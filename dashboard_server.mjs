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
  <title>ACME Synthetic Test Dashboard</title>
  <style>
    :root {
      --bg-0: #050816;
      --bg-1: #071025;
      --panel: rgba(15, 24, 46, 0.78);
      --line: rgba(111,148,221,0.22);
      --line-hot: #2cf6e3;
      --text: #eff5ff;
      --muted: #8ea1c7;
      --accent: #2cf6e3;
      --accent-2: #6fb8ff;
      --accent-3: #7c6cff;
      --ok: #58ff94;
      --warn: #ffb649;
      --danger: #ff6b86;
    }
    * { box-sizing: border-box; }
    body {
      font-family: Inter, Segoe UI, Arial, sans-serif;
      color: var(--text);
      margin: 0;
      background:
        radial-gradient(1200px 600px at 10% -10%, rgba(59,130,246,.22), transparent 55%),
        radial-gradient(900px 500px at 100% 0%, rgba(34,211,238,.15), transparent 55%),
        linear-gradient(180deg, var(--bg-0), var(--bg-1));
      min-height: 100vh;
      animation: fadeIn .45s ease-out;
    }
    .wrap {
      padding: 24px;
      max-width: 1220px;
      margin: 0 auto;
    }
    .hero {
      background: linear-gradient(180deg, rgba(8,18,37,.92), rgba(8,18,37,.7));
      border: 1px solid rgba(111,148,221,0.28);
      border-radius: 16px;
      padding: 18px 20px;
      box-shadow: 0 24px 70px rgba(0,0,0,0.45), 0 0 0 1px rgba(44,246,227,.08) inset;
      margin-bottom: 16px;
      animation: riseIn .5s ease-out;
    }
    .eyebrow {
      text-transform: uppercase;
      letter-spacing: 0.22em;
      font-size: 11px;
      color: var(--accent);
      margin-bottom: 8px;
      font-weight: 700;
    }
    .hero-title {
      margin: 0;
      font-size: clamp(2.1rem, 4.6vw, 3.8rem);
      line-height: 1.05;
      font-weight: 800;
      background: linear-gradient(90deg, #dffeff 0%, #6fb8ff 40%, #7c6cff 100%);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
    .hero-sub {
      margin-top: 8px;
      color: var(--muted);
      font-size: 13px;
    }
    .hero-nav {
      display: flex;
      gap: 8px;
      margin-top: 14px;
      flex-wrap: wrap;
    }
    .nav-pill {
      border: 1px solid rgba(111,148,221,0.32);
      border-radius: 999px;
      padding: 6px 11px;
      font-size: 12px;
      color: #d7e6ff;
      background: rgba(12, 21, 40, .72);
    }
    .status-strip {
      margin-top: 12px;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .status-pill {
      border-radius: 999px;
      font-size: 11px;
      padding: 5px 9px;
      border: 1px solid transparent;
      font-weight: 600;
    }
    .status-pill.info { color: #b9eeff; border-color: rgba(44,246,227,.4); background: rgba(44,246,227,.12); }
    .status-pill.ok { color: #d9ffe9; border-color: rgba(88,255,148,.45); background: rgba(88,255,148,.13); }
    .status-pill.warn { color: #ffe8c7; border-color: rgba(255,182,73,.45); background: rgba(255,182,73,.13); }

    .control-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 10px;
    }

    .row {
      display: grid;
      grid-template-columns: repeat(1, minmax(0, 1fr));
      gap: 12px;
    }
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(180px, 1fr));
      gap: 12px;
      margin-bottom: 14px;
    }
    .card {
      background: linear-gradient(180deg, rgba(31,41,55,.9), var(--panel));
      border: 1px solid var(--line);
      border-radius: 12px;
      padding: 14px;
      cursor: pointer;
      box-shadow: 0 10px 30px rgba(0,0,0,.22);
      transform: translateY(0) scale(1);
      transition: transform .24s ease, border-color .24s ease, box-shadow .24s ease;
      animation: cardIn .45s ease both;
      backdrop-filter: blur(5px);
    }
    .card:hover {
      border-color: var(--line-hot);
      transform: translateY(-4px) scale(1.01);
      box-shadow: 0 14px 38px rgba(37, 99, 235, .25);
    }
    .count {
      font-size: 30px;
      font-weight: 700;
      margin-top: 6px;
      background: linear-gradient(90deg, #fff, #93c5fd);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
      animation: pulseSoft 2.8s ease-in-out infinite;
    }
    button {
      background: linear-gradient(90deg, var(--accent), var(--accent-2));
      color: white;
      border: 0;
      padding: 10px 14px;
      border-radius: 10px;
      cursor: pointer;
      font-weight: 600;
      box-shadow: 0 8px 22px rgba(37, 99, 235, .35);
      transition: transform .18s ease, box-shadow .18s ease, filter .18s ease;
    }
    button:hover { transform: translateY(-1px); filter: brightness(1.04); }
    button:active { transform: translateY(0); }
    .table-wrap {
      margin-top: 12px;
      overflow: auto;
      border-radius: 12px;
      border: 1px solid var(--line);
      background: rgba(17, 24, 39, .75);
      animation: riseIn .35s ease-out;
    }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th, td { border: 1px solid var(--line); padding: 8px; vertical-align: top; }
    th {
      background: rgba(31,41,55,.95);
      text-align: left;
      position: sticky;
      top: 0;
      z-index: 1;
    }
    tr:hover td { background: rgba(59,130,246,.08); }
    .row-click { cursor: pointer; }
    .muted { color: var(--muted); font-size: 12px; }
    #detailTitle { margin: 18px 0 6px; }
    .sparkline { width: 100%; height: 28px; margin-top: 8px; opacity: .9; }
    .sparkline path { fill: none; stroke: rgba(147,197,253,.95); stroke-width: 2; }

    .card-head { display: flex; align-items: center; justify-content: space-between; }
    .gauge { width: 42px; height: 42px; }
    .gauge-bg { fill: none; stroke: rgba(148, 163, 184, .25); stroke-width: 6; }
    .gauge-val {
      fill: none;
      stroke: url(#g);
      stroke-width: 6;
      stroke-linecap: round;
      transform: rotate(-90deg);
      transform-origin: 50% 50%;
      transition: stroke-dashoffset .45s ease;
    }
    .gauge-text {
      font-size: 8px;
      fill: #bfdbfe;
      font-weight: 600;
      text-anchor: middle;
      dominant-baseline: middle;
    }

    #fxCanvas {
      position: fixed;
      inset: 0;
      z-index: -1;
      pointer-events: none;
      opacity: .45;
    }

    .side-panel {
      position: fixed;
      top: 0;
      right: 0;
      width: min(460px, 95vw);
      height: 100vh;
      background: rgba(17,24,39,.96);
      border-left: 1px solid var(--line);
      box-shadow: -20px 0 50px rgba(0,0,0,.35);
      transform: translateX(105%);
      transition: transform .3s ease;
      z-index: 30;
      display: flex;
      flex-direction: column;
    }
    .side-panel.open { transform: translateX(0); }
    .panel-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 14px;
      border-bottom: 1px solid var(--line);
      background: rgba(31,41,55,.75);
    }
    .panel-body { padding: 12px 14px; overflow: auto; }
    .pill {
      display: inline-block;
      background: rgba(37,99,235,.25);
      border: 1px solid rgba(96,165,250,.45);
      color: #bfdbfe;
      border-radius: 999px;
      font-size: 11px;
      padding: 3px 8px;
      margin-right: 6px;
      margin-bottom: 6px;
    }
    pre {
      white-space: pre-wrap;
      word-break: break-word;
      background: rgba(2,6,23,.65);
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 10px;
      font-size: 12px;
      line-height: 1.45;
      color: #cbd5e1;
    }

    .persona-filters { margin-bottom: 8px; }
    .fchip {
      display: inline-block;
      margin-right: 6px;
      margin-bottom: 6px;
      border: 1px solid #334155;
      color: #cbd5e1;
      background: rgba(15, 23, 42, .75);
      border-radius: 999px;
      font-size: 11px;
      padding: 5px 9px;
      cursor: pointer;
      transition: transform .16s ease, border-color .16s ease, background .16s ease;
    }
    .fchip:hover { transform: translateY(-1px); border-color: #60a5fa; }
    .fchip.active { border-color: #60a5fa; background: rgba(37, 99, 235, .26); color: #dbeafe; }

    .surface {
      background: linear-gradient(180deg, rgba(8,18,37,.88), rgba(8,18,37,.62));
      border: 1px solid rgba(111,148,221,0.24);
      border-radius: 14px;
      padding: 14px;
      box-shadow: 0 24px 70px rgba(0,0,0,0.35);
    }
    .surface h4 { margin: 0 0 10px; letter-spacing: .05em; font-size: 13px; text-transform: uppercase; color: #9fd3ff; }
    .ops-grid {
      display: grid;
      grid-template-columns: 1.25fr .75fr;
      gap: 12px;
      margin-bottom: 14px;
    }
    .feed-item, .finding-item, .error-item {
      border: 1px solid rgba(111,148,221,0.2);
      border-radius: 10px;
      padding: 8px 10px;
      margin-bottom: 8px;
      background: rgba(5,10,25,.55);
    }
    .mono { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
    .chip {
      display: inline-block;
      border-radius: 999px;
      padding: 2px 8px;
      font-size: 10px;
      margin-right: 6px;
      border: 1px solid transparent;
      text-transform: uppercase;
      letter-spacing: .08em;
    }
    .chip.info { color:#c7f7ff; border-color: rgba(44,246,227,.35); background: rgba(44,246,227,.12); }
    .chip.warn { color:#ffe3be; border-color: rgba(255,182,73,.4); background: rgba(255,182,73,.16); }
    .chip.danger { color:#ffd3dc; border-color: rgba(255,107,134,.45); background: rgba(255,107,134,.16); }
    .scroll-zone { max-height: 310px; overflow: auto; }

    .activity-shell { padding: 12px 12px 8px; }
    .activity-head {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 10px;
    }
    .activity-grid {
      display: grid;
      grid-template-columns: minmax(0, 1.45fr) minmax(290px, .95fr);
      gap: 12px;
      align-items: start;
    }
    .inline-detail {
      border: 1px solid var(--line);
      border-radius: 12px;
      background: rgba(2,6,23,.58);
      padding: 10px;
      min-height: 220px;
    }
    .inline-detail h4 { margin: 0 0 8px; font-size: 14px; color: #dbeafe; }
    .kv { display: grid; grid-template-columns: 120px 1fr; gap: 6px 10px; font-size: 12px; }
    .kv .k { color: #9fb6d6; }
    .kv .v { color: #e5edf9; }

    th.sortable { padding: 0; }
    .th-btn {
      width: 100%;
      text-align: left;
      background: transparent;
      border: 0;
      box-shadow: none;
      color: #d6e4ff;
      border-radius: 0;
      padding: 8px;
      font-size: 12px;
      letter-spacing: .01em;
    }
    .th-btn:hover { transform: none; filter: none; background: rgba(59,130,246,.12); }
    tr.selected td { background: rgba(59,130,246,.19) !important; }

    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes riseIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes cardIn { from { opacity: 0; transform: translateY(8px) scale(.985); } to { opacity: 1; transform: translateY(0) scale(1); } }
    @keyframes pulseSoft { 0%, 100% { opacity: 1; } 50% { opacity: .82; } }

    @media (max-width: 960px) {
      .metrics-grid { grid-template-columns: repeat(2, minmax(180px, 1fr)); }
      .ops-grid { grid-template-columns: 1fr; }
      .activity-grid { grid-template-columns: 1fr; }
      .control-row { flex-direction: column; align-items: flex-start; }
    }
    @media (max-width: 600px) {
      .metrics-grid { grid-template-columns: 1fr; }
      .wrap { padding: 14px; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation: none !important; transition: none !important; }
      #fxCanvas { display: none; }
    }
  </style>
</head>
<body>
  <canvas id="fxCanvas"></canvas>
  <div class="wrap">
    <header class="hero">
      <div class="eyebrow">Live · Synthetic Control</div>
      <h1 class="hero-title">Synthetic User Validation Platform</h1>
      <div class="hero-sub">Org: ACME · Environment: Production Target · Session mode: Multi-agent monitor</div>
      <nav class="hero-nav" aria-label="dashboard sections">
        <span class="nav-pill">Projects</span>
        <span class="nav-pill">Personas</span>
        <span class="nav-pill">Test Accounts</span>
        <span class="nav-pill">Workflows</span>
        <span class="nav-pill">LLM Providers</span>
        <span class="nav-pill">Calibration</span>
        <span class="nav-pill">Run Setup</span>
      </nav>
      <div class="status-strip">
        <span class="status-pill info">dark ops theme</span>
        <span class="status-pill ok">multi-agent ready</span>
        <span class="status-pill warn">live remote target</span>
      </div>
    </header>

    <div class="control-row">
      <button id="start">Start 20-user run</button>
      <div class="muted" id="status"></div>
    </div>
    <div class="metrics-grid" id="cards"></div>

    <div class="ops-grid">
      <section class="surface">
        <h4>Live Event Feed</h4>
        <div id="liveFeed" class="scroll-zone muted">Waiting for run events...</div>
      </section>
      <section class="surface">
        <h4>Findings & Recommendations</h4>
        <div id="findings" class="scroll-zone muted" style="max-height:190px">Run a simulation to generate findings.</div>
        <h4 style="margin-top:12px;">Recent Errors</h4>
        <div id="recentErrors" class="scroll-zone muted" style="max-height:140px">No errors yet.</div>
      </section>
    </div>

    <section class="surface activity-shell">
      <div class="activity-head">
        <h3 id="detailTitle">Agent activity table (click a category card)</h3>
        <div id="detailMeta" class="muted">Sortable by username, status, latency, and recency.</div>
      </div>
      <div class="activity-grid">
        <div id="detail"></div>
        <aside id="inlineDetail" class="inline-detail muted">Select a row to inspect user/persona details and raw payload.</aside>
      </div>
    </section>
  </div>

  <aside id="sidePanel" class="side-panel" aria-hidden="true">
    <div class="panel-head">
      <strong id="panelTitle">Detail</strong>
      <button id="closePanel" type="button">Close</button>
    </div>
    <div class="panel-body" id="panelBody"></div>
  </aside>
<script>
let activeRows = [];
let activeLabel = '';
let activeCategoryId = '';
let personaFilter = 'all';
let selectedRowId = '';
let sortState = { key: 'timestamp', dir: 'desc' };

function esc(x){ return String(x ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;'); }

function animateNumber(el, target) {
  const next = Number(target || 0);
  const prev = Number(el.dataset.value || 0);
  const start = performance.now();
  const dur = 460;
  function tick(now) {
    const t = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - t, 3);
    const val = Math.round(prev + (next - prev) * eased);
    el.textContent = String(val);
    if (t < 1) requestAnimationFrame(tick);
  }
  el.dataset.value = String(next);
  requestAnimationFrame(tick);
}

function renderSparkline(svg, base, seed) {
  const w = 180;
  const h = 28;
  const points = [];
  for (let i = 0; i < 16; i++) {
    const x = (i / 15) * w;
    const wave = Math.sin((i + seed) * 0.9) * 4;
    const lift = Math.cos((i + seed * 1.3) * 0.4) * 2;
    const y = Math.max(3, Math.min(h - 3, h - 6 - ((base % 40) / 40) * 12 + wave + lift));
    points.push([x, y]);
  }
  let d = 'M ' + points[0][0].toFixed(2) + ' ' + points[0][1].toFixed(2);
  for (let i = 1; i < points.length; i++) d += ' L ' + points[i][0].toFixed(2) + ' ' + points[i][1].toFixed(2);
  svg.innerHTML = '<path d="' + d + '"></path>';
}

function personaColor(label) {
  const map = {
    power_user: '#60a5fa',
    tech_averse: '#f59e0b',
    price_hunter: '#34d399',
    impulse_buyer: '#f472b6',
    careful_researcher: '#a78bfa'
  };
  return map[label] || '#93c5fd';
}

function donutSvg(percent, label, idx) {
  const p = Math.max(0, Math.min(100, Math.round(percent)));
  const circumference = 94.2;
  const offset = circumference - (p / 100) * circumference;
  return ''
    + '<svg class="gauge" viewBox="0 0 42 42" aria-label="'+ esc(label) +' gauge">'
    + '<defs><linearGradient id="g'+idx+'" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#22d3ee"/><stop offset="100%" stop-color="#3b82f6"/></linearGradient></defs>'
    + '<circle class="gauge-bg" cx="21" cy="21" r="15"></circle>'
    + '<circle class="gauge-val" cx="21" cy="21" r="15" stroke="url(#g'+idx+')" style="stroke-dasharray:'+circumference+';stroke-dashoffset:'+offset+'"></circle>'
    + '<text class="gauge-text" x="21" y="21">'+p+'%</text>'
    + '</svg>';
}

function renderFilterChips() {
  const panelBody = document.getElementById('panelBody');
  const labels = ['all', ...new Set(activeRows.map(r => r.persona?.label).filter(Boolean))];
  const chips = labels.map(l => {
    const active = l === personaFilter ? ' active' : '';
    const color = l === 'all' ? '#60a5fa' : personaColor(l);
    return '<button class="fchip'+active+'" data-label="'+esc(l)+'" style="border-color:'+color+'33">'+esc(l)+'</button>';
  }).join('');
  panelBody.innerHTML = '<div class="persona-filters"><strong>Persona filters</strong><div style="margin-top:6px">'+chips+'</div></div><div id="panelData" class="muted">Select a row for event details.</div>';

  panelBody.querySelectorAll('.fchip').forEach(btn => {
    btn.addEventListener('click', async () => {
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
  title.textContent = (row.username || 'User Detail') + ' • ' + activeLabel;
  const persona = row.persona || {};
  if (data) {
    data.innerHTML = ''
      + '<div>'
      + '<span class="pill" style="border-color:'+personaColor(persona.label||'')+'66">persona: ' + esc(persona.label || 'n/a') + '</span>'
      + '<span class="pill">experience: ' + esc(persona.experience || 'n/a') + '</span>'
      + '<span class="pill">speed: ' + esc(persona.speed || 'n/a') + '</span>'
      + '<span class="pill">patience: ' + esc(persona.patience ?? 'n/a') + '</span>'
      + '<span class="pill">riskTolerance: ' + esc(persona.riskTolerance ?? 'n/a') + '</span>'
      + '</div>'
      + '<h4>Raw Event</h4>'
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
  const byEndpoint = errors.reduce((acc, e) => { acc[e.endpoint] = (acc[e.endpoint] || 0) + 1; return acc; }, {});
  const worstEndpoint = Object.entries(byEndpoint).sort((a,b)=>b[1]-a[1])[0];

  if (errorRate > 0.35) {
    findings.push({
      severity: 'danger',
      title: 'High failure ratio detected',
      detail: Math.round(errorRate * 100) + '% of observed events are failures.',
      recommendation: 'Prioritize endpoint hardening and retry-safe UI fallbacks on failing paths.'
    });
  }

  if (worstEndpoint) {
    findings.push({
      severity: 'warn',
      title: 'Endpoint hotspot',
      detail: worstEndpoint[0] + ' produced ' + worstEndpoint[1] + ' failures in this run.',
      recommendation: 'Inspect route configuration/permissions and add targeted synthetic checks for this endpoint.'
    });
  }

  const slow = perfRows.slice().sort((a,b)=>(b.p95LatencyMs||0)-(a.p95LatencyMs||0))[0];
  if (slow && slow.p95LatencyMs > 120) {
    findings.push({
      severity: 'warn',
      title: 'Latency variance risk',
      detail: 'Highest user p95 latency observed: ' + slow.p95LatencyMs + 'ms (' + slow.username + ').',
      recommendation: 'Profile backend hotspots and CDN/cache behavior for peak-path requests.'
    });
  }

  if (!findings.length) {
    findings.push({
      severity: 'info',
      title: 'Stable run profile',
      detail: 'No severe anomalies detected in this run window.',
      recommendation: 'Continue monitoring with expanded scenario coverage.'
    });
  }

  return findings.slice(0, 4);
}

function renderOpsPanels(actions, errors, personas, perfRows) {
  const liveFeed = document.getElementById('liveFeed');
  const findingsEl = document.getElementById('findings');
  const recentErrorsEl = document.getElementById('recentErrors');

  const merged = actions.concat(errors).sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp)).slice(0, 28);
  if (!merged.length) {
    liveFeed.innerHTML = 'Waiting for run events...';
  } else {
    liveFeed.innerHTML = merged.map(ev => {
      const sev = ev.category === 'errors' ? 'danger' : 'info';
      const label = ev.category === 'errors' ? 'error' : 'event';
      return '<div class="feed-item">'
        + '<span class="chip '+sev+'">'+label+'</span>'
        + '<span class="mono">'+esc(ev.timestamp||'')+'</span>'
        + '<div><strong>'+esc(ev.username||'unknown')+'</strong> · '+esc(ev.endpoint||'-')+' · '+esc(String(ev.status||'-'))+'</div>'
        + '<div class="muted">persona: '+esc(ev.persona?.label||'n/a')+' · latency: '+esc(String(ev.latencyMs||0))+'ms</div>'
        + '</div>';
    }).join('');
  }

  const findings = buildFindings(actions, errors, personas, perfRows);
  findingsEl.innerHTML = findings.map(f =>
    '<div class="finding-item">'
      + '<span class="chip '+f.severity+'">'+esc(f.severity)+'</span>'
      + '<strong>'+esc(f.title)+'</strong>'
      + '<div class="muted" style="margin-top:4px">'+esc(f.detail)+'</div>'
      + '<div style="margin-top:5px">'+esc(f.recommendation)+'</div>'
    + '</div>'
  ).join('');

  const recentErrors = errors.slice().sort((a,b)=>new Date(b.timestamp)-new Date(a.timestamp)).slice(0, 10);
  if (!recentErrors.length) {
    recentErrorsEl.innerHTML = 'No errors yet.';
  } else {
    recentErrorsEl.innerHTML = recentErrors.map(e =>
      '<div class="error-item">'
      + '<span class="chip danger">error</span><strong>'+esc(e.username)+'</strong>'
      + '<div class="muted">'+esc(e.endpoint||'-')+' · status '+esc(String(e.status||'-'))+' · '+esc(String(e.latencyMs||0))+'ms</div>'
      + '</div>'
    ).join('');
  }
}

async function loadSummary() {
  const [s, actions, errors, personas, perfRows] = await Promise.all([
    fetch('/api/summary').then(r => r.json()),
    fetch('/api/category/actions').then(r => r.json()),
    fetch('/api/category/errors').then(r => r.json()),
    fetch('/api/category/personas').then(r => r.json()),
    fetch('/api/category/performance').then(r => r.json())
  ]);

  document.getElementById('status').textContent = 'Status: ' + s.status + ' | Target: ' + s.target + ' | Started: ' + (s.startedAt || '-') + ' | Finished: ' + (s.finishedAt || '-');

  const totalEvents = actions.length + errors.length;
  const errorRate = totalEvents ? errors.length / totalEvents : 0;
  const completedAgents = personas.filter(p => (p.actionCount + p.errorCount) > 0).length;
  const activeAgents = s.status === 'running' ? Math.max(0, personas.length - completedAgents) : 0;
  const avgActionMs = s.categories.find(c=>c.id==='performance')?.count || 0;
  const p95Overall = perfRows.length ? Math.round(perfRows.reduce((acc, r)=>acc + (r.p95LatencyMs||0), 0) / perfRows.length) : 0;
  const findingsCount = Math.max(0, Math.round(errors.length * 0.35));
  const frustration = Math.min(100, Math.round(errorRate * 100));
  const tokens = actions.length * 180 + errors.length * 90;
  const budgetUsd = Number((tokens * 0.000002).toFixed(4));
  const artifacts = findingsCount + (s.status === 'completed' ? 1 : 0);

  const cardsData = [
    { label:'Actions', value: actions.length, hint:'Total action events', category:'actions' },
    { label:'Active agents', value: activeAgents, hint:'Agents still in flight' },
    { label:'Findings', value: findingsCount, hint:'Derived risk findings' },
    { label:'Frustration', value: frustration, hint:'Error-pressure index %' },
    { label:'Completed agents', value: completedAgents, hint:'Agents with activity' },
    { label:'Avg action ms', value: avgActionMs, hint:'Mean response latency', category:'performance' },
    { label:'p95 latency', value: p95Overall, hint:'Tail latency ms', category:'performance' },
    { label:'Error count', value: errors.length, hint:'Total failing events', category:'errors' },
    { label:'Error rate %', value: Math.round(errorRate*100), hint:'Failures / all events' },
    { label:'Token budget', value: tokens, hint:'Estimated token usage' },
    { label:'Budget cost', value: Math.round(budgetUsd * 10000), hint:'USD x 10k (compact)' },
    { label:'Artifacts ready', value: artifacts, hint:'Reports + findings bundle' }
  ];

  const maxCount = Math.max(1, ...cardsData.map(c => Number(c.value) || 0));
  const cards = document.getElementById('cards');
  cards.innerHTML = '';
  cardsData.forEach((c, idx) => {
    const pct = (Number(c.value || 0) / maxCount) * 100;
    const el = document.createElement('div');
    el.className = 'card';
    if (c.category) el.classList.add('row-click');
    el.style.animationDelay = (idx * 45) + 'ms';
    el.innerHTML = ''
      + '<div class="card-head"><div>' + c.label + '</div>' + donutSvg(pct, c.label, idx+1) + '</div>'
      + '<div class="count mono" data-value="0">0</div>'
      + '<div class="muted">' + c.hint + '</div>'
      + '<svg class="sparkline" viewBox="0 0 180 28" preserveAspectRatio="none"></svg>';
    if (c.category) el.onclick = () => loadCategory(c.category, c.label);
    cards.appendChild(el);
    animateNumber(el.querySelector('.count'), c.value);
    renderSparkline(el.querySelector('.sparkline'), Number(c.value)||0, idx + 1);
  });

  renderOpsPanels(actions, errors, personas, perfRows);
}

function normalizeDetailRow(row, idx) {
  const persona = row.persona || {};
  const username = row.username || row.user || 'unknown';
  const timestamp = row.timestamp || row.lastEventAt || '';
  const rowId = row.rowId || [username, timestamp, idx].join('|');
  return {
    rowId,
    username,
    persona: persona.label || row.personaLabel || 'n/a',
    endpoint: row.endpoint || row.lastEndpoint || '-',
    status: row.status ?? row.lastStatus ?? '-',
    latencyMs: Number(row.latencyMs ?? row.avgLatencyMs ?? 0),
    p95LatencyMs: Number(row.p95LatencyMs ?? 0),
    actionCount: Number(row.actionCount ?? 0),
    errorCount: Number(row.errorCount ?? 0),
    timestamp,
    raw: row
  };
}

function renderInlineDetail(row) {
  const box = document.getElementById('inlineDetail');
  if (!row) {
    box.innerHTML = 'Select a row to inspect user/persona details and raw payload.';
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
    + '<div class="kv" style="margin-top:10px">'
      + '<div class="k">Endpoint</div><div class="v">' + esc(row.endpoint) + '</div>'
      + '<div class="k">Action count</div><div class="v">' + esc(String(row.actionCount)) + '</div>'
      + '<div class="k">Error count</div><div class="v">' + esc(String(row.errorCount)) + '</div>'
      + '<div class="k">Timestamp</div><div class="v mono">' + esc(row.timestamp || '-') + '</div>'
    + '</div>'
    + '<h4 style="margin-top:12px">Raw payload</h4>'
    + '<pre>' + esc(JSON.stringify(raw, null, 2)) + '</pre>';
}

function compareValues(a, b, key, dir) {
  const av = a[key];
  const bv = b[key];
  const mul = dir === 'asc' ? 1 : -1;
  if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * mul;
  return String(av ?? '').localeCompare(String(bv ?? '')) * mul;
}

async function renderDetailTable() {
  const wrap = document.getElementById('detail');
  const meta = document.getElementById('detailMeta');
  const baseRows = personaFilter === 'all'
    ? activeRows
    : activeRows.filter(r => (r.persona?.label || r.personaLabel || '') === personaFilter);

  if (!baseRows.length) {
    wrap.innerHTML = '<p class="muted">No data for this filter yet.</p>';
    meta.textContent = 'No rows to render for current filter.';
    renderInlineDetail(null);
    return;
  }

  const rows = baseRows.map(normalizeDetailRow).sort((a, b) => compareValues(a, b, sortState.key, sortState.dir));
  const columns = [
    ['username', 'Username'],
    ['persona', 'Persona'],
    ['status', 'Status'],
    ['endpoint', 'Endpoint'],
    ['latencyMs', 'Latency'],
    ['p95LatencyMs', 'p95'],
    ['actionCount', 'Actions'],
    ['errorCount', 'Errors'],
    ['timestamp', 'Last event']
  ];

  let html = '<div class="table-wrap"><table><thead><tr>'
    + columns.map(([key, label]) => {
      const marker = sortState.key === key ? (sortState.dir === 'asc' ? ' ▲' : ' ▼') : '';
      return '<th class="sortable"><button class="th-btn" data-sort="'+key+'">' + esc(label + marker) + '</button></th>';
    }).join('')
    + '</tr></thead><tbody>';

  rows.forEach(r => {
    const selected = selectedRowId === r.rowId ? ' selected' : '';
    html += '<tr class="row-click'+selected+'" data-rowid="' + esc(r.rowId) + '">'
      + '<td>' + esc(r.username) + '</td>'
      + '<td>' + esc(r.persona) + '</td>'
      + '<td>' + esc(String(r.status)) + '</td>'
      + '<td>' + esc(r.endpoint) + '</td>'
      + '<td class="mono">' + esc(String(r.latencyMs)) + 'ms</td>'
      + '<td class="mono">' + esc(String(r.p95LatencyMs)) + 'ms</td>'
      + '<td class="mono">' + esc(String(r.actionCount)) + '</td>'
      + '<td class="mono">' + esc(String(r.errorCount)) + '</td>'
      + '<td class="mono">' + esc(r.timestamp || '-') + '</td>'
      + '</tr>';
  });

  html += '</tbody></table></div>';
  wrap.innerHTML = html;
  meta.textContent = 'Rows: ' + rows.length + ' · Sort: ' + sortState.key + ' (' + sortState.dir + ')';

  wrap.querySelectorAll('button.th-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const key = btn.getAttribute('data-sort') || 'timestamp';
      if (sortState.key === key) sortState.dir = sortState.dir === 'asc' ? 'desc' : 'asc';
      else {
        sortState.key = key;
        sortState.dir = key === 'username' || key === 'persona' || key === 'endpoint' ? 'asc' : 'desc';
      }
      await renderDetailTable();
    });
  });

  wrap.querySelectorAll('tr.row-click').forEach(tr => {
    tr.addEventListener('click', () => {
      const id = tr.getAttribute('data-rowid') || '';
      selectedRowId = id;
      const selected = rows.find(r => r.rowId === id) || rows[0];
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
  sortState = { key: id === 'performance' ? 'p95LatencyMs' : 'timestamp', dir: 'desc' };
  document.getElementById('detailTitle').textContent = 'Agent activity: ' + label + ' (click rows for user drilldown)';
  activeRows = await fetch('/api/category/' + id).then(r => r.json());
  await renderDetailTable();
  renderFilterChips();
}

function initBackgroundFx() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const canvas = document.getElementById('fxCanvas');
  const ctx = canvas.getContext('2d');
  const dots = [];

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  for (let i = 0; i < 42; i++) {
    dots.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      r: Math.random() * 1.8 + 0.8
    });
  }

  function frame() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const d of dots) {
      d.x += d.vx; d.y += d.vy;
      if (d.x < 0 || d.x > canvas.width) d.vx *= -1;
      if (d.y < 0 || d.y > canvas.height) d.vy *= -1;
      ctx.beginPath();
      ctx.fillStyle = 'rgba(96,165,250,.45)';
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < dots.length; i++) {
      for (let j = i + 1; j < dots.length; j++) {
        const a = dots[i], b = dots[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < 130) {
          ctx.strokeStyle = 'rgba(34,211,238,' + (0.13 - dist / 1300) + ')';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }
    requestAnimationFrame(frame);
  }
  frame();
}

document.getElementById('start').onclick = async () => {
  await fetch('/api/run/start');
  await loadSummary();
  const t = setInterval(async () => {
    await loadSummary();
    const s = await fetch('/api/summary').then(r => r.json());
    if (s.status !== 'running') clearInterval(t);
  }, 1200);
};

document.getElementById('closePanel').onclick = closePanel;
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePanel(); });

renderFilterChips();
initBackgroundFx();
loadSummary();
</script>
</body>
</html>`;

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
