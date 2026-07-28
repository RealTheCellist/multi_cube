// --- SetupLengthSearch (Mixed Commutator Design Space Validation Sprint
// v1, RQ-2/RQ-3) ----------------------------------------------------------
// Tests whether LONGER setups (more atomic fragments concatenated before
// the known pattern) reduce footprint further, using the single BEST
// pattern pair PatternPairSearch.ts found (determined empirically, not
// guessed -- see the driver). A full symmetric cross product at setup
// length >= 2 is computationally infeasible (48^2 x 48^2 per case), so
// this is an explicitly disclosed ASYMMETRIC probe: hold one side fixed
// at its own L1-best setup (from PatternPairSearch's own result for this
// case+pair), and sweep the OTHER side across L2 (2304 two-fragment
// concatenations, exhaustive) and a deterministic L3 SAMPLE (2304 of the
// 48^3 = 110592 three-fragment concatenations, picked by a fixed stride
// rule, not randomly) -- tried in both directions (extend A, extend B).
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, slotKey, wrongWingCount5, type Move } from "../fiveByFiveEdges";
import { buildAtomicFragments, type MoveFragment } from "../primitiveDiscovery/PrimitiveSearch";
import { invertSequence } from "../primitiveDiscovery/PrimitiveEvaluator";
import { conjugate } from "./PatternPairSearch";

function countAffectedWings(before: Cubie[], after: Cubie[]): number {
  const beforeSlotById = new Map(before.map((c) => [c.id, slotKey(c)]));
  let affected = 0;
  for (const c of after) if (beforeSlotById.get(c.id) !== slotKey(c)) affected++;
  return affected;
}

export interface SetupOption {
  label: string;
  moves: Move[];
  length: number; // number of atomic fragments composing this setup
}

export function buildSetupOptionsAtLength(level: 1 | 2 | 3): SetupOption[] {
  const fragments: MoveFragment[] = buildAtomicFragments(); // 48, no identity here (identity = level 0, handled separately)
  if (level === 1) {
    return fragments.map((f) => ({ label: f.label, moves: f.moves, length: 1 }));
  }
  if (level === 2) {
    const out: SetupOption[] = [];
    for (const f1 of fragments) {
      for (const f2 of fragments) {
        out.push({ label: `${f1.label}+${f2.label}`, moves: [...f1.moves, ...f2.moves], length: 2 });
      }
    }
    return out; // 48*48 = 2304, exhaustive
  }
  // level 3: deterministic stride sample of 2304 out of 48^3=110592 -- disclosed as a sample, not exhaustive.
  const out: SetupOption[] = [];
  const N = fragments.length;
  for (let i = 0; i < 2304; i++) {
    const i1 = i % N;
    const i2 = (i * 7 + 3) % N;
    const i3 = (i * 13 + 5) % N;
    const f1 = fragments[i1];
    const f2 = fragments[i2];
    const f3 = fragments[i3];
    out.push({ label: `${f1.label}+${f2.label}+${f3.label}`, moves: [...f1.moves, ...f2.moves, ...f3.moves], length: 3 });
  }
  return out;
}

export interface LengthProbeCandidate {
  label: string;
  cycleLength: number;
  extendedSide: "A" | "B";
  extendedLength: number; // 2 or 3
  setupExtendedLabel: string;
  setupFixedLabel: string;
  affectedWingCount: number;
  footprintRatio: number;
  wrongWingBefore: number;
  wrongWingAfter: number;
  moveLength: number;
  improvementScore: number;
}

export interface SetupLengthSearchResult {
  label: string;
  cycleLength: number;
  patternA: string;
  patternB: string;
  attemptsEvaluated: number;
  bestAtLength: { 2: LengthProbeCandidate | null; 3: LengthProbeCandidate | null }; // plain object (not Map) -- JSON-checkpoint-safe
}

/**
 * fixedSetupAMoves/fixedSetupBMoves: the L1-best setup for this case+pair
 * from PatternPairSearch (or IDENTITY -- [] -- if none was improving),
 * used as the "held constant" partner while the other side's setup length
 * is extended to 2 and 3.
 */
export function searchSetupLengths(
  cubies: Cubie[],
  label: string,
  cycleLength: number,
  patternA: string,
  patternB: string,
  knownA: readonly Move[],
  knownB: readonly Move[],
  fixedSetupAMoves: readonly Move[],
  fixedSetupALabel: string,
  fixedSetupBMoves: readonly Move[],
  fixedSetupBLabel: string
): SetupLengthSearchResult {
  const wrongWingBefore = wrongWingCount5(cubies);
  let attemptsEvaluated = 0;
  const bestAtLength: { 2: LengthProbeCandidate | null; 3: LengthProbeCandidate | null } = { 2: null, 3: null };

  function tryOne(setupAMoves: readonly Move[], setupALabel: string, setupBMoves: readonly Move[], setupBLabel: string, extendedSide: "A" | "B", extendedLength: number, extendedLabel: string) {
    attemptsEvaluated++;
    const A = conjugate(setupAMoves, knownA);
    const B = conjugate(setupBMoves, knownB);
    const total: Move[] = [...A, ...B, ...invertSequence(A), ...invertSequence(B)];
    const clone = cloneCubies(cubies);
    applySeq(clone, total);
    const wrongWingAfter = wrongWingCount5(clone);
    if (wrongWingAfter >= wrongWingBefore) return;
    const affectedWingCount = countAffectedWings(cubies, clone);
    const candidate: LengthProbeCandidate = {
      label,
      cycleLength,
      extendedSide,
      extendedLength,
      setupExtendedLabel: extendedLabel,
      setupFixedLabel: extendedSide === "A" ? setupBLabel : setupALabel,
      affectedWingCount,
      footprintRatio: affectedWingCount / cycleLength,
      wrongWingBefore,
      wrongWingAfter,
      moveLength: total.length,
      improvementScore: wrongWingBefore - wrongWingAfter,
    };
    const key = extendedLength as 2 | 3;
    const current = bestAtLength[key];
    if (!current || affectedWingCount < current.affectedWingCount) bestAtLength[key] = candidate;
  }

  for (const level of [2, 3] as const) {
    const options = buildSetupOptionsAtLength(level);
    for (const opt of options) {
      // extend A, hold B fixed at its L1-best
      tryOne(opt.moves, opt.label, fixedSetupBMoves, fixedSetupBLabel, "A", level, opt.label);
      // extend B, hold A fixed at its L1-best
      tryOne(fixedSetupAMoves, fixedSetupALabel, opt.moves, opt.label, "B", level, opt.label);
    }
  }

  return { label, cycleLength, patternA, patternB, attemptsEvaluated, bestAtLength };
}
