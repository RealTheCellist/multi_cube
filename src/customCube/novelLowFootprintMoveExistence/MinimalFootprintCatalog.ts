// --- MinimalFootprintCatalog (Novel Low-Footprint Move Existence
// Validation Sprint v1, Deliverable "Low-Footprint Move Catalog") -----------
import type { CommutatorSearchResult } from "./TrueCommutatorSearch";

export interface CatalogEntry {
  label: string;
  cycleLength: number;
  attemptsEvaluated: number;
  found: boolean; // any attempt achieved wrongWingAfter < wrongWingBefore
  bestAffectedWingCount: number | null; // among IMPROVING attempts only
  bestFootprintRatio: number | null; // bestAffectedWingCount / cycleLength
  bestKnownPattern: string | null;
  bestMoveLength: number | null;
  bestWrongWingBefore: number | null;
  bestWrongWingAfter: number | null;
  improvingCount: number;
}

export function buildCatalog(results: CommutatorSearchResult[]): CatalogEntry[] {
  return results.map((r) => {
    const found = r.improvingCount > 0 && !!r.best && r.best.wrongWingAfter < r.best.wrongWingBefore;
    return {
      label: r.label,
      cycleLength: r.cycleLength,
      attemptsEvaluated: r.attemptsEvaluated,
      found,
      bestAffectedWingCount: found ? r.best!.affectedWingCount : null,
      bestFootprintRatio: found ? r.best!.affectedWingCount / r.cycleLength : null,
      bestKnownPattern: found ? r.best!.knownPattern : null,
      bestMoveLength: found ? r.best!.moveLength : null,
      bestWrongWingBefore: found ? r.best!.wrongWingBefore : null,
      bestWrongWingAfter: found ? r.best!.wrongWingAfter : null,
      improvingCount: r.improvingCount,
    };
  });
}
