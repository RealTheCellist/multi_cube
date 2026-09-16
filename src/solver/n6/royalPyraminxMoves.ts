// AUTO-DERIVED, do not hand-edit the constant tables below -- see the
// generation note at the bottom of this file for how to regenerate them.
//
// N=6 (Royal Pyraminx) piece-level move tables. Each move permutes 4 piece
// orbits (tips, edges, axial, centers) -- see royalPyraminxState.ts's own
// comment for why these 4 orbits (not the corners/outerEdges/middleEdges/
// innerEdges/leftWings/rightWings/centralCenters split originally proposed)
// are what this puzzle's geometry actually has.
//
// Axis-to-vertex mapping (arbitrary but fixed): U=vertex0, L=vertex1,
// R=vertex2, B=vertex3. Depth-to-token mapping (1..5, matching N=6's
// layerCount-1=5 valid turn depths): depth1="u/l/r/b" (tip only),
// depth2="U/L/R/B" (outer layer), depth3="Uw/Lw/Rw/Bw" (2-layer slice),
// depth4="3Uw/3Lw/3Rw/3Bw" (3-layer slice), depth5="4Uw/4Lw/4Rw/4Bw"
// (4-layer slice). No suffix = clockwise (sign=+1); trailing "'" =
// counter-clockwise (sign=-1). (The spec's "'' or 2" CCW notation isn't
// used: this is a third-turn puzzle -- every turn is order-3 -- so a
// second CW/CCW pair covers both non-identity states; a "2" suffix would
// just be a same-direction double-turn, redundant with the other sign.)

import type { RoyalPyraminxState } from "./royalPyraminxState";
import { AXIAL_COUNT, CENTER_COUNT, EDGE_COUNT, TIP_COUNT } from "./royalPyraminxState";

interface RoyalMoveTable {
  tipPerm: Uint8Array;
  tipOri: Uint8Array;
  edgePerm: Uint8Array;
  edgeOri: Uint8Array;
  axialPerm: Uint8Array;
  centerPerm: Uint8Array;
}

