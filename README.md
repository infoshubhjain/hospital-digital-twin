# Hospital Operations Digital Twin

Haven is an educational operations-planning demonstrator. Edit a representative hospital scenario, run reproducible discrete-event simulations, compare a capacity or routing change, and export assumptions with results.

**This is not a clinical system, a staffing directive, or a forecast of any real hospital.** All included scenario values are synthetic. Do not enter patient identifiers, protected health information, or facility confidential data.

![Haven scenario comparison after a simulation run](docs/screenshots/desktop.png)

[Mobile workflow screenshot](docs/screenshots/mobile.png)

## Run locally

Requires Node.js 22.12 or newer.

```sh
npm ci
npm run dev
```

Open http://localhost:5173. The editor starts with an example scenario. Choose **Run simulation** to generate both baseline and intervention results. The API runs locally on port 3001. No account, API key, data provider, or network service is required at runtime.

For a production build, run `npm run build` then `NODE_ENV=production npm start`. The frontend build is written to `public/`; the Express app serves it locally or in Docker, and Vercel serves the built assets. Or build and run the included Docker image:

```sh
docker build -t hospital-digital-twin .
docker run --rm -p 3001:3001 hospital-digital-twin
```

Open http://localhost:3001. The app uses no persistence: each simulation result is returned directly from its run request.

## Using the dashboard

1. Review or change arrivals in four six-hour blocks, acuity mix, service-time medians, ED providers/beds, inpatient beds, and admission share.
2. Set horizon, warm-up, replication count, and random seed.
3. Select an intervention (two added ED providers, four added ED beds, or a five percentage point lower admission share) and run the comparison.
4. Inspect the wait-time estimates, utilization, boarding, and hourly queue timeline. Export JSON for complete replication output or CSV for summary metrics.

The comparison pairs runs by reusing the same replication seeds. For each seed, the intervention wait median minus the baseline wait median is computed; the displayed paired effect uses the sample standard error and a two-sided 95% Student-t interval with n−1 degrees of freedom. Positive effects mean longer waits. This interval describes simulation variability under entered assumptions, not real-world or model uncertainty. Individual summary metric intervals also use Student-t critical values, but are not the paired intervention interval.

Individual summary metric intervals use the two-sided 95% Student-t critical value with n−1 degrees of freedom, based on replication-level values, and are clipped at zero for nonnegative measures. They assume independent, approximately normal replication-level values; with small replication counts or skewed metrics, coverage can still be poor. These intervals describe simulation variability, not model uncertainty or real-world uncertainty.

The intervention panel also reports the observed variance reduction of the paired estimator relative to an independent-run estimate from the two marginal sample variances. This diagnostic can be negative (pairing increased observed variance) and is unavailable when the marginal variance is zero or there is only one replication; it is not evidence that the model is calibrated.

## Architecture

```mermaid
flowchart LR
  UI[React dashboard] -->|validated JSON| API[Express API]
  API --> Schema[Shared Zod scenario schema]
  API --> Engine[Pure TypeScript discrete-event engine]
  Engine -->|seeded replications and summaries| API
  API -->|simulation response| UI
```

The Vite/React client and Express API are one deployable app. `shared/simulation.ts` has no web framework dependency and can be tested independently. `shared/model.ts` defines the input limits and output units. `server/app.ts` validates the API boundary, limits JSON request size and POST rate, uses Helmet security headers, and caps estimated event work. There is no authentication because there are no users or persistent records.

## Model card

**Purpose:** explore how simplified ED and inpatient capacity assumptions can affect queues and simulated waits. This model is not calibrated to a hospital and has not been validated against operational data.

**Entities and events:** synthetic arrivals move through a waiting queue, ED provider and bed service, and either ED discharge or an inpatient pathway. Event times are ordered in a binary min-heap. ED beds remain occupied during boarding. Inpatient capacity is released after a sampled stay; a waiting boarded patient then transfers and frees an ED bed.

**Assumptions:** arrivals follow a piecewise-constant Poisson process with four rates repeated over each 24-hour day. Acuity is sampled from the three user-entered proportions. ED service time is lognormal with the entered median and a fixed log-scale sigma of 0.35. Admission is a Bernoulli draw with a shared admission probability. Inpatient length of stay is exponential with the entered mean. Providers, ED beds, and inpatient beds are homogeneous pools. There is no priority queue by acuity; first-come-first-served is used.

**Measurement and accounting:** warm-up arrivals seed the system but are excluded from arrival, completion, and wait cohorts. The measurement horizon begins after warm-up. Completed means the patient leaves the simulated hospital system, including the inpatient stay for an admitted patient. At the horizon, `arrivals = completed + still in system` for the measured arrival cohort. Utilization is occupied ED or inpatient bed-minutes, or busy provider-minutes, divided by configured capacity times measurement minutes. Boarding is reported as occupied ED bed-hours for patients waiting for an inpatient bed. The result timeline includes replication-average ED and inpatient occupancy, waiting ED queue, and boarded patients at hourly snapshots.

