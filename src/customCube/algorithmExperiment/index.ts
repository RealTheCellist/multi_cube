// Algorithm Experiment Framework v1 -- barrel export. Node-only, layered on
// top of ../failureAnalysis (which owns FailureCollector/FailureDatabase/
// Replay). Never modifies the Solver or the Failure Analysis Engine.
export * from "./ExperimentContext";
export * from "./ExperimentResult";
export * from "./ExperimentRegistry";
export * from "./ExperimentRunner";
export * from "./BenchmarkRunner";
export * from "./ExperimentReport";
export * from "./experiments/ExistingSolverExperiment";
export * from "./experiments/EmptyExperiment";
