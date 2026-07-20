// --- Recovery Strategy layer (Adaptive Executor v2 작업지시서) --------------
// Executor's fallback for when the ordinary BASE/FLIP/CASE/PARITY/ENDGAME
// pipeline finds no progress at all: deliberately DISRUPT an already-paired
// slot (or apply a SETUP move that doesn't help by itself but creates an
// easier follow-on case), then hand back to the ordinary pipeline for a
// Retry. Every disrupt/setup primitive below reuses an existing,
// already-untouched search from fiveByFiveEdges.ts (tryEndgameThroughDisruption
// / tryEndgameMultiPly) rather than inventing a new one -- per the spec's
// explicit "기존 Library를 삭제하지 않는다" / "Pattern Database를 새로 만들지
// 않는다" constraints, this file only adds the STRATEGY layer on top: generate
// >=3 candidates, score each with the existing whole-state Evaluator, pick
// the best, apply it, retry.
import type { Cubie } from "./cubeState";
import { cloneCubies } from "./cubeState";
import { applySeq, tryEndgameMultiPly, tryEndgameThroughDisruption, wrongWingCount5 } from "./fiveByFiveEdges";
import type { Move } from "./fiveByFiveEdges";
import { computeEdgeSolverStateHash } from "./fiveByFiveEdgeStateHash";
import { DEFAULT_EVALUATOR_WEIGHTS, scoreWholeState, type EvaluatorWeights } from "./fiveByFiveEdgeEvaluator";
import type { RecoveryStrategy, TraceEntry } from "./fiveByFiveEdgeSolverTypes";
import type { ExecutorLibraries } from "./fiveByFiveEdgeExecutor";
// Integration Blueprint Sprint v1's chosen Integration Point: W2_widerHop
// (Prototype Refinement Sprint v2's confirmed Primitive -- A1_wideCycle
// Gate, cycleLength 2~4 AND conflictEdgeCount>0, maxCandidatesPerHop=3)
// wired in as a new "REPAIR"-typed Recovery candidate. runSuccessV2
// already does its own full Gate check + Deferred Validation internally
// (returns {matched:false} when the Gate isn't satisfied, {moves:null}
// when no net-improving leaf is found) -- reused UNMODIFIED, the search
// algorithm itself is not reimplemented here.
import { runSuccessV2, W2_WIDER_HOP } from "./solverPrimitivePrototypeRefinementV2/SuccessOptimizationV2";

// Section 13's Time Budget table gives Recovery its own small sub-budgets
// (생성 50ms / Simulation 50ms / Retry 150ms) -- these are PER-TASK budgets
// layered inside whatever slice of the plan's overall 1000ms the calling
// task already has, never added on top of it (every deadline computed below
// is clamped with Math.min against the caller's own `deadline`), so the
// solver-wide 1000ms cap (section 14) can never be exceeded by Recovery
// alone.
export const RECOVERY_GEN_BUDGET_MS = 300;
export const RECOVERY_RETRY_BUDGET_MS = 150;
export const MAX_RECOVERY_RETRIES = 1;

let nextRecoveryId = 1;

// A small fixed cost per move so two candidates with similar state-quality
// deltas prefer the shorter one -- mirrors how the rest of this project
// treats move count as a tie-breaking cost, never the primary signal.
const MOVE_COST_WEIGHT = 2;

// Integration Refinement Sprint v1: which candidate-generation ORDER/
// budget rule generateRecoveryStrategies uses. "baseline" is BYTE-
// IDENTICAL to this function's pre-Refinement-Sprint behavior (order
// DISRUPT,DISRUPT,SETUP,REPAIR; all four share genDeadline via the same
// `Date.now() < genDeadline` gate; no candidate gets special treatment)
// -- every real production caller (which never passes this param)
// therefore behaves EXACTLY as before this Sprint. "priorityGate" tries
// REPAIR FIRST (same shared-genDeadline mechanism, just reordered).
// "reservedBudget" keeps the original order but gives REPAIR's own slot
// a guaranteed, unstarvable window -- see REPAIR_RESERVED_SLICE_MS and
// genRepair()'s own comment for why. Integration Prototype Sprint v1
// found DISRUPT/SETUP alone can consume 245-481ms against the nominal
// 300ms genDeadline on Gate-matching snapshots, starving REPAIR's turn
// out entirely under "baseline" -- these two strategies are this
// Sprint's disclosed candidate fixes for that specific mechanism.
export type SchedulingStrategy = "baseline" | "priorityGate" | "reservedBudget";

