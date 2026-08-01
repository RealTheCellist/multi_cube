import 'package:flutter/material.dart';

import '../features/cube_input/cube_input_screen.dart';
import '../features/home/home_screen.dart';
import '../features/playback/playback_screen.dart';
import '../features/solution/solution_screen.dart';
import '../features/solve/solve_screen.dart';
import '../solver/cube_state_draft.dart';
import '../solver/solver_models.dart';

/// Named-route constants + a generateRoute function -- Flutter's
/// Navigator 1.0 imperative push/pop, matching AppNavigator.swift's own
/// role in the superseded native app (a thin push/pop wrapper, no routing
/// framework beyond what the task needs).
class AppRoutes {
  static const home = '/';
  static const cubeInput = '/cube-input';
  static const solve = '/solve';
  static const solution = '/solution';
  static const playback = '/playback';

  static Route<dynamic> onGenerateRoute(RouteSettings settings) {
    switch (settings.name) {
      case home:
        return MaterialPageRoute(builder: (_) => const HomeScreen());
      case cubeInput:
        return MaterialPageRoute(builder: (_) => const CubeInputScreen());
      case solve:
        final draft = settings.arguments as CubeStateDraft;
        return MaterialPageRoute(builder: (_) => SolveScreen(cubeState: draft));
      case solution:
        final result = settings.arguments as SolveResult;
        return MaterialPageRoute(builder: (_) => SolutionScreen(result: result));
      case playback:
        final result = settings.arguments as SolveResult;
        return MaterialPageRoute(builder: (_) => PlaybackScreen(result: result));
      default:
        return MaterialPageRoute(builder: (_) => const HomeScreen());
    }
  }
}
