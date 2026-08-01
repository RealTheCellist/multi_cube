import Foundation
import PolyPuzzleSolverSDK

/// Minimal, explicit dependency-injection container (constructor injection,
/// no DI framework) -- the directive's STEP2 calls for "DI" without naming
/// a framework, and this app has exactly one real dependency worth
/// injecting (SolverService), so a framework would be pure overhead.
@MainActor
final class AppContainer: ObservableObject {
  let solverService: SolverService

  /// Throws only if the bundled JS bridge resource is missing/corrupt --
  /// see SolverService.init's own doc comment. A production app should
  /// treat that as fatal at launch (it means the app was built wrong), not
  /// something to recover from per-screen.
  init() throws {
    self.solverService = try SolverService()
    self.solverService.warmup()
  }
}
