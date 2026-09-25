/**
 * MEGAMINX_SOLVECROSS_RESIDUAL_BFS_PIPELINE_COST_PROFILE_V1 -- pure
 * measurement Sprint. No optimization performed, no production code
 * touched. Decomposes phase1_raw_capture_forward_v2_impl +
 * phase2_diagnostic_v2_impl's own BFS tree construction (established by
 * the prior Sprint to be ~90-98% of real wall-clock) into forward-vs-
 * backward, round-by-round (side/inputFrontier/generated/accepted/
 * duplicate/callCounts), isolating the backward-side canonicalization
 * cost specifically. phase1_raw_capture_forward_v2_impl,
 * canonical_key_v2, compute_edge_state_key_fast5, apply_move are all
 * reused completely UNCHANGED.
 */
import { describe, it, expect } from "vitest";
import { rbfsPhase1Wasm, rbfsRunOneRoundWasm, benchApplyMoveTargetedWasm, benchCanonicalKeyWasm, benchComputeEdgeStateKeyWasm, benchFastmapInsertTargetedWasm } from "./megaminxSearchWasm";
import { applyMegaminxScramble, randomMegaminxScramble, solvedMegaminxState, type MegaminxState } from "./megaminxState";
import { mulberry32 } from "./dodecaState";

const TRACKED_PIECES = [0, 1, 2, 3, 4];
const PRODUCTION_CAP = 1_500_000;
const DEPTH12_MAX_HALF_DEPTH = 12;
const TOTAL_MAX_HALF_DEPTH = 13;

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

let perCallStateKeyMs = 0;
let perCallCanonicalKeyMs = 0;
let perCallApplyMoveMs = 0;

describe("MEGAMINX_SOLVECROSS_RESIDUAL_BFS_PIPELINE_COST_PROFILE_V1: isolated per-operation costs", () => {
  it("compute_edge_state_key_fast5, canonical_key_v2, apply_move, FastMap insert at realistic table sizes", () => {
    const warm = scrambledFor("hard", 31);
    const REPS = 1_000_000;

    benchComputeEdgeStateKeyWasm(warm, TRACKED_PIECES, 1, 1000);
    benchCanonicalKeyWasm(warm, TRACKED_PIECES, 2, 1000);
    benchApplyMoveTargetedWasm(warm, 1000);

    const t0 = performance.now();
    benchComputeEdgeStateKeyWasm(warm, TRACKED_PIECES, 1, REPS);
    const keyMs = performance.now() - t0;
    perCallStateKeyMs = keyMs / REPS;

    const t1 = performance.now();
    benchCanonicalKeyWasm(warm, TRACKED_PIECES, 2, REPS);
    const canonMs = performance.now() - t1;
    perCallCanonicalKeyMs = canonMs / REPS;

    const t2 = performance.now();
    benchApplyMoveTargetedWasm(warm, REPS);
    const moveMs = performance.now() - t2;
    perCallApplyMoveMs = moveMs / REPS;

    console.log("\n== isolated per-operation costs (1,000,000-call scale) ==");
    console.log(`compute_edge_state_key_fast5: ${keyMs.toFixed(1)}ms total, ${perCallStateKeyMs.toFixed(6)}ms/call`);
    console.log(`canonical_key_v2:             ${canonMs.toFixed(1)}ms total, ${perCallCanonicalKeyMs.toFixed(6)}ms/call`);
    console.log(`apply_move:                   ${moveMs.toFixed(1)}ms total, ${perCallApplyMoveMs.toFixed(6)}ms/call`);

    for (const prepop of [10_000, 2_000_000]) {
      const insertReps = 200_000;
      const t = performance.now();
      benchFastmapInsertTargetedWasm(prepop, insertReps);
      const ms = performance.now() - t;
      console.log(`FastMap insert+lookup @ prepopulate=${prepop.toLocaleString()}: ${ms.toFixed(1)}ms total, ${(ms / insertReps).toFixed(6)}ms/op`);
    }

    expect(perCallCanonicalKeyMs).toBeGreaterThan(0);
  }, 60_000);
});

