import http from 'node:http';
import { URL } from 'node:url';

const TARGET = 'https://acme-web-store.up.railway.app';
const PORT = process.env.PORT || 5055;

const PERSONA_TEMPLATES = [
  { label: 'power_user', experience: 'high', patience: 0.8, riskTolerance: 0.7, speed: 'fast' },
  { label: 'tech_averse', experience: 'low', patience: 0.4, riskTolerance: 0.2, speed: 'slow' },
  { label: 'price_hunter', experience: 'medium', patience: 0.7, riskTolerance: 0.5, speed: 'medium' },
  { label: 'impulse_buyer', experience: 'medium', patience: 0.3, riskTolerance: 0.9, speed: 'fast' },
  { label: 'careful_researcher', experience: 'high', patience: 0.9, riskTolerance: 0.3, speed: 'slow' }
];

const state = {
  status: 'idle',
  startedAt: null,
  finishedAt: null,
  users: [],
  actions: [],
  errors: [],
  runHistory: []
};

function json(res, code, payload) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(payload));
}

function html(res, body) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(body);
}

function makeUsers(count = 20) {
  const firstNames = [
    'Mia', 'Noah', 'Ava', 'Liam', 'Zoe', 'Ethan', 'Ivy', 'Mason', 'Nora', 'Lucas',
    'Leah', 'Owen', 'Ruby', 'Elijah', 'Aria', 'Logan', 'Jade', 'Caleb', 'Skye', 'Henry'
  ];
  const lastNames = [
    'Hart', 'Quinn', 'Brooks', 'Reed', 'Parker', 'Hayes', 'Blake', 'Foster', 'Bennett', 'Sloane',
    'Miles', 'Carter', 'Shaw', 'Morgan', 'Ellis', 'Wells', 'Rowe', 'Turner', 'Lane', 'Bailey'
  ];

  return Array.from({ length: count }, (_, idx) => {
    const n = idx + 1;
    const p = PERSONA_TEMPLATES[idx % PERSONA_TEMPLATES.length];
    const first = firstNames[idx % firstNames.length];
    const last = lastNames[idx % lastNames.length];
    const username = `${first.toLowerCase()}_${last.toLowerCase()}_${p.label}_${String(n).padStart(2, '0')}`;

    return {
      id: `u${String(n).padStart(2, '0')}`,
      username,
      persona: p,
      actions: [],
      errors: []
    };
  });
}

async function timedFetch(url, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const start = Date.now();
  try {
    const resp = await fetch(url, { signal: ctrl.signal });
    const latencyMs = Date.now() - start;
    return { ok: resp.ok, status: resp.status, latencyMs };
  } catch (err) {
    return { ok: false, status: 0, latencyMs: Date.now() - start, error: String(err) };
  } finally {
    clearTimeout(timer);
  }
}

async function runSyntheticTest() {
  if (state.status === 'running') return;

  state.status = 'running';
  state.startedAt = new Date().toISOString();
  state.finishedAt = null;
  state.users = makeUsers(20);
  state.actions = [];
  state.errors = [];

  const endpoints = ['/', '/products', '/orders', '/api/products'];

  for (const user of state.users) {
    for (const ep of endpoints) {
      const result = await timedFetch(`${TARGET}${ep}`);
      if (result.ok) {
        const action = {
          category: 'actions',
          username: user.username,
          persona: user.persona,
          endpoint: ep,
          status: result.status,
          latencyMs: result.latencyMs,
          timestamp: new Date().toISOString()
        };
        user.actions.push(action);
        state.actions.push(action);
      } else {
        const error = {
          category: 'errors',
          username: user.username,
          persona: user.persona,
          endpoint: ep,
          status: result.status,
          error: result.error || `HTTP ${result.status}`,
          latencyMs: result.latencyMs,
          timestamp: new Date().toISOString()
        };
        user.errors.push(error);
        state.errors.push(error);
      }
    }
  }

  state.status = 'completed';
  state.finishedAt = new Date().toISOString();
  state.runHistory.push(buildRunSnapshot());
  state.runHistory = state.runHistory.slice(-12);
}

function average(values) {
  const nums = (values || []).map(Number).filter(Number.isFinite);
  return nums.length ? Math.round(nums.reduce(function (sum, value) { return sum + value; }, 0) / nums.length) : 0;
}

function percentile(values, ratio = 0.95) {
  const nums = (values || []).map(Number).filter(Number.isFinite).sort(function (a, b) { return a - b; });
  if (!nums.length) return null;
  const idx = Math.min(nums.length - 1, Math.max(0, Math.ceil(nums.length * ratio) - 1));
  return nums[idx];
}

