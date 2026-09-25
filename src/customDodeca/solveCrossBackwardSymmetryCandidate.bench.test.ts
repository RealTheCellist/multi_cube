/**
 * MEGAMINX_SOLVECROSS_BACKWARD_SYMMETRY_CANDIDATE_V1 -- isolated JS-side
 * candidate implementation (no Rust/production change). Forward stays
 * completely untouched (raw states, raw keys, exactly like
 * bidirectional_search_impl). Backward is deduplicated by ORBIT
 * (canonical = min key over the 5 face-0-stabilizer symmetry images),
 * expanding only one representative per orbit.
 *
 * IMPORTANT CORRECTION made during this Sprint: the earlier FEASIBILITY
 * Sprint's own `applySymmetry` computes RIGHT-multiplication (state . sym),
 * which does NOT fix SOLVED (confirmed by that Sprint's own order-5 test --
 * applySymmetry(SOLVED,sym) != SOLVED). Canonicalization needs TRUE
 * two-sided conjugation (sigma . S . sigma^-1), which DOES fix SOLVED --
 * see solveCrossSymmetryFeasibility.bench.test.ts's own
 * `conjugateState`/`buildConjugationContext`, added and validated (200/200
 * exact matches for multi-move sequences) during this Sprint after Gate A
 * caught 11/30 false solves with the original (wrong) primitive. The
 * corrected primitive conjugates move sequences via pi_F^{-1} (NOT pi_F --
 * empirically confirmed: right-mult and two-sided conjugation relabel
 * moves in OPPOSITE directions, as expected for left- vs
 * right-multiplication).
 *
 * Meeting: for each forward (real) state F, look up F's own canonical key
 * in backward's canonical table. On a hit (representative Rep, real state +
 * real path from SOLVED), find the symmetry power j (0..4) with
 * key(conjugateState^j(F)) === key(Rep) exactly, then conjugate Rep's own
 * real path by pi_F^{-(5-j)%5} (relabeling each move's face, same sign) to
 * get a path from SOLVED to a state whose cross-substate matches F's
 * exactly.
 *
 * Absolute constraint: every "found" solution is verified by a FULL replay
 * against the real geometric MegaminxState (not just a key comparison) --
 * a false solve here would be the single worst outcome this whole session
 * has guarded against everywhere else.
 */
import { describe, it, expect } from "vitest";
import { deriveSymmetryTable, derivePiF, invertPerm, buildConjugationContext, conjugateState, type ConjugationContext } from "./solveCrossSymmetryFeasibility.bench.test";
import { applyMegaminxMove, applyMegaminxScramble, randomMegaminxScramble, solvedMegaminxState, type MegaminxState, type MegaminxTurn } from "./megaminxState";
import { mulberry32 } from "./dodecaState";
import type { FaceIndex } from "./dodecaMath";

const TRACKED_PIECES = [0, 1, 2, 3, 4]; // face 0's own 5 edges -- see SYMMETRY_FEASIBILITY_V1's own "face-0 edges" derivation

function computeEdgeStateKey(state: MegaminxState, pieces: readonly number[]): bigint {
  const n = pieces.length;
  const slotForPiece = new Array(30).fill(-1);
  for (let i = 0; i < n; i++) slotForPiece[pieces[i]] = i;
  const positions = new Array(n).fill(0);
  let remaining = n;
  for (let pos = 0; pos < 30 && remaining > 0; pos++) {
    const slot = slotForPiece[state.edgePerm[pos]];
    if (slot >= 0) {
      positions[slot] = pos;
      remaining--;
    }
  }
  let key = 0n;
  for (let i = 0; i < n; i++) key = key * 60n + BigInt(positions[i] * 2 + state.edgeOrient[positions[i]]);
  return key;
}

function canonicalKey(state: MegaminxState, ctx: ConjugationContext): bigint {
  let best = computeEdgeStateKey(state, TRACKED_PIECES);
  let cur = state;
  for (let k = 0; k < 4; k++) {
    cur = conjugateState(cur, ctx);
    const k2 = computeEdgeStateKey(cur, TRACKED_PIECES);
    if (k2 < best) best = k2;
  }
  return best;
}