const MOVE_0: RoyalMoveTable = { tipPerm: Uint8Array.from([0,1,2,3]), tipOri: Uint8Array.from([0,0,0,1]), edgePerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23]), edgeOri: Uint8Array.from([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]), axialPerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59]), centerPerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23]) };
const MOVE_1: RoyalMoveTable = { tipPerm: Uint8Array.from([0,1,2,3]), tipOri: Uint8Array.from([0,0,0,2]), edgePerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23]), edgeOri: Uint8Array.from([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]), axialPerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59]), centerPerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23]) };
const MOVE_2: RoyalMoveTable = { tipPerm: Uint8Array.from([0,1,2,3]), tipOri: Uint8Array.from([0,0,0,1]), edgePerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11,20,13,14,15,12,17,18,19,16,21,22,23]), edgeOri: Uint8Array.from([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0]), axialPerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,30,16,17,18,19,20,21,22,23,24,25,26,27,28,29,45,31,32,33,34,35,36,37,38,39,40,41,42,43,44,15,46,47,48,49,50,51,52,53,54,55,56,57,58,59]), centerPerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23]) };
const MOVE_3: RoyalMoveTable = { tipPerm: Uint8Array.from([0,1,2,3]), tipOri: Uint8Array.from([0,0,0,2]), edgePerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11,16,13,14,15,20,17,18,19,12,21,22,23]), edgeOri: Uint8Array.from([0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,0,0,0,0]), axialPerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,45,16,17,18,19,20,21,22,23,24,25,26,27,28,29,15,31,32,33,34,35,36,37,38,39,40,41,42,43,44,30,46,47,48,49,50,51,52,53,54,55,56,57,58,59]), centerPerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23]) };
const MOVE_4: RoyalMoveTable = { tipPerm: Uint8Array.from([0,1,2,3]), tipOri: Uint8Array.from([0,0,0,1]), edgePerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11,20,21,14,15,12,13,18,19,16,17,22,23]), edgeOri: Uint8Array.from([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,1,1,0,0]), axialPerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,30,35,17,18,19,31,21,22,23,24,25,26,27,28,29,45,50,32,33,34,46,36,37,38,39,40,41,42,43,44,15,16,47,48,49,20,51,52,53,54,55,56,57,58,59]), centerPerm: Uint8Array.from([0,1,2,3,4,5,12,7,8,9,10,11,18,13,14,15,16,17,6,19,20,21,22,23]) };
const MOVE_5: RoyalMoveTable = { tipPerm: Uint8Array.from([0,1,2,3]), tipOri: Uint8Array.from([0,0,0,2]), edgePerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11,16,17,14,15,20,21,18,19,12,13,22,23]), edgeOri: Uint8Array.from([0,0,0,0,0,0,0,0,0,0,0,0,1,1,0,0,1,1,0,0,0,0,0,0]), axialPerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,45,46,17,18,19,50,21,22,23,24,25,26,27,28,29,15,20,32,33,34,16,36,37,38,39,40,41,42,43,44,30,35,47,48,49,31,51,52,53,54,55,56,57,58,59]), centerPerm: Uint8Array.from([0,1,2,3,4,5,18,7,8,9,10,11,6,13,14,15,16,17,12,19,20,21,22,23]) };
const MOVE_6: RoyalMoveTable = { tipPerm: Uint8Array.from([0,1,2,3]), tipOri: Uint8Array.from([0,0,0,1]), edgePerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11,20,21,22,15,12,13,14,19,16,17,18,23]), edgeOri: Uint8Array.from([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,1,1,1,0]), axialPerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,30,35,39,18,19,31,36,22,23,32,25,26,27,28,29,45,50,54,33,34,46,51,37,38,47,40,41,42,43,44,15,16,17,48,49,20,21,52,53,24,55,56,57,58,59]), centerPerm: Uint8Array.from([0,1,2,3,4,5,12,15,8,13,10,11,18,21,14,19,16,17,6,7,20,9,22,23]) };
const MOVE_7: RoyalMoveTable = { tipPerm: Uint8Array.from([0,1,2,3]), tipOri: Uint8Array.from([0,0,0,2]), edgePerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11,16,17,18,15,20,21,22,19,12,13,14,23]), edgeOri: Uint8Array.from([0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,0,1,1,1,0,0,0,0,0]), axialPerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,45,46,47,18,19,50,51,22,23,54,25,26,27,28,29,15,20,24,33,34,16,21,37,38,17,40,41,42,43,44,30,35,39,48,49,31,36,52,53,32,55,56,57,58,59]), centerPerm: Uint8Array.from([0,1,2,3,4,5,18,19,8,21,10,11,6,9,14,7,16,17,12,15,20,13,22,23]) };
const MOVE_8: RoyalMoveTable = { tipPerm: Uint8Array.from([0,1,2,3]), tipOri: Uint8Array.from([0,0,0,1]), edgePerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11,20,21,22,23,12,13,14,15,16,17,18,19]), edgeOri: Uint8Array.from([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1]), axialPerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,30,35,39,42,19,31,36,40,23,32,37,26,33,28,29,45,50,54,57,34,46,51,55,38,47,52,41,48,43,44,15,16,17,18,49,20,21,22,53,24,25,56,27,58,59]), centerPerm: Uint8Array.from([0,1,2,3,4,5,12,15,17,13,16,14,18,21,23,19,22,20,6,7,8,9,10,11]) };
const MOVE_9: RoyalMoveTable = { tipPerm: Uint8Array.from([0,1,2,3]), tipOri: Uint8Array.from([0,0,0,2]), edgePerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11,16,17,18,19,20,21,22,23,12,13,14,15]), edgeOri: Uint8Array.from([0,0,0,0,0,0,0,0,0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0]), axialPerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,45,46,47,48,19,50,51,52,23,54,55,26,57,28,29,15,20,24,27,34,16,21,25,38,17,22,41,18,43,44,30,35,39,42,49,31,36,40,53,32,37,56,33,58,59]), centerPerm: Uint8Array.from([0,1,2,3,4,5,18,19,20,21,22,23,6,9,11,7,10,8,12,15,17,13,16,14]) };
const MOVE_10: RoyalMoveTable = { tipPerm: Uint8Array.from([0,1,2,3]), tipOri: Uint8Array.from([2,0,0,0]), edgePerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23]), edgeOri: Uint8Array.from([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]), axialPerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59]), centerPerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23]) };
const MOVE_11: RoyalMoveTable = { tipPerm: Uint8Array.from([0,1,2,3]), tipOri: Uint8Array.from([1,0,0,0]), edgePerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23]), edgeOri: Uint8Array.from([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]), axialPerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59]), centerPerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23]) };
const MOVE_12: RoyalMoveTable = { tipPerm: Uint8Array.from([0,1,2,3]), tipOri: Uint8Array.from([2,0,0,0]), edgePerm: Uint8Array.from([4,1,2,3,23,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,0]), edgeOri: Uint8Array.from([1,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]), axialPerm: Uint8Array.from([59,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,0,45,46,47,48,49,50,51,52,53,54,55,56,57,58,44]), centerPerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23]) };
const MOVE_13: RoyalMoveTable = { tipPerm: Uint8Array.from([0,1,2,3]), tipOri: Uint8Array.from([1,0,0,0]), edgePerm: Uint8Array.from([23,1,2,3,0,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,4]), edgeOri: Uint8Array.from([0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1]), axialPerm: Uint8Array.from([44,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,59,45,46,47,48,49,50,51,52,53,54,55,56,57,58,0]), centerPerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23]) };
const MOVE_14: RoyalMoveTable = { tipPerm: Uint8Array.from([0,1,2,3]), tipOri: Uint8Array.from([2,0,0,0]), edgePerm: Uint8Array.from([4,6,2,3,23,5,22,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,1,0]), edgeOri: Uint8Array.from([1,1,0,0,1,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]), axialPerm: Uint8Array.from([59,58,2,3,4,57,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,1,5,0,45,46,47,48,49,50,51,52,53,54,55,56,43,42,44]), centerPerm: Uint8Array.from([23,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,0,18,19,20,21,22,17]) };
const MOVE_15: RoyalMoveTable = { tipPerm: Uint8Array.from([0,1,2,3]), tipOri: Uint8Array.from([1,0,0,0]), edgePerm: Uint8Array.from([23,22,2,3,0,5,1,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,6,4]), edgeOri: Uint8Array.from([0,0,0,0,1,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,1]), axialPerm: Uint8Array.from([44,42,2,3,4,43,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,58,57,59,45,46,47,48,49,50,51,52,53,54,55,56,5,1,0]), centerPerm: Uint8Array.from([17,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,23,18,19,20,21,22,0]) };
const MOVE_16: RoyalMoveTable = { tipPerm: Uint8Array.from([0,1,2,3]), tipOri: Uint8Array.from([2,0,0,0]), edgePerm: Uint8Array.from([4,6,8,3,23,5,22,7,21,9,10,11,12,13,14,15,16,17,18,19,20,2,1,0]), edgeOri: Uint8Array.from([1,1,1,0,1,0,1,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]), axialPerm: Uint8Array.from([59,58,56,3,4,57,55,7,8,54,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,2,6,9,1,5,0,45,46,47,48,49,50,51,52,53,41,40,39,43,42,44]), centerPerm: Uint8Array.from([23,22,2,21,4,5,6,7,8,9,10,11,12,13,14,1,3,0,18,19,20,16,15,17]) };
const MOVE_17: RoyalMoveTable = { tipPerm: Uint8Array.from([0,1,2,3]), tipOri: Uint8Array.from([1,0,0,0]), edgePerm: Uint8Array.from([23,22,21,3,0,5,1,7,2,9,10,11,12,13,14,15,16,17,18,19,20,8,6,4]), edgeOri: Uint8Array.from([0,0,0,0,1,0,1,0,1,0,0,0,0,0,0,0,0,0,0,0,0,1,1,1]), axialPerm: Uint8Array.from([44,42,39,3,4,43,40,7,8,41,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,56,55,54,58,57,59,45,46,47,48,49,50,51,52,53,9,6,2,5,1,0]), centerPerm: Uint8Array.from([17,15,2,16,4,5,6,7,8,9,10,11,12,13,14,22,21,23,18,19,20,3,1,0]) };
const MOVE_18: RoyalMoveTable = { tipPerm: Uint8Array.from([0,1,2,3]), tipOri: Uint8Array.from([2,0,0,0]), edgePerm: Uint8Array.from([4,6,8,10,23,5,22,7,21,9,20,11,12,13,14,15,16,17,18,19,3,2,1,0]), edgeOri: Uint8Array.from([1,1,1,1,1,0,1,0,1,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0]), axialPerm: Uint8Array.from([59,58,56,53,4,57,55,52,8,54,51,11,50,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,3,7,10,12,2,6,9,1,5,0,45,46,47,48,49,38,37,36,35,41,40,39,43,42,44]), centerPerm: Uint8Array.from([23,22,20,21,19,18,6,7,8,9,10,11,2,4,5,1,3,0,14,13,12,16,15,17]) };
const MOVE_19: RoyalMoveTable = { tipPerm: Uint8Array.from([0,1,2,3]), tipOri: Uint8Array.from([1,0,0,0]), edgePerm: Uint8Array.from([23,22,21,20,0,5,1,7,2,9,3,11,12,13,14,15,16,17,18,19,10,8,6,4]), edgeOri: Uint8Array.from([0,0,0,0,1,0,1,0,1,0,1,0,0,0,0,0,0,0,0,0,1,1,1,1]), axialPerm: Uint8Array.from([44,42,39,35,4,43,40,36,8,41,37,11,38,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,53,52,51,50,56,55,54,58,57,59,45,46,47,48,49,12,10,7,3,9,6,2,5,1,0]), centerPerm: Uint8Array.from([17,15,12,16,13,14,6,7,8,9,10,11,20,19,18,22,21,23,5,4,2,3,1,0]) };
const MOVE_20: RoyalMoveTable = { tipPerm: Uint8Array.from([0,1,2,3]), tipOri: Uint8Array.from([0,0,1,0]), edgePerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23]), edgeOri: Uint8Array.from([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]), axialPerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59]), centerPerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23]) };
const MOVE_21: RoyalMoveTable = { tipPerm: Uint8Array.from([0,1,2,3]), tipOri: Uint8Array.from([0,0,2,0]), edgePerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23]), edgeOri: Uint8Array.from([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]), axialPerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59]), centerPerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23]) };
const MOVE_22: RoyalMoveTable = { tipPerm: Uint8Array.from([0,1,2,3]), tipOri: Uint8Array.from([0,0,1,0]), edgePerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,11,19,12,13,14,15,16,17,18,10,20,21,22,23]), edgeOri: Uint8Array.from([0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,1,0,0,0,0]), axialPerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11,12,13,29,15,16,17,18,19,20,21,22,23,24,25,26,27,28,49,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,14,50,51,52,53,54,55,56,57,58,59]), centerPerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23]) };
const MOVE_23: RoyalMoveTable = { tipPerm: Uint8Array.from([0,1,2,3]), tipOri: Uint8Array.from([0,0,2,0]), edgePerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,19,10,12,13,14,15,16,17,18,11,20,21,22,23]), edgeOri: Uint8Array.from([0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0,0,0,0]), axialPerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11,12,13,49,15,16,17,18,19,20,21,22,23,24,25,26,27,28,14,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,29,50,51,52,53,54,55,56,57,58,59]), centerPerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23]) };
const MOVE_24: RoyalMoveTable = { tipPerm: Uint8Array.from([0,1,2,3]), tipOri: Uint8Array.from([0,0,1,0]), edgePerm: Uint8Array.from([0,1,2,3,4,5,6,7,9,18,11,19,12,13,14,15,16,17,8,10,20,21,22,23]), edgeOri: Uint8Array.from([0,0,0,0,0,0,0,0,1,0,1,0,0,0,0,0,0,0,1,1,0,0,0,0]), axialPerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11,28,27,29,15,16,17,18,19,20,21,22,23,24,25,26,53,48,49,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,12,14,50,51,52,13,54,55,56,57,58,59]), centerPerm: Uint8Array.from([0,1,2,3,4,11,6,7,8,9,10,20,12,13,14,15,16,17,18,19,5,21,22,23]) };
const MOVE_25: RoyalMoveTable = { tipPerm: Uint8Array.from([0,1,2,3]), tipOri: Uint8Array.from([0,0,2,0]), edgePerm: Uint8Array.from([0,1,2,3,4,5,6,7,18,8,19,10,12,13,14,15,16,17,9,11,20,21,22,23]), edgeOri: Uint8Array.from([0,0,0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0]), axialPerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11,48,53,49,15,16,17,18,19,20,21,22,23,24,25,26,13,12,14,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,28,29,50,51,52,27,54,55,56,57,58,59]), centerPerm: Uint8Array.from([0,1,2,3,4,20,6,7,8,9,10,5,12,13,14,15,16,17,18,19,11,21,22,23]) };
const MOVE_26: RoyalMoveTable = { tipPerm: Uint8Array.from([0,1,2,3]), tipOri: Uint8Array.from([0,0,1,0]), edgePerm: Uint8Array.from([0,1,2,3,4,5,7,17,9,18,11,19,12,13,14,15,16,6,8,10,20,21,22,23]), edgeOri: Uint8Array.from([0,0,0,0,0,0,1,0,1,0,1,0,0,0,0,0,0,1,1,1,0,0,0,0]), axialPerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,26,25,24,28,27,29,15,16,17,18,19,20,21,22,23,56,52,47,53,48,49,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,9,12,14,50,51,10,13,54,55,11,57,58,59]), centerPerm: Uint8Array.from([0,1,2,10,9,11,6,7,8,22,19,20,12,13,14,15,16,17,18,3,5,21,4,23]) };
const MOVE_27: RoyalMoveTable = { tipPerm: Uint8Array.from([0,1,2,3]), tipOri: Uint8Array.from([0,0,2,0]), edgePerm: Uint8Array.from([0,1,2,3,4,5,17,6,18,8,19,10,12,13,14,15,16,7,9,11,20,21,22,23]), edgeOri: Uint8Array.from([0,0,0,0,0,0,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0]), axialPerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,47,52,56,48,53,49,15,16,17,18,19,20,21,22,23,11,10,9,13,12,14,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,26,28,29,50,51,25,27,54,55,24,57,58,59]), centerPerm: Uint8Array.from([0,1,2,19,22,20,6,7,8,4,3,5,12,13,14,15,16,17,18,10,11,21,9,23]) };
const MOVE_28: RoyalMoveTable = { tipPerm: Uint8Array.from([0,1,2,3]), tipOri: Uint8Array.from([0,0,1,0]), edgePerm: Uint8Array.from([0,1,2,3,5,16,7,17,9,18,11,19,12,13,14,15,4,6,8,10,20,21,22,23]), edgeOri: Uint8Array.from([0,0,0,0,1,0,1,0,1,0,1,0,0,0,0,0,1,1,1,1,0,0,0,0]), axialPerm: Uint8Array.from([0,1,2,3,4,23,22,21,20,26,25,24,28,27,29,15,16,17,18,19,58,55,51,46,56,52,47,53,48,49,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,5,9,12,14,50,6,10,13,54,7,11,57,8,59]), centerPerm: Uint8Array.from([8,7,6,10,9,11,23,21,18,22,19,20,12,13,14,15,16,17,0,3,5,1,4,2]) };
const MOVE_29: RoyalMoveTable = { tipPerm: Uint8Array.from([0,1,2,3]), tipOri: Uint8Array.from([0,0,2,0]), edgePerm: Uint8Array.from([0,1,2,3,16,4,17,6,18,8,19,10,12,13,14,15,5,7,9,11,20,21,22,23]), edgeOri: Uint8Array.from([0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0,0,0,0,0,0,0,0,0]), axialPerm: Uint8Array.from([0,1,2,3,4,46,51,55,58,47,52,56,48,53,49,15,16,17,18,19,8,7,6,5,11,10,9,13,12,14,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,23,26,28,29,50,22,25,27,54,21,24,57,20,59]), centerPerm: Uint8Array.from([18,21,23,19,22,20,2,1,0,4,3,5,12,13,14,15,16,17,8,10,11,7,9,6]) };
const MOVE_30: RoyalMoveTable = { tipPerm: Uint8Array.from([0,1,2,3]), tipOri: Uint8Array.from([0,2,0,0]), edgePerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23]), edgeOri: Uint8Array.from([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]), axialPerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59]), centerPerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23]) };
const MOVE_31: RoyalMoveTable = { tipPerm: Uint8Array.from([0,1,2,3]), tipOri: Uint8Array.from([0,1,0,0]), edgePerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23]), edgeOri: Uint8Array.from([0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]), axialPerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59]), centerPerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23]) };
const MOVE_32: RoyalMoveTable = { tipPerm: Uint8Array.from([0,1,2,3]), tipOri: Uint8Array.from([0,2,0,0]), edgePerm: Uint8Array.from([0,1,2,15,4,3,6,7,8,9,10,11,12,13,14,5,16,17,18,19,20,21,22,23]), edgeOri: Uint8Array.from([0,0,0,1,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]), axialPerm: Uint8Array.from([0,1,2,3,34,5,6,7,8,9,10,11,12,13,14,15,16,17,18,4,20,21,22,23,24,25,26,27,28,29,30,31,32,33,19,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59]), centerPerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23]) };
const MOVE_33: RoyalMoveTable = { tipPerm: Uint8Array.from([0,1,2,3]), tipOri: Uint8Array.from([0,1,0,0]), edgePerm: Uint8Array.from([0,1,2,5,4,15,6,7,8,9,10,11,12,13,14,3,16,17,18,19,20,21,22,23]), edgeOri: Uint8Array.from([0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0]), axialPerm: Uint8Array.from([0,1,2,3,19,5,6,7,8,9,10,11,12,13,14,15,16,17,18,34,20,21,22,23,24,25,26,27,28,29,30,31,32,33,4,35,36,37,38,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59]), centerPerm: Uint8Array.from([0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23]) };
const MOVE_34: RoyalMoveTable = { tipPerm: Uint8Array.from([0,1,2,3]), tipOri: Uint8Array.from([0,2,0,0]), edgePerm: Uint8Array.from([0,1,14,15,4,3,6,2,8,9,10,11,12,13,7,5,16,17,18,19,20,21,22,23]), edgeOri: Uint8Array.from([0,0,1,1,0,1,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]), axialPerm: Uint8Array.from([0,1,2,33,34,5,6,7,38,9,10,11,12,13,14,15,16,17,8,4,20,21,22,3,24,25,26,27,28,29,30,31,32,23,19,35,36,37,18,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59]), centerPerm: Uint8Array.from([0,1,14,3,4,5,6,7,2,9,10,11,12,13,8,15,16,17,18,19,20,21,22,23]) };
const MOVE_35: RoyalMoveTable = { tipPerm: Uint8Array.from([0,1,2,3]), tipOri: Uint8Array.from([0,1,0,0]), edgePerm: Uint8Array.from([0,1,7,5,4,15,6,14,8,9,10,11,12,13,2,3,16,17,18,19,20,21,22,23]), edgeOri: Uint8Array.from([0,0,1,1,0,0,0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0]), axialPerm: Uint8Array.from([0,1,2,23,19,5,6,7,18,9,10,11,12,13,14,15,16,17,38,34,20,21,22,33,24,25,26,27,28,29,30,31,32,3,4,35,36,37,8,39,40,41,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59]), centerPerm: Uint8Array.from([0,1,8,3,4,5,6,7,14,9,10,11,12,13,2,15,16,17,18,19,20,21,22,23]) };
const MOVE_36: RoyalMoveTable = { tipPerm: Uint8Array.from([0,1,2,3]), tipOri: Uint8Array.from([0,2,0,0]), edgePerm: Uint8Array.from([0,13,14,15,4,3,6,2,8,1,10,11,12,9,7,5,16,17,18,19,20,21,22,23]), edgeOri: Uint8Array.from([0,1,1,1,0,1,0,1,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0]), axialPerm: Uint8Array.from([0,1,32,33,34,5,6,37,38,9,10,41,12,13,14,15,16,11,8,4,20,21,7,3,24,25,2,27,28,29,30,31,26,23,19,35,36,22,18,39,40,17,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59]), centerPerm: Uint8Array.from([0,13,14,3,16,5,6,4,2,9,1,11,12,10,8,15,7,17,18,19,20,21,22,23]) };
const MOVE_37: RoyalMoveTable = { tipPerm: Uint8Array.from([0,1,2,3]), tipOri: Uint8Array.from([0,1,0,0]), edgePerm: Uint8Array.from([0,9,7,5,4,15,6,14,8,13,10,11,12,1,2,3,16,17,18,19,20,21,22,23]), edgeOri: Uint8Array.from([0,1,1,1,0,0,0,0,0,0,0,0,0,1,1,1,0,0,0,0,0,0,0,0]), axialPerm: Uint8Array.from([0,1,26,23,19,5,6,22,18,9,10,17,12,13,14,15,16,41,38,34,20,21,37,33,24,25,32,27,28,29,30,31,2,3,4,35,36,7,8,39,40,11,42,43,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59]), centerPerm: Uint8Array.from([0,10,8,3,7,5,6,16,14,9,13,11,12,1,2,15,4,17,18,19,20,21,22,23]) };
const MOVE_38: RoyalMoveTable = { tipPerm: Uint8Array.from([0,1,2,3]), tipOri: Uint8Array.from([0,2,0,0]), edgePerm: Uint8Array.from([12,13,14,15,4,3,6,2,8,1,10,0,11,9,7,5,16,17,18,19,20,21,22,23]), edgeOri: Uint8Array.from([1,1,1,1,0,1,0,1,0,1,0,1,0,0,0,0,0,0,0,0,0,0,0,0]), axialPerm: Uint8Array.from([0,31,32,33,34,5,36,37,38,9,40,41,12,43,14,15,13,11,8,4,20,10,7,3,24,6,2,27,1,29,30,28,26,23,19,35,25,22,18,39,21,17,42,16,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59]), centerPerm: Uint8Array.from([12,13,14,15,16,17,5,4,2,3,1,0,11,10,8,9,7,6,18,19,20,21,22,23]) };
const MOVE_39: RoyalMoveTable = { tipPerm: Uint8Array.from([0,1,2,3]), tipOri: Uint8Array.from([0,1,0,0]), edgePerm: Uint8Array.from([11,9,7,5,4,15,6,14,8,13,10,12,0,1,2,3,16,17,18,19,20,21,22,23]), edgeOri: Uint8Array.from([1,1,1,1,0,0,0,0,0,0,0,0,1,1,1,1,0,0,0,0,0,0,0,0]), axialPerm: Uint8Array.from([0,28,26,23,19,5,25,22,18,9,21,17,12,16,14,15,43,41,38,34,20,40,37,33,24,36,32,27,31,29,30,1,2,3,4,35,6,7,8,39,10,11,42,13,44,45,46,47,48,49,50,51,52,53,54,55,56,57,58,59]), centerPerm: Uint8Array.from([11,10,8,9,7,6,17,16,14,15,13,12,0,1,2,3,4,5,18,19,20,21,22,23]) };