function buildRunSnapshot() {
  const successLatencies = state.actions.map(function (a) { return a.latencyMs; });
  const failureLatencies = state.errors.map(function (e) { return e.latencyMs; });
  const totalEvents = state.actions.length + state.errors.length;
  const errorRate = totalEvents ? state.errors.length / totalEvents : 0;
  const impactedPersonas = state.users.filter(function (u) { return (u.errors || []).length > 0; }).length;
  const completedAgents = state.users.filter(function (u) { return ((u.actions || []).length + (u.errors || []).length) > 0; }).length;
  const endpointFailureCounts = state.errors.reduce(function (acc, error) {
    const key = error.endpoint || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const topEndpoint = Object.entries(endpointFailureCounts).sort(function (a, b) { return b[1] - a[1]; })[0] || null;

  return {
    startedAt: state.startedAt,
    finishedAt: state.finishedAt,
    status: state.status,
    totalEvents: totalEvents,
    successCount: state.actions.length,
    errorCount: state.errors.length,
    errorRate: errorRate,
    avgSuccessLatencyMs: average(successLatencies),
    p95SuccessLatencyMs: percentile(successLatencies, 0.95),
    avgFailureLatencyMs: average(failureLatencies),
    uniqueEndpoints: new Set(state.actions.concat(state.errors).map(function (event) { return event.endpoint; }).filter(Boolean)).size,
    impactedPersonas: impactedPersonas,
    completedAgents: completedAgents,
    topEndpoint: topEndpoint ? { endpoint: topEndpoint[0], failures: topEndpoint[1] } : null
  };
}

function summary() {
  const latest = buildRunSnapshot();
  const previous = state.runHistory.length > 1 ? state.runHistory[state.runHistory.length - 2] : null;
  return {
    status: state.status,
    startedAt: state.startedAt,
    finishedAt: state.finishedAt,
    target: TARGET,
    latestRun: latest,
    previousRun: previous,
    runHistory: state.runHistory,
    categories: [
      { id: 'actions', label: 'Actions', count: state.actions.length, hint: 'Successful endpoint checks by test users' },
      { id: 'errors', label: 'Errors', count: state.errors.length, hint: 'Failures grouped with user + persona context' },
      { id: 'personas', label: 'Personas', count: state.users.length, hint: 'All test users with personality variables' },
      { id: 'performance', label: 'Performance', count: latest.avgSuccessLatencyMs, hint: 'Average successful latency (ms)' }
    ]
  };
}

function categoryData(name) {
  if (name === 'actions') return state.actions;
  if (name === 'errors') return state.errors;
  if (name === 'personas') {
    return state.users.map(u => ({
      username: u.username,
      persona: u.persona,
      actionCount: u.actions.length,
      errorCount: u.errors.length
    }));
  }
  if (name === 'performance') {
    return state.users.map(u => {
      const successLats = u.actions.map(function (a) { return a.latencyMs; });
      const failureLats = u.errors.map(function (e) { return e.latencyMs; });
      return {
        username: u.username,
        persona: u.persona,
        successCount: u.actions.length,
        failureCount: u.errors.length,
        avgLatencyMs: average(successLats),
        p95LatencyMs: percentile(successLats, 0.95),
        failureAvgLatencyMs: average(failureLats),
        errorCount: u.errors.length
      };
    });
  }
  return [];
}

const UI = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>AgentSynthValidator // Matrix Ops Console</title>
  <style>
    :root {
      --bg: #020603;
      --bg-elev: #07110a;
      --bg-panel: rgba(6, 18, 9, 0.88);
      --bg-soft: rgba(46, 255, 114, 0.05);
      --line: rgba(88, 255, 147, 0.14);
      --line-strong: rgba(115, 255, 168, 0.28);
      --text: #dbffe7;
      --muted: #8fc8a1;
      --muted-2: #5f9870;
      --accent: #2dff72;
      --accent-2: #89ffb1;
      --ok: #59ff93;
      --warn: #c8ff5e;
      --danger: #7dff9f;
      --shadow: 0 24px 80px rgba(0,0,0,0.52);
      --radius: 18px;
      --mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, Courier New, monospace;
      --sans: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; min-height: 100%; }
    body {
      font-family: var(--sans);
      color: var(--text);
      background:
        radial-gradient(1000px 520px at 50% -10%, rgba(45,255,114,0.12), transparent 56%),
        radial-gradient(900px 560px at 100% 0%, rgba(137,255,177,0.08), transparent 48%),
        linear-gradient(180deg, #020603 0%, #030905 46%, #010402 100%);
      letter-spacing: -0.01em;
      position: relative;
      overflow-x: hidden;
    }
    body::before {
      content: '';
      position: fixed;
      inset: 0;
      pointer-events: none;
      background:
        repeating-linear-gradient(90deg, rgba(70,255,128,0.05) 0 1px, transparent 1px 72px),
        linear-gradient(180deg, rgba(20,255,111,0.035), rgba(0,0,0,0) 28%, rgba(20,255,111,0.03) 100%);
      opacity: 0.52;
      mix-blend-mode: screen;
    }
    body::after {
      content: '';
      position: fixed;
      inset: 0;
      pointer-events: none;
      background: repeating-linear-gradient(180deg, rgba(186,255,206,0.05) 0 1px, transparent 1px 4px);
      opacity: 0.2;
    }
    .wrap { max-width: 1440px; margin: 0 auto; padding: 28px; position: relative; z-index: 1; }
    .topbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 18px; padding-bottom: 14px; border-bottom: 1px solid rgba(89,255,147,0.08); }
    .mission-control { display: flex; gap: 28px; align-items: center; flex-wrap: wrap; flex: 1; }
    .mission-status { display: flex; gap: 16px; align-items: center; }
    .mission-item { display: flex; align-items: center; gap: 8px; font-size: 13px; }
    .mission-label { color: #8fc8a1; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 700; font-size: 11px; }
    .mission-value { color: #d9ffe5; font-weight: 650; font-family: var(--mono); }
    .brand { display: flex; align-items: center; gap: 14px; }
    .brand-mark {
      width: 42px; height: 42px; border-radius: 10px;
      background:
        radial-gradient(circle at 50% 50%, rgba(133,255,182,0.95), rgba(45,255,114,0.85) 34%, rgba(5,28,11,0.96) 35%, rgba(3,12,6,0.96) 100%);
      border: 1px solid rgba(126,255,174,0.45);
      box-shadow: 0 0 0 1px rgba(70,255,128,0.08) inset, 0 0 18px rgba(45,255,114,0.24), 0 10px 22px rgba(0,0,0,0.3);
      position: relative;
    }
    .brand-mark::after {
      content: '';
      position: absolute;
      inset: 11px;
      border-radius: 999px;
      border: 1px solid rgba(190,255,216,0.75);
      box-shadow: 0 0 14px rgba(114,255,166,0.22);
    }
    .brand-copy small { display: block; color: #72d494; text-transform: uppercase; letter-spacing: 0.24em; font-size: 11px; margin-bottom: 4px; font-weight: 700; }
    .brand-copy strong { display: block; font-size: 15px; font-weight: 650; color: #dbffe7; text-shadow: 0 0 14px rgba(84,255,140,0.12); }
    .topbar-meta { display: flex; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
    .micro-pill {
      display: inline-flex; align-items: center; gap: 7px; padding: 8px 12px; border-radius: 999px;
      border: 1px solid var(--line); background: rgba(7, 21, 11, 0.82); color: #bbffd0; font-size: 12px; white-space: nowrap;
      box-shadow: inset 0 0 0 1px rgba(92,255,150,0.04);
    }
    .micro-dot { width: 7px; height: 7px; border-radius: 999px; background: var(--accent); box-shadow: 0 0 0 6px rgba(45,255,114,0.1), 0 0 12px rgba(45,255,114,0.35); }
    .hero-grid { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(320px, 0.9fr); gap: 16px; margin-bottom: 18px; }
    .panel {
      background: linear-gradient(180deg, rgba(8,17,10,0.95), rgba(3,10,5,0.96));
      border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); backdrop-filter: blur(8px);
    }
    .hero-main {
      padding: 24px; min-height: 248px; display: flex; flex-direction: column; justify-content: space-between; position: relative; overflow: hidden;
    }
    .hero-main::before {
      content: ''; position: absolute; inset: 0;
      background:
        linear-gradient(135deg, rgba(45,255,114,0.14), transparent 38%),
        radial-gradient(600px 280px at 100% 0%, rgba(137,255,177,0.08), transparent 60%),
        repeating-linear-gradient(180deg, rgba(110,255,160,0.03) 0 1px, transparent 1px 28px);
      pointer-events: none;
    }
    .eyebrow { color: #8cf2ad; text-transform: uppercase; letter-spacing: 0.24em; font-size: 11px; font-weight: 700; margin-bottom: 12px; }
    .hero-title { margin: 0; font-size: clamp(2.1rem, 4vw, 3.6rem); line-height: 0.98; font-weight: 680; max-width: 12ch; letter-spacing: -0.045em; text-shadow: 0 0 24px rgba(45,255,114,0.12); }
    .hero-lead { margin: 14px 0 0; max-width: 66ch; color: #abdfbb; font-size: 15px; line-height: 1.65; }
    .hero-footer { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-top: 22px; position: relative; z-index: 1; }
    .status-cluster, .hero-tags, .hero-actions { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
    .status-badge, .tag {
      display: inline-flex; align-items: center; gap: 8px; border-radius: 999px; padding: 8px 12px; font-size: 12px; border: 1px solid transparent; font-weight: 600;
    }
    .status-badge.info, .tag.info { color: #d7ffe6; border-color: rgba(122,255,172,0.28); background: rgba(58,255,123,0.08); }
    .status-badge.ok, .tag.ok { color: #d6ffe2; border-color: rgba(89,255,147,0.35); background: rgba(89,255,147,0.12); }
    .status-badge.warn, .tag.warn { color: #efffd0; border-color: rgba(200,255,94,0.32); background: rgba(200,255,94,0.08); }
    .status-badge.danger, .tag.danger { color: #d9ffe6; border-color: rgba(125,255,159,0.32); background: rgba(125,255,159,0.09); }
    button { border: 0; border-radius: 12px; cursor: pointer; font: inherit; min-height: 44px; transition: transform .18s ease, filter .18s ease, border-color .18s ease, background .18s ease, box-shadow .18s ease; }
    .btn-primary { display: inline-flex; align-items: center; justify-content: center; background: linear-gradient(135deg, rgba(57,255,123,0.96), rgba(152,255,197,0.94)); color: #041109; font-weight: 800; padding: 12px 16px; box-shadow: 0 0 0 1px rgba(131,255,185,0.18) inset, 0 0 28px rgba(45,255,114,0.22); }
    .btn-primary:hover { transform: translateY(-1px); filter: brightness(1.04); }
    .btn-secondary { display: inline-flex; align-items: center; justify-content: center; background: rgba(9,25,13,0.82); color: var(--text); border: 1px solid var(--line); padding: 11px 14px; }
    .btn-secondary:hover { transform: translateY(-1px); border-color: var(--line-strong); box-shadow: 0 0 16px rgba(45,255,114,0.08); }
    .run-brief { padding: 22px; display: flex; flex-direction: column; gap: 16px; min-height: 248px; }
    .nexus-panel { position: relative; overflow: hidden; }
    .nexus-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 14px; flex-wrap: wrap; }
    .nexus-title-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-top: 6px; }
    .nexus-title { font-size: 28px; line-height: 1; letter-spacing: -0.04em; color: #effff4; text-shadow: 0 0 16px rgba(45,255,114,0.12); }
    .nexus-copy { max-width: 42ch; margin-bottom: 0; }
    .nexus-meta { text-align: right; max-width: 240px; }
    .nexus-count { font-size: 20px; color: #d9ffe5; letter-spacing: -0.03em; }
    .nexus-subtitle { margin-top: 6px; color: var(--muted); font-size: 13px; line-height: 1.45; }
    .nexus-stage {
      position: relative;
      min-height: 320px;
      border-radius: 18px;
      border: 1px solid rgba(89,255,147,0.12);
      background: radial-gradient(circle at 50% 50%, rgba(24,75,36,0.26), rgba(1,6,3,0.94) 58%, rgba(0,0,0,0.98) 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      box-shadow: inset 0 0 0 1px rgba(57,255,123,0.03);
    }
    .nexus-rain {
      position: absolute;
      inset: 0;
      background:
        repeating-linear-gradient(180deg, rgba(0,255,65,0.10) 0 2px, transparent 2px 18px),
        repeating-linear-gradient(90deg, rgba(0,59,0,0.18) 0 1px, transparent 1px 34px);
      opacity: 0.09;
      mask-image: radial-gradient(circle at 50% 46%, black 38%, transparent 78%);
      pointer-events: none;
    }
    .nexus-globe-wrap { position: relative; display: flex; flex-direction: column; align-items: center; z-index: 1; }
    .nexus-globe {
      position: relative;
      width: min(360px, 70vw);
      aspect-ratio: 1;
      border-radius: 50%;
      background: radial-gradient(circle at 48% 38%, rgba(89,255,147,0.16), rgba(5,17,8,0.92) 54%, rgba(0,0,0,0.98) 100%);
      border: 1px solid rgba(89,255,147,0.18);
      box-shadow: 0 0 60px rgba(45,255,114,0.08), inset 0 0 50px rgba(45,255,114,0.08);
      overflow: hidden;
      isolation: isolate;
    }
    .nexus-grid {
      position: absolute;
      inset: 8%;
      border-radius: 50%;
      background:
        radial-gradient(circle, transparent 58%, rgba(89,255,147,0.12) 59%, transparent 60%),
        repeating-radial-gradient(circle, rgba(89,255,147,0.07) 0 1px, transparent 1px 22px),
        repeating-linear-gradient(0deg, rgba(89,255,147,0.06) 0 1px, transparent 1px 26px),
        repeating-linear-gradient(90deg, rgba(89,255,147,0.06) 0 1px, transparent 1px 26px);
      opacity: 0.55;
      transform: perspective(480px) rotateX(70deg);
    }
    .nexus-node-cloud, .nexus-arcs { position: absolute; inset: 0; }
    .nexus-node {
      position: absolute;
      width: 8px;
      height: 8px;
      margin: -4px 0 0 -4px;
      border-radius: 999px;
      background: rgba(133,255,182,0.82);
      box-shadow: 0 0 10px rgba(89,255,147,0.48);
      opacity: 0.82;
      transition: all .3s ease;
    }
    .nexus-node.active {
      width: 10px;
      height: 10px;
      margin: -5px 0 0 -5px;
      background: #2dff72;
      box-shadow: 0 0 16px rgba(45,255,114,0.8), 0 0 32px rgba(45,255,114,0.4);
      animation: nodeActive 1s ease-in-out infinite;
    }
    .nexus-node.error {
      width: 12px;
      height: 12px;
      margin: -6px 0 0 -6px;
      background: #ff6b6b;
      box-shadow: 0 0 18px rgba(255,107,107,0.8), 0 0 36px rgba(255,107,107,0.3);
      animation: nodeError .6s ease-in-out infinite;
    }
    .nexus-node.completed {
      background: rgba(152,255,197,0.45);
      box-shadow: 0 0 8px rgba(152,255,197,0.35);
      opacity: 0.55;
    }
    .nexus-node.self {
      width: 10px;
      height: 10px;
      margin: -5px 0 0 -5px;
      background: #00bfff;
      box-shadow: 0 0 16px rgba(0,191,255,0.7);
      animation: selfPulse 2.2s ease-in-out infinite;
    }
    .nexus-node.dim { opacity: 0.45; }
    .nexus-arcs path {
      fill: none;
      stroke-linecap: round;
      opacity: 0.92;
      filter: drop-shadow(0 0 5px currentColor);
    }
    .nexus-tooltip {
      margin-top: 14px;
      max-width: 320px;
      text-align: center;
      color: #ccffda;
      font-size: 12px;
      line-height: 1.5;
      background: rgba(4,16,7,0.82);
      border: 1px solid rgba(89,255,147,0.14);
      border-radius: 999px;
      padding: 8px 12px;
      box-shadow: 0 0 18px rgba(45,255,114,0.05);
    }
    .nexus-empty {
      position: absolute;
      bottom: 18px;
      left: 50%;
      transform: translateX(-50%);
      color: #d8ffe4;
      font-size: 13px;
      text-align: center;
      max-width: 280px;
      opacity: 0;
      transition: opacity .2s ease;
      z-index: 2;
      pointer-events: none;
    }
    .nexus-stage.is-empty .nexus-empty { opacity: 1; }
    .nexus-stage.is-empty .nexus-tooltip { opacity: 0.85; }
    .nexus-stage.is-live {
      box-shadow: inset 0 0 0 1px rgba(57,255,123,0.05), 0 0 32px rgba(45,255,114,0.08);
    }
    .nexus-stage.is-live .nexus-globe {
      box-shadow: 0 0 70px rgba(45,255,114,0.12), inset 0 0 56px rgba(45,255,114,0.10);
    }
    .nexus-stats { margin-top: 2px; }
    .section-label { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.18em; font-weight: 700; }
    .health-line { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 6px; }
    .health-line strong { font-size: 28px; line-height: 1; letter-spacing: -0.04em; }
    .brief-copy { color: var(--muted); font-size: 14px; line-height: 1.65; }
    .brief-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .brief-stat { background: rgba(8,22,11,0.78); border: 1px solid rgba(89,255,147,0.1); border-radius: 14px; padding: 12px; box-shadow: inset 0 0 0 1px rgba(57,255,123,0.03); }
    .brief-stat .label { font-size: 12px; color: var(--muted-2); margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.1em; }
    .brief-stat .value { font-size: 18px; font-weight: 650; letter-spacing: -0.03em; color: #deffe8; }
    .brief-stat .sub { margin-top: 6px; font-size: 12px; color: var(--muted); line-height: 1.45; }
    .metrics-grid { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 12px; margin-bottom: 18px; }
    .metric-card {
      grid-column: span 2; background: linear-gradient(180deg, rgba(9,22,12,0.94), rgba(4,11,6,0.96));
      border: 1px solid rgba(89,255,147,0.14); border-radius: 16px; padding: 16px; box-shadow: 0 14px 40px rgba(0,0,0,0.3), inset 0 0 0 1px rgba(57,255,123,0.03);
    }
    .metric-card.interactive { cursor: pointer; }
    .metric-card.interactive:hover { transform: translateY(-2px); border-color: rgba(89,255,147,0.34); box-shadow: 0 14px 42px rgba(0,0,0,0.34), 0 0 22px rgba(45,255,114,0.08); }
    .metric-card.active { border-color: rgba(89,255,147,0.5); box-shadow: 0 0 0 1px rgba(89,255,147,0.14) inset, 0 18px 44px rgba(0,0,0,0.34), 0 0 24px rgba(45,255,114,0.08); }
    .metric-top { display: flex; justify-content: space-between; gap: 12px; align-items: center; margin-bottom: 12px; }
    .metric-label { color: #c6ffd7; font-size: 12px; text-transform: uppercase; letter-spacing: 0.16em; font-weight: 700; }
    .metric-meta { color: var(--muted-2); font-size: 11px; }
    .metric-value { font-size: 34px; line-height: 1; letter-spacing: -0.05em; font-weight: 680; margin-bottom: 10px; color: #e7ffee; text-shadow: 0 0 14px rgba(45,255,114,0.1); }
    .metric-sub { color: var(--muted); font-size: 13px; line-height: 1.5; }
    .metric-bar { height: 7px; margin-top: 14px; border-radius: 999px; background: rgba(70,255,128,0.08); overflow: hidden; }
    .metric-bar > span { display: block; height: 100%; width: 0%; border-radius: 999px; background: linear-gradient(90deg, rgba(57,255,123,0.92), rgba(152,255,197,0.96)); transition: width .45s ease; }
    .metric-sparkline { margin-top: 12px; height: 34px; width: 100%; }
    .metric-sparkline path.spark-fill { fill: rgba(57,255,123,0.10); }
    .metric-sparkline path.spark-line { fill: none; stroke: rgba(152,255,197,0.96); stroke-width: 2.25; stroke-linecap: round; stroke-linejoin: round; }
    .metric-sparkline circle { fill: #b6ffcf; }
    .insight-grid { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) minmax(300px, 0.86fr); gap: 16px; margin-bottom: 18px; }
    .panel-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 14px; }
    .panel-head h3, .panel-head h4 { margin: 0; letter-spacing: -0.03em; }
    .headline-panel { padding: 20px; display: flex; flex-direction: column; gap: 18px; }
    .headline-title { font-size: 30px; line-height: 1.02; letter-spacing: -0.05em; margin: 0; max-width: 14ch; }
    .headline-copy { color: #b4e1c1; font-size: 15px; line-height: 1.65; max-width: 56ch; }
    .headline-callout { border: 1px solid rgba(89,255,147,0.14); background: rgba(10,25,12,0.78); border-radius: 16px; padding: 14px; transition: border-color .24s ease, background .24s ease, transform .24s ease; }
    .callout-kicker { color: var(--muted-2); font-size: 11px; text-transform: uppercase; letter-spacing: 0.16em; font-weight: 700; margin-bottom: 8px; }
    .callout-text { font-size: 14px; color: #dbffe7; line-height: 1.6; }
    .list-panel { padding: 20px; }
    .list-scroller { max-height: 440px; overflow: auto; padding-right: 4px; }
    .finding-item, .feed-item, .error-item, .persona-item { border: 1px solid rgba(89,255,147,0.12); background: rgba(8,22,11,0.78); border-radius: 14px; padding: 12px 13px; margin-bottom: 10px; }
    .finding-item, .feed-item, .error-item, .persona-item, .metric-card, .headline-callout { animation: riseIn .28s ease both; }
    .finding-item:hover, .feed-item:hover, .error-item:hover, .persona-item:hover { border-color: rgba(129,255,180,0.2); background: rgba(9,30,14,0.88); }
    .latency-track { margin-top: 8px; height: 5px; border-radius: 999px; background: rgba(89,255,147,0.08); overflow: hidden; }
    .latency-track > span { display: block; height: 100%; border-radius: 999px; background: linear-gradient(90deg, rgba(57,255,123,0.9), rgba(152,255,197,0.98)); }
    .latency-track.warn > span { background: linear-gradient(90deg, rgba(157,255,93,0.88), rgba(215,255,152,0.98)); }
    .latency-track.danger > span { background: linear-gradient(90deg, rgba(89,255,147,0.85), rgba(210,255,229,0.98)); }
    .finding-item strong, .feed-item strong, .error-item strong, .persona-item strong { display: block; margin-bottom: 4px; color: #effff4; font-size: 14px; }
    .chip { display: inline-flex; align-items: center; gap: 6px; border-radius: 999px; padding: 5px 8px; font-size: 10px; border: 1px solid transparent; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 700; margin-bottom: 8px; }
    .chip.info { color: #d5ffe2; border-color: rgba(122,255,172,0.26); background: rgba(58,255,123,0.08); }
    .chip.warn { color: #ecffcf; border-color: rgba(200,255,94,0.28); background: rgba(200,255,94,0.08); }
    .chip.danger { color: #ddffe8; border-color: rgba(125,255,159,0.3); background: rgba(125,255,159,0.08); }
    .chip.ok { color: #d9ffe5; border-color: rgba(89,255,147,0.28); background: rgba(89,255,147,0.08); }
    .evidence-grid { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(320px, 0.75fr); gap: 16px; margin-bottom: 18px; }
    .workspace { padding: 18px; }
    .workspace-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 14px; margin-bottom: 14px; flex-wrap: wrap; }
    .workspace-head h3 { margin: 0; font-size: 24px; letter-spacing: -0.04em; }
    .workspace-meta { color: var(--muted); font-size: 13px; line-height: 1.55; max-width: 72ch; }
    .workspace-filters { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
    .filter-btn { background: rgba(7,22,10,0.84); color: #d8ffe3; border: 1px solid var(--line); padding: 8px 11px; border-radius: 999px; font-size: 12px; font-weight: 600; }
    .filter-btn:hover { border-color: var(--line-strong); box-shadow: 0 0 16px rgba(45,255,114,0.08); }
    .filter-btn.active { background: rgba(45,255,114,0.14); border-color: rgba(89,255,147,0.42); color: #edfff3; }
    .activity-grid { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(320px, 0.88fr); gap: 14px; align-items: start; }
    .table-wrap { overflow: auto; border-radius: 16px; border: 1px solid rgba(89,255,147,0.16); background: rgba(3,10,5,0.95); }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 11px 12px; border-bottom: 1px solid rgba(89,255,147,0.08); vertical-align: top; text-align: left; }
    th { position: sticky; top: 0; z-index: 1; background: rgba(5,17,8,0.98); color: #caffd8; font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; }
    th.sortable { padding: 0; }
    .th-btn { width: 100%; text-align: left; background: transparent; border: 0; box-shadow: none; color: #d7ffe3; border-radius: 0; padding: 11px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 700; }
    .th-btn:hover { background: rgba(45,255,114,0.05); }
    tr.row-click { cursor: pointer; }
    tr.row-click:hover td { background: rgba(45,255,114,0.04); }
    tr.selected td {
      background: linear-gradient(180deg, rgba(45,255,114,0.14), rgba(45,255,114,0.08)) !important;
      box-shadow: inset 0 1px 0 rgba(194,255,216,0.05), inset 3px 0 0 rgba(137,255,177,0.95);
    }
    .mono { font-family: var(--mono); }
    .inline-detail {
      border: 1px solid rgba(89,255,147,0.18);
      border-radius: 16px;
      background: linear-gradient(180deg, rgba(4,12,6,0.96), rgba(3,9,5,0.9));
      padding: 16px;
      min-height: 240px;
      box-shadow: inset 0 0 0 1px rgba(57,255,123,0.04);
    }
    .inline-detail h4 { margin: 0 0 10px; font-size: 17px; letter-spacing: -0.03em; color: #ebfff1; }
    .muted { color: var(--muted); }
    .pill { display: inline-flex; align-items: center; border-radius: 999px; background: rgba(9,25,13,0.82); border: 1px solid rgba(89,255,147,0.12); color: #dfffea; font-size: 11px; padding: 5px 8px; margin-right: 6px; margin-bottom: 6px; }
    .kv { display: grid; grid-template-columns: 110px 1fr; gap: 7px 10px; font-size: 12px; margin-top: 12px; }
    .kv .k { color: var(--muted-2); }
    .kv .v { color: #eafdf0; }
    pre { white-space: pre-wrap; word-break: break-word; background: rgba(7,22,10,0.82); border: 1px solid rgba(89,255,147,0.1); border-radius: 14px; padding: 12px; font-size: 12px; line-height: 1.55; color: #d6ffe1; overflow: auto; }
    .side-panel { position: fixed; top: 0; right: 0; width: min(480px, 96vw); height: 100vh; background: rgba(3,11,5,0.98); border-left: 1px solid rgba(89,255,147,0.16); box-shadow: -24px 0 64px rgba(0,0,0,0.5); transform: translateX(105%); transition: transform .28s ease; z-index: 40; display: flex; flex-direction: column; }
    .side-panel.open { transform: translateX(0); }
    .drawer-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; border-bottom: 1px solid rgba(89,255,147,0.1); background: rgba(7,22,10,0.82); }
    .drawer-body { padding: 16px; overflow: auto; }
    .persona-filters { margin-bottom: 12px; }
    .fchip { display: inline-block; margin-right: 6px; margin-bottom: 6px; border: 1px solid rgba(89,255,147,0.14); color: #dfffea; background: rgba(7,22,10,0.84); border-radius: 999px; font-size: 11px; padding: 6px 10px; cursor: pointer; }
    .fchip.active { border-color: rgba(89,255,147,0.4); background: rgba(45,255,114,0.14); color: #edfff3; }
    .status-badge.pulse { animation: statusPulse 1.8s ease-in-out infinite; }
    @keyframes riseIn {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes statusPulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(142,219,255,0.0); }
      50% { box-shadow: 0 0 0 8px rgba(142,219,255,0.08); }
    }
    @keyframes selfPulse {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.18); opacity: 0.84; }
    }
    @keyframes nexusRotate {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
    .nexus-globe .nexus-node-cloud,
    .nexus-globe .nexus-arcs,
    .nexus-globe .nexus-grid { animation: nexusRotate 200s linear infinite; transform-origin: 50% 50%; }
    .nexus-globe:hover .nexus-node-cloud,
    .nexus-globe:hover .nexus-arcs,
    .nexus-globe:hover .nexus-grid { animation-play-state: paused; }
    .command-console { padding: 20px; margin-bottom: 18px; }
    .console-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 12px; }
    .console-head h4 { margin: 0; font-size: 16px; font-weight: 600; letter-spacing: -0.02em; }
    .console-body {
      background: rgba(4,16,7,0.95);
      border: 1px solid rgba(89,255,147,0.16);
      border-radius: 12px;
      padding: 14px;
      max-height: 240px;
      overflow-y: auto;
      font-family: var(--mono);
      font-size: 12px;
      line-height: 1.6;
    }
    .console-body::-webkit-scrollbar { width: 6px; }
    .console-body::-webkit-scrollbar-track { background: rgba(45,255,114,0.05); border-radius: 3px; }
    .console-body::-webkit-scrollbar-thumb { background: rgba(89,255,147,0.35); border-radius: 3px; }
    .console-body::-webkit-scrollbar-thumb:hover { background: rgba(89,255,147,0.5); }
    .console-line {
      color: #b4e1c1;
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .console-line.event-action { color: #c6ffd7; }
    .console-line.event-error { color: #ff9999; }
    .console-line.event-success { color: #89ffb1; }
    .console-line.event-friction { color: #ffd84d; }
    .console-timestamp { color: #5f9870; font-size: 11px; flex-shrink: 0; }
    .console-label { font-weight: 650; color: #deffe8; }
    @keyframes nodeActive {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.25); opacity: 0.88; }
    }
    @keyframes nodeError {
      0%, 100% { transform: scale(1); opacity: 1; }
      50% { transform: scale(1.3); opacity: 0.72; }
    }
    @keyframes cmdLine {
      from { width: 0; }
      to { width: 100%; }
    }
    @media (prefers-reduced-motion: reduce) {
      .nexus-globe .nexus-node-cloud,
      .nexus-globe .nexus-arcs,
      .nexus-globe .nexus-grid,
      .nexus-node.self {
        animation: none !important;
      }
    }
    @media (max-width: 1200px) {
      .metrics-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
      .metric-card { grid-column: span 2; }
      .insight-grid, .evidence-grid { grid-template-columns: 1fr; }
    }
    @media (max-width: 980px) {
      .wrap { padding: 18px; }
      .hero-grid, .activity-grid { grid-template-columns: 1fr; }
      .workspace-head { align-items: flex-start; }
      .run-brief { min-height: auto; }
      .hero-title { max-width: 14ch; }
      .topbar-meta { justify-content: flex-start; }
      .inline-detail { min-height: 0; }
    }
    @media (max-width: 720px) {
      .wrap { padding: 14px; }
      .topbar { flex-direction: column; align-items: stretch; }
      .brand { align-items: flex-start; }
      .topbar-meta {
        justify-content: flex-start;
        flex-wrap: nowrap;
        overflow-x: auto;
        padding-bottom: 2px;
        scrollbar-width: thin;
      }
      .micro-pill { white-space: nowrap; flex: 0 0 auto; }
      .hero-main, .run-brief, .headline-panel, .list-panel, .workspace { padding: 16px; }
      .hero-title { font-size: clamp(1.9rem, 8vw, 2.6rem); max-width: none; }
      .hero-lead { font-size: 14px; line-height: 1.6; }
      .hero-footer { flex-direction: column; align-items: stretch; }
      .hero-actions { width: 100%; }
      .hero-actions .btn-primary,
      .hero-actions .btn-secondary { flex: 1 1 100%; width: 100%; justify-content: center; }
      .status-cluster, .hero-tags { width: 100%; }
      .brief-grid, .metrics-grid { grid-template-columns: 1fr; }
      .metric-card { grid-column: span 1; }
      .metric-value { font-size: 30px; }
      .workspace-filters {
        flex-wrap: nowrap;
        overflow-x: auto;
        padding-bottom: 2px;
        scrollbar-width: thin;
      }
      .filter-btn { flex: 0 0 auto; }
      .table-wrap {
        margin-inline: -4px;
        border-radius: 14px;
      }
      table { font-size: 12px; }
      th, td { padding: 10px 9px; }
      .kv { grid-template-columns: 92px 1fr; }
      .side-panel { width: 100vw; }
      .drawer-head, .drawer-body { padding-left: 14px; padding-right: 14px; }
    }
    @media (max-width: 560px) {
      .wrap { padding: 12px; }
      .brand-mark { width: 38px; height: 38px; border-radius: 12px; }
      .brand-mark::after { inset: 8px; border-radius: 8px; }
      .brand-copy strong { font-size: 14px; }
      .panel { border-radius: 16px; }
      .hero-main, .run-brief, .headline-panel, .list-panel, .workspace { padding: 14px; }
      .eyebrow, .section-label { letter-spacing: 0.16em; }
      .status-badge, .tag, .micro-pill { font-size: 11px; padding: 7px 10px; }
      .brief-stat .value { font-size: 17px; }
      .headline-title { font-size: 24px; max-width: none; }
      .headline-copy, .callout-text, .brief-copy { font-size: 13px; }
      .workspace-head h3 { font-size: 20px; }
      .workspace-meta { font-size: 12px; }
      .inline-detail { padding: 14px; }
      .pill { font-size: 10px; }
      .kv { grid-template-columns: 1fr; gap: 4px 0; }
      .kv .k { margin-top: 8px; }
    }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
  </style>
</head>
<body>
  <div class="wrap">
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true"></div>
        <div class="brand-copy">
          <small>matrix signal relay</small>
          <strong>AgentSynthValidator · Matrix Ops Console</strong>
        </div>
      </div>
      <div class="mission-control" id="missionControl">
        <div class="mission-status">
          <div class="mission-item">
            <span class="mission-label">Environment</span>
            <span class="mission-value" id="missionEnv">production</span>
          </div>
          <div class="mission-item">
            <span class="mission-label">Model</span>
            <span class="mission-value" id="missionModel">gpt-4-turbo</span>
          </div>
          <div class="mission-item">
            <span class="mission-label">Cost Ceiling</span>
            <span class="mission-value" id="missionCost">$5.00</span>
          </div>
          <div class="mission-item">
            <span class="mission-label">Elapsed</span>
            <span class="mission-value mono" id="missionElapsed">—</span>
          </div>
        </div>
      </div>
      <div class="topbar-meta">
        <span class="micro-pill"><span class="micro-dot"></span>Sentinel personas online</span>
        <span class="micro-pill">Remote target trace stream</span>
        <span class="micro-pill">Neon operator view</span>
      </div>
    </header>

    <div style="display: grid; grid-template-columns: 260px minmax(0, 1fr) 280px; gap: 18px; margin-bottom: 18px;">
      <!-- LEFT PANEL: Persona Stack -->
      <aside class="panel left-panel-stack">
        <div>
          <div class="section-label" style="margin-bottom: 8px;">Persona Archetypes</div>
          <div class="persona-filter-bar">
            <button class="persona-filter-btn active" data-filter="all">All</button>
            <button class="persona-filter-btn" data-filter="active">Active</button>
            <button class="persona-filter-btn" data-filter="errors">Errors</button>
          </div>
        </div>
        <div class="persona-stack" id="personaStack">
          <div class="muted" style="text-align: center; padding: 20px 0; font-size: 12px;">Run will populate personas...</div>
        </div>
      </aside>

      <!-- CENTER: Main content -->
      <div>

    <section class="hero-grid">
      <div class="panel hero-main">
        <div>
          <div class="eyebrow">Matrix traffic observatory</div>
          <h1 class="hero-title">Watch the system glitch before your real users feel it.</h1>
          <p class="hero-lead">Trace autonomous test identities through the target surface, surface failure patterns and latency anomalies, and inspect persona-by-persona evidence from a single neon command deck.</p>
        </div>
        <div class="hero-footer">
          <div>
            <div class="status-cluster" id="heroBadges"><span class="status-badge info">Waiting for first run</span></div>
            <div class="hero-tags" style="margin-top:10px">
              <span class="tag info" id="heroTargetTag">Target not yet sampled</span>
              <span class="tag ok">20 operator shells</span>
              <span class="tag warn">Route breach coverage</span>
            </div>
          </div>
          <div class="hero-actions">
            <button class="btn-primary" id="start">Start 20-user run</button>
            <button class="btn-secondary" id="openErrors" type="button">Inspect failures</button>
          </div>
        </div>
      </div>

      <aside class="panel run-brief nexus-panel">
        <div class="nexus-head">
          <div>
            <div class="section-label">Nexus</div>
            <div class="nexus-title-row">
              <strong class="nexus-title">Nexus View</strong>
              <span class="status-badge info" id="heroHealthBadge">No active run</span>
            </div>
            <p class="brief-copy nexus-copy" id="runSummaryLine">Launch a synthetic run to generate findings, latency telemetry, and persona-level evidence.</p>
          </div>
          <div class="nexus-meta">
            <div class="nexus-count mono" id="nexusCount">0 connected</div>
            <div class="nexus-subtitle" id="heroHealthText">You&apos;re early. Invite others to light up the Nexus.</div>
          </div>
        </div>
        <div class="nexus-stage">
          <div class="nexus-rain" aria-hidden="true"></div>
          <div class="nexus-globe-wrap">
            <div class="nexus-globe" id="nexusGlobe" aria-label="3D network of users. Double tap to hear node count.">
              <div class="nexus-grid" aria-hidden="true"></div>
              <svg class="nexus-arcs" id="nexusArcs" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"></svg>
              <div class="nexus-node-cloud" id="nexusNodes"></div>
            </div>
            <div class="nexus-tooltip" id="nexusHint">Each light is a person. Lines show real activity. Drag to explore.</div>
          </div>
          <div class="nexus-empty" id="nexusEmpty">You&apos;re early. Invite others to light up the Nexus.</div>
        </div>
        <div class="brief-grid nexus-stats">
          <div class="brief-stat"><div class="label">Status</div><div class="value" id="briefStatus">idle</div><div class="sub">No simulation in progress.</div></div>
          <div class="brief-stat"><div class="label">Window</div><div class="value mono" id="briefWindow">-</div><div class="sub">Run duration appears here.</div></div>
          <div class="brief-stat"><div class="label">Target</div><div class="value mono" id="briefTarget">-</div><div class="sub">Remote environment under test.</div></div>
          <div class="brief-stat"><div class="label">Latest guidance</div><div class="value" id="briefGuidance">Awaiting run</div><div class="sub">Primary next step for the team after the latest run.</div></div>
        </div>
      </aside>
    </section>

    <section class="metrics-grid" id="cards"></section>

    <section class="insight-grid">
      <article class="panel headline-panel">
        <div class="panel-head">
          <div><div class="section-label">Executive summary</div><h3 class="headline-title" id="headlineTitle">Run synthetic traffic to generate a risk summary.</h3></div>
          <span class="status-badge info" id="headlineBadge">Waiting</span>
        </div>
        <div class="headline-copy" id="headlineCopy">This area surfaces the most important outcome from the latest run: stability, concentrated failure pressure, or latency risk.</div>
        <div class="headline-callout"><div class="callout-kicker">Why this matters</div><div class="callout-text" id="headlineCallout">Product teams need an immediate read on what to fix first before they widen scenario coverage or invite real beta traffic.</div></div>
      </article>

      <article class="panel list-panel">
        <div class="panel-head"><div><div class="section-label">Findings</div><h4>Recommended next actions</h4></div></div>
        <div id="findings" class="list-scroller muted">Run a simulation to generate findings.</div>
      </article>

      <article class="panel list-panel">
        <div class="panel-head"><div><div class="section-label">Failures</div><h4>Recent errors</h4></div></div>
        <div id="recentErrors" class="list-scroller muted">No errors yet.</div>
      </article>
    </section>

    <section class="evidence-grid">
      <article class="panel list-panel">
        <div class="panel-head"><div><div class="section-label">Live evidence</div><h4>Run event timeline</h4></div><div class="workspace-meta" id="status">Status: idle</div></div>
        <div id="liveFeed" class="list-scroller muted">Waiting for run events...</div>
      </article>
      <article class="panel list-panel">
        <div class="panel-head"><div><div class="section-label">Persona pressure</div><h4>Affected user archetypes</h4></div></div>
        <div id="personaPressure" class="list-scroller muted">Persona impact will appear after a run.</div>
      </article>
    </section>

    <section class="panel workspace">
      <div class="workspace-head">
        <div>
          <div class="section-label">Investigation workspace</div>
          <h3 id="detailTitle">Select a metric above to open the evidence table.</h3>
          <div class="workspace-meta" id="detailMeta">Pivot between actions, failures, personas, and performance, then select a row to inspect the event payload, persona profile, and endpoint context.</div>
          <div class="workspace-filters" id="workspaceFilters"></div>
        </div>
      </div>
      <div class="activity-grid"><div id="detail"></div><aside id="inlineDetail" class="inline-detail muted">Select a row to inspect user, persona, endpoint, and raw payload details.</aside></div>
    </section>

    <section class="panel command-console">
      <div class="console-head">
        <div class="section-label">Command Stream</div>
        <h4 style="margin: 6px 0 0 0; font-size: 16px;">Live event log</h4>
      </div>
      <div class="console-body" id="commandConsole">
        <div class="console-line muted" style="opacity: 0.55;">Awaiting first run...</div>
      </div>
    </section>

      </div>
      <!-- END main content -->

      <!-- RIGHT PANEL: Diagnostics -->
      <aside class="panel right-panel-diagnostics">
        <div>
          <div class="section-label" style="margin-bottom: 8px;">Real-time Diagnostics</div>
        </div>
        
        <div class="diagnostic-section" id="diagnosticsContainer">
          <div class="diagnostic-empty">Run will populate diagnostics...</div>
        </div>
      </aside>
      <!-- END right panel -->
    </div>
    <!-- END left panel grid -->
  </div>

  <aside id="sidePanel" class="side-panel" aria-hidden="true">
    <div class="drawer-head"><strong id="panelTitle">Detail</strong><button class="btn-secondary" id="closePanel" type="button">Close</button></div>
    <div class="drawer-body" id="panelBody"></div>
  </aside>

<script src="/app.js?v=2"></script>
</body>
</html>`;

const APP_JS = String.raw`
let activeRows = [];
let activeLabel = '';
let activeCategoryId = '';
let personaFilter = 'all';
let selectedRowId = '';
let sortState = { key: 'timestamp', dir: 'desc' };

function esc(x) {
  return String(x == null ? '' : x)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function fmtShort(iso) {
  return iso ? new Date(iso).toLocaleString() : '-';
}

function durSec(startedAt, finishedAt, status) {
  if (!startedAt) return '-';
  const start = new Date(startedAt).getTime();
  const end = finishedAt ? new Date(finishedAt).getTime() : (status === 'running' ? Date.now() : start);
  return ((end - start) / 1000).toFixed(1) + 's';
}

function fmtMetric(value, suffix, emptyLabel) {
  if (value == null || !Number.isFinite(Number(value))) return emptyLabel || '—';
  return String(Math.round(Number(value))) + (suffix || '');
}

function deltaMeta(current, previous, suffix) {
  if (current == null || previous == null || !Number.isFinite(Number(current)) || !Number.isFinite(Number(previous))) {
    return 'baseline pending';
  }
  const diff = Number(current) - Number(previous);
  if (Math.abs(diff) < 0.5) return 'flat vs prev';
  const sign = diff > 0 ? '+' : '';
  return sign + Math.round(diff) + (suffix || '') + ' vs prev';
}

function average(values) {
  const nums = (values || []).map(function (v) { return Number(v); }).filter(function (v) { return Number.isFinite(v); });
  if (!nums.length) return 0;
  return Math.round(nums.reduce(function (sum, value) { return sum + value; }, 0) / nums.length);
}

function percentile(values, ratio) {
  const nums = (values || []).map(function (v) { return Number(v); }).filter(function (v) { return Number.isFinite(v); }).sort(function (a, b) { return a - b; });
  if (!nums.length) return 0;
  const q = ratio == null ? 0.95 : Number(ratio);
  const idx = Math.min(nums.length - 1, Math.max(0, Math.ceil(nums.length * q) - 1));
  return nums[idx];
}

function animateNumber(el, target) {
  const next = Number(target || 0);
  const prev = Number(el.dataset.value || 0);
  const suffix = el.dataset.suffix || '';
  const start = performance.now();
  const dur = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 420;

  function tick(now) {
    const t = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - t, 3);
    const val = Math.round(prev + (next - prev) * eased);
    el.textContent = String(val) + suffix;
    if (t < 1) requestAnimationFrame(tick);
  }

  el.dataset.value = String(next);
  requestAnimationFrame(tick);
}

function buildSparkline(values) {
  const nums = (values || []).map(function (v) { return Number(v) || 0; }).filter(function (v) { return isFinite(v); });
  if (!nums.length) return '';
  const width = 120;
  const height = 34;
  const pad = 3;
  const min = Math.min.apply(null, nums);
  const max = Math.max.apply(null, nums);
  const span = Math.max(1, max - min);
  const step = nums.length === 1 ? 0 : (width - pad * 2) / (nums.length - 1);
  const pts = nums.map(function (n, i) {
    const x = pad + step * i;
    const y = height - pad - ((n - min) / span) * (height - pad * 2);
    return [x, y];
  });
  const line = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(2) + ' ' + p[1].toFixed(2); }).join(' ');
  const fill = line + ' L ' + (width - pad) + ' ' + (height - pad) + ' L ' + pad + ' ' + (height - pad) + ' Z';
  const last = pts[pts.length - 1];
  return ''
    + '<svg class="metric-sparkline" viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none" aria-hidden="true">'
    + '<path class="spark-fill" d="' + fill + '"></path>'
    + '<path class="spark-line" d="' + line + '"></path>'
    + '<circle cx="' + last[0].toFixed(2) + '" cy="' + last[1].toFixed(2) + '" r="2.7"></circle>'
    + '</svg>';
}

function nexusNodePosition(index, total) {
  const count = Math.max(1, total || 1);
  const i = index + 0.5;
  const phi = Math.acos(1 - (2 * i) / count);
  const theta = Math.PI * (1 + Math.sqrt(5)) * i;
  const x = Math.cos(theta) * Math.sin(phi);
  const y = Math.sin(theta) * Math.sin(phi);
  const z = Math.cos(phi);
  const scale = 0.72 + ((z + 1) / 2) * 0.34;
  return {
    left: 50 + x * 34,
    top: 50 + y * 34,
    opacity: 0.28 + ((z + 1) / 2) * 0.68,
    scale: scale,
    z: z
  };
}

function nexusArcColor(kind) {
  if (kind === 'collab') return '#00bfff';
  if (kind === 'transaction') return '#ffd84d';
  return '#00ff41';
}

function updateMissionControl(summary) {
  const startedAt = summary.startedAt ? new Date(summary.startedAt) : null;
  const finishedAt = summary.finishedAt ? new Date(summary.finishedAt) : null;
  const nowMs = Date.now();
  
  if (startedAt && summary.status === 'running') {
    const elapsedMs = nowMs - startedAt.getTime();
    const secs = Math.floor(elapsedMs / 1000);
    const mins = Math.floor(secs / 60);
    const elapsedStr = mins > 0 ? mins + 'm ' + (secs % 60) + 's' : secs + 's';
    document.getElementById('missionElapsed').textContent = elapsedStr;
  } else if (finishedAt && startedAt) {
    const elapsedMs = finishedAt.getTime() - startedAt.getTime();
    const secs = Math.floor(elapsedMs / 1000);
    const mins = Math.floor(secs / 60);
    const elapsedStr = mins > 0 ? mins + 'm ' + (secs % 60) + 's' : secs + 's';
    document.getElementById('missionElapsed').textContent = elapsedStr;
  } else {
    document.getElementById('missionElapsed').textContent = '—';
  }
}

function appendConsoleEvent(type, persona, action, timestamp) {
  const consoleEl = document.getElementById('commandConsole');
  if (!consoleEl) return;
  
  const lines = consoleEl.querySelectorAll('.console-line');
  if (lines.length > 1 && lines[0].textContent === 'Awaiting first run...') {
    lines[0].remove();
  }
  
  const lineEl = document.createElement('div');
  lineEl.className = 'console-line event-' + type;
  
  const timeStr = timestamp ? new Date(timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();
  
  let text = '';
  if (type === 'action') {
    text = persona + ' completed ' + action;
  } else if (type === 'error') {
    text = persona + ' failed on ' + action;
  } else if (type === 'friction') {
    text = 'friction detected: ' + action;
  } else {
    text = persona + ' · ' + action;
  }
  
  lineEl.innerHTML = '<span class="console-timestamp">[' + timeStr + ']</span><span class="console-label">' + esc(text) + '</span>';
  consoleEl.appendChild(lineEl);
  
  if (consoleEl.querySelectorAll('.console-line').length > 50) {
    const firstLine = consoleEl.querySelector('.console-line');
    if (firstLine) firstLine.remove();
  }
  
  consoleEl.scrollTop = consoleEl.scrollHeight;
}


function renderNexus(summary, personas, actions, errors) {
  const countEl = document.getElementById('nexusCount');
  const subtitleEl = document.getElementById('heroHealthText');
  const hintEl = document.getElementById('nexusHint');
  const stageEl = document.querySelector('.nexus-stage');
  const globeEl = document.getElementById('nexusGlobe');
  const emptyEl = document.getElementById('nexusEmpty');
  const nodesEl = document.getElementById('nexusNodes');
  const arcsEl = document.getElementById('nexusArcs');
  if (!countEl || !subtitleEl || !hintEl || !stageEl || !globeEl || !emptyEl || !nodesEl || !arcsEl) return;

  const connected = personas.length || 0;
  countEl.textContent = connected.toLocaleString() + ' connected';

  if (!connected) {
    subtitleEl.textContent = 'You\'re early. Invite others to light up the Nexus.';
    hintEl.textContent = 'Each light is a person. Lines show real activity. Drag to explore.';
    stageEl.classList.add('is-empty');
    stageEl.classList.remove('is-live');
    emptyEl.setAttribute('aria-hidden', 'false');
    globeEl.setAttribute('aria-label', 'Nexus network waiting for participants. No connected users yet.');
    nodesEl.innerHTML = '';
    arcsEl.innerHTML = '';
    return;
  }

  stageEl.classList.remove('is-empty');
  stageEl.classList.toggle('is-live', summary.status === 'running');
  emptyEl.setAttribute('aria-hidden', 'true');
  const liveNow = personas.filter(function (p) { return ((p.actionCount || 0) + (p.errorCount || 0)) > 0; }).length;
  subtitleEl.textContent = liveNow.toLocaleString() + ' live now · your node is highlighted · equal presence, no hierarchy';
  hintEl.textContent = summary.status === 'running'
    ? 'Each light is a person. Lines show live activity. Hover to study the network while the run is active.'
    : 'Each light is a person. Lines show the latest activity paths from the completed run.';
  globeEl.setAttribute('aria-label', connected.toLocaleString() + ' connected users in the Nexus, ' + liveNow.toLocaleString() + ' active in the latest run. Your node is highlighted.');

  const nodesMarkup = personas.map(function (p, i) {
    const pos = nexusNodePosition(i, connected);
    const cls = 'nexus-node' + (i === 0 ? ' self' : (pos.z < -0.08 ? ' dim' : ''));
    return '<span class="' + cls + '" style="left:' + pos.left.toFixed(2) + '%;top:' + pos.top.toFixed(2) + '%;opacity:' + pos.opacity.toFixed(2) + ';transform:scale(' + pos.scale.toFixed(2) + ')" title="' + esc((p.persona && p.persona.label) || 'user') + '"></span>';
  }).join('');
  nodesEl.innerHTML = nodesMarkup;

  const recent = actions.concat(errors).slice(-6);
  const arcsMarkup = recent.map(function (ev, i) {
    const from = nexusNodePosition(i % connected, connected);
    const to = nexusNodePosition((i * 3 + 5) % connected, connected);
    const midX = ((from.left + to.left) / 2);
    const lift = 8 + (i % 3) * 6;
    const kind = ev.category === 'errors' ? 'transaction' : ((i % 2 === 0) ? 'chat' : 'collab');
    const color = nexusArcColor(kind);
    return '<path d="M ' + from.left.toFixed(2) + ' ' + from.top.toFixed(2) + ' Q ' + midX.toFixed(2) + ' ' + Math.max(6, Math.min(from.top, to.top) - lift).toFixed(2) + ' ' + to.left.toFixed(2) + ' ' + to.top.toFixed(2) + '" stroke="' + color + '" stroke-width="' + (kind === 'transaction' ? '1.8' : '1.2') + '"></path>';
  }).join('');
  arcsEl.innerHTML = arcsMarkup;
}

function latencyTone(ms) {
  if ((Number(ms) || 0) >= 140) return 'danger';
  if ((Number(ms) || 0) >= 90) return 'warn';
  return 'info';
}

function latencyBar(ms, ceiling) {
  const value = Number(ms) || 0;
  const max = Math.max(40, Number(ceiling) || 160);
  const width = Math.max(8, Math.min(100, Math.round((value / max) * 100)));
  const tone = latencyTone(value);
  return '<div class="latency-track ' + tone + '"><span style="width:' + width + '%"></span></div>';
}

function personaColor(label) {
  const map = {
    power_user: '#7ea8ff',
    tech_averse: '#f2b15c',
    price_hunter: '#55d6a1',
    impulse_buyer: '#ff8aa0',
    careful_researcher: '#baa8ff'
  };
  return map[label] || '#a6b2c8';
}

function healthState(errorRate, p95, status) {
  if (status === 'running') return { label: 'In progress', tone: 'info', headline: 'Run in progress' };
  if (status === 'idle') return { label: 'Idle', tone: 'info', headline: 'Idle' };
  if (errorRate > 0.35) return { label: 'Needs triage', tone: 'danger', headline: 'High failure pressure' };
  if (errorRate > 0.15 || p95 > 150) return { label: 'Watchlist', tone: 'warn', headline: 'Performance or reliability risk' };
  return { label: 'Healthy', tone: 'ok', headline: 'Stable synthetic run' };
}

function renderWorkspaceFilters() {
  const wrap = document.getElementById('workspaceFilters');
  const defs = [
    { id: 'actions', label: 'Actions' },
    { id: 'errors', label: 'Errors' },
    { id: 'personas', label: 'Personas' },
    { id: 'performance', label: 'Performance' }
  ];
  wrap.innerHTML = defs.map(function (d) {
    const cls = 'filter-btn' + (activeCategoryId === d.id ? ' active' : '');
    return '<button class="' + cls + '" data-category="' + esc(d.id) + '">' + esc(d.label) + '</button>';
  }).join('');

  wrap.querySelectorAll('.filter-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      const id = btn.getAttribute('data-category');
      const label = btn.textContent || id;
      loadCategory(id, label);
    });
  });
}

function renderFilterChips() {
  const panelBody = document.getElementById('panelBody');
  const labels = ['all'].concat(Array.from(new Set(activeRows.map(function (r) {
    return r.persona && r.persona.label;
  }).filter(Boolean))));

  const chips = labels.map(function (l) {
    const active = l === personaFilter ? ' active' : '';
    const color = l === 'all' ? '#7387ff' : personaColor(l);
    return '<button class="fchip' + active + '" data-label="' + esc(l) + '" style="border-color:' + color + '44">' + esc(l) + '</button>';
  }).join('');

  panelBody.innerHTML = '<div class="persona-filters"><strong>Persona filter</strong><div style="margin-top:8px">' + chips + '</div></div><div id="panelData" class="muted">Select a row for event details.</div>';

  panelBody.querySelectorAll('.fchip').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      personaFilter = btn.getAttribute('data-label') || 'all';
      await renderDetailTable();
      renderFilterChips();
    });
  });
}

function openPanel(row) {
  const panel = document.getElementById('sidePanel');
  const title = document.getElementById('panelTitle');
  const data = document.getElementById('panelData');
  const persona = row.persona || {};
  title.textContent = (row.username || 'User Detail') + ' · ' + activeLabel;

  if (data) {
    data.innerHTML = ''
      + '<div>'
      + '<span class="pill" style="border-color:' + personaColor(persona.label || '') + '66">persona: ' + esc(persona.label || 'n/a') + '</span>'
      + '<span class="pill">experience: ' + esc(persona.experience || 'n/a') + '</span>'
      + '<span class="pill">speed: ' + esc(persona.speed || 'n/a') + '</span>'
      + '<span class="pill">patience: ' + esc(persona.patience != null ? persona.patience : 'n/a') + '</span>'
      + '<span class="pill">risk tolerance: ' + esc(persona.riskTolerance != null ? persona.riskTolerance : 'n/a') + '</span>'
      + '</div>'
      + '<h4 style="margin:12px 0 8px">Raw event</h4>'
      + '<pre>' + esc(JSON.stringify(row, null, 2)) + '</pre>';
  }

  panel.classList.add('open');
  panel.setAttribute('aria-hidden', 'false');
}

function closePanel() {
  const panel = document.getElementById('sidePanel');
  panel.classList.remove('open');
  panel.setAttribute('aria-hidden', 'true');
}

function buildFindings(actions, errors, personas, perfRows) {
  const findings = [];
  const total = actions.length + errors.length;
  const errorRate = total ? errors.length / total : 0;
  const byEndpoint = errors.reduce(function (acc, e) {
    acc[e.endpoint] = (acc[e.endpoint] || 0) + 1;
    return acc;
  }, {});
  const worstEndpoint = Object.entries(byEndpoint).sort(function (a, b) { return b[1] - a[1]; })[0];
  const impactedPersonas = personas.filter(function (p) { return (p.errorCount || 0) > 0; }).length;

  if (errorRate > 0.35) {
    findings.push({
      severity: 'danger',
      title: 'High failure ratio detected',
      detail: Math.round(errorRate * 100) + '% of observed checks failed during this run.',
      recommendation: 'Treat this as a release blocker and prioritize route stability plus login/session hardening before expanding scenario coverage.'
    });
  }

  if (worstEndpoint) {
    findings.push({
      severity: 'warn',
      title: 'Endpoint hotspot',
      detail: worstEndpoint[0] + ' generated ' + worstEndpoint[1] + ' failures and is the highest-risk path in the current run.',
      recommendation: 'Add a dedicated synthetic workflow for this endpoint and inspect route permissions, data dependencies, and timeout behavior.'
    });
  }

  const slow = perfRows.slice().sort(function (a, b) { return (b.p95LatencyMs || 0) - (a.p95LatencyMs || 0); })[0];
  if (slow && slow.p95LatencyMs > 120) {
    findings.push({
      severity: 'warn',
      title: 'Latency pressure detected',
      detail: 'Highest observed user p95 latency is ' + slow.p95LatencyMs + 'ms for ' + slow.username + '.',
      recommendation: 'Profile backend hotspots and examine cache strategy for the slowest route clusters before broadening synthetic load.'
    });
  }

  if (impactedPersonas >= 3) {
    findings.push({
      severity: 'info',
      title: 'Cross-persona impact',
      detail: impactedPersonas + ' personas encountered at least one failure, which suggests the issue is systemic rather than persona-specific.',
      recommendation: 'Triaging by endpoint first will likely be faster than triaging by persona behavior alone.'
    });
  }

  if (!findings.length) {
    findings.push({
      severity: 'ok',
      title: 'Stable run profile',
      detail: 'No major anomalies surfaced in this run window.',
      recommendation: 'Expand scenario coverage next: deeper authenticated flows, multi-step transactions, and edge-case personas.'
    });
  }

  return findings.slice(0, 4);
}

function renderHeadline(findings, errorRate, p95, status) {
  const health = healthState(errorRate, p95, status);
  const top = findings[0];
  const title = document.getElementById('headlineTitle');
  const badge = document.getElementById('headlineBadge');
  const copy = document.getElementById('headlineCopy');
  const callout = document.getElementById('headlineCallout');

  badge.className = 'status-badge ' + health.tone + (status === 'running' ? ' pulse' : '');
  badge.textContent = health.label;

  if (!top) {
    title.textContent = 'Run synthetic traffic to generate a risk summary.';
    copy.textContent = 'This area highlights the most important outcome from the latest run: stability, risk concentration, or latency pressure.';
    callout.textContent = 'Product teams need a fast way to distinguish stable runs from those that need immediate triage.';
    return;
  }

  title.textContent = top.title;
  copy.textContent = top.detail;
  callout.textContent = top.recommendation;
}

function renderPersonaPressure(personas, perfRows) {
  const box = document.getElementById('personaPressure');
  if (!personas.length) {
    box.innerHTML = 'Persona impact will appear after a run.';
    return;
  }

  const perfMap = {};
  perfRows.forEach(function (r) { perfMap[r.username] = r; });
  const rows = personas.map(function (p) {
    return {
      username: p.username,
      persona: p.persona,
      actionCount: p.actionCount || 0,
      errorCount: p.errorCount || 0,
      p95LatencyMs: (perfMap[p.username] && perfMap[p.username].p95LatencyMs) || 0
    };
  }).sort(function (a, b) {
    if ((b.errorCount || 0) !== (a.errorCount || 0)) return (b.errorCount || 0) - (a.errorCount || 0);
    return (b.p95LatencyMs || 0) - (a.p95LatencyMs || 0);
  }).slice(0, 8);

  box.innerHTML = rows.map(function (p) {
    const sev = p.errorCount > 0 ? 'danger' : (p.p95LatencyMs > 120 ? 'warn' : 'ok');
    return ''
      + '<div class="persona-item">'
      + '<span class="chip ' + sev + '">' + esc(p.persona.label || 'persona') + '</span>'
      + '<strong>' + esc(p.username) + '</strong>'
      + '<div class="muted">actions ' + esc(String(p.actionCount)) + ' · errors ' + esc(String(p.errorCount)) + ' · p95 ' + esc(String(p.p95LatencyMs)) + 'ms</div>'
      + latencyBar(p.p95LatencyMs, 180)
      + '<div style="margin-top:8px;height:6px;border-radius:999px;background:rgba(255,255,255,0.06);overflow:hidden"><span style="display:block;height:100%;width:' + Math.min(100, p.errorCount * 25 + Math.round(p.p95LatencyMs / 4)) + '%;background:' + esc(personaColor(p.persona.label || '')) + '"></span></div>'
      + '</div>';
  }).join('');
}

function renderOpsPanels(actions, errors, personas, perfRows, summary) {
  const liveFeed = document.getElementById('liveFeed');
  const findingsEl = document.getElementById('findings');
  const recentErrorsEl = document.getElementById('recentErrors');
  const merged = actions.concat(errors).sort(function (a, b) { return new Date(b.timestamp) - new Date(a.timestamp); }).slice(0, 30);

  if (!merged.length) {
    liveFeed.innerHTML = 'Waiting for run events...';
  } else {
    liveFeed.innerHTML = merged.map(function (ev) {
      const sev = ev.category === 'errors' ? 'danger' : 'info';
      const label = ev.category === 'errors' ? 'failure' : 'success';
      return ''
        + '<div class="feed-item">'
        + '<span class="chip ' + sev + '">' + label + '</span>'
        + '<strong>' + esc(ev.username || 'unknown') + ' · ' + esc(ev.endpoint || '-') + '</strong>'
        + '<div class="muted">persona: ' + esc((ev.persona && ev.persona.label) || 'n/a') + ' · status ' + esc(String(ev.status || '-')) + ' · ' + esc(String(ev.latencyMs || 0)) + 'ms</div>'
        + latencyBar(ev.latencyMs, 180)
        + '<div class="muted mono" style="margin-top:6px">' + esc(fmtShort(ev.timestamp || '')) + '</div>'
        + '</div>';
    }).join('');
  }

  const findings = buildFindings(actions, errors, personas, perfRows);
  findingsEl.innerHTML = findings.map(function (f) {
    return ''
      + '<div class="finding-item">'
      + '<span class="chip ' + esc(f.severity) + '">' + esc(f.severity) + '</span>'
      + '<strong>' + esc(f.title) + '</strong>'
      + '<div class="muted">' + esc(f.detail) + '</div>'
      + '<div style="margin-top:8px;color:#dbe4f3">' + esc(f.recommendation) + '</div>'
      + '</div>';
  }).join('');

  const recentErrors = errors.slice().sort(function (a, b) { return new Date(b.timestamp) - new Date(a.timestamp); }).slice(0, 10);
  if (!recentErrors.length) {
    recentErrorsEl.innerHTML = 'No errors yet.';
  } else {
    recentErrorsEl.innerHTML = recentErrors.map(function (e) {
      return ''
        + '<div class="error-item">'
        + '<span class="chip danger">error</span>'
        + '<strong>' + esc(e.username) + '</strong>'
        + '<div class="muted">' + esc(e.endpoint || '-') + ' · status ' + esc(String(e.status || '-')) + ' · ' + esc(String(e.latencyMs || 0)) + 'ms</div>'
        + latencyBar(e.latencyMs, 180)
        + '<div class="muted mono" style="margin-top:6px">' + esc(fmtShort(e.timestamp || '')) + '</div>'
        + '</div>';
    }).join('');
  }

  renderPersonaPressure(personas, perfRows);
  renderHeadline(findings, summary.errorRate, summary.p95Overall, summary.status);
  document.getElementById('briefGuidance').textContent = findings[0] ? findings[0].title : 'Awaiting run';
}

function normalizeDetailRow(row, idx) {
  const persona = row.persona || {};
  const username = row.username || row.user || 'unknown';
  const timestamp = row.timestamp || row.lastEventAt || '';
  const rowId = row.rowId || [username, timestamp, idx].join('|');
  return {
    rowId: rowId,
    username: username,
    persona: persona.label || row.personaLabel || 'n/a',
    endpoint: row.endpoint || row.lastEndpoint || '-',
    status: row.status != null ? row.status : (row.lastStatus != null ? row.lastStatus : '-'),
    latencyMs: Number(row.latencyMs != null ? row.latencyMs : (row.avgLatencyMs != null ? row.avgLatencyMs : 0)),
    p95LatencyMs: row.p95LatencyMs == null ? null : Number(row.p95LatencyMs),
    failureAvgLatencyMs: row.failureAvgLatencyMs == null ? null : Number(row.failureAvgLatencyMs),
    successCount: Number(row.successCount != null ? row.successCount : row.actionCount != null ? row.actionCount : 0),
    failureCount: Number(row.failureCount != null ? row.failureCount : row.errorCount != null ? row.errorCount : 0),
    actionCount: Number(row.actionCount != null ? row.actionCount : 0),
    errorCount: Number(row.errorCount != null ? row.errorCount : 0),
    timestamp: timestamp,
    raw: row
  };
}

function renderInlineDetail(row) {
  const box = document.getElementById('inlineDetail');
  if (!row) {
    box.classList.add('muted');
    box.innerHTML = 'Select a row to inspect user, persona, endpoint, and raw payload details.';
    return;
  }

  box.classList.remove('muted');
  const raw = row.raw || row;
  box.innerHTML = ''
    + '<h4>' + esc(row.username) + '</h4>'
    + '<div>'
    + '<span class="pill">persona: ' + esc(row.persona) + '</span>'
    + '<span class="pill">status: ' + esc(String(row.status)) + '</span>'
    + '<span class="pill">avg success: ' + esc(fmtMetric(row.latencyMs, 'ms')) + '</span>'
    + '<span class="pill">success p95: ' + esc(fmtMetric(row.p95LatencyMs, 'ms', '—')) + '</span>'
    + '</div>'
    + '<div class="kv">'
    + '<div class="k">Endpoint</div><div class="v">' + esc(row.endpoint) + '</div>'
    + '<div class="k">Success count</div><div class="v">' + esc(String(row.successCount || row.actionCount)) + '</div>'
    + '<div class="k">Failure count</div><div class="v">' + esc(String(row.failureCount || row.errorCount)) + '</div>'
    + '<div class="k">Failed avg latency</div><div class="v">' + esc(fmtMetric(row.failureAvgLatencyMs, 'ms', '—')) + '</div>'
    + '<div class="k">Last event</div><div class="v mono">' + esc(fmtShort(row.timestamp || '')) + '</div>'
    + '</div>'
    + '<h4 style="margin-top:14px">Raw payload</h4>'
    + '<pre>' + esc(JSON.stringify(raw, null, 2)) + '</pre>';
}

function compareValues(a, b, key, dir) {
  const av = a[key];
  const bv = b[key];
  const mul = dir === 'asc' ? 1 : -1;
  if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * mul;
  return String(av == null ? '' : av).localeCompare(String(bv == null ? '' : bv)) * mul;
}

async function renderDetailTable() {
  const wrap = document.getElementById('detail');
  const meta = document.getElementById('detailMeta');
  const baseRows = personaFilter === 'all'
    ? activeRows
    : activeRows.filter(function (r) {
        return (((r.persona && r.persona.label) || r.personaLabel || '') === personaFilter);
      });

  if (!baseRows.length) {
    wrap.innerHTML = '<p class="muted">No data for this filter yet.</p>';
    meta.textContent = 'No rows available for the current filter.';
    renderInlineDetail(null);
    return;
  }

  const rows = baseRows.map(normalizeDetailRow).sort(function (a, b) {
    return compareValues(a, b, sortState.key, sortState.dir);
  });

  const columns = [
    ['username', 'Username'],
    ['persona', 'Persona'],
    ['status', 'Status'],
    ['endpoint', 'Endpoint'],
    ['latencyMs', 'Latency'],
    ['p95LatencyMs', 'P95'],
    ['actionCount', 'Actions'],
    ['errorCount', 'Errors'],
    ['timestamp', 'Last event']
  ];

  let html = '<div class="table-wrap"><table><thead><tr>'
    + columns.map(function (pair) {
        const key = pair[0];
        const label = pair[1];
        const marker = sortState.key === key ? (sortState.dir === 'asc' ? ' ▲' : ' ▼') : '';
        return '<th class="sortable"><button class="th-btn" data-sort="' + key + '">' + esc(label + marker) + '</button></th>';
      }).join('')
    + '</tr></thead><tbody>';

  rows.forEach(function (r) {
    const selected = selectedRowId === r.rowId ? ' selected' : '';
    html += ''
      + '<tr class="row-click' + selected + '" data-rowid="' + esc(r.rowId) + '">'
      + '<td>' + esc(r.username) + '</td>'
      + '<td>' + esc(r.persona) + '</td>'
      + '<td>' + esc(String(r.status)) + '</td>'
      + '<td>' + esc(r.endpoint) + '</td>'
      + '<td class="mono">' + esc(fmtMetric(r.latencyMs, 'ms')) + '</td>'
      + '<td class="mono">' + esc(fmtMetric(r.p95LatencyMs, 'ms', '—')) + '</td>'
      + '<td class="mono">' + esc(String(r.successCount || r.actionCount)) + '</td>'
      + '<td class="mono">' + esc(String(r.failureCount || r.errorCount)) + '</td>'
      + '<td class="mono">' + esc(fmtShort(r.timestamp || '')) + '</td>'
      + '</tr>';
  });

  html += '</tbody></table></div>';
  wrap.innerHTML = html;
  meta.textContent = 'Rows: ' + rows.length + ' · Sort: ' + sortState.key + ' (' + sortState.dir + ')';

  wrap.querySelectorAll('button.th-btn').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      const key = btn.getAttribute('data-sort') || 'timestamp';
      if (sortState.key === key) sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
      else {
        sortState.key = key;
        sortState.dir = (key === 'username' || key === 'persona' || key === 'endpoint') ? 'asc' : 'desc';
      }
      await renderDetailTable();
    });
  });

  wrap.querySelectorAll('tr.row-click').forEach(function (tr) {
    tr.addEventListener('click', function () {
      const id = tr.getAttribute('data-rowid') || '';
      selectedRowId = id;
      const selected = rows.find(function (r) { return r.rowId === id; }) || rows[0];
      renderInlineDetail(selected);
      openPanel(selected.raw || selected);
      renderDetailTable();
    });
  });

  if (!selectedRowId && rows.length) {
    selectedRowId = rows[0].rowId;
    renderInlineDetail(rows[0]);
  }
}

async function loadCategory(id, label) {
  activeCategoryId = id;
  activeLabel = label;
  personaFilter = 'all';
  selectedRowId = '';
  sortState = { key: id === 'performance' ? 'p95LatencyMs' : (id === 'personas' ? 'errorCount' : 'timestamp'), dir: 'desc' };
  document.getElementById('detailTitle').textContent = 'Evidence workspace · ' + label;
  activeRows = await fetch('/api/category/' + id).then(function (r) { return r.json(); });
  await renderDetailTable();
  renderFilterChips();
  renderWorkspaceFilters();
}

function updateHero(summary) {
  const health = healthState(summary.errorRate, summary.p95Overall, summary.status);
  const badge = document.getElementById('heroHealthBadge');
  badge.className = 'status-badge ' + health.tone + (summary.status === 'running' ? ' pulse' : '');
  badge.textContent = health.label;
  document.getElementById('runSummaryLine').textContent = summary.summaryLine;
  document.getElementById('briefStatus').textContent = summary.status;
  document.getElementById('briefWindow').textContent = summary.startedAt ? durSec(summary.startedAt, summary.finishedAt, summary.status) : '-';
  document.getElementById('briefTarget').textContent = summary.targetShort;

  const badges = [];
  badges.push('<span class="status-badge ' + health.tone + '">' + esc(health.label) + '</span>');
  badges.push('<span class="status-badge info">' + esc(summary.completedAgents) + ' / ' + esc(summary.totalAgents) + ' agents completed</span>');
  badges.push('<span class="status-badge ' + (summary.errorRate > 0.15 ? 'warn' : 'ok') + '">' + esc(Math.round(summary.errorRate * 100)) + '% failure rate</span>');
  document.getElementById('heroBadges').innerHTML = badges.join('');
  document.getElementById('heroTargetTag').textContent = 'Target: ' + summary.targetShort;
}

function renderMetricCards(cardsData) {
  const maxCount = Math.max.apply(null, [1].concat(cardsData.map(function (c) { return Number(c.value) || 0; })));
  const cards = document.getElementById('cards');
  cards.innerHTML = '';

  cardsData.forEach(function (c) {
    const el = document.createElement('div');
    const interactive = c.category ? ' interactive' : '';
    const active = c.category && activeCategoryId === c.category ? ' active' : '';
    const pct = Math.max(4, Math.min(100, Math.round((Number(c.value || 0) / maxCount) * 100)));
    el.className = 'metric-card' + interactive + active;
    el.innerHTML = ''
      + '<div class="metric-top"><div class="metric-label">' + esc(c.label) + '</div><div class="metric-meta">' + esc(c.meta || '') + '</div></div>'
      + '<div class="metric-value mono" data-value="0" data-suffix="' + esc(c.suffix || '') + '">0' + esc(c.suffix || '') + '</div>'
      + '<div class="metric-sub">' + esc(c.hint) + '</div>'
      + (c.series && c.series.length ? buildSparkline(c.series) : '')
      + '<div class="metric-bar"><span style="width:' + pct + '%"></span></div>';
    if (c.category) {
      el.addEventListener('click', function () { loadCategory(c.category, c.categoryLabel || c.label); });
    }
    cards.appendChild(el);
    animateNumber(el.querySelector('.metric-value'), c.value);
  });
}

async function loadSummary() {
  const payload = await Promise.all([
    fetch('/api/summary').then(function (r) { return r.json(); }),
    fetch('/api/category/actions').then(function (r) { return r.json(); }),
    fetch('/api/category/errors').then(function (r) { return r.json(); }),
    fetch('/api/category/personas').then(function (r) { return r.json(); }),
    fetch('/api/category/performance').then(function (r) { return r.json(); })
  ]);

  const s = payload[0];
  const actions = payload[1];
  const errors = payload[2];
  const personas = payload[3];
  const perfRows = payload[4];
  const latestRun = s.latestRun || {};
  const previousRun = s.previousRun || null;
  const totalEvents = latestRun.totalEvents != null ? latestRun.totalEvents : (actions.length + errors.length);
  const errorRate = latestRun.errorRate != null ? latestRun.errorRate : (totalEvents ? errors.length / totalEvents : 0);
  const completedAgents = personas.filter(function (p) { return (p.actionCount + p.errorCount) > 0; }).length;
  const affectedPersonas = latestRun.impactedPersonas != null ? latestRun.impactedPersonas : personas.filter(function (p) { return (p.errorCount || 0) > 0; }).length;
  const uniqueEndpoints = latestRun.uniqueEndpoints != null ? latestRun.uniqueEndpoints : new Set(actions.concat(errors).map(function (e) { return e.endpoint; }).filter(Boolean)).size;
  const avgSuccessMs = latestRun.avgSuccessLatencyMs != null ? latestRun.avgSuccessLatencyMs : average(perfRows.map(function (p) { return p.avgLatencyMs; }));
  const p95Overall = latestRun.p95SuccessLatencyMs != null ? latestRun.p95SuccessLatencyMs : percentile(actions.map(function (a) { return a.latencyMs; }), 0.95);
  const avgFailureMs = latestRun.avgFailureLatencyMs != null ? latestRun.avgFailureLatencyMs : average(errors.map(function (e) { return e.latencyMs; }));
  const runHistory = (s.runHistory || []).slice(-8);

  let trendCopy = 'No previous run yet — this run establishes the baseline.';
  if (previousRun) {
    const rateDelta = Math.round((errorRate - (previousRun.errorRate || 0)) * 100);
    const p95Delta = Math.round((Number(p95Overall || 0)) - Number(previousRun.p95SuccessLatencyMs || 0));
    const parts = [];
    parts.push((rateDelta >= 0 ? '+' : '') + rateDelta + ' pts failure rate');
    parts.push((p95Delta >= 0 ? '+' : '') + p95Delta + 'ms success p95');
    if (latestRun.topEndpoint && previousRun.topEndpoint && latestRun.topEndpoint.endpoint !== previousRun.topEndpoint.endpoint) {
      parts.push('hotspot shifted to ' + latestRun.topEndpoint.endpoint);
    }
    trendCopy = 'Vs previous run: ' + parts.join(' · ');
  }

  const summary = {
    status: s.status,
    startedAt: s.startedAt,
    finishedAt: s.finishedAt,
    target: s.target,
    targetShort: s.target.replace(/^https?:\/\//, ''),
    errorRate: errorRate,
    p95Overall: Number(p95Overall || 0),
    completedAgents: completedAgents,
    totalAgents: personas.length,
    summaryLine: s.status === 'idle'
      ? 'Launch a synthetic run to generate findings, latency telemetry, and persona-level evidence.'
      : 'Observed ' + totalEvents + ' checks across ' + personas.length + ' synthetic users against ' + s.target + '. ' + trendCopy,
    latestRun: latestRun,
    previousRun: previousRun,
    trendCopy: trendCopy
  };

  document.getElementById('status').textContent = 'Status: ' + s.status + ' · Started: ' + fmtShort(s.startedAt) + ' · Finished: ' + fmtShort(s.finishedAt);
  updateHero(summary);
  updateMissionControl(summary);
  renderNexus(summary, personas, actions, errors);

  const findings = buildFindings(actions, errors, personas, perfRows);
  document.getElementById('briefGuidance').textContent = findings[0] ? findings[0].title : 'Awaiting run';

  const actionByEndpoint = Object.values(actions.reduce(function (acc, ev) { acc[ev.endpoint || 'unknown'] = (acc[ev.endpoint || 'unknown'] || 0) + 1; return acc; }, {})).sort(function (a, b) { return a - b; });
  const errorByEndpoint = Object.values(errors.reduce(function (acc, ev) { acc[ev.endpoint || 'unknown'] = (acc[ev.endpoint || 'unknown'] || 0) + 1; return acc; }, {})).sort(function (a, b) { return a - b; });
  const personaActionSeries = personas.map(function (p) { return p.actionCount || 0; }).sort(function (a, b) { return a - b; });
  const personaErrorSeries = personas.map(function (p) { return p.errorCount || 0; }).sort(function (a, b) { return a - b; });
  const successLatencySeries = runHistory.map(function (run) { return run.avgSuccessLatencyMs || 0; });
  const failureLatencySeries = runHistory.map(function (run) { return run.avgFailureLatencyMs || 0; });
  const p95HistorySeries = runHistory.map(function (run) { return run.p95SuccessLatencyMs || 0; });
  const failureRateHistorySeries = runHistory.map(function (run) { return Math.round((run.errorRate || 0) * 100); });
  const endpointCoverageHistory = runHistory.map(function (run) { return run.uniqueEndpoints || 0; });

  const cardsData = [
    { label: 'Successful checks', value: actions.length, hint: 'Observed successful endpoint checks across the run.', category: 'actions', categoryLabel: 'Actions', meta: deltaMeta(actions.length, previousRun && previousRun.successCount, ''), series: actionByEndpoint },
    { label: 'Failed checks', value: errors.length, hint: 'Failing checks requiring route or session triage.', category: 'errors', categoryLabel: 'Errors', meta: deltaMeta(errors.length, previousRun && previousRun.errorCount, ''), series: errorByEndpoint.length ? errorByEndpoint : [0] },
    { label: 'Completed agents', value: completedAgents, hint: 'Synthetic users that produced at least one event.', category: 'personas', categoryLabel: 'Personas', meta: deltaMeta(completedAgents, previousRun && previousRun.completedAgents, ''), series: personaActionSeries },
    { label: 'Impacted personas', value: affectedPersonas, hint: 'Distinct personas that encountered one or more failures.', category: 'personas', categoryLabel: 'Personas', meta: deltaMeta(affectedPersonas, previousRun && previousRun.impactedPersonas, ''), series: personaErrorSeries },
    { label: 'Avg success latency', value: avgSuccessMs, hint: 'Mean response time for successful checks only.', category: 'performance', categoryLabel: 'Performance', meta: deltaMeta(avgSuccessMs, previousRun && previousRun.avgSuccessLatencyMs, 'ms'), suffix: 'ms', series: successLatencySeries },
    { label: 'Success p95 latency', value: Number(p95Overall || 0), hint: 'Tail latency for successful checks only.', category: 'performance', categoryLabel: 'Performance', meta: deltaMeta(p95Overall, previousRun && previousRun.p95SuccessLatencyMs, 'ms'), suffix: 'ms', series: p95HistorySeries },
    { label: 'Avg failed latency', value: avgFailureMs, hint: 'Mean response time for failed checks, separated from healthy traffic.', category: 'performance', categoryLabel: 'Performance', meta: deltaMeta(avgFailureMs, previousRun && previousRun.avgFailureLatencyMs, 'ms'), suffix: 'ms', series: failureLatencySeries.length ? failureLatencySeries : [0] },
    { label: 'Failure rate', value: Math.round(errorRate * 100), hint: 'Share of observed checks that failed in the latest run.', category: 'errors', categoryLabel: 'Errors', meta: deltaMeta(Math.round(errorRate * 100), previousRun ? Math.round((previousRun.errorRate || 0) * 100) : null, ' pts'), suffix: '%', series: failureRateHistorySeries.length ? failureRateHistorySeries : [0] },
    { label: 'Endpoint coverage', value: uniqueEndpoints, hint: 'Unique endpoints touched by synthetic traffic this run.', category: 'actions', categoryLabel: 'Actions', meta: deltaMeta(uniqueEndpoints, previousRun && previousRun.uniqueEndpoints, ''), series: endpointCoverageHistory.length ? endpointCoverageHistory : actionByEndpoint.concat(errorByEndpoint).sort(function (a, b) { return a - b; }) }
  ];

  renderMetricCards(cardsData);
  renderOpsPanels(actions, errors, personas, perfRows, summary);
  renderWorkspaceFilters();

  if (!activeCategoryId && s.status !== 'idle') {
    if (errors.length) await loadCategory('errors', 'Errors');
    else await loadCategory('actions', 'Actions');
  } else if (activeCategoryId) {
    await renderDetailTable();
    renderWorkspaceFilters();
  }
}

document.getElementById('start').onclick = async function () {
  await fetch('/api/run/start');
  await loadSummary();
  const t = setInterval(async function () {
    await loadSummary();
    const s = await fetch('/api/summary').then(function (r) { return r.json(); });
    updateMissionControl({status: s.status, startedAt: s.startedAt, finishedAt: s.finishedAt});
    if (s.status !== 'running') clearInterval(t);
  }, 1200);
};

document.getElementById('openErrors').onclick = function () { loadCategory('errors', 'Errors'); };
document.getElementById('closePanel').onclick = closePanel;
window.addEventListener('keydown', function (e) { if (e.key === 'Escape') closePanel(); });

renderFilterChips();
renderWorkspaceFilters();
loadSummary();
`;

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'content-type'
    });
    return res.end();
  }

  if (u.pathname === '/') return html(res, UI);
  if (u.pathname === '/app.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript; charset=utf-8' });
    return res.end(APP_JS);
  }
  if (u.pathname === '/api/summary') return json(res, 200, summary());
  if (u.pathname === '/api/run/start') {
    void runSyntheticTest();
    return json(res, 202, { ok: true, status: state.status });
  }
  if (u.pathname.startsWith('/api/category/')) {
    const id = u.pathname.split('/').pop();
    return json(res, 200, categoryData(id));
  }

  return json(res, 404, { error: 'not_found' });
});

server.listen(PORT, () => {
  console.log(`Dashboard running at http://localhost:${PORT}`);
});
