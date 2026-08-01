import SwiftUI

/// Home -> Cube Input is the whole of the Home screen's job per the
/// directive's minimum flow -- deliberately not more than that.
struct HomeView: View {
  @EnvironmentObject private var navigator: AppNavigator

  var body: some View {
    VStack(spacing: 24) {
      Spacer()
      Text("Poly Puzzle")
        .font(.largeTitle.bold())
      Text("5x5 Cube Solver")
        .font(.title3)
        .foregroundStyle(.secondary)
      Spacer()
      Button {
        navigator.push(.cubeInput)
      } label: {
        Text("Start")
          .font(.headline)
          .frame(maxWidth: .infinity)
          .padding()
      }
      .buttonStyle(.borderedProminent)
      .padding(.horizontal, 32)
      Spacer()
    }
    .navigationTitle("Poly Puzzle")
  }
}
