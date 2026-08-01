import 'package:flutter/material.dart';

import '../../solver/solver_models.dart';
import 'playback_controller.dart';

/// Playback screen -- Step Navigation (the directive's minimum feature)
/// through result.moveQueue. Shows each move as text, same scope decision
/// as the superseded native PlaybackView.swift.
class PlaybackScreen extends StatefulWidget {
  final SolveResult result;

  const PlaybackScreen({super.key, required this.result});

  @override
  State<PlaybackScreen> createState() => _PlaybackScreenState();
}

class _PlaybackScreenState extends State<PlaybackScreen> {
  late final PlaybackController _controller;

  @override
  void initState() {
    super.initState();
    _controller = PlaybackController(widget.result);
    _controller.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  String _moveLabel(SolverMove move) {
    final signSymbol = move.sign == 1 ? '+' : '-';
    return '${move.axis}${move.layer}$signSymbol';
  }

  @override
  Widget build(BuildContext context) {
    final move = _controller.currentMove;
    return Scaffold(
      appBar: AppBar(title: const Text('Playback')),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text('Move ${_controller.currentIndex} / ${widget.result.moveQueue.length}', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 24),
            Text(
              move != null ? _moveLabel(move) : 'End of solution',
              style: const TextStyle(fontSize: 40, fontFamily: 'monospace'),
            ),
            const SizedBox(height: 32),
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                IconButton(
                  iconSize: 44,
                  onPressed: _controller.isAtStart ? null : _controller.stepBackward,
                  icon: const Icon(Icons.arrow_circle_left),
                ),
                const SizedBox(width: 24),
                IconButton(iconSize: 36, onPressed: _controller.reset, icon: const Icon(Icons.restart_alt)),
                const SizedBox(width: 24),
                IconButton(
                  iconSize: 44,
                  onPressed: _controller.isAtEnd ? null : _controller.stepForward,
                  icon: const Icon(Icons.arrow_circle_right),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
