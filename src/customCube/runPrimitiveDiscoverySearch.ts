// Capability Expansion Sprint v2 -- driver.
//   npx tsx src/customCube/runPrimitiveDiscoverySearch.ts [topNClusters] [replayBenchmarkSize] [topKForBenchmark]
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { loadRepresentativeClusters, loadAllReplaySnapshots } from "./primitiveDiscovery/PrimitiveReplay";
import {
  generateSequences,
  precomputeSequences,
  knownPrimitiveTransitionHashes,
  searchAgainstCluster,
  type SearchOptions,
} from "./primitiveDiscovery/PrimitiveSearch";
import { createEmptyPrimitiveDatabase, addOrBumpCandidate, allCandidates, savePrimitiveDatabase } from "./primitiveDiscovery/PrimitiveDatabase";
import { runReplayBenchmark, computeCapabilityScore } from "./primitiveDiscovery/PrimitiveEvaluator";
import type { PrimitiveCandidate } from "./primitiveDiscovery/PrimitiveCandidate";

const dbPath = "src/customCube/failureAnalysis/data/failures.json";
const primitiveDbPath = "src/customCube/primitiveDiscovery/data/primitives.json";
const discoveryReportPath = "src/customCube/primitiveDiscovery/data/discovery-report.txt";
const catalogPath = "src/customCube/primitiveDiscovery/data/primitive-catalog.txt";
const benchmarkReportPath = "src/customCube/primitiveDiscovery/data/benchmark-report.txt";

const topNClusters = Number(process.argv[2] ?? 8);
const replayBenchmarkSize = Number(process.argv[3] ?? 50);
const topKForBenchmark = Number(process.argv[4] ?? 30);

console.log(`STEP: 대표 Failure Cluster ${topNClusters}개 로드 (Random Scramble 아님, 실제 Replay 복원)`);
const representativeClusters = loadRepresentativeClusters(dbPath, topNClusters);
for (const rc of representativeClusters) {
  console.log(
    `  Cluster ${rc.cluster.id}: WrongWing=${rc.cluster.wrongWingCount}, Parity=${rc.cluster.parity}, Occurrence=${rc.cluster.size}`
  );
}

console.log("\nSTEP: Sequence Generator -- 실제 Quarter/Half/Wide/Inner-layer Move만 사용");
const generated = generateSequences();
console.log(`  생성된 후보 시퀀스: ${generated.length}개 (Commutator + Known-Pattern Conjugate)`);
const precomputed = precomputeSequences(generated);
const knownHashes = knownPrimitiveTransitionHashes();

console.log("\nSTEP: Search Pipeline (Replay State -> Generator -> 실제 Move 적용 -> Evaluator -> Undo)");
const db = createEmptyPrimitiveDatabase();
const searchOptions: SearchOptions = { minWrongWingImprovement: 1 };
let totalEvaluated = 0;
let totalNewlyStored = 0;

for (const rc of representativeClusters) {
  const { candidates, stats } = searchAgainstCluster(rc, precomputed, searchOptions, knownHashes);
  totalEvaluated += stats.sequencesEvaluated;
  for (const c of candidates) {
    if (addOrBumpCandidate(db, c)) totalNewlyStored++;
  }
  console.log(`  Cluster ${rc.cluster.id}: ${stats.sequencesEvaluated}개 평가, ${candidates.length}개 저장 조건 충족`);
}

savePrimitiveDatabase(primitiveDbPath, db);
const stored = allCandidates(db);
console.log(`\n총 평가: ${totalEvaluated}, 고유 Transition Hash: ${stored.length}`);

console.log(`\nSTEP: Replay Benchmark -- 상위 ${topKForBenchmark}개 후보를 ${replayBenchmarkSize}개 Replay에서 검증`);
const allReplaySnapshots = loadAllReplaySnapshots(dbPath).slice(0, replayBenchmarkSize);
console.log(`  실제 사용 가능한 Replay: ${allReplaySnapshots.length}건`);

// Preliminary ranking (before benchmark): most WrongWing improvement on its
// own discovery cluster first, then how many times independently
// rediscovered (frequency) as a tiebreaker -- purely to pick WHICH
// candidates are worth the expensive full-benchmark pass, not the final
// Capability Score ranking (that only exists after the benchmark runs).
const preliminaryRanked = [...stored].sort((a, b) => a.wrongWingDelta - b.wrongWingDelta || b.frequency - a.frequency);
const topCandidates = preliminaryRanked.slice(0, topKForBenchmark);

for (const candidate of topCandidates) {
  candidate.benchmark = runReplayBenchmark(candidate, allReplaySnapshots);
  const isNovel = !knownHashes.has(candidate.transitionHash);
  candidate.capabilityScore = computeCapabilityScore(candidate, isNovel);
}

topCandidates.sort((a, b) => (b.capabilityScore ?? 0) - (a.capabilityScore ?? 0));

// Persist the now-benchmarked top candidates back into the database.
for (const c of topCandidates) db.byTransitionHash[c.transitionHash] = c;
savePrimitiveDatabase(primitiveDbPath, db);

