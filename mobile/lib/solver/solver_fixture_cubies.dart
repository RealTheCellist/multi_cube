import 'dart:convert';

import 'package:flutter/services.dart' show rootBundle;

import 'solver_models.dart';

/// Loads REAL cube states captured from the actual production
/// `buildSolvedCube(5)` / `randomLayerScramble(cubies, 5, n)`
/// (cubeState.ts) via `npx tsx` against the real repo -- the same fixture
/// files the superseded native SDK's assets used
/// (ios/PolyPuzzleCube/Resources/CubeFixtures/, copied verbatim into
/// mobile/assets/cube_fixtures/). See SolverFixtureCubies.swift's original
/// comment for why fixtures were chosen over an in-app scramble generator:
/// building one would require porting cubeMath.ts's quarter-turn rotation
/// math into Dart a second time, with no device/simulator in this Sprint
/// to verify it against.
enum CubeFixture {
  solved('solved', 'Solved'),
  easy5('easy_5', 'Easy (5 moves)'),
  light15('light_15', 'Light (15 moves)'),
  medium25('medium_25', 'Medium (25 moves)'),
  hard40('hard_40', 'Hard (40 moves)');

  final String assetName;
  final String label;

  const CubeFixture(this.assetName, this.label);
}

class SolverFixtureCubies {
  static Future<List<SolverCubie>> load(CubeFixture fixture) async {
    final raw = await rootBundle.loadString('assets/cube_fixtures/${fixture.assetName}.json');
    final decoded = jsonDecode(raw) as List<dynamic>;
    return decoded.map((c) => SolverCubie.fromJson(c as Map<String, dynamic>)).toList();
  }
}
