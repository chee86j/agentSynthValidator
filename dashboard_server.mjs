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
  errors: []
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
}

function summary() {
  const latencies = state.actions.map(a => a.latencyMs);
  const avgLatency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
  return {
    status: state.status,
    startedAt: state.startedAt,
    finishedAt: state.finishedAt,
    target: TARGET,
    categories: [
      { id: 'actions', label: 'Actions', count: state.actions.length, hint: 'Successful endpoint checks by test users' },
      { id: 'errors', label: 'Errors', count: state.errors.length, hint: 'Failures grouped with user + persona context' },
      { id: 'personas', label: 'Personas', count: state.users.length, hint: 'All test users with personality variables' },
      { id: 'performance', label: 'Performance', count: avgLatency, hint: 'Average latency (ms)' }
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
      const lats = u.actions.map(a => a.latencyMs).sort((a, b) => a - b);
      const avg = lats.length ? Math.round(lats.reduce((a, b) => a + b, 0) / lats.length) : 0;
      const p95 = lats.length ? lats[Math.min(lats.length - 1, Math.floor(lats.length * 0.95))] : 0;
      return { username: u.username, persona: u.persona, avgLatencyMs: avg, p95LatencyMs: p95, errorCount: u.errors.length };
    });
  }
  return [];
}

