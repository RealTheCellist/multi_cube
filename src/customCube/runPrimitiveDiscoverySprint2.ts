// Primitive Discovery Sprint #2 -- Gap Analysis driver.
//   npx tsx src/customCube/runPrimitiveDiscoverySprint2.ts [dbPath] [reportPath]
//
// STEP1 (fresh collection under the current, REPAIR-equipped solver) was
// already run via the existing, unmodified runFailureAnalysis.ts driver
// (150 -> 335 snapshots, committed separately). This driver does:
//   STEP1b: revalidate the pre-cutoff (pre-REPAIR) portion of the dataset
//     against the CURRENT solver, excluding any now-resolved stale entries
//   STEP2:  cluster the remaining CURRENT failure population by
//     StructuralRepresentation (wrongWing/parity/cycleLength/cycleCount/
//     conflictEdgeCount -- REPAIR's own Gate features, reused verbatim)
//   STEP3:  select the largest cluster with ZERO REPAIR-gate-eligible
//     members -- i.e. a genuine structural gap, not an under-served slice
//     of what REPAIR already targets
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadDatabase, allSnapshots } from "./failureAnalysis/failureDatabase";
import { revalidateSnapshots } from "./primitiveDiscoverySprint2/RevalidationCheck";
import { computeAllStructuralFeatures } from "./primitiveDiscoverySprint2/StructuralRepresentation";
import { clusterByStructure, clusterByMacroStructure, selectLargestUnaddressedCluster } from "./primitiveDiscoverySprint2/StructuralClustering";
import { warmupFiveByFiveEdgeLibraries } from "./fiveByFiveEdgeSolverEngine";

const dbPath = process.argv[2] ?? "src/customCube/failureAnalysis/data/failures.json";
const reportPath = process.argv[3] ?? "src/customCube/primitiveDiscoverySprint2/data/gap-analysis-report.txt";

const lines: string[] = [];
const push = (...s: string[]) => lines.push(...(s.length ? s : [""]));
const log = (s: string) => console.log(s);

push("========================================");
push("Primitive Discovery Sprint #2 -- Gap Analysis Report");
push("========================================");
push();

warmupFiveByFiveEdgeLibraries();
const db = loadDatabase(dbPath);
const allSnaps = allSnapshots(db);
push(`전체 데이터셋: ${allSnaps.length}개 snapshot (기존 150개 + 이번 Sprint STEP1에서 새로 수집한 185개)`);
push();

log(`STEP1b: 기존(pre-REPAIR) snapshot 재검증 중 (${allSnaps.length}개 중 pre-cutoff분만 실제 solve() 재실행)...`);
const revalidation = revalidateSnapshots(db, allSnaps);
const staleHashes = new Set(revalidation.filter((r) => r.nowResolved).map((r) => r.hash));
const currentFailures = allSnaps.filter((s) => !staleHashes.has(s.hash));

push("--- STEP1b: Revalidation (기존 pre-REPAIR snapshot 중 현재 Solver가 이미 해결한 것 제외) ---");
const preCutoffCount = revalidation.filter((r) => r.isPreCutoff).length;
push(`Pre-cutoff(기존) snapshot: ${preCutoffCount}개, 그중 현재 Solver가 한 번의 solve() 호출로 이미 완전히 푼 것(stale, 제외): ${staleHashes.size}개`);
push(`현재 실패 모집단(clustering 대상): ${currentFailures.length}개`);
push();

log(`STEP2: Structural Representation 계산 + Clustering 중 (${currentFailures.length}개)...`);
const features = computeAllStructuralFeatures(currentFailures);
const clusters = clusterByStructure(features);

push(`--- STEP2: Structural Clustering (wrongWing/parity/cycleLength/cycleCount/conflictEdgeCount) ---`);
push(`Cluster 수: ${clusters.length}개`);
push();
push("상위 10개 Cluster:");
for (const c of clusters.slice(0, 10)) {
  push(`  [${c.key}] 총 ${c.size}건 -- ${c.description} (REPAIR Gate 적격 비율: ${(c.gateEligibleFraction * 100).toFixed(0)}%)`);
}
push();

const gateEligibleTotal = features.filter((f) => f.gateEligible).length;
push(`전체 중 REPAIR Gate 적격(cycleLength 2~4 AND conflictEdgeCount>0): ${gateEligibleTotal}/${features.length} (${((gateEligibleTotal / features.length) * 100).toFixed(1)}%)`);
push();

// The exact-tuple clustering above reproduces the same over-fragmentation
// failureAnalysis/failureCluster.ts's own comment already warned about
// (173 clusters out of 335 snapshots, largest only 8) -- a coarser,
// cycleLength-banded view is used for the actual STEP3 selection instead.
log("STEP2b: 거친(coarse) Macro-Clustering 중 (cycleLength를 구간으로 묶음)...");
const macroClusters = clusterByMacroStructure(features);
push(`--- STEP2b: Macro Clustering (cycleLength band x conflictEdges 유무) -- exact-tuple clustering의 과도한 파편화(173개 cluster, 최대 8건)를 피하기 위한 보조 뷰 ---`);
for (const c of macroClusters) {
  push(`  [${c.key}] 총 ${c.size}건 -- ${c.description} (REPAIR Gate 적격 비율: ${(c.gateEligibleFraction * 100).toFixed(0)}%)`);
}
push();

log("STEP3: 가장 큰 미해결(REPAIR Gate 완전 부적격) Macro Cluster 선정 중...");
const macroTarget = macroClusters.filter((c) => c.gateEligibleFraction === 0).sort((a, b) => b.size - a.size)[0] ?? null;
const target = selectLargestUnaddressedCluster(clusters);
push("--- STEP3: 가장 큰 미해결 Cluster (Macro 기준으로 최종 선정) ---");
if (macroTarget) {
  push(`선정: [${macroTarget.key}] 총 ${macroTarget.size}건 -- ${macroTarget.description}`);
  push(`REPAIR Gate 적격 비율: 0%`);
  push(`대표 hash 목록 (최대 10개): ${macroTarget.hashes.slice(0, 10).join(", ")}`);
} else {
  push("모든 Macro Cluster가 최소 일부는 REPAIR Gate 적격 -- 완전히 미해결인 구조적 Cluster를 찾지 못함.");
}
push();
push(`(참고: exact-tuple 기준 가장 큰 미해결 cluster는 [${target?.key ?? "없음"}] ${target?.size ?? 0}건이었으나, 파편화가 심해 macro cluster를 최종 target으로 채택.)`);
push();

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, lines.join("\n") + "\n", "utf-8");
log(`리포트 저장: ${reportPath}`);
if (target) log(`선정된 target cluster: [${target.key}], 크기 ${target.size}`);
