// --- CapabilityBoundarySpecification (Solver Primitive Set Completeness
// Validation Sprint v1, Deliverable #4) --------------------------------------
import type { PrimitiveCoverageSummary } from "./PrimitiveCoverageMatrix";
import type { ResidualClassSummary } from "./ResidualFailureTaxonomy";

export interface PrimitiveSetBoundarySpec {
  representableDescription: string;
  nonRepresentableDescription: string;
  boundaryCondition: string;
  representativeUnsolvedLabels: string[];
}

export function buildBoundarySpec(coverage: PrimitiveCoverageSummary, residualClasses: ResidualClassSummary[]): PrimitiveSetBoundarySpec {
  const dominant = [...residualClasses].sort((a, b) => b.n - a.n)[0];
  const representative = residualClasses.flatMap((c) => c.labels).slice(0, 8);

  return {
    representableDescription: `Union Coverage ${coverage.unionCoveredCount}/${coverage.totalCases} (${((coverage.unionCoveredCount / coverage.totalCases) * 100).toFixed(
      1
    )}%) -- BASE/FLIP/CASE/PARITY의 메인 파이프라인 pass 하나로 해결되는 대다수 상태, 그리고 CCR(Gate: cycleLength 5~6, conflictEdgeCount=0, componentCount=1)이 추가로 해결하는 단일-컴포넌트 고립 cycle 일부.`,
    nonRepresentableDescription: `${coverage.residualCount}/${coverage.totalCases}건은 5개 Primitive(BASE/FLIP/CASE/PARITY/CCR) 중 어느 것도 5000ms 확장 예산에서도 해결하지 못함. 지배적 잔여 구조: ${
      dominant ? `${dominant.failureClass} (${dominant.n}건)` : "(없음)"
    }.`,
    boundaryCondition:
      "경계는 componentCount(단일/다중 컴포넌트), conflictEdgeCount(존재 여부), cycleCount(존재 여부)의 조합으로 그어진다 -- 현재 Primitive Set은 '단일 컴포넌트 + conflict 없음 + cycle 있음(길이 5~6)' 형태(CCR Gate)만 명시적으로 다루며, 그 밖의 조합(다중 컴포넌트, conflict 존재, Gate 범위 밖 cycle 길이)은 어떤 기존 Primitive의 대상 조건에도 명시적으로 포함되지 않는다.",
    representativeUnsolvedLabels: representative,
  };
}
