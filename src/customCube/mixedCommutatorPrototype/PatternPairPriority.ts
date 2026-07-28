// --- PatternPairPriority (Mixed Commutator Prototype Sprint v1) -----------
// A real Primitive operates under a deadline far shorter than the
// exhaustive research sweep (14406 attempts across 6 pattern pairs took
// ~7-10s unbounded in Mixed Commutator Design Space Validation Sprint
// v1's own offline script) -- so which pair is tried FIRST materially
// affects what a deadline-bounded search actually finds. This order is
// fixed BEFORE running any evaluation, disclosed here, and derived
// directly from that Sprint's own measured Pattern Pair Rows (not
// re-tuned after seeing this Sprint's own results):
//   1. BASE_ALG+FLIP_ALG   -- found the single best result in the whole
//      design space (footprintRatio=1.60), the only pair that beat 2.0.
//   2. PARITY_ALG+PARITY_ALG -- lowest avgAffectedWingCount (14.33) among
//      pairs with any success.
//   3. FLIP_ALG+FLIP_ALG  -- highest casesWithSuccess (9/28).
//   4. BASE_ALG+BASE_ALG  -- moderate (4/28, avgAffectedWingCount 17.75).
//   5. FLIP_ALG+PARITY_ALG -- weak (1/28).
//   6. BASE_ALG+PARITY_ALG -- 0/28 success, tried last.
export const PATTERN_PAIR_PRIORITY: readonly [string, string][] = [
  ["BASE_ALG", "FLIP_ALG"],
  ["PARITY_ALG", "PARITY_ALG"],
  ["FLIP_ALG", "FLIP_ALG"],
  ["BASE_ALG", "BASE_ALG"],
  ["FLIP_ALG", "PARITY_ALG"],
  ["BASE_ALG", "PARITY_ALG"],
];
