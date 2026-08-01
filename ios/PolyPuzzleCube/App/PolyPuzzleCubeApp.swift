import SwiftUI

@main
struct PolyPuzzleCubeApp: App {
  // Built once at process launch. If SolverService's init throws (missing
  // bundle resource -- a build misconfiguration, not a runtime condition a
  // user can hit), the app cannot function at all, so this fails fast
  // rather than limping into a broken UI state per screen.
  @StateObject private var container: AppContainer = {
    do {
      return try AppContainer()
    } catch {
      fatalError("AppContainer init failed -- Solver SDK bundle resource missing or corrupt: \(error)")
    }
  }()
  @StateObject private var navigator = AppNavigator()

  var body: some Scene {
    WindowGroup {
      NavigationStack(path: $navigator.path) {
        HomeView()
          .navigationDestination(for: AppRoute.self) { route in
            switch route {
            case .cubeInput:
              CubeInputView()
            case .solve(let draft):
              SolveView(cubeState: draft, solverService: container.solverService)
            case .solution(let result):
              SolutionListView(result: result)
            case .playback(let result):
              PlaybackView(result: result)
            }
          }
      }
      .environmentObject(container)
      .environmentObject(navigator)
    }
  }
}
