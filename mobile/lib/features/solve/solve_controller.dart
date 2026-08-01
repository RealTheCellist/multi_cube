import 'package:flutter/foundation.dart';

import '../../solver/solver_models.dart';
import '../../solver/solver_service.dart';

enum SolveStatus { solving, solved, failed }

/// Owns the (synchronous, CPU-bound) call into SolverService.solve() and
/// its resulting state -- same role as SolveViewModel.swift in the
/// superseded native app.
class SolveController extends ChangeNotifier {
  final SolverService _solverService;

  SolveStatus status = SolveStatus.solving;
  SolveResult? result;
  SolverException? error;

  SolveController(this._solverService);

  /// Known Limitation (see docs/FLUTTER_DECISION_REVISION.md, unlike the
  /// superseded native SolveViewModel.swift's Task.detached, which ran the
  /// equivalent JSContext call off the main thread): this runs on Flutter's
  /// main isolate, not a background isolate. `compute()` requires a
  /// top-level/static function and an isolate-transferable argument, but
  /// SolverService holds a flutter_js JavascriptRuntime -- a native engine
  /// handle -- which cannot cross an isolate boundary. For the CPU-bound
  /// ~1000ms PLAN_TIME_BUDGET_MS window, this means the UI thread is
  /// blocked for the duration of one solve() call. Not measured on a real
  /// device in this Sprint; if that proves visibly janky, a future Sprint
  /// would need to move the JS runtime itself into a background isolate
  /// (or a platform channel to a background thread) to fix it properly.
  Future<void> solve(List<SolverCubie> cubies) async {
    status = SolveStatus.solving;
    notifyListeners();
    try {
      final request = SolverRequest(cubies: cubies);
      final solveResult = _solverService.solve(request);
      status = SolveStatus.solved;
      result = solveResult;
    } on SolverException catch (e) {
      status = SolveStatus.failed;
      error = e;
    }
    notifyListeners();
  }
}
