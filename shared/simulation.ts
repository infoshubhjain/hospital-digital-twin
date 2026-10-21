import type { Scenario, SimulationResult, Summary } from "./model.js";
import { meanInterval } from "./statistics.js";

type Patient = {
  arrival: number;
  service: number;
  inpatient: boolean;
  included: boolean;
  state: "waiting" | "ed" | "boarding" | "inpatient" | "completed";
};
type Event = {
  time: number;
  kind: "arrival" | "edDone" | "inpatientDone";
  patient: Patient;
};
type Replication = {
  arrivals: number;
  completed: number;
  waits: number[];
  stillWaiting: number;
  edUtilization: number;
  inpatientUtilization: number;
  providerUtilization: number;
  boardingHours: number;
  stillInSystem: number;
  timeline: SimulationResult["timeline"];
};

function rng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

class EventQueue {
  private heap: Event[] = [];
  push(value: Event) {
    const heap = this.heap;
    heap.push(value);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p]!.time <= value.time) break;
      heap[i] = heap[p]!;
      i = p;
    }
    heap[i] = value;
  }
  pop(): Event | undefined {
    const heap = this.heap;
    if (!heap.length) return;
    const root = heap[0]!;
    const last = heap.pop()!;
    if (heap.length) {
      let i = 0;
      while (true) {
        let c = i * 2 + 1;
        if (c >= heap.length) break;
        if (c + 1 < heap.length && heap[c + 1]!.time < heap[c]!.time) c++;
        if (heap[c]!.time >= last.time) break;
        heap[i] = heap[c]!;
        i = c;
      }
      heap[i] = last;
    }
    return root;
  }
}

function quantile(values: number[], q: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[
    Math.min(sorted.length - 1, Math.floor(q * (sorted.length - 1)))
  ]!;
}

function replicate(s: Scenario, seed: number): Replication {
  const random = rng(seed);
  const events = new EventQueue();
  const waiting: Patient[] = [];
  const boarding: Patient[] = [];
  const patients: Patient[] = [];
  const duration = s.horizonHours + s.warmupHours;
  const start = s.warmupHours * 60;
  const end = duration * 60;
  const waits: number[] = [];
  let t = 0;
  let edBeds = 0;
  let providers = 0;
  let inpatientBeds = 0;
  let arrivals = 0;
  let completed = 0;
  let serviceMinutes = 0;
  let edArea = 0;
  let inpatientArea = 0;
  let boardingArea = 0;
  let last = 0;
  const timeline: Replication["timeline"] = [];
  let nextHour = Math.ceil(start / 60) * 60;
  const rateAt = (minute: number) =>
    s.arrivalRates[Math.floor(((minute / 60) % 24) / 6)]!;
  while (t < end) {
    const rate = rateAt(t);
    const boundary = Math.min(end, (Math.floor(t / 360) + 1) * 360);
    if (!rate) {
      t = boundary;
      continue;
    }
    const u = Math.max(Number.EPSILON, random());
    t += (-Math.log(u) * 60) / rate;
    if (t < boundary) {
      const acuity = random();
      const high = s.acuityMix.high;
      const medium = high + s.acuityMix.medium;
      const key = acuity < high ? "high" : acuity < medium ? "medium" : "low";
      const base = s.serviceMinutes[key];
      const z =
        Math.sqrt(-2 * Math.log(Math.max(Number.EPSILON, random()))) *
        Math.cos(2 * Math.PI * random());
      const service = Math.max(5, base * Math.exp(z * 0.35));
      const patient: Patient = {
        arrival: t,
        service,
        inpatient: random() < s.admissionRate,
        included: t >= start,
        state: "waiting",
      };
      patients.push(patient);
      events.push({ time: t, kind: "arrival", patient });
    } else t = boundary;
  }
  const dispatch = (at: number) => {
    while (
      waiting.length &&
      providers < s.capacities.providers &&
      edBeds < s.capacities.edBeds
    ) {
      const p = waiting.shift()!;
      p.state = "ed";
      providers++;
      edBeds++;
      if (p.included) waits.push(Math.max(0, at - p.arrival));
      events.push({ time: at + p.service, kind: "edDone", patient: p });
    }
  };
  let event: Event | undefined;
  while ((event = events.pop())) {
    t = event.time;
    while (nextHour <= t && nextHour <= end) {
      timeline.push({
        hour: Math.round(nextHour / 60),
        edOccupancy: edBeds,
        inpatientOccupancy: inpatientBeds,
        queue: waiting.length,
        boarding: boarding.length,
      });
      nextHour += 60;
    }
    const measureFrom = Math.max(last, start);
    const measureTo = Math.min(t, end);
    if (measureTo > measureFrom) {
      const dt = measureTo - measureFrom;
      edArea += edBeds * dt;
      inpatientArea += inpatientBeds * dt;
      boardingArea += boarding.length * dt;
      serviceMinutes += providers * dt;
    }
    last = t;
    if (t > end) break;
    if (event.kind === "arrival") {
      if (event.patient.included) arrivals++;
      waiting.push(event.patient);
      dispatch(t);
    } else if (event.kind === "edDone") {
      providers--;
      if (event.patient.inpatient) {
        if (inpatientBeds < s.capacities.inpatientBeds) {
          event.patient.state = "inpatient";
          inpatientBeds++;
          edBeds--;
          events.push({
            time:
              t +
              s.inpatientHours *
                60 *
                Math.max(0.1, -Math.log(Math.max(Number.EPSILON, random()))),
            kind: "inpatientDone",
            patient: event.patient,
          });
        } else {
          event.patient.state = "boarding";
          boarding.push(event.patient);
        }
      } else {
        edBeds--;
        event.patient.state = "completed";
        if (event.patient.included) completed++;
      }
      dispatch(t);
    } else {
      event.patient.state = "completed";
      if (event.patient.included) completed++;
      inpatientBeds--;
      if (boarding.length) {
        const boarded = boarding.shift()!;
        boarded.state = "inpatient";
        events.push({
          time:
            t +
            s.inpatientHours *
              60 *
              Math.max(0.1, -Math.log(Math.max(Number.EPSILON, random()))),
          kind: "inpatientDone",
          patient: boarded,
        });
        edBeds--;
        inpatientBeds++;
      }
      dispatch(t);
    }
  }
  while (nextHour <= end) {
    timeline.push({
      hour: Math.round(nextHour / 60),
      edOccupancy: edBeds,
      inpatientOccupancy: inpatientBeds,
      queue: waiting.length,
      boarding: boarding.length,
    });
    nextHour += 60;
  }
  const metricTime = s.horizonHours * 60;
  const stillInSystem = patients.filter(
    (patient) => patient.included && patient.state !== "completed",
  ).length;
  if (arrivals !== completed + stillInSystem)
    throw new Error("Simulation patient accounting invariant failed.");
  return {
    arrivals,
    completed,
    waits,
    stillWaiting: patients.filter(
      (patient) => patient.included && patient.state === "waiting",
    ).length,
    edUtilization: Math.min(1, edArea / (metricTime * s.capacities.edBeds)),
    inpatientUtilization: Math.min(
      1,
      inpatientArea / (metricTime * s.capacities.inpatientBeds),
    ),
    providerUtilization: Math.min(
      1,
      serviceMinutes / (metricTime * s.capacities.providers),
    ),
    boardingHours: boardingArea / 60,
    stillInSystem,
    timeline: timeline.filter(
      (p) => p.hour >= s.warmupHours && p.hour <= duration,
    ),
  };
}