/** Finds j in 0..4 with key(conjugateState^j(fState)) === targetKey exactly. Throws if none found (should be unreachable given a canonical-key match). */
function findSymmetryIndex(fState: MegaminxState, targetKey: bigint, ctx: ConjugationContext): number {
  let cur = fState;
  for (let j = 0; j < 5; j++) {
    if (computeEdgeStateKey(cur, TRACKED_PIECES) === targetKey) return j;
    cur = conjugateState(cur, ctx);
  }
  throw new Error("findSymmetryIndex: no matching power found -- canonical-key match without a real match, this would be a soundness bug");
}

function invertSeq(seq: readonly MegaminxTurn[]): MegaminxTurn[] {
  return [...seq].reverse().map((t) => ({ face: t.face, sign: (t.sign * -1) as 1 | -1 }));
}

function composePerm(a: readonly number[], b: readonly number[]): number[] {
  // (a then b): result[x] = b[a[x]]
  return a.map((x) => b[x]);
}

/** piFInvPowers[k] = (pi_F^{-1})^k, the k-fold composed permutation conjugateState^k relabels move sequences by (see this file's own correction notes above). */
function buildPiFInvPowers(): number[][] {
  const piFInv1 = invertPerm(derivePiF());
  const identity = piFInv1.map((_, i) => i);
  const piFInv2 = composePerm(piFInv1, piFInv1);
  const piFInv3 = composePerm(piFInv2, piFInv1);
  const piFInv4 = composePerm(piFInv3, piFInv1);
  return [identity, piFInv1, piFInv2, piFInv3, piFInv4];
}

function conjugateSeq(seq: readonly MegaminxTurn[], piFPow: readonly number[]): MegaminxTurn[] {
  return seq.map((t) => ({ face: piFPow[t.face] as FaceIndex, sign: t.sign }));
}

function applySeq(state: MegaminxState, seq: readonly MegaminxTurn[]): MegaminxState {
  let s = state;
  for (const t of seq) s = applyMegaminxMove(s, t.face, t.sign);
  return s;
}

function isCrossSolved(state: MegaminxState): boolean {
  return TRACKED_PIECES.every((p) => state.edgePerm[p] === p && state.edgeOrient[p] === 0);
}

interface FwdNode {
  state: MegaminxState;
  path: MegaminxTurn[];
  canonKey: bigint;
}
interface BwdNode {
  state: MegaminxState;
  path: MegaminxTurn[];
  key: bigint; // this representative's OWN raw key (not the canonical label)
}

interface CandidateStats {
  found: boolean;
  solutionLength: number | null;
  forwardRounds: number;
  backwardRounds: number;
  forwardFinalSize: number;
  backwardCanonicalFinalSize: number;
  meetingAttempts: number;
  termination: "MEET_FOUND" | "FRONTIER_EXCEEDED" | "ROUNDS_EXHAUSTED";
  roundsCompleted: number;
}

