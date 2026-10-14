# Contributing

Keep the simulator deterministic for a fixed seed, keep calculations in the pure `shared` module, and validate all API input with the shared schema. New outputs need explicit units, denominators, and a model-card entry describing their meaning and limits.

Before opening a pull request, run `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run test:e2e`. Use synthetic fixtures unless a public source and its terms are verified and documented. Do not add patient records, credentials, or claims of clinical validation.
