/**
 * MEGAMINX_SOLVECROSS_RESIDUAL3_STATE_INVARIANT_ANALYSIS_V1 -- pure
 * measurement, no production change. Looks for a raw (pre-
 * canonicalization) structural signature of the 5 tracked pieces that
 * separates residual-3's forward-reachable set from the precomputed
 * backward-reachable set, and from the 7-fixture comparison group's own
 * forward-reachable sets.
 */
import { describe, it, expect } from "vitest";
import { residual3ForwardSignatureHistogramWasm, residual3BackwardSignatureHistogramWasm, decodeSignature, type SignatureHistogramResult } from "./megaminxSearchWasm";
import { applyMegaminxScramble, randomMegaminxScramble, solvedMegaminxState, type MegaminxState } from "./megaminxState";
import { mulberry32 } from "./dodecaState";

const TRACKED_PIECES = [0, 1, 2, 3, 4];
const PRODUCTION_CAP = 1_500_000;
const DEPTH12_MAX_HALF_DEPTH = 12;

function scrambledFor(tier: string, length: number, seed: number): MegaminxState {
  const turns = randomMegaminxScramble(length, mulberry32(seed * 97 + length * 7919));
  return applyMegaminxScramble(solvedMegaminxState(), turns);
}

const RESIDUALS = [
  { key: "normal#28", tier: "normal", length: 40, seed: 28 },
  { key: "hard#6", tier: "hard", length: 70, seed: 6 },
  { key: "hard#24", tier: "hard", length: 70, seed: 24 },
];
const COMPARISON = [
  { key: "hard#5", tier: "hard", length: 70, seed: 5 },
  { key: "hard#9", tier: "hard", length: 70, seed: 9 },
  { key: "hard#25", tier: "hard", length: 70, seed: 25 },
  { key: "hard#30", tier: "hard", length: 70, seed: 30 },
  { key: "hard#31", tier: "hard", length: 70, seed: 31 },
  { key: "hard#36", tier: "hard", length: 70, seed: 36 },
  { key: "hard#39", tier: "hard", length: 70, seed: 39 },
];

function sigLabel(sig: number): string {
  const d = decodeSignature(sig);
  return `mis=${d.misplaced},ext=${d.external},ori=${d.oriented},par=${d.orientParity}`;
}

describe("MEGAMINX_SOLVECROSS_RESIDUAL3_STATE_INVARIANT_ANALYSIS_V1", () => {
  it("signature histograms: backward table, 3 residuals, 7 comparison fixtures -- disjointness + distribution comparison", () => {
    const backward = residual3BackwardSignatureHistogramWasm();
    console.log(`\nbackward table: totalStates=${backward.totalStates}, distinct signatures present=${backward.histogram.filter((c) => c > 0).length}/432`);

    const backwardSignatures = new Set<number>();
    for (let i = 0; i < backward.histogram.length; i++) if (backward.histogram[i] > 0) backwardSignatures.add(i);

    function analyzeGroup(fixtures: typeof RESIDUALS): { key: string; result: SignatureHistogramResult; intersectingStates: number; disjointStates: number; distinctSigs: number }[] {
      return fixtures.map((f) => {
        const scrambled = scrambledFor(f.tier, f.length, f.seed);
        const result = residual3ForwardSignatureHistogramWasm(scrambled, TRACKED_PIECES, DEPTH12_MAX_HALF_DEPTH, PRODUCTION_CAP);
        let intersectingStates = 0;
        let disjointStates = 0;
        let distinctSigs = 0;
        for (let sig = 0; sig < result.histogram.length; sig++) {
          const count = result.histogram[sig];
          if (count === 0) continue;
          distinctSigs++;
          if (backwardSignatures.has(sig)) intersectingStates += count;
          else disjointStates += count;
        }
        return { key: f.key, result, intersectingStates, disjointStates, distinctSigs };
      });
    }

    console.log("\n== Residual 3 ==");
    const residualRows = analyzeGroup(RESIDUALS);
    for (const r of residualRows) {
      console.log(`${r.key.padEnd(10)} forwardStates=${r.result.totalStates} distinctSigs=${r.distinctSigs}/432 intersectingWithBackward=${r.intersectingStates} disjointFromBackward=${r.disjointStates} (${((r.disjointStates / r.result.totalStates) * 100).toFixed(2)}% disjoint)`);
    }

    console.log("\n== Comparison group (7, rescued via depth13 fallback) ==");
    const comparisonRows = analyzeGroup(COMPARISON);
    for (const r of comparisonRows) {
      console.log(`${r.key.padEnd(10)} forwardStates=${r.result.totalStates} distinctSigs=${r.distinctSigs}/432 intersectingWithBackward=${r.intersectingStates} disjointFromBackward=${r.disjointStates} (${((r.disjointStates / r.result.totalStates) * 100).toFixed(2)}% disjoint)`);
    }

    // aggregate signature distribution comparison (residual vs comparison), top buckets by combined share
    const aggResidual = new Array(432).fill(0);
    const aggComparison = new Array(432).fill(0);
    let totalResidual = 0;
    let totalComparison = 0;
    for (const r of residualRows) {
      for (let sig = 0; sig < 432; sig++) aggResidual[sig] += r.result.histogram[sig];
      totalResidual += r.result.totalStates;
    }
    for (const r of comparisonRows) {
      for (let sig = 0; sig < 432; sig++) aggComparison[sig] += r.result.histogram[sig];
      totalComparison += r.result.totalStates;
    }

    const sigsSortedByCombined = Array.from({ length: 432 }, (_, i) => i)
      .filter((sig) => aggResidual[sig] > 0 || aggComparison[sig] > 0)
      .sort((a, b) => aggResidual[b] / totalResidual + aggComparison[b] / totalComparison - (aggResidual[a] / totalResidual + aggComparison[a] / totalComparison));

    console.log("\n== Top 15 signature buckets by combined share: residual% vs comparison% vs backward presence ==");
    console.log("signature                              | residual%  | comparison% | in backward?");
    for (const sig of sigsSortedByCombined.slice(0, 15)) {
      const rPct = ((aggResidual[sig] / totalResidual) * 100).toFixed(3);
      const cPct = ((aggComparison[sig] / totalComparison) * 100).toFixed(3);
      console.log(`${sigLabel(sig).padEnd(38)} | ${rPct.padStart(9)}% | ${cPct.padStart(10)}% | ${backwardSignatures.has(sig)}`);
    }

    // any signature present in residual forward but NEVER in comparison forward, or vice versa?
    const residualOnlySigs = sigsSortedByCombined.filter((sig) => aggResidual[sig] > 0 && aggComparison[sig] === 0);
    const comparisonOnlySigs = sigsSortedByCombined.filter((sig) => aggComparison[sig] > 0 && aggResidual[sig] === 0);
    console.log(`\nsignatures present ONLY in residual forward trees (never in comparison): ${residualOnlySigs.length} -- ${residualOnlySigs.map(sigLabel).join(" | ")}`);
    console.log(`signatures present ONLY in comparison forward trees (never in residual): ${comparisonOnlySigs.length} -- ${comparisonOnlySigs.map(sigLabel).join(" | ")}`);

    expect(backward.foundInPhase1).toBe(false);
    for (const r of residualRows) {
      expect(r.result.foundInPhase1).toBe(false);
      expect(r.result.frontierCapExceeded).toBe(false);
    }
    for (const r of comparisonRows) {
      expect(r.result.foundInPhase1).toBe(false);
      expect(r.result.frontierCapExceeded).toBe(false);
    }
  }, 120_000);
});