export function simulate(
  s: Scenario,
  id: string = crypto.randomUUID(),
): SimulationResult {
  const reps = Array.from({ length: s.replications }, (_, i) =>
    replicate(s, (s.seed + i * 2654435761) >>> 0),
  );
  const summary: Summary = {
    arrivals: meanInterval(reps.map((r) => r.arrivals)),
    completed: meanInterval(reps.map((r) => r.completed)),
    waitMedian: meanInterval(reps.map((r) => quantile(r.waits, 0.5))),
    waitP90: meanInterval(reps.map((r) => quantile(r.waits, 0.9))),
    waitObservations: meanInterval(reps.map((r) => r.waits.length)),
    edUtilization: meanInterval(reps.map((r) => r.edUtilization * 100)),
    inpatientUtilization: meanInterval(
      reps.map((r) => r.inpatientUtilization * 100),
    ),
    providerUtilization: meanInterval(
      reps.map((r) => r.providerUtilization * 100),
    ),
    boardingHours: meanInterval(reps.map((r) => r.boardingHours)),
    stillInSystem: meanInterval(reps.map((r) => r.stillInSystem)),
    stillWaiting: meanInterval(reps.map((r) => r.stillWaiting)),
  };
  const max = Math.max(1, ...reps[0]!.timeline.map((x) => x.hour));
  const timeline = Array.from(
    { length: Math.max(0, max - s.warmupHours) },
    (_, i) => {
      const hour = s.warmupHours + i + 1;
      const rows = reps
        .map((r) => r.timeline.find((x) => x.hour === hour))
        .filter((x): x is NonNullable<typeof x> => Boolean(x));
      return {
        hour,
        edOccupancy: Number(
          (
            rows.reduce((a, x) => a + x.edOccupancy, 0) /
            Math.max(1, rows.length)
          ).toFixed(1),
        ),
        inpatientOccupancy: Number(
          (
            rows.reduce((a, x) => a + x.inpatientOccupancy, 0) /
            Math.max(1, rows.length)
          ).toFixed(1),
        ),
        queue: Number(
          (
            rows.reduce((a, x) => a + x.queue, 0) / Math.max(1, rows.length)
          ).toFixed(1),
        ),
        boarding: Number(
          (
            rows.reduce((a, x) => a + x.boarding, 0) / Math.max(1, rows.length)
          ).toFixed(1),
        ),
      };
    },
  );
  return {
    id,
    modelVersion: "1.0.0",
    source: "synthetic",
    scenario: s,
    summary,
    timeline,
    replicationMetrics: reps.map((r) => ({
      arrivals: r.arrivals,
      completed: r.completed,
      stillInSystem: r.stillInSystem,
      waitMedian: quantile(r.waits, 0.5),
      waitP90: quantile(r.waits, 0.9),
      waitObservations: r.waits.length,
      stillWaiting: r.stillWaiting,
      edUtilization: r.edUtilization * 100,
      inpatientUtilization: r.inpatientUtilization * 100,
      providerUtilization: r.providerUtilization * 100,
      boardingHours: r.boardingHours,
    })),
    completedAt: new Date().toISOString(),
  };
}
