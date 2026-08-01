import Foundation
import JavaScriptCore

/// The single entry point SwiftUI (or any Application Layer code) calls to
/// run the Solver Engine. Wraps a JSContext that evaluates
/// PolyPuzzleSolverBridge.bundle.js -- the esbuild output of
/// solver_sdk/bridge/PolyPuzzleSolverBridge.ts, which itself imports
/// FiveByFiveEdgeSolverEngine directly from src/customCube (frozen Baseline
/// V1.0, never modified or reimplemented). This class contains NO solving
/// logic of its own -- it only marshals JSON in, calls the one bridge
/// function, and marshals JSON back out.
///
/// Why JavaScriptCore + a bundled JS file, not a Swift port: rewriting the
/// Solver Engine in Swift would mean re-validating everything the
/// Continuous Validation Framework / Long-term Reliability Validation
/// Sprints already measured against the TypeScript implementation, and
/// would put the iOS app permanently out of sync with any future
/// Maintenance Sprint fix (docs/SOLVER_MAINTENANCE_POLICY.md) unless that
/// fix were manually ported every time. JavaScriptCore ships on every iOS
/// device at zero extra dependency cost and lets the SDK run the exact same
/// bits the web app and every prior Sprint's benchmark ran.
public final class SolverService {
  private let context: JSContext
  private let encoder: JSONEncoder
  private let decoder: JSONDecoder

  /// Throws `.bridgeUnavailable` if the bundled resource is missing or
  /// fails to evaluate -- e.g. a broken app bundle. `bundle` defaults to
  /// `Bundle.module`, the resource bundle Swift Package Manager generates
  /// for this target's `Resources/` folder (declared in Package.swift).
  public init(bundle: Bundle = .module) throws {
    guard let context = JSContext() else {
      throw SolverError.bridgeUnavailable(message: "JSContext() returned nil")
    }
    guard let scriptURL = bundle.url(forResource: "PolyPuzzleSolverBridge.bundle", withExtension: "js") else {
      throw SolverError.bridgeUnavailable(message: "PolyPuzzleSolverBridge.bundle.js not found in bundle resources")
    }
    let script: String
    do {
      script = try String(contentsOf: scriptURL, encoding: .utf8)
    } catch {
      throw SolverError.bridgeUnavailable(message: "failed to read bundle resource: \(error.localizedDescription)")
    }

    var caughtException: JSValue?
    context.exceptionHandler = { _, exception in caughtException = exception }
    context.evaluateScript(script)
    if let caughtException {
      throw SolverError.bridgeUnavailable(message: "bundle evaluation threw: \(caughtException.toString() ?? "(unknown)")")
    }
    guard context.objectForKeyedSubscript("PolyPuzzleSolverBridge")?.isUndefined == false else {
      throw SolverError.bridgeUnavailable(message: "PolyPuzzleSolverBridge global not defined after evaluating bundle")
    }

    self.context = context
    self.encoder = JSONEncoder()
    self.decoder = JSONDecoder()
  }

  /// Pre-builds the Solver Engine's wing/flip/case libraries (mirrors the
  /// web app's own warmup() call site in App.tsx) -- call once at app
  /// launch or when the Solve screen first appears, well before the user
  /// presses Solve, so the ~1.3s cold-build cost documented in
  /// fiveByFiveEdgeSolverEngine.ts doesn't eat into the first real solve's
  /// own 1000ms plan budget.
  public func warmup() {
    context.objectForKeyedSubscript("PolyPuzzleSolverBridge")?.invokeMethod("warmup", withArguments: [])
  }

  /// Runs one solve() call against the frozen Solver Engine.
  ///
  /// Timing note (disclosed, not a defect -- see
  /// docs/IOS_PRODUCT_ARCHITECTURE.md §Bridge Verification): solve() is a
  /// wall-clock time-budgeted algorithm (PLAN_TIME_BUDGET_MS=1000ms,
  /// hardcoded, see docs/SOLVER_BASELINE_V1.md). Its OUTPUT for a given
  /// input can therefore vary between two otherwise-identical calls if the
  /// host CPU's real execution speed differs -- this was already
  /// established and disclosed for the web app itself in
  /// docs/SOLVER_LONG_TERM_RELIABILITY_VALIDATION.md's Determinism
  /// Analysis. This SDK does not change or hide that property: on-device
  /// JavaScriptCore performance (not measured in this Sprint -- no
  /// physical device or simulator was available in this Sprint's Linux
  /// container) determines exactly how much of a hard scramble's plan
  /// completes within the same 1000ms window, same as it does for any
  /// other host.
  public func solve(_ request: SolverRequest) throws -> SolveResult {
    guard let bridge = context.objectForKeyedSubscript("PolyPuzzleSolverBridge"),
      !bridge.isUndefined
    else {
      throw SolverError.bridgeUnavailable(message: "PolyPuzzleSolverBridge global missing at call time")
    }

    let requestData: Data
    do {
      requestData = try encoder.encode(request)
    } catch {
      throw SolverError.malformedResponse(message: "failed to encode SolverRequest: \(error.localizedDescription)")
    }
    guard let requestJson = String(data: requestData, encoding: .utf8) else {
      throw SolverError.malformedResponse(message: "SolverRequest JSON was not valid UTF-8")
    }

    var caughtException: JSValue?
    context.exceptionHandler = { _, exception in caughtException = exception }
    guard let responseValue = bridge.invokeMethod("solve", withArguments: [requestJson]),
      let responseJson = responseValue.toString()
    else {
      let detail = caughtException?.toString() ?? "(no exception captured, no return value)"
      throw SolverError.bridgeUnavailable(message: "PolyPuzzleSolverBridge.solve() call failed: \(detail)")
    }

    guard let responseData = responseJson.data(using: .utf8) else {
      throw SolverError.malformedResponse(message: "bridge response was not valid UTF-8")
    }

    // The bridge's own contract (PolyPuzzleSolverBridge.ts's solveBridge())
    // is `{ok:true,...} | {ok:false,errorCode,errorMessage}` -- decode the
    // discriminator first via the lightweight error-shaped struct, then
    // decode the full SolveResult only on the success path, rather than
    // guessing from which decode succeeds.
    guard let okFlag = try? decoder.decode(OkFlagOnly.self, from: responseData) else {
      throw SolverError.malformedResponse(message: "response JSON had no decodable `ok` field: \(responseJson.prefix(200))")
    }
    if !okFlag.ok {
      guard let errorPayload = try? decoder.decode(SolverBridgeErrorPayload.self, from: responseData) else {
        throw SolverError.malformedResponse(message: "ok:false response did not match SolverBridgeErrorPayload: \(responseJson.prefix(200))")
      }
      throw SolverError.from(errorPayload)
    }
    do {
      return try decoder.decode(SolveResult.self, from: responseData)
    } catch {
      throw SolverError.malformedResponse(message: "ok:true response did not match SolveResult: \(error.localizedDescription)")
    }
  }
}

private struct OkFlagOnly: Codable {
  var ok: Bool
}