function candidateSearch(rootState: MegaminxState, maxHalfDepth: number, maxFrontierSize: number, ctx: ConjugationContext, piFInvPowers: readonly number[][]): { solution: MegaminxTurn[] | null; stats: CandidateStats } {
  // piFInv^{-j} = piFInv^{(5-j)%5} -- the power needed to translate a canonical-frame match back to F's own real frame (see this file's own top comment).
  const conjPowerForJ = [piFInvPowers[0], piFInvPowers[4], piFInvPowers[3], piFInvPowers[2], piFInvPowers[1]];

  const forward = new Map<bigint, FwdNode>();
  const backward = new Map<bigint, BwdNode>(); // keyed by CANONICAL key

  const rootKey = computeEdgeStateKey(rootState, TRACKED_PIECES);
  forward.set(rootKey, { state: rootState, path: [], canonKey: canonicalKey(rootState, ctx) });

  const target = solvedMegaminxState();
  const targetCanon = canonicalKey(target, ctx);
  backward.set(targetCanon, { state: target, path: [], key: computeEdgeStateKey(target, TRACKED_PIECES) });

  let forwardRounds = 0;
  let backwardRounds = 0;
  let meetingAttempts = 0;

  const tryMeet = (): MegaminxTurn[] | null => {
    meetingAttempts++;
    for (const f of forward.values()) {
      const rep = backward.get(f.canonKey);
      if (!rep) continue;
      const j = findSymmetryIndex(f.state, rep.key, ctx);
      const conjugatedBackwardPath = conjugateSeq(rep.path, conjPowerForJ[j]);
      const combined = [...f.path, ...invertSeq(conjugatedBackwardPath)];
      return combined;
    }
    return null;
  };

  {
    const m = tryMeet();
    if (m) {
      return {
        solution: m,
        stats: { found: true, solutionLength: m.length, forwardRounds, backwardRounds, forwardFinalSize: forward.size, backwardCanonicalFinalSize: backward.size, meetingAttempts, termination: "MEET_FOUND", roundsCompleted: 0 },
      };
    }
  }

  let forwardFrontier: FwdNode[] = [...forward.values()];
  let backwardFrontier: BwdNode[] = [...backward.values()];

  for (let round = 0; round < maxHalfDepth; round++) {
    const expandForward = forward.size <= backward.size;
    if (expandForward) {
      forwardRounds++;
      const next: FwdNode[] = [];
      for (const base of forwardFrontier) {
        for (let face = 0; face < 12; face++) {
          for (const sign of [1, -1] as const) {
            const child = applyMegaminxMove(base.state, face as FaceIndex, sign);
            const key = computeEdgeStateKey(child, TRACKED_PIECES);
            if (forward.has(key)) continue;
            if (next.length >= maxFrontierSize) {
              return { solution: null, stats: { found: false, solutionLength: null, forwardRounds, backwardRounds, forwardFinalSize: forward.size, backwardCanonicalFinalSize: backward.size, meetingAttempts, termination: "FRONTIER_EXCEEDED", roundsCompleted: round } };
            }
            const node: FwdNode = { state: child, path: [...base.path, { face: face as FaceIndex, sign }], canonKey: canonicalKey(child, ctx) };
            forward.set(key, node);
            next.push(node);
          }
        }
      }
      forwardFrontier = next;
    } else {
      backwardRounds++;
      const next: BwdNode[] = [];
      for (const base of backwardFrontier) {
        for (let face = 0; face < 12; face++) {
          for (const sign of [1, -1] as const) {
            const child = applyMegaminxMove(base.state, face as FaceIndex, sign);
            const canon = canonicalKey(child, ctx);
            if (backward.has(canon)) continue;
            if (next.length >= maxFrontierSize) {
              return { solution: null, stats: { found: false, solutionLength: null, forwardRounds, backwardRounds, forwardFinalSize: forward.size, backwardCanonicalFinalSize: backward.size, meetingAttempts, termination: "FRONTIER_EXCEEDED", roundsCompleted: round } };
            }
            const node: BwdNode = { state: child, path: [...base.path, { face: face as FaceIndex, sign }], key: computeEdgeStateKey(child, TRACKED_PIECES) };
            backward.set(canon, node);
            next.push(node);
          }
        }
      }
      backwardFrontier = next;
    }

    const m = tryMeet();
    if (m) {
      return {
        solution: m,
        stats: { found: true, solutionLength: m.length, forwardRounds, backwardRounds, forwardFinalSize: forward.size, backwardCanonicalFinalSize: backward.size, meetingAttempts, termination: "MEET_FOUND", roundsCompleted: round + 1 },
      };
    }
  }

  return { solution: null, stats: { found: false, solutionLength: null, forwardRounds, backwardRounds, forwardFinalSize: forward.size, backwardCanonicalFinalSize: backward.size, meetingAttempts, termination: "ROUNDS_EXHAUSTED", roundsCompleted: maxHalfDepth } };
}

