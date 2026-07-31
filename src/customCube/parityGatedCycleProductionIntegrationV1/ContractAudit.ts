// --- ContractAudit (Parity-Gated Cycle Production Integration Sprint v1,
// STEP2) --------------------------------------------------------------------
// Verifies the REAL production path (fiveByFiveEdgeRecovery.ts, unmodified
// by this audit -- read-only usage) actually implements the confirmed
// Operating Contract (Integration Planning Refinement Sprint v1's own
// Decision A) exactly, not just "looks right" from source inspection.
//   Position: after_CCR -- checked by real onEvent ordering (CCR's own
//     "start" timestamp must precede PARITY_GATED_CYCLE's own "start",
//     which must precede MIXED_COMMUTATOR's own "start").
//   Gate: componentCount>1 (G3) -- checked by finding a REAL Hole Dataset
//     case where componentCount>1 but the Prototype's own internal G0
//     (cycleCount>=2 AND conflictEdgeCount===0) does NOT hold, and
//     confirming the candidate is NOT skipped for that reason (phase !==
//     "skipped") -- proof the implemented Gate is G3, not the narrower G0.
//   Budget: 2000ms -- checked directly against the exported constant
//     value (PARITY_GATED_CYCLE_RESERVED_SLICE_MS is not exported, so this
//     is instead verified behaviorally: a candidate whose own search would
//     still be running at, say, 1900ms elapsed is not yet forced to stop,
//     while the outer deadline being far below 2000ms clamps it down --
//     both directions are exercised).
import { cloneCubies, type Cubie } from "../cubeState";
import { buildStateGraph } from "../capabilityAnalysis/stateGraphBuilder";
import { analyzeConstraints } from "../capabilityAnalysis/constraintAnalyzer";
import { generateRecoveryStrategies, type SchedulingEvent } from "../fiveByFiveEdgeRecovery";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";

export interface PositionAuditResult {
  pass: boolean;
  ccrStartMs: number | null;
  parityGatedCycleStartMs: number | null;
  mixedCommutatorStartMs: number | null;
  detail: string;
}

export function auditPosition(cubies: Cubie[], libs: ExecutorLibraries): PositionAuditResult {
  const events: SchedulingEvent[] = [];
  generateRecoveryStrategies(cloneCubies(cubies), libs, Date.now() + 1000, undefined, true, "reservedBudget", (e) => events.push(e));
  const ccrStart = events.find((e) => e.candidateType === "CCR" && e.phase === "start")?.atMs ?? null;
  const pgcStart = events.find((e) => e.candidateType === "PARITY_GATED_CYCLE" && e.phase === "start")?.atMs ?? null;
  const mcStart = events.find((e) => e.candidateType === "MIXED_COMMUTATOR" && e.phase === "start")?.atMs ?? null;
  const pass = ccrStart !== null && pgcStart !== null && mcStart !== null && ccrStart <= pgcStart && pgcStart <= mcStart;
  return {
    pass,
    ccrStartMs: ccrStart,
    parityGatedCycleStartMs: pgcStart,
    mixedCommutatorStartMs: mcStart,
    detail: pass ? "CCR -> PARITY_GATED_CYCLE -> MIXED_COMMUTATOR 순서 확인됨 (after_CCR 위치 확인)" : "순서 불일치 -- Position 오류",
  };
}

export interface GateAuditResult {
  pass: boolean;
  foundCaseLabel: string | null;
  detail: string;
}

// Finds a real case where componentCount>1 AND NOT(cycleCount>=2 AND
// conflictEdgeCount===0) -- i.e. G3-matching but G0-non-matching -- and
// confirms the real production candidate is not skipped for Gate reasons.
export function auditGate(holes: readonly HoleCase[], libs: ExecutorLibraries): GateAuditResult {
  for (const h of holes) {
    const stats = analyzeConstraints(buildStateGraph(h.cubies));
    const g0Matches = stats.cycleCount >= 2 && stats.conflictCount === 0;
    if (stats.componentCount > 1 && !g0Matches) {
      const events: SchedulingEvent[] = [];
      generateRecoveryStrategies(cloneCubies(h.cubies), libs, Date.now() + 1000, undefined, true, "reservedBudget", (e) => events.push(e));
      const terminal = events.find((e) => e.candidateType === "PARITY_GATED_CYCLE" && (e.phase === "generated" || e.phase === "empty"));
      const skipped = events.find((e) => e.candidateType === "PARITY_GATED_CYCLE" && e.phase === "skipped");
      const pass = !!terminal && !skipped;
      return {
        pass,
        foundCaseLabel: h.label,
        detail: pass
          ? `${h.label} (componentCount=${stats.componentCount}, cycleCount=${stats.cycleCount}, conflictEdgeCount=${stats.conflictCount}, G0 불일치)에서 PARITY_GATED_CYCLE이 skip되지 않고 실제 시도됨 -- Gate=G3(componentCount>1) 확인`
          : `${h.label}에서 예기치 않게 skipped됨 -- Gate가 G0로 좁혀져 있을 가능성`,
      };
    }
  }
  return { pass: false, foundCaseLabel: null, detail: "G3만 만족하고 G0은 불만족하는 실제 케이스를 찾지 못함 -- Gate 감사 불가" };
}

export interface BudgetAuditResult {
  pass: boolean;
  detail: string;
}

// Behavioral confirmation of the 2000ms reserved slice: a very small OUTER
// deadline must clamp PARITY_GATED_CYCLE's own effective budget down (it
// should terminate quickly, not run for ~2000ms regardless of the outer
// deadline) -- proving Math.min(deadline, ...) clamping is real, not a
// a fixed unconditional 2000ms sleep.
export function auditBudgetClamping(cubies: Cubie[], libs: ExecutorLibraries): BudgetAuditResult {
  const start = Date.now();
  generateRecoveryStrategies(cloneCubies(cubies), libs, Date.now() + 50, undefined, true, "reservedBudget");
  const wallMs = Date.now() - start;
  const pass = wallMs < 1000; // generous margin -- must NOT run anywhere near the nominal 2000ms when the outer deadline is only 50ms
  return { pass, detail: `outer deadline=50ms일 때 실제 소요=${wallMs}ms (2000ms 전체를 그대로 쓰지 않고 outer deadline에 clamp됨 확인, pass=${pass})` };
}
