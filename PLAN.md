# Implementation status and acceptance checklist

1. Establish a TypeScript web app, validated API, reproducible simulation module, CI, and development setup.
2. Test simulation accounting, deterministic seeds, capacity limits, validation, and export.
3. Build the scenario editor, run dashboard, comparison, results export, and accessible guidance.
4. Document model/data provenance, limits, security, privacy, and deployment.
5. Run automated checks and a local browser flow; publish the source and public demo.

## Acceptance

- [x] Fresh checkout starts with documented commands and no credentials.
- [x] Edit assumptions, run repeatable simulations, compare paired scenarios, inspect uncertainty and assumptions, export CSV/JSON.
- [x] Invalid input is rejected; seeded runs repeat; accounting and capacity checks hold.
- [x] Responsive layout works with semantic controls and a mobile browser flow.
- [x] CI runs lint, type-check, tests, and production build.
- [x] Data is explicitly synthetic; no clinical advice or real hospital forecasts are presented.
- [x] Source is public on GitHub and the app is deployed publicly on Vercel.
