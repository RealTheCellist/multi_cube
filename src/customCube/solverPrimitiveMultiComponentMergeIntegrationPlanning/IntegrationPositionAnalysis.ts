// --- IntegrationPositionAnalysis (Multi-Component Merge Production
// Integration Planning Sprint v1, STEP1) --------------------------------------
// Read-only usage of the REAL, unmodified generateRecoveryStrategies()/
// chooseBestRecovery() (fiveByFiveEdgeRecovery.ts, production default
// schedulingStrategy="reservedBudget", useSetupReservedSlice=true) via its
// own `onEvent` instrumentation hook -- same established pattern as
// parityGatedCycleIntegrationPlanningV1/RecoveryAnalysis.ts. Production
// file untouched.
//
// Static pipeline facts below (order, Budget) transcribed directly from
// fiveByFiveEdgeRecovery.ts's own source, not re-derived or guessed:
//   order (today's production default) = [DISRUPT x2, REPAIR, CCR,
//     PARITY_GATED_CYCLE, MIXED_COMMUTATOR, SETUP]
//   REPAIR_RESERVED_SLICE_MS=75, MIXED_COMMUTATOR_RESERVED_SLICE_MS=300,
//   PARITY_GATED_CYCLE_RESERVED_SLICE_MS=2000, SETUP_RESERVED_SLICE_MS=500
//
// IMPORTANT DISCLOSED FINDING: in TODAY's real production order,
// PARITY_GATED_CYCLE is generated IMMEDIATELY after CCR, with nothing in
// between. This means the Directive's own "after_CCR" and "before_PARITY"
// positions are the SAME physical slot in the pipeline as it exists today
// -- not two distinct insertion points. Both are analyzed below and
// reported as identical for transparency, not silently merged.
import { cloneCubies, type Cubie } from "../cubeState";
import { generateRecoveryStrategies, type SchedulingEvent } from "../fiveByFiveEdgeRecovery";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import type { HoleCase } from "../coverageAtlas/HoleDatasetBuilder";

export const OUTER_DEADLINE_MS = 1000;

export type PositionId = "AFTER_REPAIR" | "AFTER_CCR" | "BEFORE_PARITY" | "PIPELINE_LAST";

export interface IntegrationPosition {
  id: PositionId;
  label: string;
  budgetMs: number;
  rationale: string;
}

export const POSITIONS: IntegrationPosition[] = [
  {
    id: "AFTER_REPAIR",
    label: "after_REPAIR (REPAIR 직후, CCR보다 먼저)",
    budgetMs: 2000,
    rationale:
      "REPAIR(cycleLength 2~4 AND conflictEdgeCount>0) 직후에 삽입 -- REPAIR과 Gate가 겹치지 않으므로(REPAIR은 " +
      "conflictEdgeCount>0 요구, MCM 후보 Gate인 componentCount>=3 케이스는 실측상 전부 conflictEdgeCount=0) " +
      "REPAIR과의 직접 경쟁은 없다. 다만 CCR(cycleLength 5~6 AND conflictEdgeCount===0)보다 먼저 실행되므로, " +
      "componentCount>=3이면서 CCR Gate도 만족하는 케이스(실측 2/9, 22.2%)에서 CCR의 기회를 선점하게 된다.",
  },
  {
    id: "AFTER_CCR",
    label: "after_CCR (CCR 직후, PARITY_GATED_CYCLE보다 먼저)",
    budgetMs: 2000,
    rationale:
      "CCR 직후에 삽입 -- CCR이 먼저 실행되도록 순서를 보존해 CCR과의 경쟁을 피한다. 오늘 실제 프로덕션 순서 " +
      "(DISRUPT,DISRUPT,REPAIR,CCR,PARITY_GATED_CYCLE,MIXED_COMMUTATOR,SETUP)에서 CCR과 PARITY_GATED_CYCLE " +
      "사이에는 아무 것도 없으므로, 이 위치는 아래 before_PARITY와 물리적으로 동일한 슬롯이다.",
  },
  {
    id: "BEFORE_PARITY",
    label: "before_PARITY (PARITY_GATED_CYCLE 직전)",
    budgetMs: 2000,
    rationale:
      "PARITY_GATED_CYCLE(componentCount>1 Gate, 단일 Bridge) 직전에 삽입 -- MCM의 componentCount>=3 Gate가 " +
      "PARITY_GATED_CYCLE의 Gate(componentCount>1)의 부분집합이므로, MCM이 먼저 componentCount>=3 케이스를 " +
      "가로채면 PARITY_GATED_CYCLE은 사실상 componentCount==2 케이스만 남아서 처리하게 되어 두 Primitive의 " +
      "Gate가 상호 배타적으로 분리된다 -- 오늘 실제 순서에서 after_CCR과 물리적으로 동일한 슬롯.",
  },
  {
    id: "PIPELINE_LAST",
    label: "pipeline_last (SETUP 이후, 절대 마지막)",
    budgetMs: 500,
    rationale:
      "모든 기존 Primitive가 실패했을 때만(candidates.length===0) 시도되는 최후 수단 위치 -- SchedulerProdIntegration " +
      "Sprint v1이 이미 확립한 SETUP_RESERVED_SLICE_MS(500ms)와 동일한 last-resort 계약을 재사용한다. 이 위치는 " +
      "PARITY_GATED_CYCLE이 먼저 componentCount>=3 케이스를 (단일 Bridge로, 부분적으로만) 건드린 이후의 상태를 " +
      "물려받으므로, MCM 자신의 componentCount>=3 Gate가 더 이상 매치되지 않을 위험이 있다(PARITY_GATED_CYCLE의 " +
      "단일 Bridge가 이미 컴포넌트 수를 줄여놨을 수 있음).",
  },
];

