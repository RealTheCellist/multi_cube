import SwiftUI
import PolyPuzzleSolverSDK

/// STEP3 "Solution" screen -- Solution List (the directive's minimum
/// feature): the plan's tasks and summary statistics, with a button into
/// Playback (Step Navigation).
struct SolutionListView: View {
  @EnvironmentObject private var navigator: AppNavigator
  let result: SolveResult

  private var statistics: SolverStatistics {
    SolverStatistics(from: result)
  }

  var body: some View {
    List {
      Section("Summary") {
        LabeledContent("Status", value: statistics.isFullySolved ? "Fully solved" : "Partial")
        LabeledContent("Moves", value: "\(statistics.moveCount)")
        LabeledContent("Tasks", value: "\(statistics.taskCount)")
        LabeledContent("Remaining wrong wings", value: "\(statistics.remainingWrongWingCount)")
        if statistics.deadlineMissed {
          LabeledContent("Note", value: "Time budget reached before every task finished")
        }
      }
      Section("Tasks") {
        ForEach(result.tasks, id: \.id) { task in
          VStack(alignment: .leading) {
            Text("\(task.type) — \(task.taskDescription)")
              .font(.subheadline)
            Text("targetEdge=\(task.targetEdge), score=\(task.score)")
              .font(.caption)
              .foregroundStyle(.secondary)
          }
        }
      }
      Section {
        Button {
          navigator.push(.playback(result: result))
        } label: {
          Text("Step-by-step Playback")
            .frame(maxWidth: .infinity)
        }
      }
    }
    .navigationTitle("Solution")
  }
}
