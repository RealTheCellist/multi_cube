import Foundation
import PolyPuzzleSolverSDK

/// The Application Layer's own representation of "a cube the user is
/// looking at right now" -- deliberately thin: it wraps exactly the
/// [SolverCubie] the Solver SDK needs, plus a human-readable summary for
/// the Home/CubeInput screens. Kept separate from SolverRequest itself so
/// UI code never has to think about `weights`/`endgameReserveMs` (SDK-level
/// tuning knobs the directive's minimum feature set doesn't expose).
struct CubeStateDraft: Hashable {
  var cubies: [SolverCubie]
  var scrambleLabel: String

  static func solved() -> CubeStateDraft {
    CubeStateDraft(cubies: SolverFixtureCubies.solved(), scrambleLabel: "Solved")
  }
}
