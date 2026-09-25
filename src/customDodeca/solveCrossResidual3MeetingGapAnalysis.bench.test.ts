/**
 * MEGAMINX_SOLVECROSS_RESIDUAL3_MEETING_GAP_ANALYSIS_V1 -- pure
 * measurement, no production change. For each of the 3 remaining
 * residuals (normal#28, hard#6, hard#24), scans the COMPLETE forward
 * tree from phase1 against the COMPLETE precomputed backward table and
 * counts exact hits -- confirming (or refuting) with real numbers
 * whether the forward/backward search spaces actually intersect.
 */
import { describe, it, expect } from "vitest";
import { residual3MeetingGapAnalysisWasm } from "./megaminxSearchWasm";
import { applyMegaminxScramble, randomMegaminxScramble, solvedMegaminxState, type MegaminxState } from "./megaminxState";
import { mulberry32 } from "./dodecaState";

const TRACKED_PIECES = [0, 1, 2, 3, 4];
const PRODUCTION_CAP = 1_500_000;
const DEPTH12_MAX_HALF_DEPTH = 12;
const TOTAL_MAX_HALF_DEPTH = 13;

function scrambledFor(tier: string, length: number, seed: number): MegaminxState {
  const turns = randomMegaminxScramble(length, mulberry32(seed * 97 + length * 7919));
  return applyMegaminxScramble(solvedMegaminxState(), turns);
}

const RESIDUALS: { key: string; tier: string; length: number; seed: number }[] = [
  { key: "normal#28", tier: "normal", length: 40, seed: 28 },
  { key: "hard#6", tier: "hard", length: 70, seed: 6 },
  { key: "hard#24", tier: "hard", length: 70, seed: 24 },
];

describe("MEGAMINX_SOLVECROSS_RESIDUAL3_MEETING_GAP_ANALYSIS_V1", () => {
  it("forward tree (complete, no sampling) vs precomputed backward table: exact hit count per residual", () => {
    console.log("\nfixture    | forward states | orbit lookups | exact hits | min backward depth | effectiveMaxRound | tableInsufficientDepth | classification");

    const rows: { key: string; result: ReturnType<typeof residual3MeetingGapAnalysisWasm> }[] = [];
    for (const f of RESIDUALS) {
      const scrambled = scrambledFor(f.tier, f.length, f.seed);
      const result = residual3MeetingGapAnalysisWasm(scrambled, TRACKED_PIECES, DEPTH12_MAX_HALF_DEPTH, PRODUCTION_CAP, TOTAL_MAX_HALF_DEPTH);
      rows.push({ key: f.key, result });

      const classification = result.hitCount === 0 ? "Case C (no intersection)" : result.minHitRound > result.effectiveMaxRound ? "Case B (hit outside budget)" : "Case A (hit missed by solver -- INVESTIGATE)";

      console.log(
        `${f.key.padEnd(10)} | ${String(result.forwardFinalSize).padStart(15)} | ${String(result.forwardFinalSize).padStart(13)} | ${String(result.hitCount).padStart(10)} | ${String(result.minHitRound).padStart(19)} | ${String(result.effectiveMaxRound).padStart(18)} | ${String(result.tableInsufficientDepth).padStart(22)} | ${classification}`,
      );

      expect(result.status).toBe(0);
      expect(result.tableInsufficientDepth).toBe(false);
    }

    console.log("\n(orbit lookups = forward states: canonical_key_v2 already encodes the min-over-C5-orbit representative per forward state -- see this Sprint's Rust dev notes for why 1 canon-key check per forward node is the complete orbit-vs-orbit intersection test, not merely an approximation of it)");

    const allZeroHits = rows.every((r) => r.result.hitCount === 0);
    console.log(`\nAll 3 residuals hitCount=0: ${allZeroHits}`);
    if (allZeroHits) {
      console.log("Stop Rule: Case C consistent across all 3 -> per this Sprint's own instruction, do NOT simply raise search depth/budget. Structural gap between forward's depth<=12 reachable set and the fixed 7-round backward table confirmed with exact numbers.");
    }

    // This Sprint's own expectation, to be updated only if real data disagrees:
    expect(rows.map((r) => r.result.hitCount)).toEqual([0, 0, 0]);
  }, 60_000);
});