const UI = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ACME Synthetic Test Dashboard</title>
  <style>
    :root {
      --bg: #070a12;
      --bg-elev: #0d111b;
      --bg-panel: rgba(14, 18, 29, 0.92);
      --bg-soft: rgba(255,255,255,0.03);
      --line: rgba(255,255,255,0.08);
      --line-strong: rgba(255,255,255,0.14);
      --text: #f3f6fb;
      --muted: #9aa4b5;
      --muted-2: #778195;
      --accent: #7387ff;
      --accent-2: #8edbff;
      --ok: #3ddc97;
      --warn: #f2b15c;
      --danger: #ff6b7d;
      --shadow: 0 24px 80px rgba(0,0,0,0.38);
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
        radial-gradient(1100px 520px at 0% -10%, rgba(115,135,255,0.14), transparent 55%),
        radial-gradient(1000px 560px at 100% 0%, rgba(142,219,255,0.10), transparent 50%),
        linear-gradient(180deg, #070a12 0%, #090d16 45%, #070a12 100%);
      letter-spacing: -0.01em;
    }
    .wrap { max-width: 1440px; margin: 0 auto; padding: 28px; }
    .topbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
    .brand { display: flex; align-items: center; gap: 14px; }
    .brand-mark {
      width: 42px; height: 42px; border-radius: 14px;
      background: linear-gradient(135deg, rgba(115,135,255,0.95), rgba(142,219,255,0.9));
      box-shadow: 0 10px 24px rgba(115,135,255,0.28); position: relative;
    }
    .brand-mark::after { content: ''; position: absolute; inset: 9px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.5); }
    .brand-copy small { display: block; color: var(--muted); text-transform: uppercase; letter-spacing: 0.18em; font-size: 11px; margin-bottom: 4px; font-weight: 700; }
    .brand-copy strong { display: block; font-size: 15px; font-weight: 600; }
    .topbar-meta { display: flex; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
    .micro-pill {
      display: inline-flex; align-items: center; gap: 7px; padding: 8px 12px; border-radius: 999px;
      border: 1px solid var(--line); background: rgba(255,255,255,0.03); color: #d7deea; font-size: 12px; white-space: nowrap;
    }
    .micro-dot { width: 7px; height: 7px; border-radius: 999px; background: var(--accent-2); box-shadow: 0 0 0 6px rgba(142,219,255,0.08); }
    .hero-grid { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(320px, 0.9fr); gap: 16px; margin-bottom: 18px; }
    .panel {
      background: linear-gradient(180deg, rgba(18,23,38,0.96), rgba(10,14,23,0.96));
      border: 1px solid var(--line); border-radius: var(--radius); box-shadow: var(--shadow); backdrop-filter: blur(12px);
    }
    .hero-main {
      padding: 24px; min-height: 248px; display: flex; flex-direction: column; justify-content: space-between; position: relative; overflow: hidden;
    }
    .hero-main::before {
      content: ''; position: absolute; inset: 0;
      background: linear-gradient(135deg, rgba(115,135,255,0.12), transparent 35%), radial-gradient(500px 280px at 100% 0%, rgba(142,219,255,0.10), transparent 60%);
      pointer-events: none;
    }
    .eyebrow { color: #bfc9ff; text-transform: uppercase; letter-spacing: 0.22em; font-size: 11px; font-weight: 700; margin-bottom: 12px; }
    .hero-title { margin: 0; font-size: clamp(2.1rem, 4vw, 3.6rem); line-height: 0.98; font-weight: 650; max-width: 11ch; letter-spacing: -0.045em; }
    .hero-lead { margin: 14px 0 0; max-width: 66ch; color: #b9c3d6; font-size: 15px; line-height: 1.65; }
    .hero-footer { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-top: 22px; position: relative; z-index: 1; }
    .status-cluster, .hero-tags, .hero-actions { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
    .status-badge, .tag {
      display: inline-flex; align-items: center; gap: 8px; border-radius: 999px; padding: 8px 12px; font-size: 12px; border: 1px solid transparent; font-weight: 600;
    }
    .status-badge.info, .tag.info { color: #d4ecff; border-color: rgba(142,219,255,0.25); background: rgba(142,219,255,0.08); }
    .status-badge.ok, .tag.ok { color: #dcfff0; border-color: rgba(61,220,151,0.28); background: rgba(61,220,151,0.08); }
    .status-badge.warn, .tag.warn { color: #ffe8c9; border-color: rgba(242,177,92,0.34); background: rgba(242,177,92,0.10); }
    .status-badge.danger, .tag.danger { color: #ffd4da; border-color: rgba(255,107,125,0.35); background: rgba(255,107,125,0.10); }
    button { border: 0; border-radius: 12px; cursor: pointer; font: inherit; transition: transform .18s ease, filter .18s ease, border-color .18s ease, background .18s ease; }
    .btn-primary { background: linear-gradient(135deg, #7486ff, #8edbff); color: #07101f; font-weight: 700; padding: 12px 16px; box-shadow: 0 12px 28px rgba(115,135,255,0.26); }
    .btn-primary:hover { transform: translateY(-1px); filter: brightness(1.03); }
    .btn-secondary { background: rgba(255,255,255,0.04); color: var(--text); border: 1px solid var(--line); padding: 11px 14px; }
    .btn-secondary:hover { transform: translateY(-1px); border-color: var(--line-strong); }
    .run-brief { padding: 22px; display: flex; flex-direction: column; gap: 16px; min-height: 248px; }
    .section-label { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: 0.18em; font-weight: 700; }
    .health-line { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 6px; }
    .health-line strong { font-size: 28px; line-height: 1; letter-spacing: -0.04em; }
    .brief-copy { color: var(--muted); font-size: 14px; line-height: 1.65; }
    .brief-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
    .brief-stat { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 14px; padding: 12px; }
    .brief-stat .label { font-size: 12px; color: var(--muted-2); margin-bottom: 8px; }
    .brief-stat .value { font-size: 18px; font-weight: 650; letter-spacing: -0.03em; }
    .brief-stat .sub { margin-top: 6px; font-size: 12px; color: var(--muted); line-height: 1.45; }
    .metrics-grid { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 12px; margin-bottom: 18px; }
    .metric-card {
      grid-column: span 2; background: linear-gradient(180deg, rgba(18,24,37,0.95), rgba(13,17,28,0.96));
      border: 1px solid var(--line); border-radius: 16px; padding: 16px; box-shadow: 0 14px 40px rgba(0,0,0,0.22);
    }
    .metric-card.interactive { cursor: pointer; }
    .metric-card.interactive:hover { transform: translateY(-2px); border-color: rgba(115,135,255,0.34); }
    .metric-card.active { border-color: rgba(115,135,255,0.5); box-shadow: 0 0 0 1px rgba(115,135,255,0.16) inset, 0 18px 44px rgba(0,0,0,0.3); }
    .metric-top { display: flex; justify-content: space-between; gap: 12px; align-items: center; margin-bottom: 12px; }
    .metric-label { color: #d8deea; font-size: 12px; text-transform: uppercase; letter-spacing: 0.14em; font-weight: 700; }
    .metric-meta { color: var(--muted-2); font-size: 11px; }
    .metric-value { font-size: 34px; line-height: 1; letter-spacing: -0.05em; font-weight: 680; margin-bottom: 10px; }
    .metric-sub { color: var(--muted); font-size: 13px; line-height: 1.5; }
    .metric-bar { height: 7px; margin-top: 14px; border-radius: 999px; background: rgba(255,255,255,0.06); overflow: hidden; }
    .metric-bar > span { display: block; height: 100%; width: 0%; border-radius: 999px; background: linear-gradient(90deg, rgba(115,135,255,0.95), rgba(142,219,255,0.95)); transition: width .45s ease; }
    .insight-grid { display: grid; grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) minmax(300px, 0.86fr); gap: 16px; margin-bottom: 18px; }
    .panel-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 14px; }
    .panel-head h3, .panel-head h4 { margin: 0; letter-spacing: -0.03em; }
    .headline-panel { padding: 20px; display: flex; flex-direction: column; gap: 18px; }
    .headline-title { font-size: 30px; line-height: 1.02; letter-spacing: -0.05em; margin: 0; max-width: 14ch; }
    .headline-copy { color: #b8c3d7; font-size: 15px; line-height: 1.65; max-width: 56ch; }
    .headline-callout { border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); border-radius: 16px; padding: 14px; }
    .callout-kicker { color: var(--muted-2); font-size: 11px; text-transform: uppercase; letter-spacing: 0.16em; font-weight: 700; margin-bottom: 8px; }
    .callout-text { font-size: 14px; color: #dbe4f3; line-height: 1.6; }
    .list-panel { padding: 20px; }
    .list-scroller { max-height: 440px; overflow: auto; padding-right: 4px; }
    .finding-item, .feed-item, .error-item, .persona-item { border: 1px solid rgba(255,255,255,0.08); background: rgba(255,255,255,0.03); border-radius: 14px; padding: 12px 13px; margin-bottom: 10px; }
    .finding-item strong, .feed-item strong, .error-item strong, .persona-item strong { display: block; margin-bottom: 4px; color: #eef3fb; font-size: 14px; }
    .chip { display: inline-flex; align-items: center; gap: 6px; border-radius: 999px; padding: 5px 8px; font-size: 10px; border: 1px solid transparent; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 700; margin-bottom: 8px; }
    .chip.info { color: #d4ecff; border-color: rgba(142,219,255,0.26); background: rgba(142,219,255,0.09); }
    .chip.warn { color: #ffe8c9; border-color: rgba(242,177,92,0.32); background: rgba(242,177,92,0.10); }
    .chip.danger { color: #ffd4da; border-color: rgba(255,107,125,0.36); background: rgba(255,107,125,0.10); }
    .chip.ok { color: #dcfff0; border-color: rgba(61,220,151,0.28); background: rgba(61,220,151,0.08); }
    .evidence-grid { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(320px, 0.75fr); gap: 16px; margin-bottom: 18px; }
    .workspace { padding: 18px; }
    .workspace-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 14px; margin-bottom: 14px; flex-wrap: wrap; }
    .workspace-head h3 { margin: 0; font-size: 24px; letter-spacing: -0.04em; }
    .workspace-meta { color: var(--muted); font-size: 13px; line-height: 1.55; max-width: 72ch; }
    .workspace-filters { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
    .filter-btn { background: rgba(255,255,255,0.03); color: #d8deea; border: 1px solid var(--line); padding: 8px 11px; border-radius: 999px; font-size: 12px; font-weight: 600; }
    .filter-btn:hover { border-color: var(--line-strong); }
    .filter-btn.active { background: rgba(115,135,255,0.14); border-color: rgba(115,135,255,0.42); color: #e7ebff; }
    .activity-grid { display: grid; grid-template-columns: minmax(0, 1.45fr) minmax(320px, 0.88fr); gap: 14px; align-items: start; }
    .table-wrap { overflow: auto; border-radius: 16px; border: 1px solid var(--line); background: rgba(9,12,20,0.95); }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { padding: 11px 12px; border-bottom: 1px solid rgba(255,255,255,0.06); vertical-align: top; text-align: left; }
    th { position: sticky; top: 0; z-index: 1; background: rgba(16,21,34,0.98); color: #d7deea; font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; }
    th.sortable { padding: 0; }
    .th-btn { width: 100%; text-align: left; background: transparent; border: 0; box-shadow: none; color: #d7deea; border-radius: 0; padding: 11px 12px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; font-weight: 700; }
    .th-btn:hover { background: rgba(255,255,255,0.04); }
    tr.row-click { cursor: pointer; }
    tr.row-click:hover td { background: rgba(255,255,255,0.03); }
    tr.selected td {
      background: linear-gradient(180deg, rgba(115,135,255,0.16), rgba(115,135,255,0.10)) !important;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.05), inset 3px 0 0 rgba(142,219,255,0.95);
    }
    .mono { font-family: var(--mono); }
    .inline-detail {
      border: 1px solid rgba(115,135,255,0.16);
      border-radius: 16px;
      background: linear-gradient(180deg, rgba(9,13,22,0.96), rgba(8,11,18,0.90));
      padding: 16px;
      min-height: 240px;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.04);
    }
    .inline-detail h4 { margin: 0 0 10px; font-size: 17px; letter-spacing: -0.03em; }
    .muted { color: var(--muted); }
    .pill { display: inline-flex; align-items: center; border-radius: 999px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08); color: #dbe4f3; font-size: 11px; padding: 5px 8px; margin-right: 6px; margin-bottom: 6px; }
    .kv { display: grid; grid-template-columns: 110px 1fr; gap: 7px 10px; font-size: 12px; margin-top: 12px; }
    .kv .k { color: var(--muted-2); }
    .kv .v { color: #eaf0fa; }
    pre { white-space: pre-wrap; word-break: break-word; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06); border-radius: 14px; padding: 12px; font-size: 12px; line-height: 1.55; color: #d3dced; overflow: auto; }
    .side-panel { position: fixed; top: 0; right: 0; width: min(480px, 96vw); height: 100vh; background: rgba(10,13,21,0.98); border-left: 1px solid var(--line); box-shadow: -24px 0 64px rgba(0,0,0,0.4); transform: translateX(105%); transition: transform .28s ease; z-index: 40; display: flex; flex-direction: column; }
    .side-panel.open { transform: translateX(0); }
    .drawer-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; border-bottom: 1px solid var(--line); background: rgba(255,255,255,0.03); }
    .drawer-body { padding: 16px; overflow: auto; }
    .persona-filters { margin-bottom: 12px; }
    .fchip { display: inline-block; margin-right: 6px; margin-bottom: 6px; border: 1px solid rgba(255,255,255,0.12); color: #dbe4f3; background: rgba(255,255,255,0.04); border-radius: 999px; font-size: 11px; padding: 6px 10px; cursor: pointer; }
    .fchip.active { border-color: rgba(115,135,255,0.4); background: rgba(115,135,255,0.14); color: #e7ebff; }
    @media (max-width: 1200px) { .metrics-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } .metric-card { grid-column: span 2; } .insight-grid, .evidence-grid { grid-template-columns: 1fr; } }
    @media (max-width: 980px) { .wrap { padding: 18px; } .hero-grid, .activity-grid { grid-template-columns: 1fr; } .workspace-head { align-items: flex-start; } }
    @media (max-width: 720px) { .topbar { flex-direction: column; align-items: flex-start; } .topbar-meta { justify-content: flex-start; } .metrics-grid { grid-template-columns: 1fr; } .metric-card { grid-column: span 1; } .brief-grid { grid-template-columns: 1fr; } .hero-footer { flex-direction: column; align-items: flex-start; } .workspace { padding: 14px; } .wrap { padding: 14px; } }
    @media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
  </style>
</head>
<body>
  <div class="wrap">
    <header class="topbar">
      <div class="brand">
        <div class="brand-mark" aria-hidden="true"></div>
        <div class="brand-copy">
          <small>synthetic validation</small>
          <strong>AgentSynthValidator · Command Center</strong>
        </div>
      </div>
      <div class="topbar-meta">
        <span class="micro-pill"><span class="micro-dot"></span>Premade personas</span>
        <span class="micro-pill">Remote target monitoring</span>
        <span class="micro-pill">Flagship dashboard preview</span>
      </div>
    </header>

    <section class="hero-grid">
      <div class="panel hero-main">
        <div>
          <div class="eyebrow">Synthetic user operations</div>
          <h1 class="hero-title">See where synthetic users struggle before your real users do.</h1>
          <p class="hero-lead">Monitor autonomous test accounts against a deployed product, surface failures and latency hotspots, and inspect persona-by-persona evidence from a single command surface.</p>
        </div>
        <div class="hero-footer">
          <div>
            <div class="status-cluster" id="heroBadges"><span class="status-badge info">Waiting for first run</span></div>
            <div class="hero-tags" style="margin-top:10px">
              <span class="tag info" id="heroTargetTag">Target not yet sampled</span>
              <span class="tag ok">20 synthetic users</span>
              <span class="tag warn">Marketplace path coverage</span>
            </div>
          </div>
          <div class="hero-actions">
            <button class="btn-primary" id="start">Start 20-user run</button>
            <button class="btn-secondary" id="openErrors" type="button">Inspect failures</button>
          </div>
        </div>
      </div>

      <aside class="panel run-brief">
        <div>
          <div class="section-label">Run health</div>
          <div class="health-line">
            <strong id="heroHealthText">Idle</strong>
            <span class="status-badge info" id="heroHealthBadge">No active run</span>
          </div>
          <p class="brief-copy" id="runSummaryLine">Launch a synthetic run to generate findings, latency telemetry, and persona-level evidence.</p>
        </div>
        <div class="brief-grid">
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
  </div>

  <aside id="sidePanel" class="side-panel" aria-hidden="true">
    <div class="drawer-head"><strong id="panelTitle">Detail</strong><button class="btn-secondary" id="closePanel" type="button">Close</button></div>
    <div class="drawer-body" id="panelBody"></div>
  </aside>

<script src="/app.js"></script>
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

function animateNumber(el, target) {
  const next = Number(target || 0);
  const prev = Number(el.dataset.value || 0);
  const suffix = el.dataset.suffix || '';
  const start = performance.now();
  const dur = 420;

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

  badge.className = 'status-badge ' + health.tone;
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
    p95LatencyMs: Number(row.p95LatencyMs != null ? row.p95LatencyMs : 0),
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
    + '<span class="pill">latency: ' + esc(String(row.latencyMs)) + 'ms</span>'
    + '<span class="pill">p95: ' + esc(String(row.p95LatencyMs)) + 'ms</span>'
    + '</div>'
    + '<div class="kv">'
    + '<div class="k">Endpoint</div><div class="v">' + esc(row.endpoint) + '</div>'
    + '<div class="k">Action count</div><div class="v">' + esc(String(row.actionCount)) + '</div>'
    + '<div class="k">Error count</div><div class="v">' + esc(String(row.errorCount)) + '</div>'
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
      + '<td class="mono">' + esc(String(r.latencyMs)) + 'ms</td>'
      + '<td class="mono">' + esc(String(r.p95LatencyMs)) + 'ms</td>'
      + '<td class="mono">' + esc(String(r.actionCount)) + '</td>'
      + '<td class="mono">' + esc(String(r.errorCount)) + '</td>'
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
  document.getElementById('heroHealthText').textContent = health.headline;
  const badge = document.getElementById('heroHealthBadge');
  badge.className = 'status-badge ' + health.tone;
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
  const totalEvents = actions.length + errors.length;
  const errorRate = totalEvents ? errors.length / totalEvents : 0;
  const completedAgents = personas.filter(function (p) { return (p.actionCount + p.errorCount) > 0; }).length;
  const perfCategory = s.categories.find(function (c) { return c.id === 'performance'; });
  const avgActionMs = (perfCategory && perfCategory.count) || 0;
  const p95Overall = perfRows.length ? Math.round(perfRows.reduce(function (acc, r) { return acc + (r.p95LatencyMs || 0); }, 0) / perfRows.length) : 0;
  const affectedPersonas = personas.filter(function (p) { return (p.errorCount || 0) > 0; }).length;
  const uniqueEndpoints = new Set(actions.concat(errors).map(function (e) { return e.endpoint; }).filter(Boolean)).size;

  const summary = {
    status: s.status,
    startedAt: s.startedAt,
    finishedAt: s.finishedAt,
    target: s.target,
    targetShort: s.target.replace(/^https?:\/\//, ''),
    errorRate: errorRate,
    p95Overall: p95Overall,
    completedAgents: completedAgents,
    totalAgents: personas.length,
    summaryLine: s.status === 'idle'
      ? 'Launch a synthetic run to generate findings, latency telemetry, and persona-level evidence.'
      : 'Observed ' + totalEvents + ' checks across ' + personas.length + ' synthetic users against ' + s.target + '.'
  };

  document.getElementById('status').textContent = 'Status: ' + s.status + ' · Started: ' + fmtShort(s.startedAt) + ' · Finished: ' + fmtShort(s.finishedAt);
  updateHero(summary);

  const findings = buildFindings(actions, errors, personas, perfRows);
  document.getElementById('briefGuidance').textContent = findings[0] ? findings[0].title : 'Awaiting run';

  const cardsData = [
    { label: 'Successful checks', value: actions.length, hint: 'Observed successful endpoint checks across the run.', category: 'actions', categoryLabel: 'Actions', meta: 'actions' },
    { label: 'Failed checks', value: errors.length, hint: 'Failing checks requiring route or session triage.', category: 'errors', categoryLabel: 'Errors', meta: 'errors' },
    { label: 'Completed agents', value: completedAgents, hint: 'Synthetic users that produced at least one event.', category: 'personas', categoryLabel: 'Personas', meta: 'coverage' },
    { label: 'Impacted personas', value: affectedPersonas, hint: 'Distinct personas that encountered one or more failures.', category: 'personas', categoryLabel: 'Personas', meta: 'risk spread' },
    { label: 'Average latency', value: avgActionMs, hint: 'Mean response time for successful checks.', category: 'performance', categoryLabel: 'Performance', meta: 'mean', suffix: 'ms' },
    { label: 'P95 latency', value: p95Overall, hint: 'Tail latency averaged across participating users.', category: 'performance', categoryLabel: 'Performance', meta: 'tail', suffix: 'ms' },
    { label: 'Failure rate', value: Math.round(errorRate * 100), hint: 'Share of observed checks that failed in the latest run.', category: 'errors', categoryLabel: 'Errors', meta: 'ratio', suffix: '%' },
    { label: 'Endpoint coverage', value: uniqueEndpoints, hint: 'Unique endpoints touched by synthetic traffic this run.', category: 'actions', categoryLabel: 'Actions', meta: 'breadth' }
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
