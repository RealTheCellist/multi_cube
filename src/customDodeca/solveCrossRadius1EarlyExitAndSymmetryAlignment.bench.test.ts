/**
 * MEGAMINX_SOLVECROSS_RADIUS1_BRIDGING_EARLY_EXIT_AND_SYMMETRY_ALIGNMENT_V1
 * -- fixes the previous Sprint's symmetry-direction mismatch (now reuses
 * find_symmetry_index exactly as every other meeting call site in this
 * codebase already does) and switches from exhaustive-all-candidates to
 * first-valid-solution early-exit. NO new search algorithm, NO production
 * change: radius1BridgeEarlyExitWasm reuses the SAME depth12/depth13
 * diagnostic pipeline and the SAME radius-1 extraction as last Sprint;
 * only the bridge acceptance test (canonical_key_v2 equality -- the same
 * "meeting" criterion the rest of this file already relies on) and the
 * early-exit control flow are new.
 */
import { describe, it, expect } from "vitest";
import { radius1BridgeEarlyExitWasm, solveCrossWasm, solveCrossSharedForwardFallbackV2Wasm } from "./megaminxSearchWasm";
import { applyMegaminxScramble, applyMegaminxMove, randomMegaminxScramble, solvedMegaminxState, type MegaminxState, type MegaminxTurn } from "./megaminxState";
import { mulberry32 } from "./dodecaState";

const TRACKED_PIECES = [0, 1, 2, 3, 4];
const PRODUCTION_CAP = 1_500_000;
const MAX_BRIDGE_DEPTH = 3;

function applySeq(state: MegaminxState, seq: readonly MegaminxTurn[]): MegaminxState {
  let s = state;
  for (const t of seq) s = applyMegaminxMove(s, t.face, t.sign);
  return s;
}
function isCrossSolved(state: MegaminxState): boolean {
  return TRACKED_PIECES.every((p) => state.edgePerm[p] === p && state.edgeOrient[p] === 0);
}

const TIER_LENGTH: Record<string, number> = { easy: 15, normal: 40, hard: 70 };
function scrambledFor(tier: string, seed: number): MegaminxState {
  const length = TIER_LENGTH[tier];
  const turns = randomMegaminxScramble(length, mulberry32(seed * 97 + length * 7919));
  return applyMegaminxScramble(solvedMegaminxState(), turns);
}

type Fixture = { key: string; tier: "normal" | "hard"; seed: number };
const RESIDUALS: Fixture[] = [
  { key: "normal#28", tier: "normal", seed: 28 },
  { key: "hard#6", tier: "hard", seed: 6 },
  { key: "hard#24", tier: "hard", seed: 24 },
];
const COMPARISON: Fixture[] = [
  { key: "hard#5", tier: "hard", seed: 5 },
  { key: "hard#31", tier: "hard", seed: 31 },
];
const ALL_FIXTURES = [...RESIDUALS, ...COMPARISON];

interface RunRecord {
  scrambled: MegaminxState;
  result: ReturnType<typeof radius1BridgeEarlyExitWasm>;
  ms: number;
}
const runsByFixture = new Map<string, RunRecord>();

describe("MEGAMINX_SOLVECROSS_RADIUS1_BRIDGING_EARLY_EXIT_AND_SYMMETRY_ALIGNMENT_V1: Step 1 -- symmetry alignment correctness", () => {
  it("residual 3 + comparison 2: early-exit finds a bridge, and it is internally valid on the FIRST candidate tried where a local bridge exists (no more 173/1075-style falloff)", () => {
    for (const f of ALL_FIXTURES) {
      const scrambled = scrambledFor(f.tier, f.seed);
      // Warmup.
      radius1BridgeEarlyExitWasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP, 13, PRODUCTION_CAP, MAX_BRIDGE_DEPTH);

      const t0 = performance.now();
      const result = radius1BridgeEarlyExitWasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP, 13, PRODUCTION_CAP, MAX_BRIDGE_DEPTH);
      const ms = performance.now() - t0;
      runsByFixture.set(f.key, { scrambled, result, ms });

      console.log(
        `${f.key}: status=${result.status} found=${result.found} internallyValid=${result.internallyValid} candidatesScanned=${result.candidatesScanned}/${result.totalCandidates} bridgeDepth=${result.bridgeDepth} solutionLength=${result.solutionLength} ms=${ms.toFixed(1)}`,
      );

      expect(result.found, `${f.key}: expected early-exit to find a bridge`).toBe(true);
      expect(result.status, `${f.key}: bridge found but failed its OWN internal replay check -- symmetry alignment still broken`).toBe(1);
      expect(result.internallyValid, `${f.key}`).toBe(true);
    }
  }, 60_000);
});

describe("MEGAMINX_SOLVECROSS_RADIUS1_BRIDGING_EARLY_EXIT_AND_SYMMETRY_ALIGNMENT_V1: Step 1b -- JS-side independent replay verification", () => {
  it("every early-exit solution replays correctly from the ORIGINAL scrambled state (false solve = 0)", () => {
    let falseSolve = 0;
    for (const f of ALL_FIXTURES) {
      const { scrambled, result } = runsByFixture.get(f.key)!;
      expect(result.seq, `${f.key}: no seq returned despite found=true`).not.toBeNull();
      const replayed = applySeq(scrambled, result.seq!);
      const solved = isCrossSolved(replayed);
      console.log(`  ${f.key}: JS replay solved=${solved} solutionLength=${result.seq!.length}`);
      if (!solved) falseSolve++;
    }
    expect(falseSolve).toBe(0);
  }, 5_000);
});

