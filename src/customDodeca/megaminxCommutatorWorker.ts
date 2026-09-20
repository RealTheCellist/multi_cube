import { parentPort, workerData } from "node:worker_threads";

/**
 * Standalone worker for buildCommutatorLibrary's own (A,B) pair search,
 * parallelized across CPU cores. Node's native TypeScript support (22.6+)
 * runs this file directly, BUT only resolves imports that carry an
 * explicit extension -- megaminxState.ts's own imports (of dodecaMath.ts,
 * kilominxState.ts, dodecaState.ts, three) are extensionless, the normal
 * style for this bundler-based project, so importing it here would fail
 * to resolve one level down. Rather than fork the whole state module's
 * import graph onto explicit extensions, this file duplicates just the
 * handful of pure, dependency-free functions the search actually needs
 * (move application, commutator construction) against a MOVE_TABLE
 * passed in as plain data -- the SAME table megaminxSolver.ts's own
 * commutator search already uses, computed once in the main thread and
 * never re-derived here.
 */

type Turn = { face: number; sign: 1 | -1 };
interface MoveTable {
  cornerPerm: number[];
  cornerOrientDelta: number[];
  edgePerm: number[];
  edgeOrientDelta: number[];
}
interface State {
  cornerPerm: Int8Array;
  cornerOrient: Int8Array;
  edgePerm: Int8Array;
  edgeOrient: Int8Array;
}
interface Commutator {
  seq: Turn[];
  cornerSupport: number[];
  edgeSupport: number[];
  cornerMovingSupport: number[];
  edgeMovingSupport: number[];
  cornerDestination: number[];
  edgeDestination: number[];
}

interface WorkerInput {
  moveTable: [MoveTable, MoveTable][]; // [face][sign===1 ? 0 : 1], mirrors megaminxState.ts's own MOVE_TABLE
  asChunk: Turn[][];
  bs: Turn[][];
  targetKind: "corner" | "edge";
  fixedCorners: number[];
  fixedEdges: number[];
  maxSupport: number;
  perSizeCap: number;
  maxPairsExamined: number;
}

const { moveTable, asChunk, bs, targetKind, fixedCorners, fixedEdges, maxSupport, perSizeCap, maxPairsExamined } = workerData as WorkerInput;

const SOLVED_STATE: State = {
  cornerPerm: Int8Array.from({ length: 20 }, (_, i) => i),
  cornerOrient: new Int8Array(20),
  edgePerm: Int8Array.from({ length: 30 }, (_, i) => i),
  edgeOrient: new Int8Array(30),
};

function applyMove(state: State, turn: Turn): State {
  const move = moveTable[turn.face][turn.sign === 1 ? 0 : 1];
  const cornerPerm = new Int8Array(20);
  const cornerOrient = new Int8Array(20);
  for (let pos = 0; pos < 20; pos++) {
    const from = move.cornerPerm[pos];
    cornerPerm[pos] = state.cornerPerm[from];
    cornerOrient[pos] = (state.cornerOrient[from] + move.cornerOrientDelta[pos]) % 3;
  }
  const edgePerm = new Int8Array(30);
  const edgeOrient = new Int8Array(30);
  for (let pos = 0; pos < 30; pos++) {
    const from = move.edgePerm[pos];
    edgePerm[pos] = state.edgePerm[from];
    edgeOrient[pos] = (state.edgeOrient[from] + move.edgeOrientDelta[pos]) % 2;
  }
  return { cornerPerm, cornerOrient, edgePerm, edgeOrient };
}
function applySeq(state: State, seq: readonly Turn[]): State {
  let s = state;
  for (const t of seq) s = applyMove(s, t);
  return s;
}
function invertSeq(seq: readonly Turn[]): Turn[] {
  return [...seq].reverse().map((t) => ({ face: t.face, sign: (t.sign * -1) as 1 | -1 }));
}

function makeCommutator(a: Turn[], b: Turn[]): Commutator {
  const seq = [...a, ...b, ...invertSeq(a), ...invertSeq(b)];
  const result = applySeq(SOLVED_STATE, seq);
  const cornerSupport: number[] = [];
  const cornerMovingSupport: number[] = [];
  const cornerDestination: number[] = new Array(20);
  for (let pos = 0; pos < 20; pos++) cornerDestination[result.cornerPerm[pos]] = pos;
  for (let i = 0; i < 20; i++) {
    if (result.cornerPerm[i] === i && result.cornerOrient[i] === 0) continue;
    cornerSupport.push(i);
    if (result.cornerPerm[i] !== i) cornerMovingSupport.push(i);
  }
  const edgeSupport: number[] = [];
  const edgeMovingSupport: number[] = [];
  const edgeDestination: number[] = new Array(30);
  for (let pos = 0; pos < 30; pos++) edgeDestination[result.edgePerm[pos]] = pos;
  for (let i = 0; i < 30; i++) {
    if (result.edgePerm[i] === i && result.edgeOrient[i] === 0) continue;
    edgeSupport.push(i);
    if (result.edgePerm[i] !== i) edgeMovingSupport.push(i);
  }
  return { seq, cornerSupport, edgeSupport, cornerMovingSupport, edgeMovingSupport, cornerDestination, edgeDestination };
}

const fixedCornerSet = new Set(fixedCorners);
const fixedEdgeSet = new Set(fixedEdges);
const buckets = new Map<number, Commutator[]>();
for (let n = 1; n <= maxSupport; n++) buckets.set(n, []);
const seen = new Set<string>();
let examined = 0;

outer: for (const A of asChunk) {
  for (const B of bs) {
    if (examined++ >= maxPairsExamined) break outer;
    const c = makeCommutator(A, B);
    const targetSupport = targetKind === "corner" ? c.cornerSupport : c.edgeSupport;
    if (targetSupport.length === 0 || targetSupport.length > maxSupport) continue;
    if (c.cornerSupport.some((p) => fixedCornerSet.has(p))) continue;
    if (c.edgeSupport.some((p) => fixedEdgeSet.has(p))) continue;
    const key = `${c.cornerSupport.join(",")}|${c.edgeSupport.join(",")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const bucket = buckets.get(targetSupport.length)!;
    if (bucket.length >= perSizeCap) continue;
    bucket.push(c);
    if ([...buckets.values()].every((b) => b.length >= perSizeCap)) break outer;
  }
}

const out: Commutator[] = [];
for (let n = 1; n <= maxSupport; n++) out.push(...buckets.get(n)!);
parentPort?.postMessage(out);
