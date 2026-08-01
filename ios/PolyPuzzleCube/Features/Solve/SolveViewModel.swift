import Foundation
import PolyPuzzleSolverSDK

/// Owns the async call into SolverService.solve() and its resulting state
/// machine (idle -> solving -> solved/failed) -- kept separate from
/// SolveView per MVVM so the view stays declarative-only.
@MainActor
final class SolveViewModel: ObservableObject {
  enum State {
    case idle
    case solving
    case solved(SolveResult)
    case failed(SolverError)
  }

  @Published private(set) var state: State = .idle

  private let solverService: SolverService
  private let cubeState: CubeStateDraft

  init(solverService: SolverService, cubeState: CubeStateDraft) {
    self.solverService = solverService
    self.cubeState = cubeState
  }

  func solve() {
    state = .solving
    // solve() itself is synchronous and CPU-bound (real work happens inside
    // the ~1000ms PLAN_TIME_BUDGET_MS window, see SolverService.solve's own
    // timing-note doc comment) -- dispatched off the main actor so SwiftUI
    // keeps rendering the "solving..." state instead of freezing for up to
    // ~1s.
    Task.detached(priority: .userInitiated) { [solverService, cubeState] in
      let request = SolverRequest(cubies: cubeState.cubies)
      do {
        let result = try solverService.solve(request)
        await MainActor.run { self.state = .solved(result) }
      } catch let error as SolverError {
        await MainActor.run { self.state = .failed(error) }
      } catch {
        await MainActor.run { self.state = .failed(.malformedResponse(message: error.localizedDescription)) }
      }
    }
  }
}
