import Foundation

@testable import PolyPuzzleSolverSDK

/// Loads Fixtures/solved5x5.json -- a REAL dump of
/// `buildSolvedCube(5)` (cubeState.ts), captured via
/// `npx tsx` against the actual production code, not hand-written. Keeping
/// this as a captured fixture rather than a hand-derived Swift geometry
/// routine avoids introducing a second, unverified implementation of the
/// solved-cube layout that could silently drift from cubeState.ts's own.
enum SolverFixtures {
  static func solvedFiveByFiveCubies() -> [SolverCubie] {
    guard let url = Bundle.module.url(forResource: "solved5x5", withExtension: "json"),
      let data = try? Data(contentsOf: url),
      let cubies = try? JSONDecoder().decode([SolverCubie].self, from: data)
    else {
      fatalError("Fixtures/solved5x5.json missing or undecodable")
    }
    return cubies
  }
}
