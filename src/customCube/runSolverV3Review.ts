// Solver v3 Strategy Review Sprint v1 (Post-BP5 Research Review) -- driver.
//   npx tsx src/customCube/runSolverV3Review.ts
// No new experiments are run here -- every number below was already
// measured and committed by a prior Sprint. This driver only assembles,
// cross-checks, and reports.
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { RESEARCH_TIMELINE } from "./solverV3Review/ResearchTimeline";
import { FAILURE_CAUSE_MATRIX, verifyFullCoverage } from "./solverV3Review/FailureCauseMatrix";
import { EVIDENCE_MAP, verifyEvidenceGrounding } from "./solverV3Review/EvidenceMap";
import { RESEARCH_DIRECTION_RANKING, verifyRankingGrounding } from "./solverV3Review/ResearchDirectionRanking";
import { SOLVER_FUTURE_RECOMMENDATION, verifyFinalRecommendation } from "./solverV3Review/SolverFutureRecommendation";

const reportPath = "src/customCube/solverV3Review/data/strategy-review-report.txt";

const lines: string[] = [];
const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));

push("========================================");
push("Solver v3 Strategy Review Sprint v1 -- Post-BP5 Research Review");
push("========================================");
push();

// --- Integrity check: every cited source file must actually exist --------
const missingFiles: string[] = [];
for (const entry of RESEARCH_TIMELINE) {
  for (const f of entry.sourceFiles) {
    if (!existsSync(f)) missingFiles.push(`${entry.id}: ${f}`);
  }
}

push("--- 1. 전체 연구 연혁 (Research Timeline) ---");
for (const t of RESEARCH_TIMELINE) {
  push(`[${t.id}] ${t.name}`);
  push(`  목표: ${t.goal}`);
  push(`  실측 결과: ${t.realResult}`);
  push(`  판정: ${t.outcome}`);
  push(`  최종 결론: ${t.finalConclusion}`);
  push(`  출처: ${t.sourceFiles.join(", ")}`);
  push();
}

push("--- 2. Sprint별 결론 요약 ---");
for (const t of RESEARCH_TIMELINE) {
  push(`${t.id}: ${t.outcome} -- ${t.finalConclusion}`);
}
push();

push("--- 3. Failure Cause Matrix ---");
for (const m of FAILURE_CAUSE_MATRIX) {
  push(`[${m.sprintId}] 축=${m.axes.join("/")} (주축=${m.primaryAxis}) 관계=${m.relation}${m.relatedSprintIds.length ? ` (연관: ${m.relatedSprintIds.join(", ")})` : ""}`);
  push(`  ${m.reasoning}`);
}
push();

push("--- 4. Evidence Map (Q1~Q4) ---");
for (const e of EVIDENCE_MAP) {
  push(`[${e.id}] ${e.question}`);
  push(`  결론: ${e.conclusion}`);
  push(`  근거:`);
  for (const ev of e.evidence) push(`    - ${ev}`);
  if (e.counterEvidence.length) {
    push(`  반증/상반되는 근거:`);
    for (const ce of e.counterEvidence) push(`    - ${ce}`);
  }
  if (e.unverifiedGaps.length) {
    push(`  남은 미검증 사항:`);
    for (const g of e.unverifiedGaps) push(`    - ${g}`);
  }
  push();
}

push("--- 5. 연구 방향 우선순위 (Research Direction Ranking) ---");
for (const r of RESEARCH_DIRECTION_RANKING) {
  push(`[${r.direction}] 기대효과=${r.expectedImpact} 실현가능성=${r.feasibility} 기존근거=${r.existingEvidence} 중복위험=${r.duplicationRisk} 제품적용가능성=${r.productApplicability}`);
  push(`  ${r.reasoning}`);
}
push();

// --- Success criteria -------------------------------------------------------
const coverage = verifyFullCoverage();
const evidenceGrounding = verifyEvidenceGrounding();
const rankingGrounding = verifyRankingGrounding();
const finalCheck = verifyFinalRecommendation();

const level1 = coverage.covered;
const level2 = evidenceGrounding.grounded && rankingGrounding.grounded && missingFiles.length === 0;
const level3 = finalCheck.resolved;

push("--- 6. 성공 기준 (Level 1~3) ---");
push(`Level 1 (모든 Sprint가 동일 기준으로 재분류됨): ${level1 ? "PASS" : "FAIL"}${coverage.missing.length ? ` (누락: ${coverage.missing.join(", ")})` : ""}${coverage.extra.length ? ` (초과: ${coverage.extra.join(", ")})` : ""}`);
push(
  `Level 2 (모든 결론이 실측 Evidence와 연결됨 + 출처 파일 실존): ${level2 ? "PASS" : "FAIL"}` +
    `${evidenceGrounding.unresolvedCitations.length ? ` (Evidence 문제: ${evidenceGrounding.unresolvedCitations.join("; ")})` : ""}` +
    `${rankingGrounding.unresolvedCitations.length ? ` (Ranking 문제: ${rankingGrounding.unresolvedCitations.join("; ")})` : ""}` +
    `${missingFiles.length ? ` (존재하지 않는 출처 파일: ${missingFiles.join("; ")})` : ""}`,
);
push(`Level 3 (최종 권고가 A~E 중 하나로 명확히 귀결): ${level3 ? "PASS" : "FAIL"} (${finalCheck.reason})`);
push();

push("--- 7. 최종 권고 ---");
push(`Q1: ${SOLVER_FUTURE_RECOMMENDATION.q1Answer}`);
push();
push(`Q2: ${SOLVER_FUTURE_RECOMMENDATION.q2Answer}`);
push();
push(`Q3: ${SOLVER_FUTURE_RECOMMENDATION.q3Answer}`);
push();
push(`Q4: ${SOLVER_FUTURE_RECOMMENDATION.q4Answer}`);
push();
push(`=== 최종 결론: ${SOLVER_FUTURE_RECOMMENDATION.outcome}. ${SOLVER_FUTURE_RECOMMENDATION.outcomeLabel} ===`);
push(SOLVER_FUTURE_RECOMMENDATION.reasoning);
push();
push("병행 가능한 즉시 실행 액션 (Dataset 확장 완료를 기다릴 필요 없음):");
for (const a of SOLVER_FUTURE_RECOMMENDATION.parallelNoRegretActions) push(`  - ${a}`);
push();
push(`spec 매핑 관련 참고: ${SOLVER_FUTURE_RECOMMENDATION.specMappingNote}`);
push();
const overall = level1 && level2 && level3;
push(`=== Sprint 종료: ${overall ? "성공" : "실패"} ===`);
push("제품 코드 통합 여부: 미통합 (spec -- 이번 Sprint는 새 실험/새 Prototype/제품 코드 수정을 전부 금지한 순수 Review Sprint)");

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, lines.join("\n"), "utf-8");
console.log(lines.join("\n"));

if (!overall) process.exitCode = 1;
