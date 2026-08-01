import 'solver_models.dart';

/// Mirrors CubeStateDraft.swift's role in the superseded native app: the
/// Application Layer's own thin wrapper around "a cube state the user
/// picked", carrying a human-readable label alongside the SolverCubie list
/// so the Solve screen doesn't need SolverFixtureCubies in scope.
class CubeStateDraft {
  final List<SolverCubie> cubies;
  final String scrambleLabel;

  const CubeStateDraft({required this.cubies, required this.scrambleLabel});
}
