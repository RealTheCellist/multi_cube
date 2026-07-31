// --- PrimitiveRegistry (Solver Primitive Discovery Sprint #5 --
// Unresolved Mechanism Validation Sprint v1, shared) -------------------------
// Uniform (cubies, lib, deadline) -> Move[]|null wrapper over every real,
// already-implemented Primitive prototype in this codebase, unmodified.
// Directive's own example names (REPAIR/CCR/Multi-Hop Bridge/Mixed
// Commutator/SETUP/DISRUPT) don't map 1:1 onto real code -- disclosed:
// "SETUP"/"DISRUPT" describe scheduling/ordering concepts in the
// production Recovery dispatcher (fiveByFiveEdgeRecovery.ts, not
// modified/read here beyond citation), not standalone Primitives with
// their own Gate+Search Contract, so there is no "try<X>" entry point for
// them to test the same way. This registry instead uses the 6 real,
// independently-callable Primitive prototypes this whole arc has actually
// built: Deep Cycle(BP-1)/CCR/Multi-Hop Bridge/Conflict-Breaking
// Sacrifice/Parity-Cycle Specialist(BP-2)/Mixed Commutator -- matching
// Blueprint Attribution Refinement Sprint v1's own 6-Blueprint roster plus
// Mixed Commutator (built later in this arc, never assigned a Blueprint
// slot but real and callable).
import type { Cubie } from "../cubeState";
import type { Move, WingLibrary } from "../fiveByFiveEdges";
import { tryBoundedMultiCycleResolver } from "../solverV2Prototype/BoundedResolver";
import { runCCRPrototype } from "../solverPrimitiveCCRPrototype/CCRPrototype";
import { tryMultiHopBridge } from "../solverPrimitivePrototype/MultiHopBridgePrototype";
import { tryConflictDominantSacrifice } from "../solverPrimitivePrototype/ConflictDominantSacrificePrototype";
import { tryParityAwareCycleBreaker } from "../solverV2PrototypeBP2/ParityAwareResolver";
import { tryAdaptiveCycleCommutator } from "../moveRepresentationPrototype/AdaptiveCycleCommutatorPrototype";

export type PrimitiveName = "DeepCycle(BP-1)" | "CCR" | "MultiHopBridge" | "ConflictBreakingSacrifice" | "ParityCycleSpecialist(BP-2)" | "MixedCommutator";

export const PRIMITIVE_NAMES: PrimitiveName[] = ["DeepCycle(BP-1)", "CCR", "MultiHopBridge", "ConflictBreakingSacrifice", "ParityCycleSpecialist(BP-2)", "MixedCommutator"];

type PrimitiveFn = (cubies: Cubie[], lib: WingLibrary, deadline: number) => Move[] | null;

export const PRIMITIVE_REGISTRY: Record<PrimitiveName, PrimitiveFn> = {
  "DeepCycle(BP-1)": tryBoundedMultiCycleResolver,
  CCR: (cubies, lib, deadline) => runCCRPrototype(cubies, lib, deadline).moves,
  MultiHopBridge: (cubies, lib, deadline) => tryMultiHopBridge(cubies, lib, deadline).moves,
  ConflictBreakingSacrifice: (cubies, lib, deadline) => tryConflictDominantSacrifice(cubies, lib, deadline).moves,
  "ParityCycleSpecialist(BP-2)": tryParityAwareCycleBreaker,
  MixedCommutator: tryAdaptiveCycleCommutator,
};
