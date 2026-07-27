// --- MechanismIdentification (Deep Cycle Resolver Validation Sprint v1,
// RQ-3/RQ-4) ---------------------------------------------------------------
// Answers "which existing mechanism, if any, already matches the
// RECOVERY_REQUIRED population's shape?" directly against
// solverPrimitiveCCRPrototype/CCRPrototype.ts's Clean-Cycle Resolution
// (CCR) -- already production-integrated as a Recovery candidate
// generator (fiveByFiveEdgeRecovery.ts's genCCR, read-only reference) --
// rather than assuming a brand-new Primitive is the only possible fix.
// CCR's own Gate (CCRGate.ts, unmodified, read-only) is
// `cycleLength in [5,6] AND conflictEdgeCount === 0`, which is EXACTLY the
// RECOVERY_REQUIRED structural profile Recovery Necessity Validation
// Sprint v1 measured (avg cycle length 6.00, conflict edges 0.00) -- this
// module measures, not assumes, whether that overlap is real.
import { cloneCubies, type Cubie } from "../cubeState";
import { analyzeCcrGate, type CCRGateAnalysis } from "../solverPrimitiveCCRPrototype/CCRGate";
import { runCCRPrototype, type CCRStrategy } from "../solverPrimitiveCCRPrototype/CCRPrototype";
import type { WingLibrary } from "../fiveByFiveEdges";

export const CCR_PROBE_BUDGETS_MS = [60, 140, 250, 500, 1000, 2000, 5000];
const STRATEGIES: CCRStrategy[] = ["singleCycle", "multiCycle"];

export interface CcrStrategyProbeRow {
  strategy: CCRStrategy;
  minSucceedingBudgetMs: number | null;
  succeededAtAnyBudget: boolean;
}

export interface CcrMechanismProbe {
  label: string;
  gate: CCRGateAnalysis;
  strategyProbes: CcrStrategyProbeRow[];
}

export function probeCcrMechanism(cubies: Cubie[], label: string, lib: WingLibrary): CcrMechanismProbe {
  const gate = analyzeCcrGate(cubies);
  const strategyProbes: CcrStrategyProbeRow[] = STRATEGIES.map((strategy) => {
    let minSucceedingBudgetMs: number | null = null;
    for (const budget of CCR_PROBE_BUDGETS_MS) {
      const clone = cloneCubies(cubies);
      const deadline = Date.now() + budget;
      const result = runCCRPrototype(clone, lib, deadline, strategy);
      if (result.moves) {
        minSucceedingBudgetMs = budget;
        break;
      }
    }
    return { strategy, minSucceedingBudgetMs, succeededAtAnyBudget: minSucceedingBudgetMs !== null };
  });
  return { label, gate, strategyProbes };
}

export type MechanismVerdict = "SAME_EXISTING_MECHANISM_SUFFICIENT" | "SAME_EXISTING_MECHANISM_INCOMPLETE" | "MECHANISM_MISMATCH";

export interface CrossCaseMechanismComparison {
  totalCases: number;
  allGateEligible: boolean; // do all cases share CCR's Gate shape? (RQ-4: same mechanism family)
  solvedByCcr: number; // how many are actually solved by the EXISTING CCR implementation
  unsolvedLabels: string[];
  verdict: MechanismVerdict;
  verdictRationale: string;
}

export function compareAcrossCases(probes: CcrMechanismProbe[]): CrossCaseMechanismComparison {
  const allGateEligible = probes.every((p) => p.gate.eligible);
  const solvedFlags = probes.map((p) => p.strategyProbes.some((s) => s.succeededAtAnyBudget));
  const solvedByCcr = solvedFlags.filter(Boolean).length;
  const unsolvedLabels = probes.filter((_, i) => !solvedFlags[i]).map((p) => p.label);

  let verdict: MechanismVerdict;
  let verdictRationale: string;
  if (!allGateEligible) {
    verdict = "MECHANISM_MISMATCH";
    verdictRationale = "일부 케이스가 CCR Gate(cycleLength 5~6, conflictEdgeCount=0) 자체를 통과하지 못함 -- 동일 메커니즘으로 설명 불가능.";
  } else if (solvedByCcr === probes.length) {
    verdict = "SAME_EXISTING_MECHANISM_SUFFICIENT";
    verdictRationale = "전 케이스가 CCR Gate를 통과하고, 기존 CCR 구현이 전부 해결 -- 새 Primitive 불필요, 이미 존재하는 메커니즘으로 충분.";
  } else {
    verdict = "SAME_EXISTING_MECHANISM_INCOMPLETE";
    verdictRationale = `전 케이스가 동일 메커니즘 계열(CCR Gate 통과)에 속하지만, 기존 CCR 구현은 ${solvedByCcr}/${probes.length}건만 해결 -- 메커니즘 자체는 맞으나 탐색 완전성(leaf cap 등)이 부족.`;
  }

  return { totalCases: probes.length, allGateEligible, solvedByCcr, unsolvedLabels, verdict, verdictRationale };
}
