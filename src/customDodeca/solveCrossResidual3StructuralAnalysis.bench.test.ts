/**
 * MEGAMINX_SOLVECROSS_RESIDUAL3_COMPLETENESS_STRUCTURAL_ANALYSIS_V1 --
 * pure diagnostic Sprint. Goal is NOT to solve normal#28/hard#6/hard#24;
 * it is to identify the exact failure mechanism the current 97/100
 * architecture (V2 shared-forward + canonical backward, depth12 raw ->
 * depth13 canonical fallback, frontier cap 1,500,000) hits on these 3
 * fixtures, and to pick exactly one next production/research axis. No
 * production code is touched; diagnostic_run_v2/diag_meeting_distance
 * (see wasm-search/src/lib.rs's own dev notes) are pure read-only
 * instrumentation over a byte-identical copy of the accepted V2 pipeline.
 */
import { describe, it, expect } from "vitest";
import { diagnosticRunV2Wasm, diagMeetingDistanceWasm, solveCrossWasm, solveCrossSharedForwardFallbackV2Wasm, type DiagRoundLogEntry } from "./megaminxSearchWasm";
import { applyMegaminxScramble, applyMegaminxMove, randomMegaminxScramble, solvedMegaminxState, type MegaminxState, type MegaminxTurn } from "./megaminxState";
import { mulberry32 } from "./dodecaState";

const TRACKED_PIECES = [0, 1, 2, 3, 4];
const PRODUCTION_CAP = 1_500_000;

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
// Explicit comparison-group example named in the work order itself: 2
// successful (rescued-by-V2-fallback) fixtures, through the same
// instrumentation, for contrast against the 3 residuals above.
const COMPARISON: Fixture[] = [
  { key: "hard#5", tier: "hard", seed: 5 },
  { key: "hard#31", tier: "hard", seed: 31 },
];

const TERM_NAME: Record<number, string> = { 0: "meet_found", 1: "frontier_exceeded", 2: "rounds_exhausted" };

function roundLogTable(log: readonly DiagRoundLogEntry[]): string {
  const lines = ["round | side | generated | retained | cumF | cumB | cap | meet"];
  for (const r of log) {
    lines.push(`${r.round.toString().padStart(5)} | ${r.side === 0 ? "F" : "B"}    | ${r.generatedThisRound.toString().padStart(9)} | ${r.retainedThisRound.toString().padStart(8)} | ${r.cumulativeForwardSize.toString().padStart(7)} | ${r.cumulativeBackwardCanonSize.toString().padStart(7)} | ${r.capHit ? "Y" : "."} | ${r.meetingFound ? "Y" : "."}`);
  }
  return lines.join("\n");
}

describe("MEGAMINX_SOLVECROSS_RESIDUAL3_COMPLETENESS_STRUCTURAL_ANALYSIS_V1: Gate A -- baseline reproduction", () => {
  it("residual 3: solved=false, false-solve=0, termination recorded; comparison 2: solved=true, replay OK", () => {
    for (const f of RESIDUALS) {
      const scrambled = scrambledFor(f.tier, f.seed);
      const { seq, stats } = diagnosticRunV2Wasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP, 13, PRODUCTION_CAP);
      console.log(`Gate A ${f.key}: solved=${seq !== null} termination=${TERM_NAME[stats.terminationReason]} roundsCompleted=${stats.roundsCompleted} forwardFinal=${stats.forwardFinalSize} backwardFinal=${stats.backwardCanonicalFinalSize}`);
      expect(seq, `${f.key} unexpectedly solved at depth13`).toBeNull();
    }
    for (const f of COMPARISON) {
      const scrambled = scrambledFor(f.tier, f.seed);
      const { seq, stats } = diagnosticRunV2Wasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP, 13, PRODUCTION_CAP);
      expect(seq, `${f.key} should still solve at depth13 (regression)`).not.toBeNull();
      const replayed = applySeq(scrambled, seq!);
      const solved = isCrossSolved(replayed);
      console.log(`Gate A ${f.key} (comparison): solved=true replayOk=${solved} solutionLength=${stats.solutionLength}`);
      expect(solved, `${f.key} false solve`).toBe(true);
    }
  }, 120_000);

  it("full 100-scramble completeness still exactly 97/100 with residual exactly {normal#28, hard#6, hard#24}", () => {
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

    console.log(`Gate A completeness: depth12=${depth12Solved}/100, V2 fallback=${fallbackSolved}/100, false solves=${falseSolves}, still failing=${stillFailing.join(", ")}`);
    expect(falseSolves).toBe(0);
    expect(depth12Solved).toBe(90);
    expect(fallbackSolved).toBe(97);
    expect(stillFailing.sort()).toEqual(["hard#24", "hard#6", "normal#28"].sort());
  }, 900_000);
});

const roundLogByFixture = new Map<string, DiagRoundLogEntry[]>();
const statsByFixture = new Map<string, { terminationReason: number; forwardFinalSize: number; backwardCanonicalFinalSize: number }>();
const distanceByFixture = new Map<string, ReturnType<typeof diagMeetingDistanceWasm>>();

