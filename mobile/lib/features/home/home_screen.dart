import 'package:flutter/material.dart';

import '../../navigation/app_routes.dart';

/// Home -> Cube Input is the whole of the Home screen's job, matching the
/// directive's minimum flow exactly (same scope as the superseded native
/// HomeView.swift).
class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Poly Puzzle')),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Text('Poly Puzzle', style: TextStyle(fontSize: 32, fontWeight: FontWeight.bold)),
            const SizedBox(height: 8),
            Text('5x5 Cube Solver', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 32),
            FilledButton(
              onPressed: () => Navigator.of(context).pushNamed(AppRoutes.cubeInput),
              child: const Padding(padding: EdgeInsets.symmetric(horizontal: 32, vertical: 12), child: Text('Start')),
            ),
          ],
        ),
      ),
    );
  }
}
