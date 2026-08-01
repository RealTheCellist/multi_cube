import 'solver/solver_service.dart';

/// Owns the app's one real dependency, SolverService -- constructor-style
/// setup (an async `create()` factory since SolverService.initialize() is
/// async), matching AppContainer.swift's own "no DI framework, one real
/// dependency" scope in the superseded native app. Exposed to the widget
/// tree via `provider`'s `Provider<AppContainer>.value`, not re-created
/// per screen.
class AppContainer {
  final SolverService solverService;

  AppContainer._(this.solverService);

  static Future<AppContainer> create() async {
    final service = SolverService();
    await service.initialize();
    service.warmup();
    return AppContainer._(service);
  }
}
