import Foundation

/// Mirrors SolveBridgeMove. `axis`/`layer`/`sign` together are exactly one
/// entry of the frozen `Move = readonly [Axis, number, 1 | -1]` tuple type
/// (fiveByFiveEdges.ts) -- flattened to named fields here only because JSON
/// round-trips tuples awkwardly, not because the semantics changed.
public struct SolverMove: Codable, Equatable, Hashable {
  public var axis: String // "x" | "y" | "z"
  public var layer: Int
  public var sign: Int // 1 or -1
}

/// Mirrors SolveBridgeTask, itself a flattened SolveTask
/// (fiveByFiveEdgeSolverTypes.ts). `type` is one of "PAIR"/"FLIP"/"PARITY"/"ENDGAME".
public struct SolverTask: Codable, Equatable, Hashable {
  public var id: Int
  public var type: String
  public var taskDescription: String
  public var targetEdge: Int
  public var score: Int

  enum CodingKeys: String, CodingKey {
    case id, type, targetEdge, score
    case taskDescription = "description"
  }
}

/// Mirrors SolveBridgeTrace / TraceEntry -- every decision the Solver Engine
/// made while building the plan, per fiveByFiveEdgeSolverEngine.ts's own
/// "every choice must be reproducible from this log alone" contract (see
/// its getTrace() doc comment). Never filtered or summarized by the SDK --
/// the UI decides what to show.
public struct SolverTraceEntry: Codable, Equatable, Hashable {
  public var at: Double
  public var label: String
  public var detail: String?
}

/// Mirrors SolveBridgeResponse's success case. A `SolveResult` is exactly
/// one SolvePlan (fiveByFiveEdgeSolverTypes.ts), reshaped for JSON.
public struct SolveResult: Codable, Equatable, Hashable {
  public var stateHash: Double
  public var score: Int
  public var createdAt: Double
  public var tasks: [SolverTask]
  public var moveQueue: [SolverMove]
  public var trace: [SolverTraceEntry]

  /// True iff wrongWingCount reached 0 before the plan's own outer deadline
  /// -- score == 0 is the Solver Engine's own definition of "fully solved"
  /// (see fiveByFiveEdgeSolverEngine.ts's SolvePlan.score doc comment: "score
  /// reflects exactly how much was actually resolved"). Derived, not
  /// duplicated logic -- there is no separate "isSolved" flag on the wire.
  public var isFullySolved: Bool { score == 0 }
}