export interface PipelineRow {
  label: string;
  parityGatedCyclePhase: "generated" | "empty" | "skipped" | "never_started";
  finalCandidatesEmpty: boolean; // candidates.length===0 at the very end of the real order -- pipeline_last's own reachability condition
}

export function measurePipelineRow(cubies: Cubie[], label: string, libs: ExecutorLibraries): PipelineRow {
  let parityGatedCyclePhase: PipelineRow["parityGatedCyclePhase"] = "never_started";
  const onEvent = (e: SchedulingEvent) => {
    if (e.candidateType === "PARITY_GATED_CYCLE" && e.phase !== "start") {
      parityGatedCyclePhase = e.phase;
    }
  };
  const deadline = Date.now() + OUTER_DEADLINE_MS;
  const candidates = generateRecoveryStrategies(cloneCubies(cubies), libs, deadline, undefined, true, "reservedBudget", onEvent, true, true, true);
  return { label, parityGatedCyclePhase, finalCandidatesEmpty: candidates.length === 0 };
}

export function measurePipeline(holes: readonly HoleCase[], libs: ExecutorLibraries): PipelineRow[] {
  return holes.map((h) => measurePipelineRow(h.cubies, h.label, libs));
}

export interface PipelineSummary {
  n: number;
  parityGatedCycleGeneratedCount: number;
  parityGatedCycleGeneratedRate: number; // real componentCount>1 rate over the full population
  finalCandidatesEmptyCount: number;
  finalCandidatesEmptyRate: number; // real reachability rate for pipeline_last
}

export function summarizePipeline(rows: readonly PipelineRow[]): PipelineSummary {
  const n = rows.length;
  const generated = rows.filter((r) => r.parityGatedCyclePhase === "generated").length;
  const empty = rows.filter((r) => r.finalCandidatesEmpty).length;
  return {
    n,
    parityGatedCycleGeneratedCount: generated,
    parityGatedCycleGeneratedRate: n ? generated / n : 0,
    finalCandidatesEmptyCount: empty,
    finalCandidatesEmptyRate: n ? empty / n : 0,
  };
}

export function chooseRecommendedPosition(): PositionId {
  // Structural conclusion (grounded in POSITIONS' own rationale above,
  // not re-derived here): BEFORE_PARITY makes MCM's Gate and
  // PARITY_GATED_CYCLE's Gate mutually exclusive (MCM claims
  // componentCount>=3 before PARITY_GATED_CYCLE ever sees it), avoiding
  // both direct competition AND the PIPELINE_LAST risk of PARITY_GATED_CYCLE
  // having already partially altered the state. AFTER_REPAIR unnecessarily
  // pre-empts CCR's own 22.2% real overlap population for no benefit (MCM
  // doesn't need to run before CCR).
  return "BEFORE_PARITY";
}