describe("MEGAMINX_SOLVECROSS_BACKWARD_SYMMETRY_CANDIDATE_V1: Gate A -- correctness on small fixtures", () => {
  it("solves 150 light-to-moderate scrambles (5-40 moves) with the candidate search and replay-verifies every solution", () => {
    const sym = deriveSymmetryTable();
    const ctx = buildConjugationContext(sym);
    const piFInvPowers = buildPiFInvPowers();
    let falseCount = 0;
    let solvedCount = 0;
    const falseSeeds: number[] = [];
    for (let seed = 1; seed <= 150; seed++) {
      const length = 5 + (seed % 36);
      const turns = randomMegaminxScramble(length, mulberry32(seed * 131 + length * 997));
      const scrambled = applyMegaminxScramble(solvedMegaminxState(), turns);
      const { solution, stats } = candidateSearch(scrambled, 12, 300_000, ctx, piFInvPowers);
      if (!solution) {
        console.log(`  seed ${seed} (len ${length}): NOT SOLVED, term=${stats.termination}`);
        continue;
      }
      solvedCount++;
      const replayed = applySeq(scrambled, solution);
      const ok = isCrossSolved(replayed);
      if (!ok) {
        falseCount++;
        falseSeeds.push(seed);
        console.log(`  seed ${seed}: FALSE SOLVE -- solution claimed length ${solution.length} but replay does not solve the cross`);
      }
    }
    console.log(`Gate A: solved ${solvedCount}/150, false solves = ${falseCount} ${falseSeeds.length > 0 ? `[${falseSeeds.join(",")}]` : ""}`);
    expect(falseCount).toBe(0);
    expect(solvedCount).toBeGreaterThan(0);
  }, 300_000);
});

const TIER_LENGTH: Record<string, number> = { easy: 15, normal: 40, hard: 70 };
function scrambledStateFor(key: string): MegaminxState {
  const [tier, seedStr] = key.split("#");
  const length = TIER_LENGTH[tier];
  const turns = randomMegaminxScramble(length, mulberry32(Number(seedStr) * 97 + length * 7919));
  return applyMegaminxScramble(solvedMegaminxState(), turns);
}

describe("MEGAMINX_SOLVECROSS_BACKWARD_SYMMETRY_CANDIDATE_V1: Gate B -- the 6 residual fixtures", () => {
  it("runs the candidate search (maxHalfDepth=13, maxFrontierSize=1,500,000 -- matching production) against all 6 structural-residual fixtures and replay-verifies any solution found", () => {
    const RESIDUAL = ["normal#28", "hard#6", "hard#24", "hard#30", "hard#31", "hard#39"];
    const sym = deriveSymmetryTable();
    const ctx = buildConjugationContext(sym);
    const piFInvPowers = buildPiFInvPowers();

    let rescued = 0;
    let falseCount = 0;
    for (const key of RESIDUAL) {
      const scrambled = scrambledStateFor(key);
      const t0 = performance.now();
      const { solution, stats } = candidateSearch(scrambled, 13, 1_500_000, ctx, piFInvPowers);
      const ms = performance.now() - t0;
      if (!solution) {
        console.log(`  ${key}: NOT SOLVED, term=${stats.termination}, roundsCompleted=${stats.roundsCompleted}, fwdRounds=${stats.forwardRounds}, bwdRounds=${stats.backwardRounds}, fwdFinal=${stats.forwardFinalSize}, bwdCanonFinal=${stats.backwardCanonicalFinalSize}, ${ms.toFixed(0)}ms`);
        continue;
      }
      const replayed = applySeq(scrambled, solution);
      const ok = isCrossSolved(replayed);
      console.log(`  ${key}: ${ok ? "SOLVED" : "FALSE SOLVE"} solLen=${solution.length} roundsCompleted=${stats.roundsCompleted} fwdRounds=${stats.forwardRounds} bwdRounds=${stats.backwardRounds} fwdFinal=${stats.forwardFinalSize} bwdCanonFinal=${stats.backwardCanonicalFinalSize} ${ms.toFixed(0)}ms`);
      if (ok) rescued++;
      else falseCount++;
    }
    console.log(`Gate B: rescued ${rescued}/6, false solves = ${falseCount}`);
    expect(falseCount).toBe(0);
  }, 900_000);
});