describe("MEGAMINX_SOLVECROSS_RESIDUAL_BFS_PIPELINE_COST_PROFILE_V1: round-by-round BFS decomposition", () => {
  it("forward vs backward, per-round generated/accepted/duplicate/calls/ms -- 5 fixtures", () => {
    type RoundRow = { side: 0 | 1; input: number; generated: number; accepted: number; duplicate: number; ms: number; stateKeyCalls: number; canonCalls: number; forwardFinalSize: number; backwardFinalSize: number };

    for (const f of ALL_FIXTURES) {
      const scrambled = scrambledFor(f.tier, f.seed);

      const t0 = performance.now();
      const p1 = rbfsPhase1Wasm(scrambled, TRACKED_PIECES, DEPTH12_MAX_HALF_DEPTH, PRODUCTION_CAP);
      const phase1Ms = performance.now() - t0;

      console.log(`\n-- ${f.key} -- phase1(forward raw + backward raw capture, depth<=${DEPTH12_MAX_HALF_DEPTH}): ${phase1Ms.toFixed(1)}ms, status=${p1.status}`);
      if (p1.status !== 0) {
        console.log(`  phase1 already resolved (status=${p1.status}), skipping round-by-round (no phase2 needed for this fixture)`);
        continue;
      }

      const rounds: RoundRow[] = [];
      let found = false;
      for (let i = 0; i < 20; i++) {
        const t = performance.now();
        const r = rbfsRunOneRoundWasm(TRACKED_PIECES.length, PRODUCTION_CAP);
        const ms = performance.now() - t;
        rounds.push({ side: r.stats.side, input: r.stats.inputFrontierSize, generated: r.stats.generated, accepted: r.stats.accepted, duplicate: r.stats.duplicate, ms, stateKeyCalls: r.stats.stateKeyFast5Calls, canonCalls: r.stats.canonicalKeyV2Calls, forwardFinalSize: r.stats.forwardFinalSize, backwardFinalSize: r.stats.backwardFinalSize });
        if (r.status === 1) {
          found = true;
          break;
        }
        if (r.status === -1) {
          console.log("  frontier cap hit mid-round, stopping");
          break;
        }
        if (r.stats.roundsUsedAfter >= TOTAL_MAX_HALF_DEPTH) break;
      }

      console.log(`  found=${found} phase2 rounds=${rounds.length}`);
      console.log("  side | round# | input      | generated  | accepted | duplicate  | ms      | stateKeyCalls | canonCalls | fwdSize   | bwdSize");
      let fwdTotalMs = 0;
      let bwdTotalMs = 0;
      let fwdCanonCalls = 0;
      let bwdCanonCalls = 0;
      let fwdStateKeyCalls = 0;
      let bwdStateKeyCalls = 0;
      rounds.forEach((r, idx) => {
        const sideLabel = r.side === 0 ? "F" : "B";
        console.log(`  ${sideLabel}    | ${String(idx + 1).padStart(6)} | ${String(r.input).padStart(10)} | ${String(r.generated).padStart(10)} | ${String(r.accepted).padStart(8)} | ${String(r.duplicate).padStart(10)} | ${r.ms.toFixed(1).padStart(7)} | ${String(r.stateKeyCalls).padStart(13)} | ${String(r.canonCalls).padStart(10)} | ${String(r.forwardFinalSize).padStart(9)} | ${r.backwardFinalSize}`);
        if (r.side === 0) {
          fwdTotalMs += r.ms;
          fwdCanonCalls += r.canonCalls;
          fwdStateKeyCalls += r.stateKeyCalls;
        } else {
          bwdTotalMs += r.ms;
          bwdCanonCalls += r.canonCalls;
          bwdStateKeyCalls += r.stateKeyCalls;
        }
      });

      const totalRoundMs = fwdTotalMs + bwdTotalMs;
      const totalMs = phase1Ms + totalRoundMs;
      console.log(`  phase1: ${phase1Ms.toFixed(1)}ms | phase2 forward rounds total: ${fwdTotalMs.toFixed(1)}ms | phase2 backward rounds total: ${bwdTotalMs.toFixed(1)}ms | grand total: ${totalMs.toFixed(1)}ms`);

      // arithmetic decomposition of the phase2 round time using isolated per-op costs
      const fwdCanonMs = fwdCanonCalls * perCallCanonicalKeyMs;
      const bwdCanonMs = bwdCanonCalls * perCallCanonicalKeyMs;
      const fwdStateKeyMs = fwdStateKeyCalls * perCallStateKeyMs;
      const bwdStateKeyMs = bwdStateKeyCalls * perCallStateKeyMs;
      const totalGenerated = rounds.reduce((a, r) => a + r.generated, 0);
      const moveApplyMs = totalGenerated * perCallApplyMoveMs;
      const estimatedMs = fwdCanonMs + bwdCanonMs + fwdStateKeyMs + bwdStateKeyMs + moveApplyMs;
      const residualMs = totalRoundMs - estimatedMs;

      console.log(`  phase2 decomposition: canon(fwd)=${fwdCanonMs.toFixed(1)}ms canon(bwd)=${bwdCanonMs.toFixed(1)}ms statekey(fwd)=${fwdStateKeyMs.toFixed(1)}ms statekey(bwd)=${bwdStateKeyMs.toFixed(1)}ms move_apply=${moveApplyMs.toFixed(1)}ms | sum=${estimatedMs.toFixed(1)}ms vs measured=${totalRoundMs.toFixed(1)}ms | residual(HashMap insert/alloc/bookkeeping)=${residualMs.toFixed(1)}ms (${((residualMs / totalMs) * 100).toFixed(1)}% of grand total)`);
      console.log(`  as % of GRAND TOTAL (${totalMs.toFixed(0)}ms): phase1=${((phase1Ms / totalMs) * 100).toFixed(1)}% canon(bwd)=${((bwdCanonMs / totalMs) * 100).toFixed(1)}% canon(fwd)=${((fwdCanonMs / totalMs) * 100).toFixed(1)}% statekey(total)=${(((fwdStateKeyMs + bwdStateKeyMs) / totalMs) * 100).toFixed(1)}% move_apply=${((moveApplyMs / totalMs) * 100).toFixed(1)}% residual=${((residualMs / totalMs) * 100).toFixed(1)}%`);

      expect(rounds.length).toBeGreaterThan(0);
    }
  }, 180_000);
});
