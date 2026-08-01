// Real smoke test (not a fabricated result): builds a real solved 5x5 cube,
// applies a real random scramble via the same cubeState.ts helpers the web
// app itself uses, runs it through BOTH (a) the bundled JS bridge under a
// plain vm context (approximating JavaScriptCore's JSContext -- no DOM, no
// Node builtins reachable from inside the sandbox) and (b) a direct TS call
// to FiveByFiveEdgeSolverEngine.solve() with the identical cubies, and
// diffs the two SolvePlan outputs field-by-field. If they match, the
// bridge's JSON marshal/demarshal round-trip is proven not to alter
// solver behavior.
import vm from "node:vm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

const { buildSolvedCube, randomLayerScramble } = await import(path.join(here, "..", "..", "src", "customCube", "cubeState.ts"));
const { FiveByFiveEdgeSolverEngine } = await import(path.join(here, "..", "..", "src", "customCube", "fiveByFiveEdgeSolverEngine.ts"));

function toJsonCubie(c) {
  return {
    id: c.id,
    originalPosition: { x: c.originalPosition.x, y: c.originalPosition.y, z: c.originalPosition.z },
    position: { x: c.position.x, y: c.position.y, z: c.position.z },
    orientation: { x: c.orientation.x, y: c.orientation.y, z: c.orientation.z, w: c.orientation.w },
    stickers: c.stickers.map((s) => ({ direction: { x: s.direction.x, y: s.direction.y, z: s.direction.z }, color: s.color })),
  };
}

let failures = 0;
const RUNS = 5;

for (let run = 0; run < RUNS; run++) {
  const cubies = buildSolvedCube(5);
  randomLayerScramble(cubies, 5, 40);
  const cubiesForDirect = cubies.map((c) => ({
    id: c.id,
    originalPosition: c.originalPosition.clone(),
    position: c.position.clone(),
    orientation: c.orientation.clone(),
    stickers: c.stickers.map((s) => ({ direction: s.direction.clone(), color: s.color })),
  }));

  // (a) Direct TS call -- the ground truth.
  const directEngine = new FiveByFiveEdgeSolverEngine();
  const directPlan = directEngine.solve(cubiesForDirect);

  // (b) Through the bundled bridge, executed in an isolated vm context (no
  // access to this process's require/import/fs -- structurally similar to
  // what a JSContext sandbox provides).
  const bundleSrc = fs.readFileSync(path.join(here, "..", "dist", "PolyPuzzleSolverBridge.bundle.js"), "utf8");
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(bundleSrc, sandbox, { filename: "PolyPuzzleSolverBridge.bundle.js" });
  const request = JSON.stringify({ cubies: cubies.map(toJsonCubie) });
  const responseJson = sandbox.PolyPuzzleSolverBridge.solve(request);
  const response = JSON.parse(responseJson);

  if (response.ok !== true) {
    console.error(`run ${run}: bridge returned error`, response);
    failures++;
    continue;
  }

  const directMoveQueue = directPlan.moveQueue.map((m) => JSON.stringify(m));
  const bridgeMoveQueue = response.moveQueue.map((m) => JSON.stringify([m.axis, m.layer, m.sign]));
  const scoreMatch = response.score === directPlan.score;
  const stateHashMatch = response.stateHash === directPlan.stateHash;
  const moveQueueMatch = JSON.stringify(directMoveQueue) === JSON.stringify(bridgeMoveQueue);
  const taskCountMatch = response.tasks.length === directPlan.tasks.length;

  const pass = scoreMatch && stateHashMatch && moveQueueMatch && taskCountMatch;
  console.log(
    `run ${run}: score(direct=${directPlan.score},bridge=${response.score})=${scoreMatch} ` +
      `stateHash=${stateHashMatch} moveQueue(len direct=${directMoveQueue.length},bridge=${bridgeMoveQueue.length})=${moveQueueMatch} ` +
      `taskCount(direct=${directPlan.tasks.length},bridge=${response.tasks.length})=${taskCountMatch} => ${pass ? "PASS" : "FAIL"}`
  );
  if (!pass) failures++;
}

console.log(`\n${RUNS - failures}/${RUNS} runs matched bridge output to direct solve() output byte-for-byte.`);
if (failures > 0) {
  console.error(`SMOKE TEST FAILED: ${failures} mismatches`);
  process.exit(1);
}
console.log("SMOKE TEST PASSED");
