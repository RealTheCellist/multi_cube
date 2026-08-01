import SwiftUI
import PolyPuzzleSolverSDK

/// STEP3 "Cube 입력" screen. Presents SolverFixtureCubies.Fixture as a
/// picker rather than a live scramble button -- see
/// SolverFixtureCubies.swift's own comment for why (no verified in-app
/// scramble geometry in this Sprint). Selecting a fixture and tapping
/// "Solve" pushes .solve(cubeState:), matching the directive's
/// Home -> Cube Input -> Solve flow.
struct CubeInputView: View {
  @EnvironmentObject private var navigator: AppNavigator
  @State private var selected: SolverFixtureCubies.Fixture = .medium25

  var body: some View {
    VStack(spacing: 20) {
      Text("Choose a cube state")
        .font(.headline)
        .padding(.top, 24)

      Picker("Cube state", selection: $selected) {
        ForEach(SolverFixtureCubies.Fixture.allCases, id: \.self) { fixture in
          Text(fixture.label).tag(fixture)
        }
      }
      .pickerStyle(.wheel)

      Button {
        let draft = CubeStateDraft(cubies: SolverFixtureCubies.load(selected), scrambleLabel: selected.label)
        navigator.push(.solve(cubeState: draft))
      } label: {
        Text("Solve")
          .font(.headline)
          .frame(maxWidth: .infinity)
          .padding()
      }
      .buttonStyle(.borderedProminent)
      .padding(.horizontal, 32)

      Spacer()
    }
    .navigationTitle("Cube Input")
  }
}
