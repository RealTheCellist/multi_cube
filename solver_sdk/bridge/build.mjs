// Bundles PolyPuzzleSolverBridge.ts + the frozen Solver Engine it imports
// into one self-contained, dependency-free JS file with no import/require
// statements left in it -- the format JavaScriptCore's JSContext needs,
// since it has no module resolver.
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

await build({
  entryPoints: [path.join(here, "PolyPuzzleSolverBridge.ts")],
  bundle: true,
  format: "iife",
  target: "es2019",
  platform: "browser",
  outfile: path.join(here, "..", "dist", "PolyPuzzleSolverBridge.bundle.js"),
  logLevel: "info",
});
