export type PairedEffect = {
  mean: number;
  standardError: number | null;
  low: number | null;
  high: number | null;
  replications: number;
  varianceReductionPercent: number | null;
};

function logGamma(z: number): number {
  const coefficients = [
    676.5203681218851, -1259.1392167224028, 771.3234287776531,
    -176.6150291621406, 12.507343278686905, -0.13857109526572012,
    9.984369578019572e-6, 1.5056327351493116e-7,
  ];
  if (z < 0.5) return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  const x = coefficients.reduce((sum, c, i) => sum + c / (z + i), 0.9999999999998099);
  const t = z - 1 + 7.5;
  return 0.9189385332046727 + (z - 0.5) * Math.log(t) - t + Math.log(x);
}

function betaFraction(a: number, b: number, x: number): number {
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 200; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c; if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const delta = d * c; h *= delta;
    if (Math.abs(delta - 1) < 3e-14) break;
  }
  return h;
}

function regularizedBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const factor = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log1p(-x));
  return x < (a + 1) / (a + b + 2)
    ? factor * betaFraction(a, b, x) / a
    : 1 - factor * betaFraction(b, a, 1 - x) / b;
}

function tCritical95(df: number): number {
  let low = 0, high = 128;
  for (let i = 0; i < 64; i++) {
    const t = (low + high) / 2;
    const cdf = 1 - 0.5 * regularizedBeta(df / (df + t * t), df / 2, 0.5);
    if (cdf < 0.975) low = t;
    else high = t;
  }
  return (low + high) / 2;
}

/** Positive effect means the intervention increased the metric. */
export function pairedEffect(baseline: number[], intervention: number[]): PairedEffect {
  if (!baseline.length || baseline.length !== intervention.length || [...baseline, ...intervention].some((x) => !Number.isFinite(x))) {
    throw new RangeError("Paired samples must have equal, non-empty lengths and finite values.");
  }
  const effects = baseline.map((value, i) => intervention[i]! - value);
  const mean = effects.reduce((sum, value) => sum + value, 0) / effects.length;
  if (effects.length < 2) return { mean, standardError: null, low: null, high: null, replications: 1, varianceReductionPercent: null };
  const sampleVariance = (values: number[]) => {
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    return values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1);
  };
  const independentVariance = sampleVariance(baseline) + sampleVariance(intervention);
  const varianceReductionPercent = independentVariance === 0
    ? null
    : 100 * (1 - sampleVariance(effects) / independentVariance);
  const variance = effects.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (effects.length - 1);
  const standardError = Math.sqrt(variance / effects.length);
  const margin = tCritical95(effects.length - 1) * standardError;
  return { mean, standardError, low: mean - margin, high: mean + margin, replications: effects.length, varianceReductionPercent };
}