// Strategy B (reservedBudget)'s own dedicated slice for REPAIR -- sized
// identically to what the shared slice() would give it under baseline
// (RECOVERY_GEN_BUDGET_MS/4 = 75ms) for a fair apples-to-apples
// comparison against baseline/priorityGate (same nominal budget size,
// just protected from being starved out by DISRUPT/SETUP running long).
const REPAIR_RESERVED_SLICE_MS = 75;

// Instrumentation hook for Integration Refinement Sprint v1's own STEP1/
// STEP2 scheduling-verification measurements (matched/skipped/budget-
// exhausted/timing) -- optional, no-op for every real caller. Reuses the
// SAME candidate-generation code path under test rather than
// reconstructing timing externally from outside the function.
export interface SchedulingEvent {
  candidateType: RecoveryStrategy["type"];
  phase: "start" | "generated" | "empty" | "skipped";
  atMs: number; // Date.now() at the moment of this event
}

/**
 * Builds >=3 Recovery candidates (spec section 7), each a genuinely
 * different existing search reused at a different aggressiveness/mechanism:
 *  - two DISRUPT candidates (tryEndgameThroughDisruption) at a narrower and
 *    a broader setting than the one the ordinary ENDGAME pipeline already
 *    tries on its own, so this isn't just repeating the same search;
 *  - one SETUP candidate (tryEndgameMultiPly) -- a genuinely different
 *    mechanism ("try a move that doesn't help by itself, then see whether a
 *    follow-up single-ply pass can finish the job") that matches the spec's
 *    own SETUP definition ("더 쉬운 Case를 만들기 위한 준비 수순").
 * None of these mutate `cubies` -- each already works against its own
 * internal clone. The scoring step here adds one more explicit clone+apply+
 * measure pass per spec section 9 ("Recovery 후보는 실제 Cube를 변경하지
 * 않고 Clone으로 평가한다"), reusing the Evaluator's existing whole-state
 * scorer rather than re-deriving futurePotential/newPairOpportunities/etc.
 * from scratch a second time.
 */
