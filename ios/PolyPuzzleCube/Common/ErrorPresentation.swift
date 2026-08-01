import SwiftUI

/// Shared "something failed" banner, used by every feature screen that
/// calls SolverService directly (CubeInput's warmup, Solve's solve()) --
/// STEP2's "Error Handling" concern, kept as one small reusable view rather
/// than each screen inventing its own error UI.
struct ErrorBanner: View {
  let message: String

  var body: some View {
    Text(message)
      .font(.footnote)
      .foregroundStyle(.white)
      .padding(8)
      .frame(maxWidth: .infinity, alignment: .leading)
      .background(Color.red.opacity(0.85))
      .clipShape(RoundedRectangle(cornerRadius: 8))
  }
}
