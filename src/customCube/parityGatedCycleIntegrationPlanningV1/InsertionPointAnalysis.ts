// --- InsertionPointAnalysis (Parity-Gated Cycle Production Integration
// Planning Sprint v1, STEP2) -------------------------------------------------
// Counterfactual: what would happen if the real Prototype
// (tryCrossComponentBridgeCycleResolver, parityGatedCyclePrototypeV1,
// UNMODIFIED -- this Sprint does not touch the Prototype algorithm per its
// own "Prototype 알고리즘은 수정하지 않는다" principle) were inserted at
// each of 5 candidate positions in the REAL Recovery Pipeline. Production
// generateRecoveryStrategies() is called unmodified to get the REAL
// existing candidates for each case; the Prototype's own candidate is
// scored with the SAME scoreWholeState/DEFAULT_EVALUATOR_WEIGHTS formula
// generateRecoveryStrategies()'s own `add()` uses internally (fiveByFiveEdgeEvaluator.ts,
// unmodified) so the two are directly comparable via the same
// score = futurePotential - moves.length*MOVE_COST_WEIGHT arithmetic
// chooseBestRecovery() would apply. No production file is edited -- this
// is a pure counterfactual replay against the real Unknown Population
// (parityGatedCycleBlueprintV1/UnknownPopulationProfiling, unmodified, no
// new dataset).
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, type WingLibrary } from "../fiveByFiveEdges";
import { generateRecoveryStrategies, chooseBestRecovery } from "../fiveByFiveEdgeRecovery";
import type { ExecutorLibraries } from "../fiveByFiveEdgeExecutor";
import { scoreWholeState, DEFAULT_EVALUATOR_WEIGHTS } from "../fiveByFiveEdgeEvaluator";
import { tryCrossComponentBridgeCycleResolver } from "../parityGatedCyclePrototypeV1/CrossComponentBridgeCycleResolver";
import type { UnknownCase } from "../parityGatedCycleBlueprintV1/UnknownPopulationProfiling";

const MOVE_COST_WEIGHT = 2; // mirrors fiveByFiveEdgeRecovery.ts's own MOVE_COST_WEIGHT exactly, for a fair score comparison

export interface InsertionPosition {
  label: string;
  budgetMs: number; // real budget the Prototype would get at this position (cited from fiveByFiveEdgeRecovery.ts's own constants)
  rationale: string;
}

// Budgets cited directly from fiveByFiveEdgeRecovery.ts's own constants/
// arithmetic -- not invented. "shared genDeadline slice" = RECOVERY_GEN_BUDGET_MS(300)/4=75ms
// (this Sprint's own candidate would become a 5th generation step sharing
// the same slice() divisor DISRUPT/SETUP/REPAIR already share under
// non-reservedBudget scheduling). REPAIR/MIXED_COMMUTATOR/SETUP's own
// reserved-slice sizes are used as-is for the "after X" positions that
// mirror their scheduling mechanism.
export const INSERTION_POSITIONS: InsertionPosition[] = [
  { label: "before_REPAIR (shared genDeadline slice)", budgetMs: 75, rationale: "DISRUPT/SETUP와 동일한 공유 genDeadline slice() 예산 (RECOVERY_GEN_BUDGET_MS/4)" },
  { label: "after_REPAIR (reserved slice, REPAIR와 동일 크기)", budgetMs: 75, rationale: "REPAIR_RESERVED_SLICE_MS와 동일 크기의 전용 슬라이스" },
  { label: "after_CCR (remainingTime 스타일, outer deadline 전체)", budgetMs: 1000, rationale: "CCR의 Budget Contract(remainingTime)를 그대로 적용 -- outer deadline 전체를 씀" },
  { label: "after_MIXED_COMMUTATOR (reserved slice, Mixed Commutator와 동일 크기)", budgetMs: 300, rationale: "MIXED_COMMUTATOR_RESERVED_SLICE_MS와 동일 크기" },
  { label: "before_SETUP (reserved slice, SETUP와 동일 크기, last-resort)", budgetMs: 500, rationale: "SETUP_RESERVED_SLICE_MS와 동일 크기, candidates.length===0일 때만 시도" },
];

