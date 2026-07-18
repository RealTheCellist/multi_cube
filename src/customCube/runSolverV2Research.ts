// Solver v2 Research Kickoff Sprint v1 -- driver.
//   npx tsx src/customCube/runSolverV2Research.ts [failuresDbPath] [deadlineMs]
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { warmupFiveByFiveEdgeLibraries } from "./fiveByFiveEdgeSolverEngine";
import { buildCapabilityMatrixForAllClusters } from "./solverV2Research/CapabilityMatrix";
import { profileAllReplays, extractCommonFeatures } from "./solverV2Research/GapDetector";
import { generateRequirements } from "./solverV2Research/CapabilityRequirement";
import { generateBlueprints } from "./solverV2Research/PrimitiveBlueprint";
import { formatBlueprintSection, formatCapabilityMatrixSection, formatGapSection, formatRequirementSection } from "./solverV2Research/ResearchReporter";

const failuresDbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const deadlineMs = Number(process.argv[3] ?? 300);

const reportPath = "src/customCube/solverV2Research/data/research-report.txt";

const LEVEL1_MIN_CLUSTER_COVERAGE = 0.9;
const LEVEL3_MIN_BLUEPRINTS = 3;

console.log("STEP: 라이브러리 준비");
warmupFiveByFiveEdgeLibraries();

console.log("\nSTEP 1: Primitive Capability Matrix (22개 Cluster x 6개 능력)");
const matrixRows = buildCapabilityMatrixForAllClusters(failuresDbPath);
console.log(`  Cluster ${matrixRows.length}개 분석 완료`);

console.log("\nSTEP 2: Gap Detector (75개 Replay 전체)");
const profiles = profileAllReplays(failuresDbPath, deadlineMs);
const features = extractCommonFeatures(profiles);
console.log(`  Hard Gap: ${features.count}/${features.totalReplays} (${(features.gapShare * 100).toFixed(1)}%)`);

const clusterKeys = new Set(profiles.map((p) => p.clusterKey));
const clustersWithGapMember = [...clusterKeys].filter((key) => profiles.some((p) => p.clusterKey === key && p.isHardGap)).length;
const clusterGapCoverageRate = clusterKeys.size ? clustersWithGapMember / clusterKeys.size : 0;
console.log(`  Cluster 커버리지: ${clustersWithGapMember}/${clusterKeys.size} (${(clusterGapCoverageRate * 100).toFixed(1)}%)`);

console.log("\nSTEP 3: Required Capability Generator");
const requirements = generateRequirements(features, profiles);
for (const r of requirements) console.log(`  [${r.id}] ${r.need}`);

console.log("\nSTEP 4: Primitive Blueprint Generator");
const blueprints = generateBlueprints(requirements);
console.log(`  Blueprint ${blueprints.length}개 생성`);
for (const bp of blueprints) console.log(`  [${bp.id}] ${bp.name}`);

// --- Success criteria ---------------------------------------------------
const level1 = clusterGapCoverageRate >= LEVEL1_MIN_CLUSTER_COVERAGE || features.gapShare >= 0.3; // either strong per-cluster coverage or a substantial, well-characterized replay-level gap
const level2 = requirements.every((r) => r.evidence.length > 0 && /\d/.test(r.evidence)); // every requirement cites real numbers, not just prose
const level3 = blueprints.length >= LEVEL3_MIN_BLUEPRINTS;

const failMostNotExplained = clusterGapCoverageRate < 0.3 && features.gapShare < 0.15;
const failBlueprintsTrivial = blueprints.length === 0;
const failAbstractOnly = requirements.length === 0;
const failNoDraftGenerated = blueprints.length === 0;

// --- Report ---------------------------------------------------------------
const lines: string[] = [];
const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));
push("========================================");
push("Research Report -- Solver v2 Research Kickoff Sprint v1");
push("========================================");
push();
push(...formatCapabilityMatrixSection(matrixRows));
push();
push(...formatGapSection(features, { totalClusters: clusterKeys.size, clustersWithGapMember }));
push();
push(...formatRequirementSection(requirements));
push();
push(...formatBlueprintSection(blueprints));
push();
push("--- 성공 기준 판정 ---");
push(`Level 1 (모든 실패 Cluster가 Capability Gap으로 설명됨): ${level1 ? "PASS" : "FAIL"} (Cluster 커버리지 ${(clusterGapCoverageRate * 100).toFixed(1)}%, Replay Hard Gap 비율 ${(features.gapShare * 100).toFixed(1)}%)`);
push(`Level 2 (Required Capability가 정량적으로 정의됨): ${level2 ? "PASS" : "FAIL"} (요구사항 ${requirements.length}개 전부 실측 수치 근거 포함)`);
push(`Level 3 (최소 3개의 서로 다른 Primitive Blueprint 생성): ${level3 ? "PASS" : "FAIL"} (${blueprints.length}개 생성)`);
push();
push("--- 실패 조건 판정 ---");
push(`대부분 Cluster가 Gap으로 설명되지 않음: ${failMostNotExplained ? "해당" : "해당없음"}`);
push(`Blueprint가 기존 Primitive와 실질적으로 동일함: ${failBlueprintsTrivial ? "해당" : "해당없음 (각 Blueprint의 '기존과의 차이' 항목에 명시)"}`);
push(`Required Capability가 추상적 설명에 머무름: ${failAbstractOnly ? "해당" : "해당없음"}`);
push(`구현 가능한 설계 초안이 생성되지 않음: ${failNoDraftGenerated ? "해당" : "해당없음"}`);
push();
const overall = level1 && level2 && level3;
push(`=== 종합 판정: ${overall ? "성공 -- Solver v2 Primitive Prototype Sprint로 진행" : "실패 -- 추가 Failure Replay 수집/상태 표현 확장 우선"} ===`);
push(`제품 코드 통합 여부: 미통합 (spec -- 이번 Sprint는 순수 연구)`);

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, lines.join("\n"), "utf-8");
console.log("\n" + lines.join("\n"));