const MOVE_TABLE: ReadonlyMap<string, RoyalMoveTable> = new Map([
  ["u", MOVE_0],
  ["u'", MOVE_1],
  ["U", MOVE_2],
  ["U'", MOVE_3],
  ["Uw", MOVE_4],
  ["Uw'", MOVE_5],
  ["3Uw", MOVE_6],
  ["3Uw'", MOVE_7],
  ["4Uw", MOVE_8],
  ["4Uw'", MOVE_9],
  ["l", MOVE_10],
  ["l'", MOVE_11],
  ["L", MOVE_12],
  ["L'", MOVE_13],
  ["Lw", MOVE_14],
  ["Lw'", MOVE_15],
  ["3Lw", MOVE_16],
  ["3Lw'", MOVE_17],
  ["4Lw", MOVE_18],
  ["4Lw'", MOVE_19],
  ["r", MOVE_20],
  ["r'", MOVE_21],
  ["R", MOVE_22],
  ["R'", MOVE_23],
  ["Rw", MOVE_24],
  ["Rw'", MOVE_25],
  ["3Rw", MOVE_26],
  ["3Rw'", MOVE_27],
  ["4Rw", MOVE_28],
  ["4Rw'", MOVE_29],
  ["b", MOVE_30],
  ["b'", MOVE_31],
  ["B", MOVE_32],
  ["B'", MOVE_33],
  ["Bw", MOVE_34],
  ["Bw'", MOVE_35],
  ["3Bw", MOVE_36],
  ["3Bw'", MOVE_37],
  ["4Bw", MOVE_38],
  ["4Bw'", MOVE_39],
]);

