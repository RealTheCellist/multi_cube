import SwiftUI
import PolyPuzzleSolverSDK

/// STEP3 "Solve" screen -- Progress 표시 (the directive's minimum feature)
/// while SolverService.solve() runs, then auto-advances to Solution.
///
/// SolveViewModel is built directly in `init`, not lazily from
/// @EnvironmentObject -- PolyPuzzleCubeApp's `navigationDestination(for:)`
/// closure has `container` in scope (it sits inside the
/// `.environmentObject(container)` subtree), so it constructs the concrete
/// SolverService reference and passes it straight into SolveView's own
/// initializer. This avoids SwiftUI's well-known "@EnvironmentObject is
/// unavailable inside init" limitation without an Optional/box workaround.
struct SolveView: View {
  @EnvironmentObject private var navigator: AppNavigator
  @StateObject private var viewModel: SolveViewModel
  let cubeState: CubeStateDraft

  init(cubeState: CubeStateDraft, solverService: SolverService) {
    self.cubeState = cubeState
    _viewModel = StateObject(wrappedValue: SolveViewModel(solverService: solverService, cubeState: cubeState))
  }

  var body: some View {
    VStack(spacing: 20) {
      Spacer()
      switch viewModel.state {
      case .idle, .solving:
        ProgressView("Solving \(cubeState.scrambleLabel)...")
          .progressViewStyle(.circular)
      case .solved(let result):
        Text(result.isFullySolved ? "Solved!" : "Partial plan found")
          .font(.title2.bold())
      case .failed(let error):
        ErrorBanner(message: error.errorDescription ?? "Unknown error")
      }
      Spacer()
    }
    .navigationTitle("Solving")
    .navigationBarBackButtonHidden(isSolving)
    .task { viewModel.solve() }
    .onChange(of: solvedResult) { _, newResult in
      if let newResult {
        navigator.push(.solution(result: newResult))
      }
    }
  }

  private var isSolving: Bool {
    if case .solving = viewModel.state { return true }
    return false
  }

  private var solvedResult: SolveResult? {
    if case .solved(let result) = viewModel.state { return result }
    return nil
  }
}