export function generateRecoveryStrategies(
  cubies: Cubie[],
  libs: ExecutorLibraries,
  deadline: number,
  weights: EvaluatorWeights = DEFAULT_EVALUATOR_WEIGHTS,
  // Integration Prototype Sprint v1: lets STEP5's Integration Benchmark
  // reconstruct the pre-REPAIR baseline behavior for an honest before/
  // after comparison, without needing two copies of this function.
  // Defaults to true (REPAIR included) for real production use.
  includeRepair = true,
  // Integration Refinement Sprint v1: see SchedulingStrategy's own
  // comment. Defaults to "baseline" -- unchanged production behavior.
  schedulingStrategy: SchedulingStrategy = "baseline",
  // Integration Refinement Sprint v1 STEP1/2 instrumentation only -- see
  // SchedulingEvent's own comment. undefined for every real caller.
  onEvent?: (e: SchedulingEvent) => void
): RecoveryStrategy[] {
  const { lib, flipLib, caseLib } = libs;
  const genDeadline = Math.min(deadline, Date.now() + RECOVERY_GEN_BUDGET_MS);
  const baselineWrong = wrongWingCount5(cubies);
  const baseScore = scoreWholeState(cubies, weights);
  const candidates: RecoveryStrategy[] = [];

  const add = (type: RecoveryStrategy["type"], description: string, moves: Move[] | null): boolean => {
    if (!moves || moves.length === 0) return false;
    const clone = cloneCubies(cubies);
    applySeq(clone, moves);
    const afterWrong = wrongWingCount5(clone);
    const afterScore = scoreWholeState(clone, weights);
    const futurePotential = afterScore - baseScore;
    candidates.push({
      id: nextRecoveryId++,
      type,
      description,
      moves,
      expectedWrongWingDelta: afterWrong - baselineWrong,
      expectedFuturePotential: futurePotential,
      score: futurePotential - moves.length * MOVE_COST_WEIGHT,
    });
    return true;
  };

  // Divisor updated 3->4 (Integration Prototype Sprint v1) now that REPAIR
  // is a 4th generation step sharing the same genDeadline -- per
  // Integration Blueprint Sprint v1's own Integration Contract ("다른
  // 후보와 동일한 예산 배분 규칙을 그대로 따른다"), REPAIR gets a fair
  // share like DISRUPT/SETUP rather than a privileged or leftover slice.
  // Unchanged by this Sprint -- schedulingStrategy only changes ORDER
  // (priorityGate) or REPAIR's OWN gating rule (reservedBudget), never
  // this shared-budget arithmetic itself.
  const slice = () => Math.max(5, Math.floor((genDeadline - Date.now()) / 4));

  const genDisrupt1 = () => {
    if (Date.now() >= genDeadline) {
      onEvent?.({ candidateType: "DISRUPT", phase: "skipped", atMs: Date.now() });
      return;
    }
    onEvent?.({ candidateType: "DISRUPT", phase: "start", atMs: Date.now() });
    const d = Math.min(genDeadline, Date.now() + slice());
    const added = add("DISRUPT", "가벼운 Disruption (교란 1개 이하, 재귀 없음)", tryEndgameThroughDisruption(cubies, lib, flipLib, d, 1, 0, caseLib));
    onEvent?.({ candidateType: "DISRUPT", phase: added ? "generated" : "empty", atMs: Date.now() });
  };

  const genDisrupt2 = () => {
    if (Date.now() >= genDeadline) {
      onEvent?.({ candidateType: "DISRUPT", phase: "skipped", atMs: Date.now() });
      return;
    }
    onEvent?.({ candidateType: "DISRUPT", phase: "start", atMs: Date.now() });
    const d = Math.min(genDeadline, Date.now() + slice());
    const added = add("DISRUPT", "확장 Disruption (교란 3개, 재귀 1단계)", tryEndgameThroughDisruption(cubies, lib, flipLib, d, 3, 1, caseLib));
    onEvent?.({ candidateType: "DISRUPT", phase: added ? "generated" : "empty", atMs: Date.now() });
  };

  const genSetup = () => {
    if (Date.now() >= genDeadline) {
      onEvent?.({ candidateType: "SETUP", phase: "skipped", atMs: Date.now() });
      return;
    }
    onEvent?.({ candidateType: "SETUP", phase: "start", atMs: Date.now() });
    const d = Math.min(genDeadline, Date.now() + slice());
    const added = add("SETUP", "Multi-ply Setup (즉시 이득 없는 수 + 후속 수습)", tryEndgameMultiPly(cubies, lib, flipLib, d));
    onEvent?.({ candidateType: "SETUP", phase: added ? "generated" : "empty", atMs: Date.now() });
  };

  const genRepair = () => {
    if (!includeRepair) return;
    if (schedulingStrategy === "reservedBudget") {
      // Strategy B: REPAIR's slot is protected from the shared-genDeadline
      // starvation Integration Prototype Sprint v1 found -- always
      // attempted (never gated by `Date.now() < genDeadline`), using a
      // fresh REPAIR_RESERVED_SLICE_MS window measured off the OUTER
      // `deadline` rather than the (possibly already-exhausted) shared
      // genDeadline. Order is otherwise unchanged (still runs last).
      onEvent?.({ candidateType: "REPAIR", phase: "start", atMs: Date.now() });
      const d = Math.min(deadline, Date.now() + REPAIR_RESERVED_SLICE_MS);
      const w2Result = runSuccessV2(cubies, lib, d, W2_WIDER_HOP);
      const added = add("REPAIR", "구조적 Cycle 해결 (W2_widerHop, reservedBudget scheduling)", w2Result.matched ? w2Result.moves : null);
      onEvent?.({ candidateType: "REPAIR", phase: added ? "generated" : "empty", atMs: Date.now() });
      return;
    }
    if (Date.now() >= genDeadline) {
      onEvent?.({ candidateType: "REPAIR", phase: "skipped", atMs: Date.now() });
      return;
    }
    onEvent?.({ candidateType: "REPAIR", phase: "start", atMs: Date.now() });
    const d = Math.min(genDeadline, Date.now() + slice());
    const w2Result = runSuccessV2(cubies, lib, d, W2_WIDER_HOP);
    const description =
      schedulingStrategy === "priorityGate"
        ? "구조적 Cycle 해결 (W2_widerHop, priorityGate scheduling -- REPAIR 우선 시도)"
        : "구조적 Cycle 해결 (W2_widerHop -- cycleLength 2~4 AND conflictEdgeCount>0 Gate, maxCandidatesPerHop=3)";
    const added = add("REPAIR", description, w2Result.matched ? w2Result.moves : null);
    onEvent?.({ candidateType: "REPAIR", phase: added ? "generated" : "empty", atMs: Date.now() });
  };

  // baseline/reservedBudget keep the ORIGINAL DISRUPT,DISRUPT,SETUP,REPAIR
  // order (reservedBudget's only change is REPAIR's own gating rule inside
  // genRepair(), not ordering); priorityGate (Strategy A) tries REPAIR
  // FIRST, using the exact same shared-genDeadline mechanism as baseline,
  // simply given first crack at it before DISRUPT/SETUP can consume it.
  const order = schedulingStrategy === "priorityGate" ? [genRepair, genDisrupt1, genDisrupt2, genSetup] : [genDisrupt1, genDisrupt2, genSetup, genRepair];
  for (const step of order) step();

  return candidates;
}

