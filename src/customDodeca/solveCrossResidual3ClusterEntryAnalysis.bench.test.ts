/**
 * MEGAMINX_SOLVECROSS_RESIDUAL3_CLUSTER_ENTRY_ANALYSIS_V1 -- pure
 * measurement, no production change. Traces HOW (which depth, which
 * move, which path) comparison fixtures' forward trees first reach the
 * 24 "clustered" signatures found by MEGAMINX_SOLVECROSS_RESIDUAL3_
 * STATE_INVARIANT_ANALYSIS_V1 to be present in comparison but never in
 * residual 3's own forward tree (re-confirmed here too). Does NOT build
 * or propose a cluster-targeting solver -- per this Sprint's own
 * instruction, that would require first confirming a cluster-entry ->
 * backward-meeting -> solution connection, which this Sprint does not
 * attempt.
 */
import { describe, it, expect } from "vitest";
import { residual3ForwardSignatureHistogramWasm, residual3BackwardSignatureHistogramWasm, residual3ClusterEntryAnalysisWasm, decodeSignature } from "./megaminxSearchWasm";
import { applyMegaminxScramble, randomMegaminxScramble, solvedMegaminxState, type MegaminxState, type MegaminxTurn } from "./megaminxState";
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
function moveLabel(t: MegaminxTurn): string {
  return `F${t.face}${t.sign === 1 ? "+" : "-"}`;
}
function pathLabel(path: MegaminxTurn[]): string {
  return path.map(moveLabel).join(" ");
}

// Populated by the first test, read by the later ones (vitest runs `it`s
// in this file sequentially).
let clusterTargetSignatures: number[] = [];

