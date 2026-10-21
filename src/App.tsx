import { useCallback, useState } from "react";
import {
  Activity,
  ArrowDownRight,
  ArrowUpRight,
  BedDouble,
  BookOpen,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Download,
  HeartPulse,
  Info,
  LoaderCircle,
  Play,
  RotateCcw,
  SlidersHorizontal,
  UsersRound,
  Waves,
} from "lucide-react";
import { safeCsvCell } from "./csv.js";
import {
  demoScenario,
  type Scenario,
  type SimulationResult,
} from "../shared/model.js";
import { pairedEffect } from "../shared/statistics.js";

type Intervention = "staff" | "beds" | "routing";
const blocks = ["12 am – 6 am", "6 am – 12 pm", "12 pm – 6 pm", "6 pm – 12 am"];
const fmt = (value: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);
const apiRun = async (scenario: Scenario): Promise<SimulationResult> => {
  const response = await fetch("/api/simulations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(scenario),
  });
  const body = await response.json();
  if (!response.ok)
    throw new Error(body.error ?? "Could not run the simulation.");
  return body as SimulationResult;
};

function MetricCard({
  label,
  icon: Icon,
  value,
  unit,
  interval,
  delta,
  direction,
}: {
  label: string;
  icon: typeof Clock3;
  value: string;
  unit: string;
  interval?: string;
  delta?: string;
  direction?: "down" | "up";
}) {
  return (
    <article className="metric-card">
      <div className="metric-top">
        <span>{label}</span>
        <span className="metric-icon">
          <Icon size={17} />
        </span>
      </div>
      <div className="metric-value">
        {value}
        <small>{unit}</small>
      </div>
      <div className="metric-foot">
        {interval && <span>{interval}</span>}
        {delta && (
          <span className={`delta ${direction}`}>
            {direction === "down" ? (
              <ArrowDownRight size={14} />
            ) : (
              <ArrowUpRight size={14} />
            )}
            {delta}
          </span>
        )}
      </div>
    </article>
  );
}

