# solverValidationFrameworkQualificationRefinementV2

Solver Validation Framework Qualification Refinement Sprint v2 — Decision Logic Only(Framework Decision Rule 수정, Production Solver 무변경).

이전 Sprint(Refinement v1)가 남긴 유일한 미해결 원인, Gate B(Runtime)의 `OPEN_QUESTION` 처리 방식을 해결한다.

## 모듈

- `RuntimeGateReplay.ts` (STEP1) — 5개 Historical Case별 Gate B 상태, 현재(strict) Framework Decision, "Gate B가 PASS였다면"의 반사실적(counterfactual) Decision을 계산해 Gate B가 실제로 불일치의 원인인지 직접 귀속시킨다.
- `DecisionRuleComparison.ts` (STEP2/3) — Directive의 Option A(모든 Gate의 OPEN_QUESTION을 PASS와 동일 취급)/B(Gate B만 예외, 다른 Mandatory Gate 전부 PASS 조건부)/C(현행 유지) 세 Rule을 동일 5개 Historical Case에 적용해 Decision Match Rate/False PASS/False FAIL을 비교한다.
- `RuleRegressionAudit.ts` (STEP4) — 기존에 발표된 3개 Release Sprint(Scheduler Production Integration v1, Production Integration Finalization v1, Release Readiness v1)의 Runtime diff 수치에 실제 `evaluateGateB()`를 적용해, 이 세 Sprint의 Gate B가 애초에 PASS였는지(정책 변경의 영향권 밖인지) 확인한다.
- `QualificationDriver.ts` — 위 세 모듈을 실행하고 STEP5 Decision Matrix + 최종 Decision을 계산해 `data/`에 report.txt/result.json을 기록한다.

## 재사용 (읽기 전용, 무수정)

- `solverValidationFrameworkQualification/HistoricalQualificationDataset.ts` — 동일 5개 Historical Case, 동일 published 수치.
- `solverValidationFrameworkQualification/FrameworkRobustnessAnalysis.ts` — False PASS/FAIL 분류 로직.
- `solverValidationFrameworkQualificationRefinement/GateReplayV2.ts` — Gate A/B/C(strict)/D/E 계산(Gate C strict 로직은 Refinement v1에서 이미 고정, 이번 Sprint는 변경하지 않음).
- `solverValidationFrameworkQualificationRefinement/QualificationHelper.ts` — Stage 배정(prototype/production).

## 이번 Sprint가 수정한 유일한 대상

`solverPostReleaseValidationFramework/ValidationPipeline.ts`의 `decideFromGates()` — 새 `gateBPolicy` 파라미터(기본값 `"strict"`, 하위호환) 추가. `ReleaseGates.ts`는 이번 Sprint에서 수정하지 않았다(Gate B 자신의 PASS/OPEN_QUESTION 계산 로직은 그대로, Decision 조립 단계에서만 그 상태를 다르게 소비함).
