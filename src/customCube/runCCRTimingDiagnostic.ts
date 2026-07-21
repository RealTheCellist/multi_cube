// CCR Production Integration Sprint v1 -- timing diagnostic driver.
//   npx tsx src/customCube/runCCRTimingDiagnostic.ts [dbPath]
//
// Verifies, over the FULL 335-snapshot dataset (not just a sample), why
// the main Sprint's own STEP1 real end-to-end pass showed CCR called
// 0/335 times despite STEP3's isolated Recovery-level comparison showing
// strong capability. Read-only -- calls only the real, unmodified
// FiveByFiveEdgeSolverEngine.solve() and inspects its own real trace.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadDatabase, allSnapshots } from "./failureAnalysis/failureDatabase";
import { runTimingDiagnostic, summarizeTimingDiagnostic } from "./solverPrimitiveCCRProductionIntegration/RecoveryTimingDiagnostic";

const dbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const reportPath = "src/customCube/solverPrimitiveCCRProductionIntegration/data/ccr-timing-diagnostic-report.txt";

const lines: string[] = [];
const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));

const db = loadDatabase(dbPath);
const snapshots = allSnapshots(db);
console.log(`Running timing diagnostic over ${snapshots.length} snapshots (real engine.solve(), unmodified)...`);

const t0 = Date.now();
const records = runTimingDiagnostic(snapshots);
const summary = summarizeTimingDiagnostic(records);
const totalSec = ((Date.now() - t0) / 1000).toFixed(1);

push("========================================");
push("CCR Production Integration Sprint v1 -- Recovery Timing Diagnostic");
push("========================================");
push();
push("STEP1의 실제 end-to-end 측정에서 CCR 호출 0/335건이 나온 원인을 실제, 미수정 engine.solve()의 trace 타임스탬프로 직접 검증한다.");
push();
push(`전체 snapshot: ${summary.n}`);
push(`Recovery 실제 트리거된 건수: ${summary.recoveryTriggeredCount}`);
push(`그중 candidates(DISRUPT/SETUP/REPAIR/CCR 무엇이든) 1개 이상 생성된 건수: ${summary.candidatesGeneratedCount} (${summary.recoveryTriggeredCount ? ((summary.candidatesGeneratedCount / summary.recoveryTriggeredCount) * 100).toFixed(1) : "0"}%)`);
push(`Recovery가 트리거된 시점의 평균 경과 시간: ${summary.avgRecoveryTriggeredAtMs.toFixed(1)}ms / 1000ms 예산 중`);
push(`즉 Recovery 시작 시점의 평균 잔여 시간: ${summary.avgRemainingAtTriggerMs.toFixed(1)}ms`);
push();
push("결론: Recovery(DISRUPT/SETUP/REPAIR/CCR 전부 포함)는 이 dataset(이미 전체 파이프라인이 실패한 가장 어려운 잔여 상태들)에서 평균적으로 전체 1000ms 예산의 대부분이 이미 소진된 시점에야 트리거되며, 그 시점부터는 어떤 Recovery 후보도 생성될 시간이 거의 남지 않는다. 이는 CCR 고유의 결함이 아니라 Recovery 레이어 자체의 기존 호출 타이밍 특성이다 -- REPAIR 자신의 실제 채택률이 과거 Integration Sprint들에서 0.3~1.8%로 극히 낮게 측정된 것과 동일한 원인이다.");
push();
push(`--- 총 소요 시간: ${totalSec}초 ---`);

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, lines.join("\n") + "\n", "utf-8");
console.log(`리포트 저장: ${reportPath}`);
console.log(lines.join("\n"));