// --- Reports -----------------------------------------------------------
function fmtMove([axis, layer, sign]: readonly [string, number, number]): string {
  return `${axis}${layer}${sign > 0 ? "+" : "-"}`;
}

const discoveryLines: string[] = [];
const dpush = (s = "") => discoveryLines.push(s);
dpush("========================================");
dpush("Primitive Discovery Report -- Capability Expansion Sprint v2");
dpush("========================================");
dpush();
dpush(`탐색한 Replay 수 (대표 Cluster): ${representativeClusters.length}`);
dpush(`탐색한 Sequence 수 (총 평가): ${totalEvaluated}`);
dpush(`발견한 Primitive 수 (고유 Transition Hash): ${stored.length}`);
dpush(`Replay Benchmark 검증 대상: ${topCandidates.length}개 (전체 중 상위)`);
dpush();
dpush("--- Capability Score 순위 (상위 15) ---");
for (const c of topCandidates.slice(0, 15)) {
  dpush(
    `${c.transitionHash}  score=${(c.capabilityScore ?? 0).toFixed(1)}  moveLength=${c.moveLength}  ` +
      `benchmark(success=${c.benchmark?.success}/${c.benchmark?.totalTested}, avgWrongWingDelta=${c.benchmark?.avgWrongWingDelta.toFixed(2)}, avgPairDelta=${c.benchmark?.avgPairDelta.toFixed(2)})`
  );
}
writeFileSync(discoveryReportPath, discoveryLines.join("\n"), "utf-8");
console.log("\n" + discoveryLines.join("\n"));

const catalogLines: string[] = [];
const cpush = (s = "") => catalogLines.push(s);
cpush("========================================");
cpush("Primitive Catalog -- Capability Expansion Sprint v2");
cpush("========================================");
for (const c of topCandidates.slice(0, 15)) {
  cpush();
  cpush(`Transition Hash: ${c.transitionHash}`);
  cpush(`  Move Sequence (${c.moveLength}수): ${c.sequence.map(fmtMove).join(" ")}`);
  cpush(`  Replay Success: ${c.benchmark?.success}/${c.benchmark?.totalTested}`);
  cpush(`  대표 적용 사례: Cluster ${c.discoveredFromClusterKey}`);
  cpush(`  Transition 특징: Affected Slots=${c.affectedSlots.length}, Changed Layers=${c.changedLayers.length}, ParityDelta=${c.parityDelta}`);
}
mkdirSync(dirname(catalogPath), { recursive: true });
writeFileSync(catalogPath, catalogLines.join("\n"), "utf-8");

const benchLines: string[] = [];
const bpush = (s = "") => benchLines.push(s);
bpush("========================================");
bpush("Benchmark Report -- Capability Expansion Sprint v2");
bpush("========================================");
const totalSuccess = topCandidates.reduce((s, c) => s + (c.benchmark?.success ?? 0), 0);
const totalRegression = topCandidates.reduce((s, c) => s + (c.benchmark?.regression ?? 0), 0);
const totalNoEffect = topCandidates.reduce((s, c) => s + (c.benchmark?.noEffect ?? 0), 0);
const avgWrongWingDelta = topCandidates.reduce((s, c) => s + (c.benchmark?.avgWrongWingDelta ?? 0), 0) / (topCandidates.length || 1);
const avgPairDelta = topCandidates.reduce((s, c) => s + (c.benchmark?.avgPairDelta ?? 0), 0) / (topCandidates.length || 1);
bpush(`Success (합계): ${totalSuccess}`);
bpush(`Regression (합계): ${totalRegression}`);
bpush(`No Effect (합계): ${totalNoEffect}`);
bpush(`평균 WrongWing 변화 (후보 평균): ${avgWrongWingDelta.toFixed(2)}`);
bpush(`평균 Pair 변화 (후보 평균): ${avgPairDelta.toFixed(2)}`);
writeFileSync(benchmarkReportPath, benchLines.join("\n"), "utf-8");
console.log("\n" + benchLines.join("\n"));

// --- Success criteria (spec section 16) ---------------------------------
const bestByReplaySuccess = topCandidates.reduce((best, c) => ((c.benchmark?.success ?? 0) > (best?.benchmark?.success ?? -1) ? c : best), null as PrimitiveCandidate | null);
const level1 = (bestByReplaySuccess?.benchmark?.success ?? 0) >= 5;
const level2 = topCandidates.some((c) => !knownHashes.has(c.transitionHash));

console.log("\n=== 성공 기준 (Level 1/2/3 중 하나 이상) ===");
console.log(`Level 1 (50 Replay 중 5회+ WrongWing 감소): ${level1 ? "PASS" : "FAIL"} (최고 후보 success=${bestByReplaySuccess?.benchmark?.success ?? 0}/${replayBenchmarkSize})`);
console.log(`Level 2 (기존 Primitive와 다른 새 Transition Hash): ${level2 ? "PASS" : "FAIL"}`);
console.log(`Level 3 (기존 Primitive로 도달 못한 Cluster 탈출): 기술 분석 참고 (아래)`);
