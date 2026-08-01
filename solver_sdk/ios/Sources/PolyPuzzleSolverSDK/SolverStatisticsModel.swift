import Foundation

/// UI-facing summary derived from a SolveResult -- exists so SwiftUI views
/// (STEP3) don't each recompute the same aggregates from `trace`/`tasks`.
/// Every field here is a pure derivation of SolveResult; none of it
/// represents new solver behavior.
public struct SolverStatistics: Equatable {
  public var moveCount: Int
  public var taskCount: Int
  public var remainingWrongWingCount: Int
  public var isFullySolved: Bool
  public var deadlineMissed: Bool
  public var solveWallClockMs: Double?

  public init(from result: SolveResult, solveWallClockMs: Double? = nil) {
    self.moveCount = result.moveQueue.count
    self.taskCount = result.tasks.count
    // score is wrongWingCount5's own remaining-count metric (negative sign
    // is the Evaluator's own scoring convention, not a fault marker) -- see
    // SolveResult.isFullySolved's comment for the same fact stated once.
    self.remainingWrongWingCount = abs(result.score)
    self.isFullySolved = result.isFullySolved
    // "budget-exhausted" is the exact trace label fiveByFiveEdgeSolverEngine.ts
    // emits when the outer PLAN_TIME_BUDGET_MS deadline is hit before every
    // planned task completes (see docs/SOLVER_OPERATION_GUIDE.md §6) -- a
    // known, disclosed, non-zero-at-baseline condition, not treated as an
    // error here.
    self.deadlineMissed = result.trace.contains { $0.label == "budget-exhausted" }
    self.solveWallClockMs = solveWallClockMs
  }
}
