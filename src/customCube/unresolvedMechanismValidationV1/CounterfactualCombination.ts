// --- CounterfactualCombination (Solver Primitive Discovery Sprint #5 --
// Unresolved Mechanism Validation Sprint v1, STEP3) --------------------------
// Directive: "각 Primitive를 독립적으로 제거 또는 강제 적용하여 기존
// Primitive 조합으로 해결 가능한지 확인한다." Operationalized as: for every
// ordered pair (A, B) where A already produced SOME move sequence in
// STEP2 (even a non-improving one -- a "setup" move a combination might
// still need), apply A's real moves first, then run B FRESH on the
// resulting state. Reuses each Primitive's own real function (via
// PrimitiveRegistry, unmodified) -- this file only composes two already-
// real calls sequentially, it invents no new move-generation logic.
//
// Distinguishes two residual categories per the Directive's own list:
//   COMBINATION -- B did NOT match on the ORIGINAL raw state at all, but
//     DOES match/improve after A's moves ran first (A's moves created a
//     structural opportunity B's own Gate didn't see before).
//   ORDERING -- B already matched/improved on the original raw state by
//     itself, but the (A,B) vs (B,A) order changes whether the case gets
//     fully solved -- i.e. not a missing mechanism, a scheduling question.
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, wrongWingCount5, type WingLibrary } from "../fiveByFiveEdges";
import { PRIMITIVE_NAMES, PRIMITIVE_REGISTRY, type PrimitiveName } from "./PrimitiveRegistry";
import type { CaseAttribution } from "./ExistingPrimitiveAttribution";
import type { UnresolvedCase } from "./UnresolvedHoleCollection";

const DEADLINE_MS = 400;

export interface ComboResult {
  first: PrimitiveName;
  second: PrimitiveName;
  solvedByCombo: boolean;
  improvedByCombo: boolean; // strictly better final wrongWingCount than before this combo ran
  secondMatchedOriginally: boolean; // did `second` alone match on the raw, unmodified case?
  classification: "COMBINATION" | "ORDERING";
}

export interface CaseCombinationResult {
  label: string;
  wrongWingBefore: number;
  combosTried: number;
  bestCombo: ComboResult | null; // solved first if any, else best net-improvement
  anySolved: boolean;
  anyImproved: boolean;
}

function runCombo(cubies: Cubie[], lib: WingLibrary, first: PrimitiveName, second: PrimitiveName, firstMoves: readonly import("../fiveByFiveEdges").Move[], secondMatchedOriginally: boolean, wrongWingBefore: number): ComboResult {
  const afterFirst = cloneCubies(cubies);
  applySeq(afterFirst, firstMoves as import("../fiveByFiveEdges").Move[]);

  const secondMoves = PRIMITIVE_REGISTRY[second](cloneCubies(afterFirst), lib, Date.now() + DEADLINE_MS);
  let solvedByCombo = false;
  let improvedByCombo = false;
  if (secondMoves) {
    const final = cloneCubies(afterFirst);
    applySeq(final, secondMoves);
    const finalWrongWing = wrongWingCount5(final);
    solvedByCombo = finalWrongWing === 0;
    improvedByCombo = finalWrongWing < wrongWingBefore;
  }

  const classification: "COMBINATION" | "ORDERING" = secondMatchedOriginally ? "ORDERING" : "COMBINATION";
  return { first, second, solvedByCombo, improvedByCombo, secondMatchedOriginally, classification };
}

export function tryCombinationsForCase(uc: UnresolvedCase, attribution: CaseAttribution, lib: WingLibrary): CaseCombinationResult {
  const wrongWingBefore = attribution.wrongWingBefore;
  const results: ComboResult[] = [];

  for (const first of PRIMITIVE_NAMES) {
    const firstAttempt = attribution.attempts[first];
    if (!firstAttempt.matched || !firstAttempt.moves) continue; // nothing to apply as a "setup" step
    for (const second of PRIMITIVE_NAMES) {
      if (second === first) continue;
      const secondMatchedOriginally = attribution.attempts[second].matched;
      results.push(runCombo(uc.hole.cubies, lib, first, second, firstAttempt.moves, secondMatchedOriginally, wrongWingBefore));
    }
  }

  const solved = results.filter((r) => r.solvedByCombo);
  const improved = results.filter((r) => r.improvedByCombo);
  const bestCombo = solved[0] ?? improved[0] ?? null;

  return { label: uc.label, wrongWingBefore, combosTried: results.length, bestCombo, anySolved: solved.length > 0, anyImproved: improved.length > 0 };
}

export function tryCombinationsForAllCases(cases: readonly UnresolvedCase[], attributions: readonly CaseAttribution[], lib: WingLibrary): CaseCombinationResult[] {
  const attributionByLabel = new Map(attributions.map((a) => [a.label, a]));
  return cases.map((uc) => tryCombinationsForCase(uc, attributionByLabel.get(uc.label)!, lib));
}
