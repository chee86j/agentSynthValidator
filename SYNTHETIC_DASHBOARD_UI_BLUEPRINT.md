# Synthetic User Validation Platform — UI Blueprint

## 1) Design Tokens

- `--bg: #050816`
- `--text: #eff5ff`
- `--muted: #8ea1c7`
- `--accent-cyan: #2cf6e3`
- `--accent-blue: #6fb8ff`
- `--accent-purple: #7c6cff`
- `--ok: #58ff94`
- `--warn: #ffb649`
- `--danger: #ff6b86`
- CTA gradient: `linear-gradient(135deg, #10d7c2 0%, #1189d3 100%)`

Typography:
- Hero title: `clamp(2.6rem, 5vw, 4.4rem)`
- Eyebrow labels: uppercase, letter spacing `0.22em`
- Monospace for IDs/technical values

## 2) Global Shell

- SSR shell + React hydrated island for live panels
- Top hero card:
  - Eyebrow: `Live · Synthetic Control`
  - Gradient title
  - user/org context line
  - rounded pill nav links
  - status pills row

- Panel style (all surfaces):
  - dark card
  - subtle blur
  - border `1px solid rgba(111,148,221,0.12-0.3)`
  - glow shadow `0 24px 70px rgba(0,0,0,0.45)`
  - cyan ring accent

## 3) Dashboard Modules

1. Dial cards (conic rings): Actions, Active Agents, Findings, Frustration
2. Metrics grid (12 compact stat cards)
3. Conditional report-ready success banner with download actions
4. Agent activity split:
   - sortable table
   - selected-agent details + recent events + artifacts
5. Recent errors rail (last 10)
6. Live event feed + findings split
7. Charts row:
   - event distribution chart
   - sortable artifact list

## 4) Real-Time Behavior

- Socket room: `run:${runId}`
- Connection status text:
  - `Connecting live feed…`
  - `Live feed connected`
- De-duplicate events with `Set`
- Selective refetch:
  - refresh artifacts/findings on `artifact.created`, `run.completed`, `run.failed`
- Polling:
  - budget every 5s
  - findings every 8s

## 5) Reusable UI Primitives

- `status` badges (`active|warning|danger|info`)
- inline pills/tags
- dial cards
- metric boxes (label/value/detail)
- list item primitive (title/meta/right actions)
- empty/flash/error state blocks

## 6) Accessibility + Interaction Rules

- color + text both required for state semantics
- keyboard-focus visible on pills/buttons/tables
- reduced motion support for ambient effects
- preserve contrast in dark mode

## 7) Current App Migration Plan

Phase A (theme + shell)
- apply token palette
- hero card + nav pills + status pills

Phase B (metrics + live)
- dial cards + metric grid
- event feed/finding layout

Phase C (operations UX)
- agent table -> detail panel coupling
- error rail + chart row

Phase D (hardening)
- event dedupe
- selective refetch + interval strategy
- loading/error/empty states

---
This blueprint can be used directly as implementation acceptance criteria for the next dashboard rewrite.