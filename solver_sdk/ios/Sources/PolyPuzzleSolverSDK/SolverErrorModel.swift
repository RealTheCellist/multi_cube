import Foundation

/// Mirrors SolveBridgeError -- the bridge's own contract is "never throw
/// across the JS/Swift boundary, always return a well-formed JSON object" so
/// SolverService can decode a single discriminated union
/// (SolveBridgeResponse in TS: `{ok:true,...} | {ok:false,errorCode,errorMessage}`)
/// without needing JSContext exception handling on the Swift side at all.
struct SolverBridgeErrorPayload: Codable {
  var ok: Bool
  var errorCode: String?
  var errorMessage: String?
}

/// Swift-native error surface for SolverService callers. Every case maps to
/// something that can concretely happen at this specific bridge boundary --
/// no speculative cases for scenarios the bridge can't produce.
public enum SolverError: Error, LocalizedError, Equatable {
  /// The bridge returned `{ok:false, errorCode:"INVALID_INPUT", ...}` --
  /// e.g. an empty `cubies` array. Mirrors the bridge's own INVALID_INPUT check.
  case invalidInput(message: String)
  /// The bridge returned `{ok:false, errorCode:"SOLVE_THREW", ...}` -- solve()
  /// itself threw. Mirrors the bridge's own catch-all.
  case solveThrew(message: String)
  /// The JSContext failed to evaluate the bundled script at all (e.g. the
  /// resource wasn't bundled correctly) -- a packaging problem, not a solver
  /// problem.
  case bridgeUnavailable(message: String)
  /// The bridge produced a JSON string SolverService could not decode into
  /// SolveResult or SolverBridgeErrorPayload -- a contract mismatch between
  /// this SDK's Swift models and the currently-bundled JS bridge version.
  case malformedResponse(message: String)

  public var errorDescription: String? {
    switch self {
    case .invalidInput(let message): return "Invalid cube input: \(message)"
    case .solveThrew(let message): return "Solver engine threw: \(message)"
    case .bridgeUnavailable(let message): return "Solver bridge unavailable: \(message)"
    case .malformedResponse(let message): return "Malformed solver response: \(message)"
    }
  }

  static func from(_ payload: SolverBridgeErrorPayload) -> SolverError {
    let message = payload.errorMessage ?? "(no message)"
    switch payload.errorCode {
    case "INVALID_INPUT":
      return .invalidInput(message: message)
    default:
      return .solveThrew(message: message)
    }
  }
}
