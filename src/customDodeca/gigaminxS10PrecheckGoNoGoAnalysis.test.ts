// GIGAMINX_S10 go/no-go pre-analysis -- before building any precheck
// architecture, answer: "is there a BFS-independent structural necessary
// condition for compound-finish success, computable from the commutator
// library alone?" This dumps each orbit's actual achievable commutator
// support-length set (bySize.keys()). Combined with tryCompoundFinishWings/
// EdgeBridges/CenterBridges' own subset-size loop (size = wrongPieces.length-1
// downto 2) and tryExactFinish<Orbit>'s own `matchingEntries.length===0`
// early-return, this directly tells us which wrongPiecesLen values are
// mathematically guaranteed to fail (zero risk, not a heuristic) -- see the
// S10 pre-analysis report for the full derivation and its cross-check against
// S9.3's real trajectory data.
import { describe, it } from "vitest";
import { __dev } from "./gigaminxSolver";

const { wingCommutators, edgeBridgeCommutators, centerBridgeCommutators } = __dev as any;

describe("GIGAMINX_S10_PRECHECK_GO_NO_GO_ANALYSIS", () => {
  it(
    "dumps each orbit's achievable commutator support-length set (the basis of the guaranteed-fail precheck)",
    () => {
      for (const [name, fn] of [
        ["wing", wingCommutators],
        ["edgeBridge", edgeBridgeCommutators],
        ["centerBridge", centerBridgeCommutators],
      ] as const) {
        const comms = fn();
        const bySize = new Map<number, number>();
        for (const c of comms) bySize.set(c.support.length, (bySize.get(c.support.length) ?? 0) + 1);
        const sizes = [...bySize.keys()].sort((a, b) => a - b);
        console.log(`S10_SUPPORT_SIZES orbit=${name} total=${comms.length} sizes=${JSON.stringify(sizes)} counts=${JSON.stringify(sizes.map((s) => bySize.get(s)))}`);
      }
    },
    600_000,
  );
});