/** All 40 legal move names (4 axes x 5 depths x 2 directions), in the notation this module accepts. */
export const ALL_ROYAL_MOVE_NAMES: readonly string[] = ["u", "u'", "U", "U'", "Uw", "Uw'", "3Uw", "3Uw'", "4Uw", "4Uw'", "l", "l'", "L", "L'", "Lw", "Lw'", "3Lw", "3Lw'", "4Lw", "4Lw'", "r", "r'", "R", "R'", "Rw", "Rw'", "3Rw", "3Rw'", "4Rw", "4Rw'", "b", "b'", "B", "B'", "Bw", "Bw'", "3Bw", "3Bw'", "4Bw", "4Bw'"];

/**
 * Applies one named move to a state, returning a NEW state (pure function,
 * input untouched) -- same "pull" composition convention as
 * masterTetraminxSolver.ts's precompute (newPieces[slot] = oldPieces[perm[slot]]),
 * chosen for consistency even though this module has no code dependency on
 * that file. Throws on an unrecognized move name.
 */
export function applyRoyalMove(state: RoyalPyraminxState, move: string): RoyalPyraminxState {
  const table = MOVE_TABLE.get(move);
  if (!table) throw new Error(`applyRoyalMove: unknown move "${move}"`);

  const tips = new Uint8Array(TIP_COUNT);
  const tipOri = new Uint8Array(TIP_COUNT);
  for (let slot = 0; slot < TIP_COUNT; slot++) {
    const src = table.tipPerm[slot];
    tips[slot] = state.tips[src];
    tipOri[slot] = (state.tipOri[src] + table.tipOri[slot]) % 3;
  }

  const edges = new Uint8Array(EDGE_COUNT);
  const edgeOri = new Uint8Array(EDGE_COUNT);
  for (let slot = 0; slot < EDGE_COUNT; slot++) {
    const src = table.edgePerm[slot];
    edges[slot] = state.edges[src];
    edgeOri[slot] = (state.edgeOri[src] + table.edgeOri[slot]) % 2;
  }

  const axial = new Uint8Array(AXIAL_COUNT);
  for (let slot = 0; slot < AXIAL_COUNT; slot++) axial[slot] = state.axial[table.axialPerm[slot]];

  const centers = new Uint8Array(CENTER_COUNT);
  for (let slot = 0; slot < CENTER_COUNT; slot++) centers[slot] = state.centers[table.centerPerm[slot]];

  return { tips, tipOri, edges, edgeOri, axial, centers };
}

// Regeneration note: these tables were derived (not hand-written) from the
// existing, already-validated N-layer tetrahedron geometry in
// src/customTetra/tetraState.ts and masterTetraminxSolver.ts's precompute(),
// by (1) grouping N=6's 144 sticker slots into physical pieces via a
// shared-edge (>=2 common 3D corner points) union-find at the solved state,
// which empirically produced 4 tip pieces (3 stickers each), 24 edge pieces
// (2 stickers each), 60 axial pieces and 24 center pieces (both single-
// sticker, no orientation) -- NOT the corners/outerEdges/middleEdges/
// innerEdges/leftWings/rightWings/centralCenters split originally proposed,
// which does not match this puzzle's real structure; then (2) for each of
// the 40 raw moves, reading precompute()'s already-validated sticker-level
// permutation and projecting it onto these piece groups (destination slot's
// occupants must all belong to the same source piece -- verified for every
// move, confirming the grouping is geometrically rigid) to get per-piece
// permutation + cyclic orientation shift. Every move's tables were verified
// to satisfy move^3 = identity (this is a third-turn puzzle -- true for all
// 4 piece-type arrays independently) and CW*CCW = identity for all 20
// axis/depth pairs before being embedded here.
