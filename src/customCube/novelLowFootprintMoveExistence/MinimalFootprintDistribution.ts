// --- MinimalFootprintDistribution (Novel Low-Footprint Move Existence
// Validation Sprint v1, Deliverable "Minimal Footprint Distribution",
// RQ-1/RQ-2) ------------------------------------------------------------
import type { CatalogEntry } from "./MinimalFootprintCatalog";

// Same disclosed bar Move Representation Blueprint/Prototype Sprint v1
// already established ("approximately cycleLength"), reused verbatim for
// continuity across this research arc.
const FOOTPRINT_RATIO_TARGET = 2.0;

export interface DistributionSummary {
  n: number;
  foundCount: number; // cases with at least one improving construction
  foundRate: number;
  avgBestFootprintRatio: number | null; // over FOUND cases only
  medianBestFootprintRatio: number | null;
  minBestFootprintRatio: number | null;
  maxBestFootprintRatio: number | null;
  lowFootprintAchievedCount: number; // FOUND cases with footprintRatio <= target
  lowFootprintAchievedRate: number; // relative to foundCount (0 if foundCount=0)
  byCycleLength: { cycleLength: number; n: number; foundCount: number }[];
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export function summarizeDistribution(entries: CatalogEntry[]): DistributionSummary {
  const found = entries.filter((e) => e.found && e.bestFootprintRatio !== null);
  const ratios = found.map((e) => e.bestFootprintRatio!);
  const lengths = Array.from(new Set(entries.map((e) => e.cycleLength))).sort((a, b) => a - b);

  return {
    n: entries.length,
    foundCount: found.length,
    foundRate: entries.length ? found.length / entries.length : 0,
    avgBestFootprintRatio: ratios.length ? ratios.reduce((a, b) => a + b, 0) / ratios.length : null,
    medianBestFootprintRatio: median(ratios),
    minBestFootprintRatio: ratios.length ? Math.min(...ratios) : null,
    maxBestFootprintRatio: ratios.length ? Math.max(...ratios) : null,
    lowFootprintAchievedCount: ratios.filter((r) => r <= FOOTPRINT_RATIO_TARGET).length,
    lowFootprintAchievedRate: ratios.length ? ratios.filter((r) => r <= FOOTPRINT_RATIO_TARGET).length / ratios.length : 0,
    byCycleLength: lengths.map((cycleLength) => {
      const members = entries.filter((e) => e.cycleLength === cycleLength);
      return { cycleLength, n: members.length, foundCount: members.filter((e) => e.found).length };
    }),
  };
}

export { FOOTPRINT_RATIO_TARGET };
