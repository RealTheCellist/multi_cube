// Failure Analysis Engine v1 -- barrel export. Node-only (uses `fs` via
// failureDatabase.ts) -- never import this from the browser bundle.
export * from "./failureTypes";
export * from "./cubeSerialization";
export * from "./slotOrder";
export * from "./failureCollector";
export * from "./failureDatabase";
export * from "./failureCluster";
export * from "./failureStatistics";
export * from "./primitiveCoverage";
export * from "./failureReplay";
export * from "./recommendation";
export * from "./reportGenerator";
export * from "./failureAnalysisEngine";