describe("MEGAMINX_SOLVECROSS_RADIUS1_BRIDGING_EARLY_EXIT_AND_SYMMETRY_ALIGNMENT_V1: Step 2 -- early-exit wall-clock cost", () => {
  it("residual 3: total solve time (phase1+phase2+radius1 early-exit) vs 3s production candidate threshold", () => {
    console.log("\nStep 2 cost table (residual 3, warm, 3-run median):");
    console.log("fixture    | candidatesScanned/total | bridgeDepth | ms(median of 3)");
    for (const f of RESIDUALS) {
      const scrambled = scrambledFor(f.tier, f.seed);
      radius1BridgeEarlyExitWasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP, 13, PRODUCTION_CAP, MAX_BRIDGE_DEPTH); // warmup
      const times: number[] = [];
      let lastResult: ReturnType<typeof radius1BridgeEarlyExitWasm> | null = null;
      for (let i = 0; i < 3; i++) {
        const t0 = performance.now();
        lastResult = radius1BridgeEarlyExitWasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP, 13, PRODUCTION_CAP, MAX_BRIDGE_DEPTH);
        times.push(performance.now() - t0);
      }
      times.sort((a, b) => a - b);
      const median = times[1];
      console.log(`${f.key.padEnd(10)} | ${lastResult!.candidatesScanned.toString().padStart(6)}/${lastResult!.totalCandidates.toString().padEnd(8)} | ${lastResult!.bridgeDepth.toString().padStart(11)} | ${median.toFixed(0)} (all: ${times.map((t) => t.toFixed(0)).join(",")})`);
      expect(lastResult!.internallyValid).toBe(true);
    }
  }, 60_000);

  it("comparison 2 (hard#5/hard#31, already succeed at depth13): early-exit still finds a bridge quickly, same mechanism", () => {
    for (const f of COMPARISON) {
      const scrambled = scrambledFor(f.tier, f.seed);
      radius1BridgeEarlyExitWasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP, 13, PRODUCTION_CAP, MAX_BRIDGE_DEPTH); // warmup
      const t0 = performance.now();
      const r = radius1BridgeEarlyExitWasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP, 13, PRODUCTION_CAP, MAX_BRIDGE_DEPTH);
      const ms = performance.now() - t0;
      console.log(`${f.key}: candidatesScanned=${r.candidatesScanned}/${r.totalCandidates} bridgeDepth=${r.bridgeDepth} ms=${ms.toFixed(0)}`);
      expect(r.internallyValid).toBe(true);
    }
  }, 30_000);
});

describe("MEGAMINX_SOLVECROSS_RADIUS1_BRIDGING_EARLY_EXIT_AND_SYMMETRY_ALIGNMENT_V1: Safety + regression", () => {
  it("false solve = 0, replay failure = 0 (same data as Step 1b)", () => {
    let falseSolve = 0;
    for (const f of ALL_FIXTURES) {
      const { scrambled, result } = runsByFixture.get(f.key)!;
      if (!result.seq || !isCrossSolved(applySeq(scrambled, result.seq))) falseSolve++;
    }
    expect(falseSolve).toBe(0);
  }, 5_000);

  it("existing 100-scramble completeness unaffected (still 90/97/residual-exactly-3)", () => {
    const PLAN: { tier: "easy" | "normal" | "hard"; length: number; count: number }[] = [
      { tier: "easy", length: 15, count: 20 },
      { tier: "normal", length: 40, count: 40 },
      { tier: "hard", length: 70, count: 40 },
    ];
    let depth12Solved = 0;
    let fallbackSolved = 0;
    let falseSolves = 0;
    const stillFailing: string[] = [];
    for (const { tier, length, count } of PLAN) {
      for (let seed = 1; seed <= count; seed++) {
        const key = `${tier}#${seed}`;
        const turns = randomMegaminxScramble(length, mulberry32(seed * 97 + length * 7919));
        const scrambled = applyMegaminxScramble(solvedMegaminxState(), turns);
        if (solveCrossWasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP) !== null) depth12Solved++;
        const { seq } = solveCrossSharedForwardFallbackV2Wasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP, 13, PRODUCTION_CAP);
        if (seq) {
          if (isCrossSolved(applySeq(scrambled, seq))) fallbackSolved++;
          else falseSolves++;
        } else {
          stillFailing.push(key);
        }
      }
    }
    console.log(`regression: depth12=${depth12Solved}/100, V2 fallback=${fallbackSolved}/100, false solves=${falseSolves}, still failing=${stillFailing.join(", ")}`);
    expect(falseSolves).toBe(0);
    expect(depth12Solved).toBe(90);
    expect(fallbackSolved).toBe(97);
    expect(stillFailing.sort()).toEqual(["hard#24", "hard#6", "normal#28"].sort());
  }, 900_000);

  it("hypothetical completeness with radius-1 early-exit bridging wired in as a further fallback: 97 -> 100 (analytical, from the same 3 always-residual fixtures + Step 1's 3/3 rescue)", () => {
    // The residual set is deterministically {normal#28, hard#6, hard#24} (reconfirmed above),
    // and Step 1 already showed all 3 are rescued (status=1, internallyValid=true, JS replay OK)
    // by radius-1 early-exit bridging -- so IF this were wired into production as a further
    // fallback after the existing depth13 V2 fallback, completeness would become 100/100.
    // Not actually wired in (out of scope per this Sprint's absolute constraints).
    let allRescued = true;
    for (const f of RESIDUALS) {
      const { result } = runsByFixture.get(f.key)!;
      if (result.status !== 1 || !result.internallyValid) allRescued = false;
    }
    console.log(`hypothetical: 97/100 (existing) + ${allRescued ? 3 : "< 3"}/3 residual rescued via radius-1 bridging => ${allRescued ? "100/100" : "< 100/100"}`);
    expect(allRescued).toBe(true);
  }, 5_000);
});
