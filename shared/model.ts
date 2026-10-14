import { z } from "zod";

export const scenarioSchema = z
  .object({
    name: z.string().trim().min(1).max(60),
    arrivalRates: z.array(z.number().min(0).max(80)).length(4),
    acuityMix: z.object({
      high: z.number().min(0).max(1),
      medium: z.number().min(0).max(1),
      low: z.number().min(0).max(1),
    }),
    admissionRate: z.number().min(0).max(1),
    capacities: z.object({
      providers: z.number().int().min(1).max(100),
      edBeds: z.number().int().min(1).max(500),
      inpatientBeds: z.number().int().min(1).max(1000),
    }),
    serviceMinutes: z.object({
      high: z.number().min(5).max(600),
      medium: z.number().min(5).max(600),
      low: z.number().min(5).max(600),
    }),
    inpatientHours: z.number().min(1).max(336),
    horizonHours: z.number().int().min(6).max(168),
    warmupHours: z.number().int().min(0).max(72),
    seed: z.number().int().min(0).max(2_147_483_647),
    replications: z.number().int().min(2).max(100),
  })
  .refine((value) => value.warmupHours < value.horizonHours, {
    message: "Warm-up must be shorter than the simulation horizon.",
    path: ["warmupHours"],
  })
  .refine(
    (value) =>
      Math.abs(
        value.acuityMix.high + value.acuityMix.medium + value.acuityMix.low - 1,
      ) < 0.001,
    { message: "Acuity percentages must add up to 100%.", path: ["acuityMix"] },
  );

export type Scenario = z.infer<typeof scenarioSchema>;

export const demoScenario: Scenario = {
  name: "Balanced day — example",
  arrivalRates: [9, 15, 18, 11],
  acuityMix: { high: 0.18, medium: 0.5, low: 0.32 },
  admissionRate: 0.18,
  capacities: { providers: 17, edBeds: 28, inpatientBeds: 120 },
  serviceMinutes: { high: 90, medium: 60, low: 35 },
  inpatientHours: 36,
  horizonHours: 48,
  warmupHours: 6,
  seed: 41721,
  replications: 24,
};

export type Metric = { mean: number; low: number; high: number };
export type Summary = {
  arrivals: Metric;
  completed: Metric;
  waitMedian: Metric;
  waitP90: Metric;
  edUtilization: Metric;
  inpatientUtilization: Metric;
  providerUtilization: Metric;
  boardingHours: Metric;
  stillInSystem: Metric;
};
export type SimulationResult = {
  id: string;
  modelVersion: string;
  source: "synthetic";
  scenario: Scenario;
  summary: Summary;
  timeline: {
    hour: number;
    edOccupancy: number;
    inpatientOccupancy: number;
    queue: number;
    boarding: number;
  }[];
  replicationMetrics: Record<string, number>[];
  completedAt: string;
};