export interface InsertionCaseResult {
  label: string;
  position: string;
  prototypeGateMatched: boolean;
  prototypeProducedCandidate: boolean;
  prototypeScore: number | null;
  bestExistingType: string | null;
  bestExistingScore: number | null;
  prototypeWouldWin: boolean;
  wallMs: number;
}

function scorePrototypeCandidate(cubies: Cubie[], lib: WingLibrary, budgetMs: number): { gateMatched: boolean; produced: boolean; score: number | null; wallMs: number } {
  const baseScore = scoreWholeState(cubies, DEFAULT_EVALUATOR_WEIGHTS);
  const start = Date.now();
  const result = tryCrossComponentBridgeCycleResolver(cubies, lib, Date.now() + budgetMs);
  const wallMs = Date.now() - start;
  if (!result.moves || result.moves.length === 0) {
    return { gateMatched: result.gateMatched, produced: false, score: null, wallMs };
  }
  const clone = cloneCubies(cubies);
  applySeq(clone, result.moves);
  const afterScore = scoreWholeState(clone, DEFAULT_EVALUATOR_WEIGHTS);
  const futurePotential = afterScore - baseScore;
  const score = futurePotential - result.moves.length * MOVE_COST_WEIGHT;
  return { gateMatched: result.gateMatched, produced: true, score, wallMs };
}

export function analyzeInsertionPositions(cases: readonly UnknownCase[], libs: ExecutorLibraries): InsertionCaseResult[] {
  const results: InsertionCaseResult[] = [];
  for (const c of cases) {
    // Real existing candidates -- production generateRecoveryStrategies(), unmodified,
    // called ONCE per case (position doesn't change what DISRUPT/REPAIR/CCR/
    // MIXED_COMMUTATOR/SETUP themselves produce, only where the Prototype would
    // compete against them).
    const existing = generateRecoveryStrategies(cloneCubies(c.hole.cubies), libs, Date.now() + 1000);
    const bestExisting = chooseBestRecovery(existing);

    for (const pos of INSERTION_POSITIONS) {
      const proto = scorePrototypeCandidate(c.hole.cubies, libs.lib, pos.budgetMs);
      const prototypeWouldWin = proto.produced && proto.score !== null && (!bestExisting || proto.score > bestExisting.score);
      results.push({
        label: c.label,
        position: pos.label,
        prototypeGateMatched: proto.gateMatched,
        prototypeProducedCandidate: proto.produced,
        prototypeScore: proto.score,
        bestExistingType: bestExisting?.type ?? null,
        bestExistingScore: bestExisting?.score ?? null,
        prototypeWouldWin,
        wallMs: proto.wallMs,
      });
    }
  }
  return results;
}

export interface PositionSummary {
  position: string;
  budgetMs: number;
  n: number;
  producedCount: number;
  rescueRate: number;
  wouldWinCount: number;
  winRateAmongProduced: number;
  avgWallMs: number;
  deadlineMissCount: number; // wallMs > budgetMs (search ran past its own allotted slice)
}

export function summarizeByPosition(results: readonly InsertionCaseResult[]): PositionSummary[] {
  return INSERTION_POSITIONS.map((pos) => {
    const rows = results.filter((r) => r.position === pos.label);
    const n = rows.length;
    const produced = rows.filter((r) => r.prototypeProducedCandidate);
    const wouldWin = rows.filter((r) => r.prototypeWouldWin);
    const avgWallMs = n ? rows.reduce((s, r) => s + r.wallMs, 0) / n : 0;
    const deadlineMissCount = rows.filter((r) => r.wallMs > pos.budgetMs).length;
    return {
      position: pos.label,
      budgetMs: pos.budgetMs,
      n,
      producedCount: produced.length,
      rescueRate: n ? produced.length / n : 0,
      wouldWinCount: wouldWin.length,
      winRateAmongProduced: produced.length ? wouldWin.length / produced.length : 0,
      avgWallMs,
      deadlineMissCount,
    };
  });
}
