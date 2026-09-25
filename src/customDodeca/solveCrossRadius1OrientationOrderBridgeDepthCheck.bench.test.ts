/** Supplementary quick check for the ORIENTATION_ORDER_VALIDATION Sprint report: does the reordered winning candidate's bridgeDepth differ from the original's? (Diagnostic only, not a new gate.) */
import { describe, it, expect } from "vitest";
import { radius1BridgeEarlyExitWasm, radius1BridgeEarlyExitReorderedWasm } from "./megaminxSearchWasm";
import { applyMegaminxScramble, randomMegaminxScramble, solvedMegaminxState, type MegaminxState } from "./megaminxState";
import { mulberry32 } from "./dodecaState";

const TRACKED_PIECES = [0, 1, 2, 3, 4];
const PRODUCTION_CAP = 1_500_000;
const MAX_BRIDGE_DEPTH = 3;
const TIER_LENGTH: Record<string, number> = { easy: 15, normal: 40, hard: 70 };
function scrambledFor(tier: string, seed: number): MegaminxState {
  const length = TIER_LENGTH[tier];
  const turns = randomMegaminxScramble(length, mulberry32(seed * 97 + length * 7919));
  return applyMegaminxScramble(solvedMegaminxState(), turns);
}
const FIXTURES: { key: string; tier: "normal" | "hard"; seed: number }[] = [
  { key: "normal#28", tier: "normal", seed: 28 },
  { key: "hard#6", tier: "hard", seed: 6 },
  { key: "hard#24", tier: "hard", seed: 24 },
  { key: "hard#5", tier: "hard", seed: 5 },
  { key: "hard#31", tier: "hard", seed: 31 },
];

describe("supplementary bridgeDepth check", () => {
  it("prints original vs reordered bridgeDepth per fixture", () => {
    console.log("fixture    | orig index | orig depth | reordered index | reordered depth");
    for (const f of FIXTURES) {
      const scrambled = scrambledFor(f.tier, f.seed);
      const orig = radius1BridgeEarlyExitWasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP, 13, PRODUCTION_CAP, MAX_BRIDGE_DEPTH);
      const reord = radius1BridgeEarlyExitReorderedWasm(scrambled, TRACKED_PIECES, 12, PRODUCTION_CAP, 13, PRODUCTION_CAP, MAX_BRIDGE_DEPTH);
      console.log(`${f.key.padEnd(10)} | ${orig.candidatesScanned.toString().padStart(10)} | ${orig.bridgeDepth.toString().padStart(10)} | ${reord.candidatesScanned.toString().padStart(16)} | ${reord.bridgeDepth.toString().padStart(16)}`);
    }
    expect(true).toBe(true);
  }, 60_000);
});
