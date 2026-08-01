import SwiftUI
import PolyPuzzleSolverSDK

/// STEP3 "Playback" screen -- Step Navigation (the directive's minimum
/// feature) through result.moveQueue. Shows the move token textually
/// (e.g. "x layer 2 sign +1") rather than a 3D cube render -- see
/// PlaybackViewModel's own doc comment for why a renderer is out of scope
/// this Sprint.
struct PlaybackView: View {
  @StateObject private var viewModel: PlaybackViewModel
  let result: SolveResult

  init(result: SolveResult) {
    self.result = result
    _viewModel = StateObject(wrappedValue: PlaybackViewModel(result: result))
  }

  var body: some View {
    VStack(spacing: 24) {
      Spacer()
      Text("Move \(viewModel.currentIndex) / \(result.moveQueue.count)")
        .font(.headline)

      if let move = viewModel.currentMove {
        Text(moveLabel(move))
          .font(.system(.largeTitle, design: .monospaced))
      } else {
        Text("End of solution")
          .font(.title3)
          .foregroundStyle(.secondary)
      }

      HStack(spacing: 32) {
        Button {
          viewModel.stepBackward()
        } label: {
          Image(systemName: "chevron.left.circle.fill").font(.system(size: 44))
        }
        .disabled(viewModel.isAtStart)

        Button {
          viewModel.reset()
        } label: {
          Image(systemName: "arrow.counterclockwise.circle").font(.system(size: 36))
        }

        Button {
          viewModel.stepForward()
        } label: {
          Image(systemName: "chevron.right.circle.fill").font(.system(size: 44))
        }
        .disabled(viewModel.isAtEnd)
      }
      Spacer()
    }
    .navigationTitle("Playback")
  }

  private func moveLabel(_ move: SolverMove) -> String {
    let signSymbol = move.sign == 1 ? "+" : "-"
    return "\(move.axis)\(move.layer)\(signSymbol)"
  }
}
