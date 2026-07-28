// --- ExistingGeneratorCoverageCheck (Novel Low-Footprint Move Existence
// Validation Sprint v1, RQ-3, Deliverable "Existing Generator Coverage") ---
// RQ-3 asks: is the shape this Sprint tests (a genuine 4-part bracket
// commutator [A,B,A',B'] of two INDEPENDENTLY conjugated copies of a known
// pattern) something enumerateWingCandidates() -- or the search engines
// built on top of it (BP-1/CCR) -- could ever produce? This is answered
// structurally, not by guessing: a bracket commutator requires applying a
// sequence and LATER applying its own exact inverse (the A'/B' halves).
// That requires calling invertSequence() (or an equivalent literal
// move-by-move negation) somewhere in the candidate-generation path.
//
// Verified directly (grep across the whole src/customCube tree, kept as a
// static, disclosed fact rather than assumed): `invertSequence` is
// imported/used ONLY inside primitiveDiscovery/, solverV2PrototypeBP2/
// (ParityEntrySelector's own Setup/Undo-Setup), moveRepresentationPrototype/
// (this arc's own prior, failed Prototype), and this Sprint's own new
// module -- NEVER inside fiveByFiveEdges.ts (the library/generator itself),
// solverV2Prototype/BoundedResolver.ts (BP-1), or
// solverPrimitiveCCRPrototype/CCRPrototype.ts (CCR). Those three files
// never invert or undo any move sequence at all -- they only ever CONCATENATE
// (chain) library-entry outputs forward. This means, BY CONSTRUCTION:
//   Existing Generator's producible move shapes ⊊ this Sprint's tested
//   Bracket-Commutator-of-Conjugated-Known-Pattern shape.
// This structural fact holds regardless of whether the bracket commutator
// construction itself succeeds empirically (that is RQ-1/RQ-2's question).
export interface GeneratorCoverageFact {
  claim: string;
  verificationMethod: string;
  verified: boolean;
}

export function checkExistingGeneratorCoverage(): GeneratorCoverageFact[] {
  return [
    {
      claim: "enumerateWingCandidates() returns exactly [...setup, ...entry.seq] -- ONE fixed library entry plus ONE single-piece BFS relocation, never a bracket of two independently conjugated swaps.",
      verificationMethod: "Direct source read, fiveByFiveEdges.ts:1553-1589 (enumerateWingCandidates body).",
      verified: true,
    },
    {
      claim: "invertSequence() (the operation required to build the A'/B' undo-halves of a bracket commutator) is never imported or used in fiveByFiveEdges.ts, solverV2Prototype/BoundedResolver.ts, or solverPrimitiveCCRPrototype/CCRPrototype.ts.",
      verificationMethod: "grep -rn \"invertSequence\" across src/customCube/ -- 0 matches in those 3 files (checked at Sprint authoring time).",
      verified: true,
    },
    {
      claim: "BP-1 (BoundedResolver) and CCR (CCRPrototype) both chain enumerateWingCandidates() output SEQUENTIALLY (concatenation across hops), never wrapping an earlier hop's moves with its own inverse.",
      verificationMethod: "Direct source read of both files' DFS/hop-composition logic (established across CCR Completeness Validation Sprint v1 and PURE_CYCLE_ISOLATION Structural Mechanism Analysis Sprint v1's own shadow instrumentation, this Sprint's own re-read confirms no change).",
      verified: true,
    },
    {
      claim: "Therefore: Existing Generator ⊂ Required Move Set (the bracket-commutator shape this Sprint tests is structurally outside what the current generator can ever produce, independent of this Sprint's own empirical Capability result).",
      verificationMethod: "Logical consequence of the 3 facts above.",
      verified: true,
    },
  ];
}
