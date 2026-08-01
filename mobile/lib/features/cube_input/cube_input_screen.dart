import 'package:flutter/material.dart';

import '../../navigation/app_routes.dart';
import '../../solver/cube_state_draft.dart';
import '../../solver/solver_fixture_cubies.dart';

/// Cube Input screen -- fixture picker, same design choice and rationale
/// as the superseded native CubeInputView.swift: 5 real, pre-captured cube
/// states rather than a live scramble generator (see
/// SolverFixtureCubies.dart's own comment).
class CubeInputScreen extends StatefulWidget {
  const CubeInputScreen({super.key});

  @override
  State<CubeInputScreen> createState() => _CubeInputScreenState();
}

class _CubeInputScreenState extends State<CubeInputScreen> {
  CubeFixture _selected = CubeFixture.medium25;
  bool _loading = false;

  Future<void> _onSolvePressed() async {
    setState(() => _loading = true);
    final cubies = await SolverFixtureCubies.load(_selected);
    if (!mounted) return;
    setState(() => _loading = false);
    final draft = CubeStateDraft(cubies: cubies, scrambleLabel: _selected.label);
    Navigator.of(context).pushNamed(AppRoutes.solve, arguments: draft);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Cube Input')),
      body: Column(
        children: [
          const Padding(padding: EdgeInsets.all(24), child: Text('Choose a cube state', style: TextStyle(fontSize: 18))),
          Expanded(
            child: RadioGroup<CubeFixture>(
              groupValue: _selected,
              onChanged: (v) => setState(() => _selected = v!),
              child: ListView(
                children: CubeFixture.values
                    .map((fixture) => RadioListTile<CubeFixture>(title: Text(fixture.label), value: fixture))
                    .toList(),
              ),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(24),
            child: FilledButton(
              onPressed: _loading ? null : _onSolvePressed,
              child: Padding(
                padding: const EdgeInsets.symmetric(vertical: 12),
                child: _loading ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Solve'),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
