// --- FootprintDistributionSummary (Mixed Commutator Design Space
// Validation Sprint v1, Deliverable #3) ---------------------------------
export interface FootprintDistributionSummary {
  n: number; // number of ratios included
  min: number | null;
  avg: number | null;
  median: number | null;
  max: number | null;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function summarizeFootprintRatios(ratios: number[]): FootprintDistributionSummary {
  if (ratios.length === 0) return { n: 0, min: null, avg: null, median: null, max: null };
  return {
    n: ratios.length,
    min: Math.min(...ratios),
    avg: ratios.reduce((a, b) => a + b, 0) / ratios.length,
    median: median(ratios),
    max: Math.max(...ratios),
  };
}
