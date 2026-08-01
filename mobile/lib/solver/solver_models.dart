// Mirrors the JSON contract of solver_sdk/bridge/PolyPuzzleSolverBridge.ts
// exactly (field names must match for jsonEncode/jsonDecode to interop with
// the bridge's own JSON.parse/JSON.stringify). This is the Dart-side
// counterpart of solver_sdk/ios/Sources/PolyPuzzleSolverSDK/
// SolverInputModel.swift / SolverOutputModel.swift, kept as a 1:1 mirror
// for the same reason those were: it's a wire-format struct, not a
// reshaping of the Solver Engine's own types.

class SolverVec3 {
  final double x;
  final double y;
  final double z;

  const SolverVec3({required this.x, required this.y, required this.z});

  factory SolverVec3.fromJson(Map<String, dynamic> json) =>
      SolverVec3(x: (json['x'] as num).toDouble(), y: (json['y'] as num).toDouble(), z: (json['z'] as num).toDouble());

  Map<String, dynamic> toJson() => {'x': x, 'y': y, 'z': z};
}

class SolverQuat {
  final double x;
  final double y;
  final double z;
  final double w;

  const SolverQuat({required this.x, required this.y, required this.z, required this.w});

  factory SolverQuat.fromJson(Map<String, dynamic> json) => SolverQuat(
    x: (json['x'] as num).toDouble(),
    y: (json['y'] as num).toDouble(),
    z: (json['z'] as num).toDouble(),
    w: (json['w'] as num).toDouble(),
  );

  Map<String, dynamic> toJson() => {'x': x, 'y': y, 'z': z, 'w': w};
}

class SolverSticker {
  final SolverVec3 direction;
  final String color; // one of "U"/"D"/"L"/"R"/"F"/"B" (Face in cubeState.ts)

  const SolverSticker({required this.direction, required this.color});

  factory SolverSticker.fromJson(Map<String, dynamic> json) =>
      SolverSticker(direction: SolverVec3.fromJson(json['direction'] as Map<String, dynamic>), color: json['color'] as String);

  Map<String, dynamic> toJson() => {'direction': direction.toJson(), 'color': color};
}

class SolverCubie {
  final int id;
  final SolverVec3 originalPosition;
  final SolverVec3 position;
  final SolverQuat orientation;
  final List<SolverSticker> stickers;

  const SolverCubie({
    required this.id,
    required this.originalPosition,
    required this.position,
    required this.orientation,
    required this.stickers,
  });

  factory SolverCubie.fromJson(Map<String, dynamic> json) => SolverCubie(
    id: json['id'] as int,
    originalPosition: SolverVec3.fromJson(json['originalPosition'] as Map<String, dynamic>),
    position: SolverVec3.fromJson(json['position'] as Map<String, dynamic>),
    orientation: SolverQuat.fromJson(json['orientation'] as Map<String, dynamic>),
    stickers: (json['stickers'] as List<dynamic>).map((s) => SolverSticker.fromJson(s as Map<String, dynamic>)).toList(),
  );

  Map<String, dynamic> toJson() => {
    'id': id,
    'originalPosition': originalPosition.toJson(),
    'position': position.toJson(),
    'orientation': orientation.toJson(),
    'stickers': stickers.map((s) => s.toJson()).toList(),
  };
}

/// Mirrors SolveBridgeRequest. `endgameReserveMs`/`recoveryReserveMsOverride`
/// default to null, matching solve()'s own optional-parameter defaults --
/// omitting them reproduces current production behavior exactly.
class SolverRequest {
  final List<SolverCubie> cubies;
  final Map<String, double>? weights;
  final double? endgameReserveMs;
  final double? recoveryReserveMsOverride;

  const SolverRequest({required this.cubies, this.weights, this.endgameReserveMs, this.recoveryReserveMsOverride});

  Map<String, dynamic> toJson() => {
    'cubies': cubies.map((c) => c.toJson()).toList(),
    if (weights != null) 'weights': weights,
    if (endgameReserveMs != null) 'endgameReserveMs': endgameReserveMs,
    if (recoveryReserveMsOverride != null) 'recoveryReserveMsOverride': recoveryReserveMsOverride,
  };
}

