/**
 * MEGAMINX_SOLVECROSS_SYMMETRY_REDUCTION_FEASIBILITY_V1 -- Step 1+2: derive
 * the face-0 stabilizer symmetry (the 5 rotations of the whole puzzle about
 * face 0's own axis -- the only rotations that fix face 0 setwise, and
 * therefore the only ones that map solveCross's own tracked piece set,
 * FIRST_LAYER_EDGE_POSITIONS = face 0's 5 edges, onto itself) and RIGOROUSLY
 * validate, by direct simulation against the same geometric engine
 * megaminxState.ts's own deriveMove trusts, that it is a genuine automorphism
 * of the move-search graph before anything is measured or built on top of it.
 *
 * Derivation technique: identical in spirit to megaminxState.ts's own
 * deriveMove (apply a real geometric transform to a real solved DodecaState,
 * then read back which piece -- identified by its own fixed home-face
 * identity, unaffected by any later rotation -- ended up at each position).
 * The only difference: deriveMove restricts to stickers within one turn
 * layer (a genuine move); here the SAME quaternion is applied to EVERY
 * sticker (a whole-puzzle rigid rotation, not a move) -- producing a table
 * shaped exactly like MOVE_TABLE's own entries, reusable with the identical
 * apply-formula applyMegaminxMove already uses.
 *
 * Absolute constraint: this file does not modify production code (Rust,
 * megaminxSearchWasm.ts, megaminxSolver.ts, megaminxState.ts) in any way --
 * it only reads already-exported geometry/state primitives and derives its
 * own local symmetry table. No solve_cross behavior changes.
 */
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { VERTICES, FACE_VERTEX_INDICES, FACE_INDICES, FACE_NORMALS, nearestFaceIndex, fifthTurnQuaternion, type FaceIndex } from "./dodecaMath";
import { FACES_AT_VERTEX, nearestVertexIndex, centroid } from "./kilominxState";
import { buildSolvedDodeca, type DodecaState, type Sticker } from "./dodecaState";
import { EDGES, applyMegaminxMove, solvedMegaminxState, type MegaminxState, type MegaminxTurn } from "./megaminxState";
import { mulberry32 } from "./dodecaState";
import { randomMegaminxScramble, applyMegaminxScramble } from "./megaminxState";

// ---------------------------------------------------------------------
// Step 1: derive pi_V (vertex permutation), pi_F (face permutation), pi_E
// (edge permutation) induced by a 72-degree rotation about face 0's axis --
// purely geometric, by rotating the actual coordinates and nearest-matching.
// ---------------------------------------------------------------------
const ROT_QUAT = fifthTurnQuaternion(0, 1);

