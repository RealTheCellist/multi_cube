import 'package:flutter/material.dart';

import '../../navigation/app_routes.dart';
import '../../solver/solver_models.dart';

/// Solution screen -- Solution List (the directive's minimum feature):
/// summary statistics + task list, with a button into Playback. Same role
/// as the superseded native SolutionListView.swift.
class SolutionScreen extends StatelessWidget {
  final SolveResult result;

  const SolutionScreen({super.key, required this.result});

  @override
  Widget build(BuildContext context) {
    final stats = SolverStatistics.from(result);
    return Scaffold(
      appBar: AppBar(title: const Text('Solution')),
      body: ListView(
        children: [
          ListTile(title: const Text('Status'), trailing: Text(stats.isFullySolved ? 'Fully solved' : 'Partial')),
          ListTile(title: const Text('Moves'), trailing: Text('${stats.moveCount}')),
          ListTile(title: const Text('Tasks'), trailing: Text('${stats.taskCount}')),
          ListTile(title: const Text('Remaining wrong wings'), trailing: Text('${stats.remainingWrongWingCount}')),
          if (stats.deadlineMissed)
            const ListTile(title: Text('Note'), trailing: Text('Time budget reached before every task finished')),
          const Divider(),
          const Padding(padding: EdgeInsets.all(16), child: Text('Tasks', style: TextStyle(fontWeight: FontWeight.bold))),
          ...result.tasks.map(
            (task) => ListTile(
              title: Text('${task.type} — ${task.taskDescription}'),
              subtitle: Text('targetEdge=${task.targetEdge}, score=${task.score}'),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(24),
            child: FilledButton(
              onPressed: () => Navigator.of(context).pushNamed(AppRoutes.playback, arguments: result),
              child: const Text('Step-by-step Playback'),
            ),
          ),
        ],
      ),
    );
  }
}