describe("MEGAMINX_SOLVECROSS_RESIDUAL3_CLUSTER_ENTRY_ANALYSIS_V1", () => {
  it("Step 0: re-derive the 24 target signatures fresh (reproduces MEGAMINX_SOLVECROSS_RESIDUAL3_STATE_INVARIANT_ANALYSIS_V1)", () => {
    const backward = residual3BackwardSignatureHistogramWasm();
    const backwardSignatures = new Set<number>();
    for (let i = 0; i < backward.histogram.length; i++) if (backward.histogram[i] > 0) backwardSignatures.add(i);

    const aggResidual = new Array(432).fill(0);
    for (const f of RESIDUALS) {
      const scrambled = scrambledFor(f.tier, f.length, f.seed);
      const result = residual3ForwardSignatureHistogramWasm(scrambled, TRACKED_PIECES, DEPTH12_MAX_HALF_DEPTH, PRODUCTION_CAP);
      for (let sig = 0; sig < 432; sig++) aggResidual[sig] += result.histogram[sig];
    }
    const aggComparison = new Array(432).fill(0);
    for (const f of COMPARISON) {
      const scrambled = scrambledFor(f.tier, f.length, f.seed);
      const result = residual3ForwardSignatureHistogramWasm(scrambled, TRACKED_PIECES, DEPTH12_MAX_HALF_DEPTH, PRODUCTION_CAP);
      for (let sig = 0; sig < 432; sig++) aggComparison[sig] += result.histogram[sig];
    }

    const targetSignatures: number[] = [];
    for (let sig = 0; sig < 432; sig++) {
      if (aggComparison[sig] > 0 && aggResidual[sig] === 0) targetSignatures.push(sig);
    }
    console.log(`\nre-derived target signatures: ${targetSignatures.length} (expected 24)`);
    console.log(targetSignatures.map(sigLabel).join(" | "));

    expect(targetSignatures.length).toBe(24);
    clusterTargetSignatures = targetSignatures;
  }, 60_000);

  it("Step 1+2+3: per-fixture shallowest entry depth/path/move for each target signature (comparison group)", () => {
    const targetSignatures = clusterTargetSignatures;
    expect(targetSignatures.length).toBe(24);

    type Row = { key: string; sig: number; depth: number; path: MegaminxTurn[] };
    const allRows: Row[] = [];

    console.log("\n== per-fixture cluster entry (comparison group) ==");
    for (const f of COMPARISON) {
      const scrambled = scrambledFor(f.tier, f.length, f.seed);
      const { totalForwardStates, rows } = residual3ClusterEntryAnalysisWasm(scrambled, TRACKED_PIECES, DEPTH12_MAX_HALF_DEPTH, PRODUCTION_CAP, targetSignatures);
      console.log(`\n-- ${f.key} (forwardStates=${totalForwardStates}) --`);
      for (const r of rows) {
        if (r.bestDepth < 0) continue; // this fixture doesn't reach this particular signature -- fine, not every fixture reaches every one
        console.log(`  ${sigLabel(r.signature).padEnd(30)} depth=${r.bestDepth} path=[${pathLabel(r.path)}] entryMove=${moveLabel(r.path[r.path.length - 1])} moveHistAtDepth=${r.moveHistogram.map((m) => `${moveLabel({ face: m.face, sign: m.sign })}x${m.count}`).join(",")}`);
        allRows.push({ key: f.key, sig: r.signature, depth: r.bestDepth, path: r.path });
      }
    }

    console.log(`\ntotal (fixture,signature) entries found: ${allRows.length} / ${COMPARISON.length * targetSignatures.length} possible`);

    // Step 2: entry move distribution across ALL (fixture,signature) shallowest entries
    const entryMoveCounts = new Map<string, number>();
    for (const r of allRows) {
      const last = r.path[r.path.length - 1];
      const label = moveLabel(last);
      entryMoveCounts.set(label, (entryMoveCounts.get(label) ?? 0) + 1);
    }
    const sortedEntryMoves = [...entryMoveCounts.entries()].sort((a, b) => b[1] - a[1]);
    console.log("\n== Step 2: entry move distribution (last move into a target signature, across all fixture x signature shallowest entries) ==");
    for (const [move, count] of sortedEntryMoves) console.log(`  ${move.padEnd(6)} ${count}`);

    // Step 3: suffix (last 2, last 3 moves) distribution
    const suffix2Counts = new Map<string, number>();
    const suffix3Counts = new Map<string, number>();
    for (const r of allRows) {
      if (r.path.length >= 2) {
        const s2 = pathLabel(r.path.slice(-2));
        suffix2Counts.set(s2, (suffix2Counts.get(s2) ?? 0) + 1);
      }
      if (r.path.length >= 3) {
        const s3 = pathLabel(r.path.slice(-3));
        suffix3Counts.set(s3, (suffix3Counts.get(s3) ?? 0) + 1);
      }
    }
    const sortedSuffix2 = [...suffix2Counts.entries()].sort((a, b) => b[1] - a[1]);
    const sortedSuffix3 = [...suffix3Counts.entries()].sort((a, b) => b[1] - a[1]);
    console.log("\n== Step 3: last-2-move suffix distribution (top 10) ==");
    for (const [suf, count] of sortedSuffix2.slice(0, 10)) console.log(`  [${suf}] x${count}`);
    console.log("\n== Step 3: last-3-move suffix distribution (top 10) ==");
    for (const [suf, count] of sortedSuffix3.slice(0, 10)) console.log(`  [${suf}] x${count}`);

    // depth distribution of first entry
    const depths = allRows.map((r) => r.depth);
    console.log(`\nentry depth distribution: min=${Math.min(...depths)} max=${Math.max(...depths)} mean=${(depths.reduce((a, b) => a + b, 0) / depths.length).toFixed(2)}`);

    expect(allRows.length).toBeGreaterThan(0);
  }, 60_000);

  it("Step 1 (residual side, re-confirmation): residual 3 fixtures never reach any of the 24 target signatures within depth 12", () => {
    const targetSignatures = clusterTargetSignatures;
    expect(targetSignatures.length).toBe(24);

    console.log("\n== residual 3: cluster entry re-confirmation (expect bestDepth=-1 for all 24, all 3 fixtures) ==");
    for (const f of RESIDUALS) {
      const scrambled = scrambledFor(f.tier, f.length, f.seed);
      const { totalForwardStates, rows } = residual3ClusterEntryAnalysisWasm(scrambled, TRACKED_PIECES, DEPTH12_MAX_HALF_DEPTH, PRODUCTION_CAP, targetSignatures);
      const reachedCount = rows.filter((r) => r.bestDepth >= 0).length;
      console.log(`  ${f.key.padEnd(10)} forwardStates=${totalForwardStates} reachedAnyTargetSignature=${reachedCount}/24`);
      expect(reachedCount).toBe(0);
    }
  }, 60_000);
});
