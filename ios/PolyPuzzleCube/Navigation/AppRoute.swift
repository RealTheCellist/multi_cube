import Foundation

/// The app's whole navigation graph as a flat, hashable enum -- matches the
/// directive's Home -> Cube Input -> Solve -> Solution -> Playback flow.
/// A single `NavigationStack(path:)` in PolyPuzzleCubeApp.swift is driven by
/// an array of these, per Apple's own recommended NavigationStack pattern
/// for state-driven (not just push/pop) navigation.
enum AppRoute: Hashable {
  case cubeInput
  case solve(cubeState: CubeStateDraft)
  case solution(result: SolveResult)
  case playback(result: SolveResult)
}