class SolverMove {
  final String axis; // "x" | "y" | "z"
  final int layer;
  final int sign; // 1 or -1

  const SolverMove({required this.axis, required this.layer, required this.sign});

  factory SolverMove.fromJson(Map<String, dynamic> json) =>
      SolverMove(axis: json['axis'] as String, layer: json['layer'] as int, sign: json['sign'] as int);
}

class SolverTask {
  final int id;
  final String type;
  final String taskDescription;
  final int targetEdge;
  final int score;

  const SolverTask({required this.id, required this.type, required this.taskDescription, required this.targetEdge, required this.score});

  factory SolverTask.fromJson(Map<String, dynamic> json) => SolverTask(
    id: json['id'] as int,
    type: json['type'] as String,
    taskDescription: json['description'] as String,
    targetEdge: json['targetEdge'] as int,
    score: json['score'] as int,
  );
}

class SolverTraceEntry {
  final double at;
  final String label;
  final String? detail;

  const SolverTraceEntry({required this.at, required this.label, this.detail});

  factory SolverTraceEntry.fromJson(Map<String, dynamic> json) =>
      SolverTraceEntry(at: (json['at'] as num).toDouble(), label: json['label'] as String, detail: json['detail'] as String?);
}

/// Mirrors SolveBridgeResponse's success case -- exactly one SolvePlan
/// (fiveByFiveEdgeSolverTypes.ts), reshaped for JSON.
class SolveResult {
  final double stateHash;
  final int score;
  final double createdAt;
  final List<SolverTask> tasks;
  final List<SolverMove> moveQueue;
  final List<SolverTraceEntry> trace;

  const SolveResult({
    required this.stateHash,
    required this.score,
    required this.createdAt,
    required this.tasks,
    required this.moveQueue,
    required this.trace,
  });

  /// score == 0 is the Solver Engine's own definition of "fully solved" --
  /// see SolvePlan.score's doc comment in fiveByFiveEdgeSolverEngine.ts.
  bool get isFullySolved => score == 0;

  factory SolveResult.fromJson(Map<String, dynamic> json) => SolveResult(
    stateHash: (json['stateHash'] as num).toDouble(),
    score: json['score'] as int,
    createdAt: (json['createdAt'] as num).toDouble(),
    tasks: (json['tasks'] as List<dynamic>).map((t) => SolverTask.fromJson(t as Map<String, dynamic>)).toList(),
    moveQueue: (json['moveQueue'] as List<dynamic>).map((m) => SolverMove.fromJson(m as Map<String, dynamic>)).toList(),
    trace: (json['trace'] as List<dynamic>).map((t) => SolverTraceEntry.fromJson(t as Map<String, dynamic>)).toList(),
  );
}

/// UI-facing summary derived from a SolveResult -- pure derivation, same
/// role as SolverStatisticsModel.swift in the (now superseded) native SDK.
class SolverStatistics {
  final int moveCount;
  final int taskCount;
  final int remainingWrongWingCount;
  final bool isFullySolved;
  final bool deadlineMissed;

  const SolverStatistics({
    required this.moveCount,
    required this.taskCount,
    required this.remainingWrongWingCount,
    required this.isFullySolved,
    required this.deadlineMissed,
  });

  factory SolverStatistics.from(SolveResult result) => SolverStatistics(
    moveCount: result.moveQueue.length,
    taskCount: result.tasks.length,
    remainingWrongWingCount: result.score.abs(),
    isFullySolved: result.isFullySolved,
    // "budget-exhausted" is the exact trace label
    // fiveByFiveEdgeSolverEngine.ts emits when PLAN_TIME_BUDGET_MS is hit
    // before every task completes -- a known, disclosed condition, not an
    // error (see docs/SOLVER_OPERATION_GUIDE.md §6).
    deadlineMissed: result.trace.any((t) => t.label == 'budget-exhausted'),
  );
}

/// Thrown by SolverService -- every case maps to something the bridge can
/// concretely produce (see PolyPuzzleSolverBridge.ts's own SolveBridgeError
/// contract), no speculative cases.
class SolverException implements Exception {
  final String code;
  final String message;

  const SolverException(this.code, this.message);

  @override
  String toString() => 'SolverException($code): $message';
}
