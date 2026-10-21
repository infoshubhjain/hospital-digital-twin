import { describe, expect, it } from "vitest";
import { demoScenario, scenarioSchema } from "./model.js";
import { simulate } from "./simulation.js";
import { meanInterval, pairedEffect } from "./statistics.js";

describe("scenario validation", () => {
  it("rejects impossible capacity, acuity totals, and warm-up length", () => {
    expect(
      scenarioSchema.safeParse({
        ...demoScenario,
        capacities: { ...demoScenario.capacities, providers: 0 },
      }).success,
    ).toBe(false);
    expect(
      scenarioSchema.safeParse({
        ...demoScenario,
        acuityMix: { high: 0.2, medium: 0.2, low: 0.2 },
      }).success,
    ).toBe(false);
    expect(
      scenarioSchema.safeParse({
        ...demoScenario,
        warmupHours: demoScenario.horizonHours,
      }).success,
    ).toBe(false);
  });
});

describe("paired intervention analysis", () => {
  it("uses a Student-t interval for independent summary metrics at low replication counts", () => {
    expect(meanInterval([0, 10])).toEqual({ mean: 5, low: 0, high: 68.53 });
    expect(() => meanInterval([1])).toThrow(RangeError);
    expect(() => meanInterval([1, Number.NaN])).toThrow(RangeError);
  });

  it("calculates a paired 95% t interval from replication-level effects", () => {
    const effect = pairedEffect([10, 10, 10], [11, 12, 13]);
    expect(effect.mean).toBe(2);
    expect(effect.standardError).toBeCloseTo(1 / Math.sqrt(3), 12);
    expect(effect.low).toBeCloseTo(-0.484, 2);
    expect(effect.high).toBeCloseTo(4.484, 2);
  });

  it("reports unavailable intervals for one replication and validates pairs", () => {
    expect(pairedEffect([2], [3])).toMatchObject({ mean: 1, low: null, high: null, varianceReductionPercent: null });
    expect(() => pairedEffect([1], [1, 2])).toThrow(RangeError);
  });

  it("reports observed paired variance reduction, including negative values", () => {
    expect(pairedEffect([1, 2, 3], [2, 3, 4]).varianceReductionPercent).toBe(100);
    expect(pairedEffect([1, 2, 3], [3, 2, 1]).varianceReductionPercent).toBe(-100);
    expect(pairedEffect([4, 4, 4], [5, 5, 5]).varianceReductionPercent).toBeNull();
  });
});

describe("discrete-event model", () => {
  it("repeats for a fixed seed and accounts for every measured arrival", () => {
    const small = {
      ...demoScenario,
      horizonHours: 12,
      warmupHours: 2,
      replications: 6,
    };
    const a = simulate(small, "fixed-id");
    const b = simulate(small, "fixed-id");
    expect(a.summary).toEqual(b.summary);
    expect(a.timeline).toEqual(b.timeline);
    for (const replication of a.replicationMetrics)
      expect(replication.arrivals).toBe(
        replication.completed + replication.stillInSystem,
      );
  });

  it("handles zero arrivals without invalid values", () => {
    const empty = {
      ...demoScenario,
      arrivalRates: [0, 0, 0, 0],
      horizonHours: 6,
      warmupHours: 0,
      replications: 3,
    };
    const result = simulate(empty);
    expect(result.summary.arrivals.mean).toBe(0);
    expect(result.summary.waitMedian.mean).toBe(0);
    expect(result.timeline).toHaveLength(empty.horizonHours);
    expect(
      result.timeline.every(
        (p) => p.queue >= 0 && p.edOccupancy <= empty.capacities.edBeds,
      ),
    ).toBe(true);
    expect(JSON.stringify(result)).not.toContain("null");
  });

  it("respects finite ED capacity under sustained admissions", () => {
    const loaded = {
      ...demoScenario,
      arrivalRates: [70, 70, 70, 70],
      horizonHours: 12,
      warmupHours: 0,
      replications: 3,
      capacities: { providers: 100, edBeds: 3, inpatientBeds: 1 },
      admissionRate: 1,
    };
    const result = simulate(loaded);
    expect(
      result.timeline.every(
        (p) =>
          p.edOccupancy <= loaded.capacities.edBeds &&
          p.inpatientOccupancy <= loaded.capacities.inpatientBeds &&
          p.boarding >= 0,
      ),
    ).toBe(true);
    expect(result.timeline.some((p) => p.boarding > 0)).toBe(true);
    for (const replication of result.replicationMetrics)
      expect(replication.arrivals).toBe(
        replication.completed + replication.stillInSystem,
      );
  });

  it("reports patients still waiting separately from observed wait percentiles", () => {
    const congested = {
      ...demoScenario,
      arrivalRates: [80, 80, 80, 80],
      horizonHours: 6,
      warmupHours: 0,
      replications: 4,
      capacities: { providers: 1, edBeds: 1, inpatientBeds: 1 },
      admissionRate: 0,
      serviceMinutes: { high: 600, medium: 600, low: 600 },
    };
    const result = simulate(congested, "censored-waits");
    for (const replication of result.replicationMetrics) {
      expect(replication.stillWaiting).toBeGreaterThan(0);
      expect(replication.waitObservations).toBeLessThan(replication.arrivals);
    }
    expect(result.summary.stillWaiting.mean).toBeGreaterThan(0);
  });

  it("narrows the seeded wait-time interval as replications increase", () => {
    const small = simulate({ ...demoScenario, replications: 8 }, "convergence");
    const larger = simulate(
      { ...demoScenario, replications: 64 },
      "convergence",
    );
    const smallWidth = small.summary.waitP90.high - small.summary.waitP90.low;
    const largerWidth =
      larger.summary.waitP90.high - larger.summary.waitP90.low;
    expect(largerWidth).toBeLessThan(smallWidth);
  });
});
