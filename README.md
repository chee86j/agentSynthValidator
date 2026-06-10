# agentSynthValidator

agentSynthValidator is a synthetic user validation platform that helps product teams understand how users might experience an MVP before investing heavily in traditional beta testing.

The core idea is simple: instead of waiting to recruit, onboard, and coordinate human testers, teams can launch multiple synthetic users—each with distinct personas, goals, and interaction styles—to explore a live product in real time. These agents behave like early users would: browsing listings, creating posts, leaving comments, matching with other users, and moving through key product workflows using premade authenticated accounts.

As those simulations run, the platform streams activity into a live dashboard that gives teams immediate visibility into how the product is performing under realistic usage. Metrics can include total actions, comments posted, listings created, matches made, active agents, frustrations, engagement, responsiveness, retention, satisfaction, and feature coverage.

The value proposition is speed and clarity. Instead of relying solely on manual testing or waiting for human feedback to surface patterns, teams can use synthetic users to quickly identify bugs, friction points, latency issues, confusing flows, and potential feature requests. This makes it easier to spot bottlenecks early, validate product assumptions, and prioritize improvements with better signal.

This repository reflects the next evolution of that vision: a more secure and controlled synthetic testing architecture built around Playwright-based agents, customer-selected LLM providers, premade test accounts, real-time event streaming, and structured reporting.

## What it includes

- `dashboard_server.mjs` — Node server with inline dashboard UI and API endpoints
- `SYNTHETIC_DASHBOARD_UI_BLUEPRINT.md` — UI/UX blueprint and implementation plan

## Run locally

```bash
node dashboard_server.mjs
```

Then open:

- http://localhost:5055/

## Notes

- Designed for deployed-target workflows (no local app repo required)
- Includes metrics cards, live event feed, findings/recommendations, recent errors,
  sortable activity table, and row drilldown details
