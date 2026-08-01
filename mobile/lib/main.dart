import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'app_container.dart';
import 'navigation/app_routes.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Built once at process launch, same fail-fast rationale as
  // PolyPuzzleCubeApp.swift's own @StateObject init in the superseded
  // native app: if this throws (missing/corrupt bundled JS asset -- a
  // build misconfiguration, not a runtime condition a user can hit), the
  // app cannot function at all.
  final container = await AppContainer.create();
  runApp(PolyPuzzleCubeApp(container: container));
}

class PolyPuzzleCubeApp extends StatelessWidget {
  final AppContainer container;

  const PolyPuzzleCubeApp({super.key, required this.container});

  @override
  Widget build(BuildContext context) {
    return Provider<AppContainer>.value(
      value: container,
      child: MaterialApp(
        title: 'Poly Puzzle',
        theme: ThemeData(colorSchemeSeed: Colors.deepPurple, useMaterial3: true),
        initialRoute: AppRoutes.home,
        onGenerateRoute: AppRoutes.onGenerateRoute,
      ),
    );
  }
}