/** Highest-scoring candidate, or null if none were generated (spec section 8's
 * formula is already folded into each candidate's `score` at generation
 * time in generateRecoveryStrategies -- this is purely the selection step). */
export function chooseBestRecovery(candidates: readonly RecoveryStrategy[]): RecoveryStrategy | null {
  if (candidates.length === 0) return null;
  return candidates.reduce((best, c) => (c.score > best.score ? c : best));
}

/**
 * The full Recovery Sequence (spec sections 6/10/11): generate candidates,
 * pick the best, apply it, retry the ORIGINAL task via `retryTask` (injected
 * rather than imported, so this file never needs to depend on the
 * Executor's own pipeline function -- avoids a circular import while
 * keeping Retry's behavior byte-identical to an ordinary task attempt).
 *
 * Works entirely against a scratch clone: a totally failed recovery
 * attempt (no retry round ever succeeds) never mutates the real `cubies`,
 * matching every other Executor function's "empty return = untouched"
 * contract. Only commits to the real cube once a retry actually succeeds.
 *
 * Loop prevention (spec section 11): every intermediate state (after
 * applying a candidate's moves, before knowing if the retry will help) is
 * hashed and checked against `visited` -- revisiting the same state aborts
 * the whole recovery attempt rather than looping.
 */
export function attemptRecovery(
  cubies: Cubie[],
  libs: ExecutorLibraries,
  deadline: number,
  weights: EvaluatorWeights,
  retryTask: (working: Cubie[], taskDeadline: number) => Move[],
  trace?: TraceEntry[],
  // Integration Prototype Sprint v1: threaded through to
  // generateRecoveryStrategies -- see that function's own comment.
  includeRepair = true,
  // A REPAIR candidate's moves are already validated as net-improving by
  // W2_widerHop's own Deferred Validation (runSuccessV2 -> validateDeferred)
  // BEFORE they ever reach chooseBestRecovery -- unlike DISRUPT/SETUP,
  // which deliberately may NOT improve wrongWingCount by themselves and
  // therefore genuinely need the retryTask round trip to become useful.
  // When true (the default), a chosen REPAIR candidate that already beats
  // originalBaseline is accepted immediately, skipping the retryTask call
  // entirely -- avoiding wasted work on a step whose outcome is already
  // known. Defaults to true (Integration Blueprint Sprint v1's own
  // recommended resolution of its previously-open design question);
  // pass false to reconstruct the pre-short-circuit behavior for STEP3's
  // A/B comparison.
  shortCircuitRepair = true,
  // Integration Refinement Sprint v1: threaded through to
  // generateRecoveryStrategies -- see SchedulingStrategy's own comment.
  // Defaults to "baseline" -- unchanged production behavior.
  schedulingStrategy: SchedulingStrategy = "baseline"
): Move[] {
  const log = (label: string, detail?: string) => trace?.push({ at: Date.now(), label, detail });
  const visited = new Set<number>();
  visited.add(computeEdgeSolverStateHash(cubies));

  // The bar the WHOLE recovery attempt must clear before its moves are ever
  // handed back as "success" -- not just "the retry found some locally
  // improving move relative to the disrupted state" (that alone tolerates a
  // net-zero or net-negative round trip: disrupt 5->6, "retry" finds a move
  // that brings 6->5, right back to where we started, no real progress made
  // but reported as a completed task anyway). Every existing disruption
  // search in this codebase (tryEndgameThroughDisruption/tryEndgameMultiPly)
  // already guards on this exact same condition before returning a fix --
  // this mirrors that same invariant at the Recovery layer.
  const originalBaseline = wrongWingCount5(cubies);

  const scratch = cloneCubies(cubies);
  const applied: Move[] = [];

  for (let round = 0; round < MAX_RECOVERY_RETRIES; round++) {
    if (Date.now() > deadline) break;

    const candidates = generateRecoveryStrategies(scratch, libs, deadline, weights, includeRepair, schedulingStrategy);
    if (candidates.length === 0) {
      log("recovery-no-candidates", `${round + 1}회차: Recovery 후보를 찾지 못함`);
      break;
    }
    log(
      "recovery-candidates",
      candidates.map((c) => `${c.description}: score=${c.score.toFixed(1)}`).join(" / ")
    );

    const best = chooseBestRecovery(candidates);
    if (!best) break;

    const probe = cloneCubies(scratch);
    applySeq(probe, best.moves);
    const probeHash = computeEdgeSolverStateHash(probe);
    if (visited.has(probeHash)) {
      log("recovery-loop-detected", `"${best.description}"가 이미 방문한 상태로 귀결 -- 중단`);
      break;
    }
    visited.add(probeHash);

    const before = wrongWingCount5(scratch);
    applySeq(scratch, best.moves);
    applied.push(...best.moves);
    const afterDisrupt = wrongWingCount5(scratch);
    log(
      "recovery-applied",
      `"${best.description}" 선택 -- wrongWing ${before} -> ${afterDisrupt}, futurePotential ${
        best.expectedFuturePotential >= 0 ? "+" : ""
      }${best.expectedFuturePotential.toFixed(1)}`
    );

    if (best.type === "REPAIR" && shortCircuitRepair && afterDisrupt < originalBaseline) {
      log("recovery-repair-short-circuit", `REPAIR가 이미 net-improvement 검증됨(wrongWing ${originalBaseline} -> ${afterDisrupt}) -- retryTask 생략`);
      applySeq(cubies, applied);
      return applied;
    }

    const retryDeadline = Math.min(deadline, Date.now() + RECOVERY_RETRY_BUDGET_MS);
    const retryMoves = retryTask(scratch, retryDeadline);
    if (retryMoves.length > 0) {
      applied.push(...retryMoves);
      const finalWrong = wrongWingCount5(scratch);
      if (finalWrong < originalBaseline) {
        log("recovery-retry-success", `원래 Task 재시도 성공 -- wrongWing ${originalBaseline} -> ${finalWrong}`);
        applySeq(cubies, applied);
        return applied;
      }
      // The retry found SOME locally-improving move, but the round trip as
      // a whole hasn't actually beaten where we started -- not a genuine
      // win yet. Keep going (next round's Recovery search starts from this
      // intermediate state) rather than reporting a net-zero/negative
      // result as success.
      log(
        "recovery-retry-insufficient",
        `재시도했지만 원래 기준(${originalBaseline})보다 개선되지 않음 (현재 ${finalWrong}) -- 계속 시도`
      );
      continue;
    }
    log("recovery-retry-failed", `${round + 1}회차 재시도 후에도 진전 없음`);
  }

  return [];
}
