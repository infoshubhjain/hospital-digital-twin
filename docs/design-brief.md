# Haven: product design brief

## Audit and direction

1. **Difference:** A reproducible patient-flow experiment compares two discrete-event simulation runs with paired seeds. It is an educational model, not a clinical dashboard.
2. **User:** A student or operations analyst exploring how arrival patterns, beds, providers, and admissions affect queues and occupancy.
3. **Concept:** A calm clinical operations studio built around a care-pathway trace. Forest ink, mineral paper, and measured rules support dense evidence without implying hospital branding.
4. **Primary action:** Change a scenario, run a baseline/intervention comparison, inspect an hour, then export assumptions and results.
5. **Technical proof:** The hourly trace and paired intervention statistics show what the event simulation produced; the model notes explain replication and uncertainty.
6. **Visualization:** Aligned queue, ED occupancy, and boarding time series; a selected-hour marker and numeric pathway stages; an accessible hourly table.
7. **Remove:** The old dashboard palette and any metric treatment that duplicates the trace without helping interpretation. The palette was removed in the previous release.
8. **Complete it:** Make the timeline itself select an hour while retaining the keyboard slider and data table. Keep the selected hour synchronized everywhere.

## Implementation map

`src/App.tsx` owns the scenario form, trace, chart, comparison, and exports. `shared/model.ts`, `shared/simulation.ts`, and `shared/statistics.ts` define validated inputs, discrete-event behavior, and intervals. `server/app.ts` exposes the simulation API; `src/csv.ts` exports results. React, Express, and Zod are existing dependencies. `src/styles.css` defines the independent visual system. There is one principal workspace, with anchor navigation rather than decorative routes.

The scenario editor, export controls, trace, and comparison call actual simulation state. All default inputs are synthetic. There is no account, history, patient data, or field calibration. The browser keeps the last result in memory. The existing local verification baseline is 20 unit/API checks and two browser flows; JavaScript was 104,259 gzip bytes before this pass. No measured load bottleneck justifies a new library or client state layer.

## Feature and route inventory

- **Screen:** One responsive study workspace with anchor navigation to trace, assumptions, and comparison. No additional application routes or reusable UI package.
- **API:** `GET /api/health` reports readiness; `POST /api/simulations` validates and runs the paired scenario. No account or persistence endpoint.
- **Working controls:** Arrival, capacity, acuity, duration, replication, seed, and intervention inputs; run/reset; hour slider; export menu. The trace, confidence intervals, comparison, resource snapshot, and hourly table are computed from the response.
- **Presentation only:** Brand mark, section icons, and synthetic status mark. The chart is based on returned hourly values rather than arbitrary display data.
- **Constraint:** Scientific calibration is absent by design. A longer horizon or more replications increases simulation work, which the API bounds; no measured client-render bottleneck was found.

## Priorities and acceptance

- **P1 completed:** Clicking a chart hour updates the same inspector row as the slider, including intervention values and the selected marker. A browser check must compare the chosen hour with the accessible table.
- **P2:** Preserve legibility at 390, 720, and desktop widths, keyboard access to the slider, clear synthetic labeling, and exported provenance.
- **Out of scope:** Patient-level tracking, facility calibration, and clinical recommendations require data and domain validation this app does not have.
