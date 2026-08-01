import 'dart:convert';

import 'package:flutter/services.dart' show rootBundle;
import 'package:flutter_js/flutter_js.dart';

import 'solver_models.dart';

/// The single entry point the app calls to run the Solver Engine. Wraps a
/// `flutter_js` JavascriptRuntime that evaluates
/// assets/js/PolyPuzzleSolverBridge.bundle.js -- the exact same esbuild
/// output solver_sdk/bridge/build.mjs produces from
/// PolyPuzzleSolverBridge.ts, which itself imports
/// FiveByFiveEdgeSolverEngine directly from src/customCube (frozen
/// Baseline V1.0, never modified). This class contains NO solving logic --
/// it only marshals JSON in, calls the bridge's one function, marshals
/// JSON back out.
///
/// `flutter_js` runs JavaScriptCore on iOS/macOS and QuickJS (via FFI) on
/// Android/Linux/Windows -- one plugin abstraction instead of a
/// per-platform native SDK, which is why this Sprint's Flutter pivot
/// doesn't need an iOS-specific Swift SDK layer the way the previous
/// (superseded) native attempt did. Both platforms still run the identical
/// bundled JS, so the "never reimplement the Solver Engine" guarantee from
/// docs/IOS_PRODUCT_ARCHITECTURE.md's original architecture decision holds
/// unchanged.
class SolverService {
  late final JavascriptRuntime _runtime;
  bool _bridgeReady = false;

  /// Loads and evaluates the bundle. Must be called once (e.g. in main())
  /// before solve()/warmup() -- throws SolverException('BRIDGE_UNAVAILABLE', ...)
  /// if the asset is missing or evaluation fails, mirroring
  /// SolverService.init's own failure mode in the superseded Swift SDK.
  Future<void> initialize() async {
    final bundleSource = await rootBundle.loadString('assets/js/PolyPuzzleSolverBridge.bundle.js');
    _runtime = getJavascriptRuntime();
    final result = _runtime.evaluate(bundleSource, sourceUrl: 'PolyPuzzleSolverBridge.bundle.js');
    if (result.isError) {
      throw SolverException('BRIDGE_UNAVAILABLE', 'bundle evaluation threw: ${result.stringResult}');
    }
    final probe = _runtime.evaluate('typeof PolyPuzzleSolverBridge');
    if (probe.stringResult != 'object') {
      throw SolverException('BRIDGE_UNAVAILABLE', 'PolyPuzzleSolverBridge global not defined after evaluating bundle');
    }
    _bridgeReady = true;
  }

  /// Pre-builds the Solver Engine's wing/flip/case libraries (mirrors the
  /// web app's own warmup() call site) -- call once, well before the first
  /// solve(), per fiveByFiveEdgeSolverEngine.ts's own warmup doc comment.
  void warmup() {
    _requireReady();
    _runtime.evaluate('PolyPuzzleSolverBridge.warmup();');
  }

  /// Runs one solve() call against the frozen Solver Engine.
  ///
  /// Timing note (disclosed, not a defect -- see
  /// docs/IOS_PRODUCT_ARCHITECTURE.md §Bridge Verification, unchanged by
  /// this Flutter pivot): solve() is wall-clock time-budgeted
  /// (PLAN_TIME_BUDGET_MS=1000ms). Its output for a given input can vary
  /// between calls if the host CPU's real execution speed differs --
  /// already established for the web app itself in
  /// docs/SOLVER_LONG_TERM_RELIABILITY_VALIDATION.md's Determinism
  /// Analysis. QuickJS-on-Android's real throughput vs.
  /// JavaScriptCore-on-iOS's was not measured in this Sprint (no device or
  /// simulator available) -- see docs/IOS_DEPLOYMENT_GUIDE.md.
  SolveResult solve(SolverRequest request) {
    _requireReady();
    final requestJson = jsonEncode(request.toJson());
    // jsonEncode(requestJson) below produces a properly escaped JS string
    // literal (JSON string escaping is a strict subset of JS string
    // literal escaping), stored on a throwaway global first rather than
    // interpolated inline, to keep the call expression itself simple and
    // avoid any ambiguity from nested quoting.
    _runtime.evaluate('globalThis.__solverRequestJson = ${jsonEncode(requestJson)};');
    final result = _runtime.evaluate('PolyPuzzleSolverBridge.solve(globalThis.__solverRequestJson);');
    if (result.isError) {
      throw SolverException('BRIDGE_UNAVAILABLE', 'PolyPuzzleSolverBridge.solve() call failed: ${result.stringResult}');
    }

    late final Map<String, dynamic> responseMap;
    try {
      responseMap = jsonDecode(result.stringResult) as Map<String, dynamic>;
    } catch (e) {
      throw SolverException('MALFORMED_RESPONSE', 'response JSON did not decode: $e');
    }

    // The bridge's own contract (PolyPuzzleSolverBridge.ts's solveBridge())
    // is `{ok:true,...} | {ok:false,errorCode,errorMessage}`.
    if (responseMap['ok'] != true) {
      final code = responseMap['errorCode'] as String? ?? 'UNKNOWN';
      final message = responseMap['errorMessage'] as String? ?? '(no message)';
      throw SolverException(code, message);
    }

    try {
      return SolveResult.fromJson(responseMap);
    } catch (e) {
      throw SolverException('MALFORMED_RESPONSE', 'ok:true response did not match SolveResult: $e');
    }
  }

  void _requireReady() {
    if (!_bridgeReady) {
      throw const SolverException('BRIDGE_UNAVAILABLE', 'SolverService.initialize() was not called or failed');
    }
  }

  void dispose() {
    if (_bridgeReady) {
      _runtime.dispose();
    }
  }
}