Median and 90th percentile waits measure time to start ED care only among measured arrivals who reach care before the horizon. The dashboard and exports also report wait observations and patients still waiting at the cutoff for each replication. Those queued waits are not included in the percentiles, so interpret the percentiles together with the waiting count; a low percentile does not imply a short wait for patients still in queue.

**Uncertainty:** replications use independent deterministic seeds derived from the base seed. The paired intervention uses corresponding seeds. Individual summary intervals use the 95% Student-t critical value with n−1 degrees of freedom on replication-level metrics and are clipped at zero for nonnegative measures. The intervention callout separately uses replication-level paired effects and the 95% Student-t critical value; it never subtracts separate interval endpoints. These intervals assume independent, approximately normal replication-level values and can have poor coverage with small samples or skewed metrics. Intervals can vary non-monotonically for finite samples; more replications reduce sampling error but do not resolve input uncertainty or model error.

**Not modeled:** nonstationary surges within the six-hour blocks, acuity-dependent routing/priority, patient choice, left-without-being-seen, diagnostics and service stages, staffing skill mix and shift schedules, breaks, transfers, readmissions, local policies, or empirically calibrated distributions. The admission-share intervention changes routing probability by assumption and does not model clinical suitability. Do not use outputs for care, staffing, investment, or operational decisions.

## Data provenance and licensing

There is no external operational dataset or public hospital data in this MVP. Arrival, acuity, service-time, admission, and capacity defaults are synthetic and editable. Outputs are simulated values, never observations. This project does not claim national representativeness. As a result, external source attribution and data license do not apply. Software is licensed under MIT; see [LICENSE](LICENSE).

## API

- `GET /api/health` — health and model version.
- `POST /api/simulations` — validate a scenario, run it, and return a result. Scenario bounds are defined in `shared/model.ts`; JSON is limited to 64 KB, POST is limited to 20 requests per minute per IP, and estimated event work is capped. Runs execute synchronously one at a time in the Node event loop.
- Unknown `/api` routes return a JSON 404 response.

There is no CORS allowlist because the UI and API are served from one origin. No user data is written to disk. Network logs should be configured by any hosting provider to avoid retaining request bodies or precise user-entered assumptions longer than necessary.

## Security and privacy notes

- No account, tracking, analytics, external data call, or persistent app storage. Simulation inputs are sent to the API and used to produce the response.
- Do not send protected health information or sensitive operational data. The hosting provider may process request metadata and logs; configure its retention settings appropriately.
- Helmet adds content-security and other security headers. Server errors do not echo submitted values. API responses contain scenario assumptions and should be treated as user-provided data.
- For public hosting, configure TLS, platform-level abuse protections, and logs without request bodies. The built-in per-process limiter is a basic guard and is not distributed across replicas.
- Threat notes: oversized payloads and excessive estimated event work are rejected; browser scripts are restricted by CSP; without accounts there are no session cookies or cross-site state changes. A publicly hosted instance exposes its run endpoint to anyone and its host may observe request metadata, so keep the rate limit and avoid confidential assumptions.

## Accessibility

Inputs have visible or accessible labels, controls are keyboard operable, charts have text alternatives, data is not communicated by color alone, and reduced-motion preferences are respected. The dashboard presents a chart and numeric summary so the flow does not depend on chart colors.

## Development and checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

The browser smoke test edits the example assumptions, selects an intervention, runs the paired comparison, checks the mobile layout, and downloads JSON. CI runs linting, type checks, unit/API/UI tests, build, and the Chromium smoke test on pull requests and pushes to `main`.

When deploying behind a reverse proxy, set `TRUST_PROXY_HOPS` to the exact number of trusted proxy hops and ensure the app cannot be reached around those proxies. It defaults to `0`, which ignores forwarded client-IP headers. The Render Blueprint sets it to `2` for the documented Cloudflare and Render load-balancer path; verify the effective client IP and per-client rate limit on the public service after deployment before treating that value as confirmed for the account's routing.

## Troubleshooting

- If port 3001 is occupied, set `PORT` in your environment; Vite reads the same value for its API proxy.
- If a run is rejected as too large, lower the horizon, arrival rates, or replication count; the API has a bounded work budget.
- Results remain in the current page only. After reloading the page or changing assumptions, run the same seed and configuration again to reproduce them.
- If Playwright cannot launch Chromium, run `npx playwright install chromium`.

## Deployment

The Express app is exported from the repository-root `index.ts` for Vercel. `vercel.json` selects the Express framework and `npm run build`; Vercel runs the app as a Node.js function and serves the Vite build files from `public/`. Import the GitHub repository into Vercel and deploy the production branch to create the public site. Vercel supplies a sanitized `x-forwarded-for` client address, used for the per-IP run limit. The limiter is process-local and best effort across function instances. No database is required because the UI uses the result in the response to each run.

The Docker image serves the production UI and API on port 3001. `render.yaml` still prepares the equivalent Render deployment with `/api/health` checks. Both providers' free plans have usage and reliability limits; review [Vercel Hobby limits](https://vercel.com/docs/plans/hobby) and [Render free-plan details](https://render.com/docs/free) before choosing a public host. Keep TLS enabled and follow the public-hosting security notes above.
