import Foundation
import PolyPuzzleSolverSDK

/// Loads REAL cube states captured from the actual production
/// `buildSolvedCube(5)` / `randomLayerScramble(cubies, 5, n)`
/// (cubeState.ts), via `npx tsx` against the real repo, not hand-derived.
///
/// Why fixtures instead of an in-app scramble generator: building one would
/// require porting cubeMath.ts's quarter-turn rotation math
/// (rotateGridVector90 / quarterTurnQuaternion) into Swift a second time --
/// a second, unverified implementation of cube kinematics that could
/// silently diverge from the real one, and this Sprint has no device or
/// simulator to test it against (see docs/IOS_DEPLOYMENT_GUIDE.md). Five
/// real, captured cube states (1 solved + 4 scrambles of increasing
/// difficulty) cover the directive's minimum "Cube 입력" feature honestly;
/// a live in-app scramble generator (or camera-based color capture) is
/// listed as a Known Limitation in docs/IOS_PRODUCT_ARCHITECTURE.md, to be
/// built and verified on an actual macOS+Xcode environment.
enum SolverFixtureCubies {
  enum Fixture: String, CaseIterable {
    case solved
    case easy5 = "easy_5"
    case light15 = "light_15"
    case medium25 = "medium_25"
    case hard40 = "hard_40"

    var label: String {
      switch self {
      case .solved: return "Solved"
      case .easy5: return "Easy (5 moves)"
      case .light15: return "Light (15 moves)"
      case .medium25: return "Medium (25 moves)"
      case .hard40: return "Hard (40 moves)"
      }
    }
  }

  static func solved() -> [SolverCubie] {
    load(.solved)
  }

  static func load(_ fixture: Fixture) -> [SolverCubie] {
    guard let url = Bundle.main.url(forResource: fixture.rawValue, withExtension: "json", subdirectory: "CubeFixtures"),
      let data = try? Data(contentsOf: url),
      let cubies = try? JSONDecoder().decode([SolverCubie].self, from: data)
    else {
      fatalError("CubeFixtures/\(fixture.rawValue).json missing or undecodable")
    }
    return cubies
  }
}
