# agentSynthValidator

Standalone Synthetic User Validation dashboard for monitoring ACME synthetic test runs against the deployed target app.

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