describe("MEGAMINX_SOLVECROSS_RESIDUAL3_COMPLETENESS_STRUCTURAL_ANALYSIS_V1: Gate B -- round-by-round frontier profile", () => {
  it("residual 3 + comparison 2: full round log table via diagnostic_run_v2/diag_round_log", () => {
    for (const f of [...RESIDUALS, ...COMPARISON]) {
      const scrambled = scrambledFor(f.tier, f.seed);
      const { stats, roundLog } = diagnosticRunV2Wasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP, 13, PRODUCTION_CAP);
      roundLogByFixture.set(f.key, roundLog);
      statsByFixture.set(f.key, { terminationReason: stats.terminationReason, forwardFinalSize: stats.forwardFinalSize, backwardCanonicalFinalSize: stats.backwardCanonicalFinalSize });
      distanceByFixture.set(f.key, diagMeetingDistanceWasm());
      console.log(`\nGate B ${f.key} (termination=${TERM_NAME[stats.terminationReason]}):\n${roundLogTable(roundLog)}`);
    }
    expect(roundLogByFixture.size).toBe(5);
  }, 120_000);
});

describe("MEGAMINX_SOLVECROSS_RESIDUAL3_COMPLETENESS_STRUCTURAL_ANALYSIS_V1: Gate C -- B7 frontier cap analysis", () => {
  it("residual 3: is the last (B7-equivalent) round cap-limited?", () => {
    for (const f of RESIDUALS) {
      const log = roundLogByFixture.get(f.key);
      expect(log, `${f.key}: Gate B must run first`).toBeDefined();
      const last = log![log!.length - 1];
      const verdict = last.capHit || last.retainedThisRound >= PRODUCTION_CAP ? "C2 (cap-limited)" : "C1 (cap NOT the cause)";
      console.log(`Gate C ${f.key}: last round=${last.round} side=${last.side === 0 ? "F" : "B"} retained=${last.retainedThisRound} generated=${last.generatedThisRound} capHit=${last.capHit} -> ${verdict}`);
    }
    expect(true).toBe(true);
  }, 5_000);
});

describe("MEGAMINX_SOLVECROSS_RESIDUAL3_COMPLETENESS_STRUCTURAL_ANALYSIS_V1: Gate D -- meeting-distance diagnostic", () => {
  it("residual 3 + comparison 2: nearest forward/backward canonical key pair (radius 1 then 2)", () => {
    for (const f of [...RESIDUALS, ...COMPARISON]) {
      const d = distanceByFixture.get(f.key);
      expect(d, `${f.key}: Gate B must run first`).toBeDefined();
      const radiusDesc = d!.bestRadius === null ? "N/A (DIAG_STATE empty)" : d!.bestRadius === -1 ? "≥3 (not found within radius 2)" : `${d!.bestRadius}`;
      console.log(`Gate D ${f.key}: bestRadius=${radiusDesc} countAtBest=${d!.countAtBest} exampleFwdKey=${d!.exampleForwardKey} exampleBwdKey=${d!.exampleBackwardKey}`);
    }
    expect(true).toBe(true);
  }, 5_000);
});

describe("MEGAMINX_SOLVECROSS_RESIDUAL3_COMPLETENESS_STRUCTURAL_ANALYSIS_V1: Gate E -- residual-vs-residual comparison table", () => {
  it("prints Forward/Backward state, cap, meeting, termination, 추정 원인 across the 3 residuals", () => {
    console.log("\nGate E comparison table:");
    console.log("fixture    | forwardFinal | backwardFinal | capHitAnyRound | bestMeetRadius | termination");
    for (const f of RESIDUALS) {
      const st = statsByFixture.get(f.key)!;
      const log = roundLogByFixture.get(f.key)!;
      const capHitAny = log.some((r) => r.capHit);
      const d = distanceByFixture.get(f.key)!;
      const radiusDesc = d.bestRadius === null ? "N/A" : d.bestRadius === -1 ? "≥3" : `${d.bestRadius}`;
      console.log(`${f.key.padEnd(10)} | ${st.forwardFinalSize.toString().padStart(12)} | ${st.backwardCanonicalFinalSize.toString().padStart(13)} | ${capHitAny ? "Y" : "N"} | ${radiusDesc.padStart(14)} | ${TERM_NAME[st.terminationReason]}`);
    }
    expect(true).toBe(true);
  }, 5_000);
});

const depth14ByFixture = new Map<string, { solved: boolean; capHitAny: boolean; roomLeft: boolean }>();

describe("MEGAMINX_SOLVECROSS_RESIDUAL3_COMPLETENESS_STRUCTURAL_ANALYSIS_V1: Gate F -- isolated depth14 diagnostic", () => {
  it("residual 3: total_max_half_depth=14, cap kept at production's 1,500,000; classify Case 1/2/3", () => {
    for (const f of RESIDUALS) {
      const scrambled = scrambledFor(f.tier, f.seed);
      const { seq, stats, roundLog } = diagnosticRunV2Wasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP, 14, PRODUCTION_CAP);
      const capHitAny = roundLog.some((r) => r.capHit);
      const solved = seq !== null;
      if (solved) {
        const replayed = applySeq(scrambled, seq!);
        expect(isCrossSolved(replayed), `${f.key} depth14 false solve`).toBe(true);
      }
      const caseLabel = solved && !capHitAny ? "Case 1 (depth-limited candidate)" : capHitAny ? "Case 2 (frontier/state-space ceiling)" : "Case 3 (room left, still fails -- not simple depth deficiency)";
      depth14ByFixture.set(f.key, { solved, capHitAny, roomLeft: !capHitAny });
      console.log(`Gate F ${f.key}: solved=${solved} termination=${TERM_NAME[stats.terminationReason]} roundsCompleted=${stats.roundsCompleted} capHitAnyRound=${capHitAny} forwardFinal=${stats.forwardFinalSize} backwardFinal=${stats.backwardCanonicalFinalSize} -> ${caseLabel}`);
    }
    expect(depth14ByFixture.size).toBe(3);
  }, 60_000);
});
