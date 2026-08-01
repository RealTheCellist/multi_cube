import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../app_container.dart';
import '../../navigation/app_routes.dart';
import '../../solver/cube_state_draft.dart';
import 'solve_controller.dart';

/// Solve screen -- Progress 표시 (the directive's minimum feature) while
/// SolverService.solve() runs, then auto-advances to Solution. Same role
/// as the superseded native SolveView.swift.
class SolveScreen extends StatefulWidget {
  final CubeStateDraft cubeState;

  const SolveScreen({super.key, required this.cubeState});

  @override
  State<SolveScreen> createState() => _SolveScreenState();
}

class _SolveScreenState extends State<SolveScreen> {
  late final SolveController _controller;

  @override
  void initState() {
    super.initState();
    final container = Provider.of<AppContainer>(context, listen: false);
    _controller = SolveController(container.solverService);
    _controller.addListener(_onControllerChanged);
    _controller.solve(widget.cubeState.cubies);
  }

  void _onControllerChanged() {
    if (_controller.status == SolveStatus.solved) {
      Navigator.of(context).pushReplacementNamed(AppRoutes.solution, arguments: _controller.result);
    } else {
      setState(() {});
    }
  }

  @override
  void dispose() {
    _controller.removeListener(_onControllerChanged);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Solving'), automaticallyImplyLeading: false),
      body: Center(
        child: _controller.status == SolveStatus.failed
            ? Padding(
                padding: const EdgeInsets.all(24),
                child: Text(
                  _controller.error?.message ?? 'Unknown error',
                  style: const TextStyle(color: Colors.red),
                  textAlign: TextAlign.center,
                ),
              )
            : Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  const CircularProgressIndicator(),
                  const SizedBox(height: 16),
                  Text('Solving ${widget.cubeState.scrambleLabel}...'),
                ],
              ),
      ),
    );
  }
}
