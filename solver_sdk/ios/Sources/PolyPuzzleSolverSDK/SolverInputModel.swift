import Foundation

/// Mirrors JsonVec3 in solver_sdk/bridge/PolyPuzzleSolverBridge.ts exactly --
/// field names must match for JSONEncoder/JSONDecoder to interoperate with
/// the bridge's JSON.parse/JSON.stringify on the JS side.
public struct SolverVec3: Codable, Equatable, Hashable {
  public var x: Double
  public var y: Double
  public var z: Double

  public init(x: Double, y: Double, z: Double) {
    self.x = x
    self.y = y
    self.z = z
  }
}

/// Mirrors JsonQuat.
public struct SolverQuat: Codable, Equatable, Hashable {
  public var x: Double
  public var y: Double
  public var z: Double
  public var w: Double

  public init(x: Double, y: Double, z: Double, w: Double) {
    self.x = x
    self.y = y
    self.z = z
    self.w = w
  }
}

/// Mirrors JsonSticker. `color` is one of "U"/"D"/"L"/"R"/"F"/"B" (Face in
/// cubeState.ts) -- kept as a plain String rather than a Swift enum so an
/// unrecognized value never fails to decode; SolverService validates it
/// against SolverFace's known cases where it matters.
public struct SolverSticker: Codable, Equatable, Hashable {
  public var direction: SolverVec3
  public var color: String

  public init(direction: SolverVec3, color: String) {
    self.direction = direction
    self.color = color
  }
}

/// Mirrors JsonCubie -- the on-the-wire representation of one Cubie. The
/// Solver Engine itself (fiveByFiveEdgeSolverEngine.ts, frozen/protected)
/// never changes; this struct exists only to get a Cubie's fields across the
/// JS bridge as JSON, so it must stay a 1:1 mirror of JsonCubie, not a
/// "nicer" Swift-native reshaping of it.
public struct SolverCubie: Codable, Equatable, Hashable {
  public var id: Int
  public var originalPosition: SolverVec3
  public var position: SolverVec3
  public var orientation: SolverQuat
  public var stickers: [SolverSticker]

  public init(id: Int, originalPosition: SolverVec3, position: SolverVec3, orientation: SolverQuat, stickers: [SolverSticker]) {
    self.id = id
    self.originalPosition = originalPosition
    self.position = position
    self.orientation = orientation
    self.stickers = stickers
  }
}

/// Optional per-solve weight overrides. Mirrors EvaluatorWeights
/// (fiveByFiveEdgeEvaluator.ts) loosely as an open dictionary rather than a
/// fixed struct, since EvaluatorWeights' own field set belongs to the
/// (protected) Evaluator and must not be hardcoded a second time here --
/// nil (the SDK default) reproduces exactly the same behavior as omitting
/// `weights` from a direct TS solve() call.
public typealias SolverEvaluatorWeights = [String: Double]

/// Mirrors SolveBridgeRequest. `endgameReserveMs` / `recoveryReserveMsOverride`
/// default to nil, matching solve()'s own optional-parameter defaults --
/// passing nil here reproduces current production behavior exactly, per
/// fiveByFiveEdgeSolverEngine.ts's own doc comments on those two parameters.
public struct SolverRequest: Codable {
  public var cubies: [SolverCubie]
  public var weights: SolverEvaluatorWeights?
  public var endgameReserveMs: Double?
  public var recoveryReserveMsOverride: Double?

  public init(
    cubies: [SolverCubie],
    weights: SolverEvaluatorWeights? = nil,
    endgameReserveMs: Double? = nil,
    recoveryReserveMsOverride: Double? = nil
  ) {
    self.cubies = cubies
    self.weights = weights
    self.endgameReserveMs = endgameReserveMs
    self.recoveryReserveMsOverride = recoveryReserveMsOverride
  }
}
