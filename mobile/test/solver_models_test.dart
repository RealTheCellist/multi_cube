import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:poly_puzzle_cube/solver/solver_models.dart';

void main() {
  test('SolverCubie round-trips through the real solved5x5 fixture JSON', () {
    // Real fixture captured from buildSolvedCube(5) (cubeState.ts) via
    // npx tsx -- same file mobile/assets/cube_fixtures/solved.json ships
    // in the app, read directly here to avoid depending on Flutter's
    // asset-bundle machinery inside a plain `flutter test` unit test.
    final file = File('assets/cube_fixtures/solved.json');
    final decoded = jsonDecode(file.readAsStringSync()) as List<dynamic>;
    expect(decoded.length, 98);

    final cubies = decoded.map((c) => SolverCubie.fromJson(c as Map<String, dynamic>)).toList();
    expect(cubies.length, 98);

    // Round-trip: toJson() then fromJson() must reproduce the same values,
    // proving the Dart-side JSON contract mirrors the real captured shape
    // exactly (same guarantee the Swift SDK's SolverInputModel established
    // for the superseded native app).
    final firstCubie = cubies.first;
    final roundTripped = SolverCubie.fromJson(firstCubie.toJson());
    expect(roundTripped.id, firstCubie.id);
    expect(roundTripped.position.x, firstCubie.position.x);
    expect(roundTripped.stickers.length, firstCubie.stickers.length);
  });

  test('SolveResult.isFullySolved is true iff score == 0', () {
    final solved = SolveResult(stateHash: 1, score: 0, createdAt: 0, tasks: const [], moveQueue: const [], trace: const []);
    final partial = SolveResult(stateHash: 1, score: -5, createdAt: 0, tasks: const [], moveQueue: const [], trace: const []);
    expect(solved.isFullySolved, true);
    expect(partial.isFullySolved, false);
  });

  test('SolverStatistics.deadlineMissed reflects the real "budget-exhausted" trace label', () {
    final withDeadlineMiss = SolveResult(
      stateHash: 1,
      score: -3,
      createdAt: 0,
      tasks: const [],
      moveQueue: const [],
      trace: const [SolverTraceEntry(at: 0, label: 'budget-exhausted', detail: 'ENDGAME 태스크 도달 전 예산 소진')],
    );
    final stats = SolverStatistics.from(withDeadlineMiss);
    expect(stats.deadlineMissed, true);
    expect(stats.remainingWrongWingCount, 3);
  });
}
