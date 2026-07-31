// --- ExistingPrimitiveAttribution (Solver Primitive Discovery Sprint #5
// -- Unresolved Mechanism Validation Sprint v1, STEP2) -----------------------
// For each unresolved hole, runs EVERY real Primitive in PrimitiveRegistry.ts
// independently (multiple attributions allowed per the Directive --
// "복수 Attribution 허용") and records whether it matches (produces ANY
// move sequence at all, even a non-improving one -- a "setup" move a
// combination might still need) and whether it net-improves alone.
import { cloneCubies, type Cubie } from "../cubeState";
import { applySeq, wrongWingCount5, type Move, type WingLibrary } from "../fiveByFiveEdges";
import { PRIMITIVE_NAMES, PRIMITIVE_REGISTRY, type PrimitiveName } from "./PrimitiveRegistry";
import type { UnresolvedCase } from "./UnresolvedHoleCollection";

const DEADLINE_MS = 400;

export interface PrimitiveAttempt {
  matched: boolean; // produced ANY move sequence
  moves: Move[] | null;
  improvedAlone: boolean; // net-improves this case on its own
  solvedAlone: boolean; // fully solves (wrongWingCount reaches 0) on its own
}

export interface CaseAttribution {
  label: string;
  sourceBlueprint: string;
  wrongWingBefore: number;
  attempts: Record<PrimitiveName, PrimitiveAttempt>;
  anyMatched: boolean;
  anyImprovedAlone: boolean;
}

export function attemptPrimitive(name: PrimitiveName, cubies: Cubie[], lib: WingLibrary, deadlineMs: number = DEADLINE_MS): PrimitiveAttempt {
  const working = cloneCubies(cubies);
  const before = wrongWingCount5(working);
  const moves = PRIMITIVE_REGISTRY[name](working, lib, Date.now() + deadlineMs);
  if (!moves) return { matched: false, moves: null, improvedAlone: false, solvedAlone: false };

  const after = cloneCubies(working);
  applySeq(after, moves);
  const wrongWingAfter = wrongWingCount5(after);
  return { matched: true, moves, improvedAlone: wrongWingAfter < before, solvedAlone: wrongWingAfter === 0 };
}

export function attributeCase(uc: UnresolvedCase, lib: WingLibrary): CaseAttribution {
  const wrongWingBefore = wrongWingCount5(uc.hole.cubies);
  const attempts = {} as Record<PrimitiveName, PrimitiveAttempt>;
  for (const name of PRIMITIVE_NAMES) attempts[name] = attemptPrimitive(name, uc.hole.cubies, lib);

  return {
    label: uc.label,
    sourceBlueprint: uc.sourceBlueprint,
    wrongWingBefore,
    attempts,
    anyMatched: PRIMITIVE_NAMES.some((n) => attempts[n].matched),
    anyImprovedAlone: PRIMITIVE_NAMES.some((n) => attempts[n].improvedAlone),
  };
}

export function attributeAllCases(cases: readonly UnresolvedCase[], lib: WingLibrary): CaseAttribution[] {
  return cases.map((uc) => attributeCase(uc, lib));
}
