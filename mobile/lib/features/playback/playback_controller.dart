import 'package:flutter/foundation.dart';

import '../../solver/solver_models.dart';

/// Owns "which move are we looking at" -- pure index bookkeeping over
/// result.moveQueue, same role and same scope limitation as
/// PlaybackViewModel.swift in the superseded native app: no cube-rendering
/// logic (see docs/IOS_PRODUCT_ARCHITECTURE.md's original Known
/// Limitations, unchanged by this Flutter pivot).
class PlaybackController extends ChangeNotifier {
  final SolveResult result;
  int currentIndex = 0;

  PlaybackController(this.result);

  SolverMove? get currentMove => currentIndex < result.moveQueue.length ? result.moveQueue[currentIndex] : null;

  bool get isAtStart => currentIndex == 0;
  bool get isAtEnd => currentIndex >= result.moveQueue.length;

  void stepForward() {
    if (isAtEnd) return;
    currentIndex++;
    notifyListeners();
  }

  void stepBackward() {
    if (isAtStart) return;
    currentIndex--;
    notifyListeners();
  }

  void reset() {
    currentIndex = 0;
    notifyListeners();
  }
}