function derivePiV(): number[] {
  return VERTICES.map((v) => {
    const rotated = v.clone().applyQuaternion(ROT_QUAT);
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < 20; i++) {
      const d = rotated.distanceToSquared(VERTICES[i]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  });
}

/** Inverse of pi_F -- the face relabeling conjugateState's own two-sided (sigma . S . sigma^-1) formula actually needs for move sequences, NOT pi_F itself (see this file's own correction notes on conjugateState below). */
export function invertPerm(perm: readonly number[]): number[] {
  return perm.map((_, i) => perm.findIndex((x) => x === i));
}

export function derivePiF(): number[] {
  return FACE_NORMALS.map((n) => {
    const rotated = n.clone().applyQuaternion(ROT_QUAT);
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < 12; i++) {
      const d = rotated.distanceToSquared(FACE_NORMALS[i]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  });
}

const FACES_AT_EDGE: readonly (readonly [number, number])[] = EDGES.map(([a, b]) => {
  const faces: number[] = [];
  for (const f of FACE_INDICES) {
    const verts = FACE_VERTEX_INDICES[f];
    for (let j = 0; j < 5; j++) {
      const x = verts[j];
      const y = verts[(j + 1) % 5];
      if ((x === a && y === b) || (x === b && y === a)) faces.push(f);
    }
  }
  return faces.sort((p, q) => p - q) as readonly [number, number];
});
const EDGE_MIDPOINTS: readonly THREE.Vector3[] = EDGES.map(([a, b]) => VERTICES[a].clone().add(VERTICES[b]).multiplyScalar(0.5));
function nearestEdgeIndex(p: THREE.Vector3): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < 30; i++) {
    const d = p.distanceToSquared(EDGE_MIDPOINTS[i]);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function derivePiE(piV: number[]): number[] {
  return EDGES.map(([a, b]) => {
    const na = piV[a];
    const nb = piV[b];
    for (let i = 0; i < 30; i++) {
      const [x, y] = EDGES[i];
      if ((x === na && y === nb) || (x === nb && y === na)) return i;
    }
    throw new Error(`no matching edge for rotated pair (${na},${nb})`);
  });
}

// ---------------------------------------------------------------------
// Derive the symmetry as a MOVE_TABLE-shaped conjugation table, by
// simulation: rotate EVERY sticker of a solved DodecaState (not a single
// turn layer), then read back exactly like megaminxState.ts's own
// deriveMove.
// ---------------------------------------------------------------------
export interface SymmetryTable {
  cornerPerm: number[];
  cornerOrientDelta: number[];
  edgePerm: number[];
  edgeOrientDelta: number[];
}

function stickerCentroid(corners: readonly THREE.Vector3[]): THREE.Vector3 {
  const sum = new THREE.Vector3();
  for (const c of corners) sum.add(c);
  return sum.divideScalar(corners.length);
}

export function deriveSymmetryTable(): SymmetryTable {
  const solved: DodecaState = buildSolvedDodeca(3);
  // Whole-puzzle rigid rotation: apply the SAME quaternion to every sticker (no depth/layer filter), unlike applyRawFifthTurn.
  const rotated: Sticker[] = solved.stickers.map((s) => ({ ...s, corners: s.corners.map((c) => c.clone().applyQuaternion(ROT_QUAT)) }));

  const cornerPieceIdOfFaceTriple = new Map<string, number>();
  for (let v = 0; v < 20; v++) cornerPieceIdOfFaceTriple.set([...FACES_AT_VERTEX[v]].sort((a, b) => a - b).join(","), v);
  const edgePieceIdOfFacePair = new Map<string, number>();
  for (let e = 0; e < 30; e++) edgePieceIdOfFacePair.set([...FACES_AT_EDGE[e]].sort((a, b) => a - b).join(","), e);

  const byVertex: { homeFace: number; curFace: number }[][] = Array.from({ length: 20 }, () => []);
  const byEdge: { homeFace: number; curFace: number }[][] = Array.from({ length: 30 }, () => []);
  for (const st of rotated) {
    if (st.pieceType === "corner") {
      const v = nearestVertexIndex(st.corners[1]);
      const curFace = nearestFaceIndex(stickerCentroid(st.corners));
      byVertex[v].push({ homeFace: st.homeFaceIndex, curFace });
    } else if (st.pieceType === "edge") {
      const e = nearestEdgeIndex(centroid([st.corners[0], st.corners[1]]));
      const curFace = nearestFaceIndex(stickerCentroid(st.corners));
      byEdge[e].push({ homeFace: st.homeFaceIndex, curFace });
    }
  }

  const cornerPerm: number[] = new Array(20).fill(-1);
  const cornerOrientDelta: number[] = new Array(20).fill(0);
  for (let v = 0; v < 20; v++) {
    const triple = byVertex[v]
      .map((x) => x.homeFace)
      .sort((a, b) => a - b)
      .join(",");
    const pieceId = cornerPieceIdOfFaceTriple.get(triple);
    if (pieceId === undefined) throw new Error(`no corner piece match at vertex ${v}: [${triple}]`);
    cornerPerm[v] = pieceId;
    if (pieceId === v) continue;
    const bySlot = [...byVertex[v]].sort((a, b) => FACES_AT_VERTEX[v].indexOf(a.curFace) - FACES_AT_VERTEX[v].indexOf(b.curFace));
    const slot0HomeFace = FACES_AT_VERTEX[pieceId][0];
    cornerOrientDelta[v] = bySlot.findIndex((x) => x.homeFace === slot0HomeFace);
  }

  const edgePerm: number[] = new Array(30).fill(-1);
  const edgeOrientDelta: number[] = new Array(30).fill(0);
  for (let e = 0; e < 30; e++) {
    const pair = byEdge[e]
      .map((x) => x.homeFace)
      .sort((a, b) => a - b)
      .join(",");
    const pieceId = edgePieceIdOfFacePair.get(pair);
    if (pieceId === undefined) throw new Error(`no edge piece match at edge ${e}: [${pair}]`);
    edgePerm[e] = pieceId;
    if (pieceId === e) continue;
    const bySlot = [...byEdge[e]].sort((a, b) => FACES_AT_EDGE[e].indexOf(a.curFace) - FACES_AT_EDGE[e].indexOf(b.curFace));
    const slot0HomeFace = FACES_AT_EDGE[pieceId][0];
    edgeOrientDelta[e] = bySlot.findIndex((x) => x.homeFace === slot0HomeFace);
  }

  return { cornerPerm, cornerOrientDelta, edgePerm, edgeOrientDelta };
}

/** Applies a symmetry table exactly like applyMegaminxMove applies a move -- same formula, different table. */
export function applySymmetry(state: MegaminxState, sym: SymmetryTable): MegaminxState {
  const cornerPerm = new Int8Array(20);
  const cornerOrient = new Int8Array(20);
  for (let pos = 0; pos < 20; pos++) {
    const from = sym.cornerPerm[pos];
    cornerPerm[pos] = state.cornerPerm[from];
    cornerOrient[pos] = ((state.cornerOrient[from] + sym.cornerOrientDelta[pos]) % 3) as number;
  }
  const edgePerm = new Int8Array(30);
  const edgeOrient = new Int8Array(30);
  for (let pos = 0; pos < 30; pos++) {
    const from = sym.edgePerm[pos];
    edgePerm[pos] = state.edgePerm[from];
    edgeOrient[pos] = ((state.edgeOrient[from] + sym.edgeOrientDelta[pos]) % 2) as number;
  }
  return { cornerPerm, cornerOrient, edgePerm, edgeOrient };
}

export function statesEqual(a: MegaminxState, b: MegaminxState): boolean {
  for (let i = 0; i < 20; i++) if (a.cornerPerm[i] !== b.cornerPerm[i] || a.cornerOrient[i] !== b.cornerOrient[i]) return false;
  for (let i = 0; i < 30; i++) if (a.edgePerm[i] !== b.edgePerm[i] || a.edgeOrient[i] !== b.edgeOrient[i]) return false;
  return true;
}

/**
 * MEGAMINX_SOLVECROSS_BACKWARD_SYMMETRY_CANDIDATE_V1's own correction to
 * this Sprint's earlier (FEASIBILITY) work: `applySymmetry` above computes
 * RIGHT MULTIPLICATION (state . sym) -- a perfectly well-defined operation,
 * but NOT the one canonicalization needs. Right-mult does NOT fix SOLVED
 * (confirmed by this file's own order-5 test: applySymmetry(SOLVED,sym) !=
 * SOLVED), because piece identity is tied to HOME POSITION, and physically
 * rotating a solved puzzle moves piece i's sticker to position sigma(i)
 * while it is still "piece i" in this codebase's own fixed numbering --
 * that is not the identity permutation unless sigma is.
 *
 * The operation canonicalization actually needs is CONJUGATION: newState
 * such that whoever is piece i at position p in S is redescribed as "piece
 * sigma(i) at position sigma(p)" -- i.e. newState(sigma(p)) = sigma(S(p)),
 * equivalently newState = sigma . S . sigma^-1 as permutation composition.
 * This DOES fix SOLVED (sigma . identity . sigma^-1 = identity for any
 * sigma), which is the property the whole "backward tree is closed under
 * the symmetry because its root is symmetry-invariant" argument requires.
 *
 * Implemented via the SAME generic "compose two permutation+orientation
 * tables" formula applyMegaminxMove/applySymmetry already use (this
 * codebase's own composition is associative regardless of which operand is
 * semantically a "state" vs a "move" -- both are just perm+mod-orientation
 * tables), so conjugateState = compose(compose(sigma, S), sigma^-1), with
 * sigma/sigma^-1 obtained by applying applySymmetry to SOLVED (1 and 4
 * times respectively -- reusing THAT already-validated right-mult
 * primitive purely as a way to materialize sigma's own table as a proper
 * MegaminxState, not to canonicalize with).
 */
interface Transform {
  cornerPerm: readonly number[];
  cornerOrient: readonly number[];
  edgePerm: readonly number[];
  edgeOrient: readonly number[];
}
function composeTransforms(a: Transform, b: Transform): MegaminxState {
  const cornerPerm = new Int8Array(20);
  const cornerOrient = new Int8Array(20);
  for (let pos = 0; pos < 20; pos++) {
    const from = b.cornerPerm[pos];
    cornerPerm[pos] = a.cornerPerm[from];
    cornerOrient[pos] = ((a.cornerOrient[from] + b.cornerOrient[pos]) % 3) as number;
  }
  const edgePerm = new Int8Array(30);
  const edgeOrient = new Int8Array(30);
  for (let pos = 0; pos < 30; pos++) {
    const from = b.edgePerm[pos];
    edgePerm[pos] = a.edgePerm[from];
    edgeOrient[pos] = ((a.edgeOrient[from] + b.edgeOrient[pos]) % 2) as number;
  }
  return { cornerPerm, cornerOrient, edgePerm, edgeOrient };
}

export interface ConjugationContext {
  sigma: MegaminxState; // sigma applied to SOLVED (proper state, order-5 element)
  sigmaInv: MegaminxState; // sigma^-1 = sigma^4
}

export function buildConjugationContext(sym: SymmetryTable): ConjugationContext {
  const sigma = applySymmetry(solvedMegaminxState(), sym);
  let sigmaInv = sigma;
  for (let k = 0; k < 3; k++) sigmaInv = applySymmetry(sigmaInv, sym); // sigma^4
  return { sigma, sigmaInv };
}

/** The operation canonicalization needs: newState = sigma . S . sigma^-1 (fixes SOLVED, unlike applySymmetry's own right-mult). */
export function conjugateState(state: MegaminxState, ctx: ConjugationContext): MegaminxState {
  return composeTransforms(composeTransforms(ctx.sigma, state), ctx.sigmaInv);
}

describe("MEGAMINX_SOLVECROSS_SYMMETRY_REDUCTION_FEASIBILITY_V1: Step 1+2 -- derive and validate the face-0 stabilizer symmetry", () => {
  it("derives pi_V/pi_F/pi_E geometrically and checks basic structural properties", () => {
    const piV = derivePiV();
    const piF = derivePiF();
    const piE = derivePiE(piV);

    console.log(`pi_F (face permutation): ${piF.join(",")}`);
    console.log(`pi_V (vertex permutation): ${piV.join(",")}`);

    expect(piF[0]).toBe(0); // face 0 is fixed by construction (rotation about its own axis)
    // pi_F must be a genuine permutation of order dividing 5 (order exactly 5 unless it's identity, which it isn't since face 0's neighbors move).
    let cur = Array.from({ length: 12 }, (_, i) => i);
    for (let k = 1; k <= 5; k++) {
      cur = cur.map((_, i) => piF[cur[i]]);
    }
    // after applying piF 5 times, should return to identity.
    expect(cur).toEqual(Array.from({ length: 12 }, (_, i) => i));

    // FIRST_LAYER_EDGE_POSITIONS (face 0's own 5 edges) must map onto itself under pi_E.
    const face0Edges = new Set<number>();
    const verts0 = FACE_VERTEX_INDICES[0];
    for (let j = 0; j < 5; j++) {
      const a = verts0[j];
      const b = verts0[(j + 1) % 5];
      const idx = EDGES.findIndex(([x, y]) => (x === a && y === b) || (x === b && y === a));
      face0Edges.add(idx);
    }
    const mappedFace0Edges = new Set([...face0Edges].map((e) => piE[e]));
    console.log(`face-0 edges: [${[...face0Edges].join(",")}] -> pi_E -> [${[...mappedFace0Edges].join(",")}]`);
    expect(mappedFace0Edges).toEqual(face0Edges);
  });

  it("validates the derived symmetry table against direct simulation: order-5, SOLVED-orbit sanity, and (critically) move-conjugation equivalence across many random states/moves", () => {
    const piF = derivePiF();
    const sym = deriveSymmetryTable();
    console.log(`symmetry table cornerPerm: ${sym.cornerPerm.join(",")}`);
    console.log(`symmetry table edgePerm:   ${sym.edgePerm.join(",")}`);
    console.log(`symmetry table cornerOrientDelta: ${sym.cornerOrientDelta.join(",")}`);
    console.log(`symmetry table edgeOrientDelta:   ${sym.edgeOrientDelta.join(",")}`);

    // sym.cornerPerm/edgePerm must themselves be bijections (valid permutations).
    expect(new Set(sym.cornerPerm).size).toBe(20);
    expect(new Set(sym.edgePerm).size).toBe(30);

    // Order-5 check: applying the symmetry 5 times to SOLVED must return exactly to SOLVED.
    let s: MegaminxState = solvedMegaminxState();
    for (let k = 0; k < 5; k++) s = applySymmetry(s, sym);
    expect(statesEqual(s, solvedMegaminxState())).toBe(true);
    // And NOT after fewer than 5 (confirms this is a genuine order-5 element, not accidentally identity/order-1).
    let s1 = applySymmetry(solvedMegaminxState(), sym);
    expect(statesEqual(s1, solvedMegaminxState())).toBe(false);

    // ---- THE critical soundness check: move-conjugation equivalence. ----
    // For random state S and random move (face f, sign), applySymmetry(applyMegaminxMove(S,f,sign), sym)
    // must equal applyMegaminxMove(applySymmetry(S,sym), piF[f], sign) EXACTLY, for the symmetry to be a
    // genuine automorphism of the move-search graph.
    const rng = mulberry32(12345);
    let mismatches = 0;
    let trials = 0;
    for (let t = 0; t < 500; t++) {
      const scrambleLen = 1 + Math.floor(rng() * 30);
      const turns = randomMegaminxScramble(scrambleLen, rng);
      const S = applyMegaminxScramble(solvedMegaminxState(), turns);
      const face = Math.floor(rng() * 12) as FaceIndex;
      const sign: 1 | -1 = rng() < 0.5 ? 1 : -1;

      const lhs = applySymmetry(applyMegaminxMove(S, face, sign), sym);
      const rhs = applyMegaminxMove(applySymmetry(S, sym), piF[face] as FaceIndex, sign);
      trials++;
      if (!statesEqual(lhs, rhs)) {
        mismatches++;
        if (mismatches <= 3) console.log(`MISMATCH at trial ${t}: face=${face} sign=${sign} piF[face]=${piF[face]}`);
      }
    }
    console.log(`move-conjugation equivalence: ${trials - mismatches}/${trials} trials matched exactly`);
    expect(mismatches).toBe(0);
  });
});

describe("MEGAMINX_SOLVECROSS_BACKWARD_SYMMETRY_CANDIDATE_V1: correction -- conjugateState (true two-sided conjugation, fixes SOLVED)", () => {
  it("fixes SOLVED, has order 5, and satisfies move-conjugation for SEQUENCES (not just single moves) -- the property path reconstruction actually needs", () => {
    const sym = deriveSymmetryTable();
    const piF = derivePiF();
    const ctx = buildConjugationContext(sym);

    // Fixes SOLVED -- the property applySymmetry's own right-mult famously does NOT have (see this file's own
    // order-5 test above: applySymmetry(SOLVED,sym) != SOLVED). conjugateState must differ here.
    expect(statesEqual(conjugateState(solvedMegaminxState(), ctx), solvedMegaminxState())).toBe(true);

    // Order 5 on a non-trivial state (sanity: not accidentally the identity operation).
    let s: MegaminxState = solvedMegaminxState();
    const turns0 = randomMegaminxScramble(10, mulberry32(999));
    s = applyMegaminxScramble(s, turns0);
    let cur = s;
    for (let k = 0; k < 5; k++) cur = conjugateState(cur, ctx);
    expect(statesEqual(cur, s)).toBe(true);
    expect(statesEqual(conjugateState(s, ctx), s)).toBe(false);

    // THE property path reconstruction depends on: conjugateState(applySeq(SOLVED, seq)) ==
    // applySeq(SOLVED, conjugateSeq(seq, piFInv)), for real multi-move sequences from SOLVED (not just one
    // move). NOTE: empirically (see a standalone single-move diagnostic run during this Sprint) conjugateState's
    // own two-sided formula (sigma . S . sigma^-1) relabels a move's face via pi_F^{-1}, NOT pi_F directly --
    // e.g. move face=1 conjugates to face=2, and piF^{-1}[1]=2 while piF[1]=9. This is the OPPOSITE convention
    // from applySymmetry's own (right-mult) move-conjugation property validated above, which legitimately uses
    // piF directly -- the two operations conjugate in opposite directions, as expected for left- vs
    // right-multiplication.
    const piFInv = piF.map((_, i) => piF.findIndex((x) => x === i));
    const rng = mulberry32(2024);
    let mismatches = 0;
    for (let t = 0; t < 200; t++) {
      const len = 1 + Math.floor(rng() * 20);
      const seq = randomMegaminxScramble(len, rng);
      const Rep = applyMegaminxScramble(solvedMegaminxState(), seq);
      const lhs = conjugateState(Rep, ctx);
      const conjugatedSeq = seq.map((mv) => ({ face: piFInv[mv.face] as FaceIndex, sign: mv.sign }));
      const rhs = applyMegaminxScramble(solvedMegaminxState(), conjugatedSeq);
      if (!statesEqual(lhs, rhs)) {
        mismatches++;
        if (mismatches <= 3) console.log(`MISMATCH at trial ${t}, len=${len}`);
      }
    }
    console.log(`sequence conjugation from SOLVED (using piF^-1): ${200 - mismatches}/200 trials matched exactly`);
    expect(mismatches).toBe(0);
  });
});