describe("MEGAMINX_SOLVECROSS_BACKWARD_SYMMETRY_CANDIDATE_V1: Gate C -- 100-scramble regression at production maxHalfDepth=12", () => {
  it("matches or beats the production baseline's 90/100 completeness, with 0 false solves, across the full fixture set", () => {
    const sym = deriveSymmetryTable();
    const ctx = buildConjugationContext(sym);
    const piFInvPowers = buildPiFInvPowers();

    const PLAN: { tier: "easy" | "normal" | "hard"; length: number; count: number }[] = [
      { tier: "easy", length: 15, count: 20 },
      { tier: "normal", length: 40, count: 40 },
      { tier: "hard", length: 70, count: 40 },
    ];

    let solved = 0;
    let falseCount = 0;
    const failedKeys: string[] = [];
    const falseKeys: string[] = [];
    const t0 = performance.now();
    for (const { tier, length, count } of PLAN) {
      for (let seed = 1; seed <= count; seed++) {
        const turns = randomMegaminxScramble(length, mulberry32(seed * 97 + length * 7919));
        const scrambled = applyMegaminxScramble(solvedMegaminxState(), turns);
        const { solution } = candidateSearch(scrambled, 12, 1_500_000, ctx, piFInvPowers);
        if (!solution) {
          failedKeys.push(`${tier}#${seed}`);
          continue;
        }
        const replayed = applySeq(scrambled, solution);
        if (isCrossSolved(replayed)) {
          solved++;
        } else {
          falseCount++;
          falseKeys.push(`${tier}#${seed}`);
        }
      }
    }
    const totalMs = performance.now() - t0;
    console.log(`Gate C: solved ${solved}/100 (production baseline: 90/100), false solves = ${falseCount}, total wall ${(totalMs / 1000).toFixed(1)}s`);
    if (falseKeys.length > 0) console.log(`  FALSE SOLVES: ${falseKeys.join(", ")}`);
    console.log(`  failed (not solved): ${failedKeys.join(", ")}`);
    expect(falseCount).toBe(0);
    expect(solved).toBeGreaterThanOrEqual(90);
  }, 900_000);
});

describe("MEGAMINX_SOLVECROSS_BACKWARD_SYMMETRY_CANDIDATE_V1: Gate C2 -- full 100-scramble at maxHalfDepth=13 (symmetry's own value-add depth)", () => {
  it("measures TOTAL completeness with canonicalized-backward + depth13 combined (baseline depth13-without-symmetry was 94/100; this Sprint's own Gate B found 3 MORE rescues among the residual 6 at this depth)", () => {
    const sym = deriveSymmetryTable();
    const ctx = buildConjugationContext(sym);
    const piFInvPowers = buildPiFInvPowers();

    const PLAN: { tier: "easy" | "normal" | "hard"; length: number; count: number }[] = [
      { tier: "easy", length: 15, count: 20 },
      { tier: "normal", length: 40, count: 40 },
      { tier: "hard", length: 70, count: 40 },
    ];

    let solved = 0;
    let falseCount = 0;
    const failedKeys: string[] = [];
    const falseKeys: string[] = [];
    const t0 = performance.now();
    for (const { tier, length, count } of PLAN) {
      for (let seed = 1; seed <= count; seed++) {
        const turns = randomMegaminxScramble(length, mulberry32(seed * 97 + length * 7919));
        const scrambled = applyMegaminxScramble(solvedMegaminxState(), turns);
        const { solution } = candidateSearch(scrambled, 13, 1_500_000, ctx, piFInvPowers);
        if (!solution) {
          failedKeys.push(`${tier}#${seed}`);
          continue;
        }
        const replayed = applySeq(scrambled, solution);
        if (isCrossSolved(replayed)) {
          solved++;
        } else {
          falseCount++;
          falseKeys.push(`${tier}#${seed}`);
        }
      }
    }
    const totalMs = performance.now() - t0;
    console.log(`Gate C2: solved ${solved}/100 at maxHalfDepth=13 with canonicalized backward, false solves = ${falseCount}, total wall ${(totalMs / 1000).toFixed(1)}s`);
    if (falseKeys.length > 0) console.log(`  FALSE SOLVES: ${falseKeys.join(", ")}`);
    console.log(`  failed (not solved): ${failedKeys.join(", ")}`);
    expect(falseCount).toBe(0);
  }, 900_000);
});