export default function App() {
  const [scenario, setScenario] = useState<Scenario>(demoScenario);
  const [intervention, setIntervention] = useState<Intervention>("staff");
  const [base, setBase] = useState<SimulationResult>();
  const [change, setChange] = useState<SimulationResult>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [guideOpen, setGuideOpen] = useState(true);
  const [ranAt, setRanAt] = useState("");
  const interventionHasNoEffect =
    (intervention === "staff" && scenario.capacities.providers >= 100) ||
    (intervention === "beds" && scenario.capacities.edBeds >= 500) ||
    (intervention === "routing" && scenario.admissionRate <= 0);

  const run = useCallback(
    async (input: Scenario, selectedIntervention = intervention) => {
      setBusy(true);
      setError("");
      setBase(undefined);
      setChange(undefined);
      try {
        const [baseline, alternate] = await Promise.all([
          apiRun(input),
          apiRun(
            selectedIntervention === "staff"
              ? {
                  ...input,
                  name: `${input.name} · +2 providers`,
                  capacities: {
                    ...input.capacities,
                    providers: Math.min(100, input.capacities.providers + 2),
                  },
                }
              : selectedIntervention === "beds"
                ? {
                    ...input,
                    name: `${input.name} · +4 ED beds`,
                    capacities: {
                      ...input.capacities,
                      edBeds: Math.min(500, input.capacities.edBeds + 4),
                    },
                  }
                : {
                    ...input,
                    name: `${input.name} · −5 pt admission`,
                    admissionRate: Math.max(0, input.admissionRate - 0.05),
                  },
          ),
        ]);
        setBase(baseline);
        setChange(alternate);
        setRanAt(
          new Date().toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          }),
        );
      } catch (e) {
        setError(
          e instanceof Error
            ? e.message
            : "Something went wrong. Please try again.",
        );
      } finally {
        setBusy(false);
      }
    },
    [intervention],
  );

  const updateScenario = (
    update: Scenario | ((current: Scenario) => Scenario),
  ) => {
    setBase(undefined);
    setChange(undefined);
    setScenario(update);
  };
  const setNumber = (key: string, value: number) =>
    updateScenario((s) => ({ ...s, [key]: value }));
  const setCapacity = (key: keyof Scenario["capacities"], value: number) =>
    updateScenario((s) => ({
      ...s,
      capacities: { ...s.capacities, [key]: value },
    }));
  const setRate = (index: number, value: number) =>
    updateScenario((s) => ({
      ...s,
      arrivalRates: s.arrivalRates.map((v, i) => (i === index ? value : v)),
    }));
  const setAcuity = (key: keyof Scenario["acuityMix"], percent: number) =>
    updateScenario((s) => {
      const other = (
        Object.keys(s.acuityMix) as (keyof Scenario["acuityMix"])[]
      ).filter((item) => item !== key);
      const total = Math.max(0, Math.min(100, percent)) / 100;
      const remaining = 1 - total;
      const otherTotal = s.acuityMix[other[0]!] + s.acuityMix[other[1]!];
      return {
        ...s,
        acuityMix: {
          ...s.acuityMix,
          [key]: total,
          [other[0]!]:
            remaining *
            (otherTotal ? s.acuityMix[other[0]!] / otherTotal : 0.5),
          [other[1]!]:
            remaining *
            (otherTotal ? s.acuityMix[other[1]!] / otherTotal : 0.5),
        },
      };
    });
  const result = base?.summary;
  const pairedWait = base && change
    ? pairedEffect(
        base.replicationMetrics.map((rep) => rep.waitMedian!),
        change.replicationMetrics.map((rep) => rep.waitMedian!),
      )
    : undefined;
  const waitChange =
    pairedWait
      ? Math.round(pairedWait.mean)
      : undefined;
  const chartData = base?.timeline ?? [];
  const interventionData = change?.timeline ?? [];
  const chartMax = Math.max(
    1,
    ...[...chartData, ...interventionData].flatMap((point) => [
      point.edOccupancy,
      point.queue,
      point.boarding,
    ]),
  );
  const chartPoint = (
    data: typeof chartData,
    key: "edOccupancy" | "queue" | "boarding",
    index: number,
  ) => {
    const left = 42;
    const right = 710;
    const top = 12;
    const bottom = 174;
    const x =
      left +
      (data.length < 2 ? 0 : (index * (right - left)) / (data.length - 1));
    const y = bottom - (data[index]![key] / chartMax) * (bottom - top);
    return `${x},${y}`;
  };
  const chartLabels = chartData.filter(
    (_, i) =>
      i % Math.max(1, Math.ceil(chartData.length / 6)) === 0 ||
      i === chartData.length - 1,
  );
  const exportData = (format: "json" | "csv") => {
    if (!base || !change) return;
    let contents: string;
    let mime: string;
    let name: string;
    if (format === "json") {
      contents = JSON.stringify(
        {
          disclosure:
            "Synthetic simulation; not hospital observations or a forecast.",
          modelVersion: base.modelVersion,
          units: {
            wait: "minutes",
            boarding: "hours",
            utilization: "percent",
            volume: "patients per replication",
          },
          baseline: base,
          intervention: change,
          pairedWaitEffectMinutes: pairedWait,
        },
        null,
        2,
      );
      mime = "application/json";
      name = "hospital-twin-results.json";
    } else {
      const header = [
        "scenario",
        "metric",
        "mean",
        "95% CI low",
        "95% CI high",
        "unit",
        "model version",
        "seed",
        "data source",
        "scenario configuration",
      ];
      const rows = [base, change].flatMap((r) =>
        Object.entries(r.summary).map(([metric, stats]) =>
          [
            r.scenario.name,
            metric,
            stats.mean,
            stats.low,
            stats.high,
            metric === "waitMedian" || metric === "waitP90"
              ? "minutes"
              : metric.toLowerCase().includes("utilization")
                ? "percent"
                : metric.toLowerCase().includes("boarding")
                  ? "bed-hours"
                  : "patients",
            r.modelVersion,
            r.scenario.seed,
            "synthetic",
            JSON.stringify(r.scenario),
          ]
            .map(safeCsvCell)
            .join(","),
        ),
      );
      contents = [
        header.map(safeCsvCell).join(","),
        ...rows,
        [
          safeCsvCell("data disclosure"),
          safeCsvCell(
            "Synthetic assumptions only; no real patient or facility records",
          ),
        ].join(","),
      ].join("\n");
      mime = "text/csv";
      name = "hospital-twin-results.csv";
    }
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([contents], { type: mime }));
    link.download = name;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  const metricCards = result
    ? [
        {
          label: "Median wait · reached care",
          icon: Clock3,
          value: fmt(result.waitMedian.mean),
          unit: "min",
          interval: `${fmt(result.waitMedian.low)}–${fmt(result.waitMedian.high)} min CI`,
          delta:
            waitChange === undefined
              ? undefined
              : `${fmt(Math.abs(waitChange))} min`,
          direction:
            waitChange === undefined
              ? undefined
              : waitChange <= 0
                ? ("down" as const)
                : ("up" as const),
        },
        {
          label: "90th percentile · reached care",
          icon: Activity,
          value: fmt(result.waitP90.mean),
          unit: "min",
          interval: `${fmt(result.waitP90.low)}–${fmt(result.waitP90.high)} min CI`,
        },
        {
          label: "Completed",
          icon: Check,
          value: fmt(result.completed.mean),
          unit: "patients",
          interval: `${fmt(result.arrivals.mean)} arrivals · ${scenario.horizonHours} hr`,
        },
        {
          label: "ED bed utilization",
          icon: BedDouble,
          value: `${fmt(result.edUtilization.mean)}%`,
          unit: "",
          interval: `${fmt(result.edUtilization.low)}–${fmt(result.edUtilization.high)}% CI`,
        },
      ]
    : [];

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Main navigation">
        <a className="brand" href="#top" aria-label="Haven home">
          <span className="brand-mark">
            <HeartPulse size={22} strokeWidth={2.4} />
          </span>
          <span>
            haven<span className="brand-dot">.</span>
            <small>OPERATIONS TWIN</small>
          </span>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <nav>
          <a className="nav-link" href="#overview">
            <Activity size={18} />
            Overview
          </a>
          <a className="nav-link" href="#scenario">
            <SlidersHorizontal size={18} />
            Scenario builder
          </a>
          <a className="nav-link" href="#comparison">
            <Waves size={18} />
            Compare scenarios
          </a>
        </nav>
        <div className="sidebar-bottom">
          <div className="privacy-box">
            <span className="privacy-icon">
              <Info size={16} />
            </span>
            <div>
              <strong>Synthetic inputs only</strong>
              <p>Runs are sent to the server and not saved by the app. Never enter patient or confidential data.</p>
            </div>
          </div>
          <div className="model-tag">
            <span className="pulse-dot" /> SIMULATION MODEL <span>v1.0</span>
          </div>
          <div className="profile">
            <div className="profile-avatar">HO</div>
            <div>
              <strong>Hospital Ops</strong>
              <small>Planning workspace</small>
            </div>
            <ChevronDown size={15} />
          </div>
        </div>
      </aside>

      <main className="main-content" id="top">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Workspace</span>
            <span className="crumb-sep">/</span>
            <strong>Operations overview</strong>
          </div>
          <div className="topbar-actions">
            <span className="data-pill">
              <span className="status-dot" /> Synthetic demo data
            </span>
            <button
              className="icon-button"
              aria-label="About this simulator"
              onClick={() => setGuideOpen((v) => !v)}
            >
              <CircleHelp size={19} />
            </button>
            <div className="top-avatar">HO</div>
          </div>
        </header>

        <div className="page-wrap" id="overview">
          <section className="page-heading">
            <div>
              <div className="eyebrow">
                <span className="eyebrow-line" /> HOSPITAL OPERATIONS{" "}
                <span className="eyebrow-dot">·</span> PLANNING
              </div>
              <h1>Operations overview</h1>
              <p>
                Explore how capacity and patient flow assumptions shape system
                performance.
              </p>
            </div>
            <div className="heading-actions">
              <button
                className="button button-quiet"
                onClick={() => {
                  updateScenario(demoScenario);
                  setIntervention("staff");
                  void run(demoScenario, "staff");
                }}
                disabled={busy}
              >
                <RotateCcw size={16} /> Reset demo
              </button>
              <button
                className="button button-primary"
                onClick={() => void run(scenario)}
                disabled={busy || interventionHasNoEffect}
              >
                {busy ? (
                  <LoaderCircle className="spin" size={17} />
                ) : (
                  <Play size={16} fill="currentColor" />
                )}{" "}
                {busy ? "Running model…" : "Run simulation"}
              </button>
            </div>
          </section>

          {guideOpen && (
            <section className="guide-card">
              <div className="guide-icon">
                <BookOpen size={18} />
              </div>
              <div className="guide-copy">
                <strong>A planning model, not a prediction</strong>
                <p>
                  Set assumptions below, run paired scenarios, and compare their
                  simulated outcomes. All example values are synthetic.
                </p>
              </div>
              <button
                className="guide-close"
                aria-label="Dismiss guide"
                onClick={() => setGuideOpen(false)}
              >
                ×
              </button>
              <div className="guide-step">
                <span>01</span>
                <span className="step-line" />
                <span>03</span>
              </div>
            </section>
          )}

          {error && (
            <div className="error-banner" role="alert">
              <Info size={18} /> <span>{error}</span>
              <button onClick={() => setError("")}>Dismiss</button>
            </div>
          )}
          <div className="section-heading">
            <div>
              <h2>At a glance</h2>
              <p>
                {base
                  ? `Results from ${scenario.replications} independent replications · updated ${ranAt}`
                  : "Run the example to see simulated results."}
              </p>
              {base && result && (
                <small className="measure-note">
                  Wait percentiles include only patients who started ED care by
                  the horizon. On average, {fmt(result.waitObservations.mean)}
                  patients reached care and {fmt(result.stillWaiting.mean)}
                  remained waiting per replication; queued waits are excluded
                  from those percentiles.
                </small>
              )}
            </div>
            <span className="confidence-tag">
              <span /> 95% Student-t intervals
            </span>
          </div>
          <section
            className="metric-grid"
            aria-label="Simulation summary metrics"
          >
            {metricCards.length ? (
              metricCards.map((card) => (
                <MetricCard key={card.label} {...card} />
              ))
            ) : (
              <div className="metrics-placeholder">
                <LoaderCircle size={17} className="spin" /> Preparing the
                synthetic example…
              </div>
            )}
          </section>

          <section className="content-grid" id="comparison">
            <article className="panel flow-panel">
              <div className="panel-heading">
                <div>
                  <div className="panel-title-row">
                    <h2>Patient flow & capacity</h2>
                    <span className="live-badge">
                      <span /> SIMULATED
                    </span>
                  </div>
                  <p>
                    {change
                      ? "Hourly averages across paired replications · solid baseline, dashed intervention"
                      : "Baseline result shown · re-run to compare the selected intervention"}
                  </p>
                </div>
                <button
                  className="select-button"
                  onClick={() => exportData("csv")}
                  disabled={!base}
                >
                  <Download size={15} /> Export <ChevronDown size={14} />
                </button>
              </div>
              {base ? (
                <>
                  <div className="chart-legend">
                    <span>
                      <i className="legend-bed" /> ED beds · baseline
                    </span>
                    {change && (
                      <span>
                        <i className="legend-bed-alt" /> ED beds · intervention
                      </span>
                    )}
                    <span>
                      <i className="legend-queue" /> Queue · baseline
                    </span>
                    {change && (
                      <span>
                        <i className="legend-queue-alt" /> Queue · intervention
                      </span>
                    )}
                    <span>
                      <i className="legend-board" /> Boarding · baseline
                    </span>
                    {change && (
                      <span>
                        <i className="legend-board-alt" /> Boarding ·
                        intervention
                      </span>
                    )}
                  </div>
                  <svg
                    className="flow-chart"
                    viewBox="0 0 720 200"
                    role="img"
                    aria-label="Baseline and intervention emergency department occupancy, waiting queue, and boarding by hour"
                  >
                    <title>Patient flow timeline</title>
                    {Array.from({ length: 5 }, (_, i) => {
                      const y = 174 - i * 40.5;
                      return (
                        <g key={i}>
                          <line
                            x1="42"
                            x2="710"
                            y1={y}
                            y2={y}
                            stroke="#e9eeeb"
                            strokeDasharray="3 5"
                          />
                          <text
                            x="31"
                            y={y + 4}
                            textAnchor="end"
                            className="chart-tick"
                          >
                            {Math.round((chartMax * i) / 4)}
                          </text>
                        </g>
                      );
                    })}
                    <polyline
                      points={chartData
                        .map((_, i) => chartPoint(chartData, "edOccupancy", i))
                        .join(" ")}
                      fill="none"
                      stroke="#147865"
                      strokeWidth="2.5"
                      vectorEffect="non-scaling-stroke"
                    />
                    {change && (
                      <polyline
                        points={interventionData
                          .map((_, i) =>
                            chartPoint(interventionData, "edOccupancy", i),
                          )
                          .join(" ")}
                        fill="none"
                        stroke="#81b8a5"
                        strokeWidth="2"
                        strokeDasharray="5 4"
                        vectorEffect="non-scaling-stroke"
                      />
                    )}
                    <polyline
                      points={chartData
                        .map((_, i) => chartPoint(chartData, "queue", i))
                        .join(" ")}
                      fill="none"
                      stroke="#d59c47"
                      strokeWidth="2"
                      vectorEffect="non-scaling-stroke"
                    />
                    {change && (
                      <polyline
                        points={interventionData
                          .map((_, i) =>
                            chartPoint(interventionData, "queue", i),
                          )
                          .join(" ")}
                        fill="none"
                        stroke="#e6c586"
                        strokeWidth="1.8"
                        strokeDasharray="5 4"
                        vectorEffect="non-scaling-stroke"
                      />
                    )}
                    <polyline
                      points={chartData
                        .map((_, i) => chartPoint(chartData, "boarding", i))
                        .join(" ")}
                      fill="none"
                      stroke="#9182bd"
                      strokeWidth="1.8"
                      vectorEffect="non-scaling-stroke"
                    />
                    {change && (
                      <polyline
                        points={interventionData
                          .map((_, i) =>
                            chartPoint(interventionData, "boarding", i),
                          )
                          .join(" ")}
                        fill="none"
                        stroke="#bcb0d2"
                        strokeWidth="1.6"
                        strokeDasharray="5 4"
                        vectorEffect="non-scaling-stroke"
                      />
                    )}
                    {chartLabels.map((point) => {
                      const index = chartData.indexOf(point);
                      const x =
                        42 +
                        (chartData.length < 2
                          ? 0
                          : (index * 668) / (chartData.length - 1));
                      return (
                        <text
                          key={point.hour}
                          x={x}
                          y="195"
                          textAnchor="middle"
                          className="chart-tick"
                        >
                          {point.hour}h
                        </text>
                      );
                    })}
                  </svg>
                  <details className="chart-data">
                    <summary>View hourly values</summary>
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Hour</th>
                            <th>ED beds</th>
                            <th>ED beds · intervention</th>
                            <th>Queue</th>
                            <th>Queue · intervention</th>
                            <th>Boarding</th>
                            <th>Boarding · intervention</th>
                            <th>Inpatient beds</th>
                            <th>Inpatient beds · intervention</th>
                          </tr>
                        </thead>
                        <tbody>
                          {chartData.map((point) => (
                            <tr key={point.hour}>
                              <th scope="row">{point.hour}</th>
                              <td>{point.edOccupancy}</td>
                              <td>
                                {interventionData[chartData.indexOf(point)]
                                  ?.edOccupancy ?? "—"}
                              </td>
                              <td>{point.queue}</td>
                              <td>
                                {interventionData[chartData.indexOf(point)]
                                  ?.queue ?? "—"}
                              </td>
                              <td>{point.boarding}</td>
                              <td>
                                {interventionData[chartData.indexOf(point)]
                                  ?.boarding ?? "—"}
                              </td>
                              <td>{point.inpatientOccupancy}</td>
                              <td>
                                {interventionData[chartData.indexOf(point)]
                                  ?.inpatientOccupancy ?? "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </details>
                  <div className="chart-foot">
                    <span>
                      Simulation hour{" "}
                      <b>
                        {scenario.warmupHours}–
                        {scenario.warmupHours + scenario.horizonHours}
                      </b>
                    </span>
                    <span>Warm-up period excluded</span>
                  </div>
                </>
              ) : (
                <div className="chart-empty">
                  <Waves size={28} />
                  <span>
                    Run a simulation to view the patient flow timeline.
                  </span>
                </div>
              )}
            </article>

            <article className="panel compare-panel">
              <div className="panel-heading">
                <div>
                  <h2>Scenario comparison</h2>
                  <p>Baseline vs. intervention</p>
                </div>
                <span className="compare-icon">
                  <Activity size={18} />
                </span>
              </div>
              <label className="field-label" htmlFor="intervention">
                INTERVENTION
              </label>
              <select
                id="intervention"
                disabled={busy}
                value={intervention}
                onChange={(e) => {
                  setIntervention(e.target.value as Intervention);
                  setChange(undefined);
                }}
              >
                <option value="staff">Add 2 ED providers</option>
                <option value="beds">Add 4 ED beds</option>
                <option value="routing">Reduce admission rate by 5 pts</option>
              </select>
              {interventionHasNoEffect && (
                <p className="helper-text" role="status">
                  This intervention cannot change the current scenario. Choose
                  another intervention or change the assumption.
                </p>
              )}
              <div className="compare-columns">
                <div>
                  <small>BASELINE</small>
                  <strong>
                    {result ? (
                      <>
                        {fmt(result.waitMedian.mean)} <i>min</i>
                      </>
                    ) : (
                      "—"
                    )}
                  </strong>
                  <span>Median wait · reached care</span>
                </div>
                <div className="compare-arrow">→</div>
                <div>
                  <small>INTERVENTION</small>
                  <strong>
                    {change ? (
                      <>
                        {fmt(change.summary.waitMedian.mean)} <i>min</i>
                      </>
                    ) : (
                      "—"
                    )}
                  </strong>
                  <span>Median wait · reached care</span>
                </div>
              </div>
              {change && base && (
                <div
                  className={`compare-callout ${waitChange! <= 0 ? "good" : "caution"}`}
                >
                  <span>
                    {waitChange! <= 0 ? (
                      <ArrowDownRight size={16} />
                    ) : (
                      <ArrowUpRight size={16} />
                    )}
                  </span>
                  <strong>{Math.abs(waitChange!)} min</strong>
                  <span>
                    {waitChange! <= 0 ? "lower" : "higher"} median wait in this
                    scenario
                  </span>
                </div>
              )}
              <div className="compare-note">
                Positive effects mean longer waits. Paired 95% t interval: {pairedWait?.low === null || pairedWait?.low === undefined ? "unavailable" : `${fmt(pairedWait.low)} to ${fmt(pairedWait.high!)} min`} ({pairedWait?.replications ?? 0} replications). Observed variance reduction vs independent runs: {pairedWait?.varianceReductionPercent === null || pairedWait?.varianceReductionPercent === undefined ? "unavailable" : `${fmt(pairedWait.varianceReductionPercent)}%`}. It describes simulation variability under these assumptions, not real-world uncertainty.
              </div>
              <button
                className="text-button"
                onClick={() => void run(scenario)}
                disabled={busy || interventionHasNoEffect}
              >
                {busy ? "Running comparison…" : "Re-run comparison"}{" "}
                <span>→</span>
              </button>
            </article>
          </section>

          <section className="section-heading scenario-heading" id="scenario">
            <div>
              <h2>Scenario assumptions</h2>
              <p>
                Adjust the starting conditions, then run again to see the
                effect.
              </p>
            </div>
            <span className="assumption-badge">
              <Info size={14} /> Illustrative defaults
            </span>
          </section>
          <section className="assumption-grid">
            <article className="panel assumption-panel">
              <div className="assumption-title">
                <div className="assumption-icon">
                  <Waves size={17} />
                </div>
                <div>
                  <h3>Arrival pattern</h3>
                  <p>Expected arrivals per hour</p>
                </div>
              </div>
              <div className="arrival-grid">
                {blocks.map((block, i) => (
                  <label key={block}>
                    <span>{block}</span>
                    <div className="input-with-unit">
                      <input
                        aria-label={`Arrivals per hour ${block}`}
                        type="number"
                        disabled={busy}
                        min="0"
                        max="80"
                        value={scenario.arrivalRates[i]}
                        onChange={(e) => setRate(i, Number(e.target.value))}
                      />
                      <small>/ hr</small>
                    </div>
                  </label>
                ))}
              </div>
              <p className="helper-text">
                Repeats every 24 hours of the modeled horizon.
              </p>
            </article>
            <article className="panel assumption-panel">
              <div className="assumption-title">
                <div className="assumption-icon">
                  <UsersRound size={17} />
                </div>
                <div>
                  <h3>Capacity & routing</h3>
                  <p>Available resources and pathways</p>
                </div>
              </div>
              <div className="capacity-grid">
                <label>
                  <span>ED providers</span>
                  <input
                    aria-label="ED providers"
                    type="number"
                    disabled={busy}
                    min="1"
                    max="100"
                    value={scenario.capacities.providers}
                    onChange={(e) =>
                      setCapacity("providers", Number(e.target.value))
                    }
                  />
                </label>
                <label>
                  <span>ED beds</span>
                  <input
                    aria-label="ED beds"
                    type="number"
                    disabled={busy}
                    min="1"
                    max="500"
                    value={scenario.capacities.edBeds}
                    onChange={(e) =>
                      setCapacity("edBeds", Number(e.target.value))
                    }
                  />
                </label>
                <label>
                  <span>Inpatient beds</span>
                  <input
                    aria-label="Inpatient beds"
                    type="number"
                    disabled={busy}
                    min="1"
                    max="1000"
                    value={scenario.capacities.inpatientBeds}
                    onChange={(e) =>
                      setCapacity("inpatientBeds", Number(e.target.value))
                    }
                  />
                </label>
                <label>
                  <span>Admission rate</span>
                  <div className="input-with-unit">
                    <input
                      aria-label="Admission rate percent"
                      type="number"
                      disabled={busy}
                      min="0"
                      max="100"
                      value={Math.round(scenario.admissionRate * 100)}
                      onChange={(e) =>
                        setNumber("admissionRate", Number(e.target.value) / 100)
                      }
                    />
                    <small>%</small>
                  </div>
                </label>
              </div>
              <p className="helper-text">
                Admissions above available inpatient capacity may board in the
                ED.
              </p>
            </article>
            <article className="panel assumption-panel assumptions-wide">
              <div className="assumption-title">
                <div className="assumption-icon">
                  <SlidersHorizontal size={17} />
                </div>
                <div>
                  <h3>Model settings</h3>
                  <p>Care mix, run duration, and reproducibility</p>
                </div>
              </div>
              <div className="settings-grid">
                <label>
                  <span>High acuity share</span>
                  <div className="input-with-unit">
                    <input
                      aria-label="High acuity share percent"
                      type="number"
                      disabled={busy}
                      min="0"
                      max="100"
                      value={Math.round(scenario.acuityMix.high * 100)}
                      onChange={(e) =>
                        setAcuity("high", Number(e.target.value))
                      }
                    />
                    <small>%</small>
                  </div>
                </label>
                <label>
                  <span>Medium acuity share</span>
                  <div className="input-with-unit">
                    <input
                      aria-label="Medium acuity share percent"
                      type="number"
                      disabled={busy}
                      min="0"
                      max="100"
                      value={Math.round(scenario.acuityMix.medium * 100)}
                      onChange={(e) =>
                        setAcuity("medium", Number(e.target.value))
                      }
                    />
                    <small>%</small>
                  </div>
                </label>
                <label>
                  <span>Low acuity share</span>
                  <div className="input-with-unit">
                    <input
                      aria-label="Low acuity share percent"
                      type="number"
                      disabled={busy}
                      min="0"
                      max="100"
                      value={Math.round(scenario.acuityMix.low * 100)}
                      onChange={(e) => setAcuity("low", Number(e.target.value))}
                    />
                    <small>%</small>
                  </div>
                </label>
                {(["high", "medium", "low"] as const).map((acuity) => (
                  <label key={acuity}>
                    <span>Median service · {acuity}</span>
                    <div className="input-with-unit">
                      <input
                        aria-label={`${acuity[0]!.toUpperCase()}${acuity.slice(1)} acuity service time`}
                        type="number"
                        disabled={busy}
                        min="5"
                        max="600"
                        value={scenario.serviceMinutes[acuity]}
                        onChange={(e) =>
                          updateScenario((s) => ({
                            ...s,
                            serviceMinutes: {
                              ...s.serviceMinutes,
                              [acuity]: Number(e.target.value),
                            },
                          }))
                        }
                      />
                      <small>min</small>
                    </div>
                  </label>
                ))}
                <label>
                  <span>Inpatient length of stay</span>
                  <div className="input-with-unit">
                    <input
                      aria-label="Inpatient length of stay"
                      type="number"
                      disabled={busy}
                      min="1"
                      max="336"
                      value={scenario.inpatientHours}
                      onChange={(e) =>
                        setNumber("inpatientHours", Number(e.target.value))
                      }
                    />
                    <small>hr</small>
                  </div>
                </label>
                <label>
                  <span>Simulation horizon</span>
                  <div className="input-with-unit">
                    <input
                      aria-label="Simulation horizon"
                      type="number"
                      disabled={busy}
                      min="6"
                      max="168"
                      value={scenario.horizonHours}
                      onChange={(e) =>
                        setNumber("horizonHours", Number(e.target.value))
                      }
                    />
                    <small>hr</small>
                  </div>
                </label>
                <label>
                  <span>Warm-up excluded</span>
                  <div className="input-with-unit">
                    <input
                      aria-label="Warm-up hours"
                      type="number"
                      disabled={busy}
                      min="0"
                      max="72"
                      value={scenario.warmupHours}
                      onChange={(e) =>
                        setNumber("warmupHours", Number(e.target.value))
                      }
                    />
                    <small>hr</small>
                  </div>
                </label>
                <label>
                  <span>Independent replications</span>
                  <div className="input-with-unit">
                    <input
                      aria-label="Replication count"
                      type="number"
                      disabled={busy}
                      min="2"
                      max="100"
                      value={scenario.replications}
                      onChange={(e) =>
                        setNumber("replications", Number(e.target.value))
                      }
                    />
                    <small>runs</small>
                  </div>
                </label>
                <label>
                  <span>Random seed</span>
                  <input
                    aria-label="Random seed"
                    type="number"
                    disabled={busy}
                    min="0"
                    max="2147483647"
                    value={scenario.seed}
                    onChange={(e) => setNumber("seed", Number(e.target.value))}
                  />
                </label>
              </div>
              <div className="setting-note">
                <Info size={15} />
                <span>
                  Editing an acuity share adjusts the other two proportionally
                  so the total stays at 100%. Student-t intervals summarize
                  variation across independent replications, not model error.
                </span>
              </div>
              <button
                className="button button-primary run-bottom"
                onClick={() => void run(scenario)}
                disabled={busy || interventionHasNoEffect}
              >
                {busy ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <Play size={15} fill="currentColor" />
                )}{" "}
                Run with these assumptions
              </button>
            </article>
          </section>

          <section className="bottom-grid">
            <article className="panel utilization-panel">
              <div className="panel-heading">
                <div>
                  <h2>Resource snapshot</h2>
                  <p>Mean utilization · baseline scenario</p>
                </div>
                <BedDouble size={18} className="heading-icon" />
              </div>
              <div className="resource-row">
                <span>ED beds</span>
                <div className="progress-track">
                  <i
                    style={{
                      width: `${Math.min(100, result?.edUtilization.mean ?? 0)}%`,
                    }}
                  />
                </div>
                <strong>
                  {result ? `${fmt(result.edUtilization.mean)}%` : "—"}
                </strong>
              </div>
              <div className="resource-row">
                <span>ED providers</span>
                <div className="progress-track provider">
                  <i
                    style={{
                      width: `${Math.min(100, result?.providerUtilization.mean ?? 0)}%`,
                    }}
                  />
                </div>
                <strong>
                  {result ? `${fmt(result.providerUtilization.mean)}%` : "—"}
                </strong>
              </div>
              <div className="resource-row">
                <span>Inpatient beds</span>
                <div className="progress-track inpatient">
                  <i
                    style={{
                      width: `${Math.min(100, result?.inpatientUtilization.mean ?? 0)}%`,
                    }}
                  />
                </div>
                <strong>
                  {result ? `${fmt(result.inpatientUtilization.mean)}%` : "—"}
                </strong>
              </div>
              <div className="resource-detail">
                <span>
                  <span className="status-dot green" />
                  {fmt(scenario.capacities.inpatientBeds)} configured beds
                </span>
                <span>
                  Boarding:{" "}
                  {result ? `${fmt(result.boardingHours.mean)} bed-hr` : "—"}
                </span>
              </div>
            </article>
            <article className="panel model-note">
              <div className="note-head">
                <div className="note-icon">
                  <Info size={17} />
                </div>
                <strong>Understand the model</strong>
              </div>
              <p>
                This simplified model uses Poisson arrivals, acuity-based
                service times, finite ED and inpatient beds, and inpatient
                boarding. It is for learning and scenario exploration.
              </p>
              <details id="model">
                <summary>Read assumptions & limitations</summary>
                <p>
                  Arrivals follow four repeated six-hour rates.
                  First-come-first-served ED care uses acuity-specific lognormal
                  service times. Admissions wait in the ED when inpatient beds
                  are full. The model does not include acuity priority, staffing
                  shifts, patient choice, or local policies, and has not been
                  calibrated to a hospital. Results are not forecasts or
                  operational guidance.
                </p>
              </details>
            </article>
          </section>

          <footer className="page-footer">
            <span>
              HAVEN <i>·</i> HOSPITAL OPERATIONS DIGITAL TWIN
            </span>
            <span>
              Educational planning tool · Not a clinical system, staffing
              directive, or forecast
            </span>
            <div className="footer-actions">
              <button onClick={() => exportData("json")} disabled={!base}>
                <Download size={14} /> JSON
              </button>
              <button onClick={() => exportData("csv")} disabled={!base}>
                <Download size={14} /> CSV
              </button>
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
}
