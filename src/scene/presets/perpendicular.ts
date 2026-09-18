import { rect, boundsOf } from '../../geom/polygon';
import { BOUNDS_PAD, NEIGHBOUR_CAR, type Obstacle, type PresetDef, type Scene } from '../types';

/**
 * Bay opens toward -y onto an aisle. Target x in [0, bayWidth], y in [0, bayDepth].
 * Wall behind the bay row, neighbour cars either side, aisle y in [-aisleWidth, 0].
 * Car starts in the aisle heading -x with the bay on its left, ready to reverse in.
 */
export const perpendicular: PresetDef = {
  id: 'perpendicular',
  name: 'Perpendicular bay',
  params: [
    { key: 'bayWidth', label: 'Bay width', unit: 'm', min: 2.3, max: 3.2, step: 0.05, default: 2.5 },
    { key: 'bayDepth', label: 'Bay depth', unit: 'm', min: 4.5, max: 6.0, step: 0.1, default: 5.0 },
    { key: 'aisleWidth', label: 'Aisle width', unit: 'm', min: 5.0, max: 8.0, step: 0.1, default: 6.0 },
  ],
  build(p): Scene {
    const bayWidth = p.bayWidth!;
    const bayDepth = p.bayDepth!;
    const aisleWidth = p.aisleWidth!;
    const carX = (bayWidth - NEIGHBOUR_CAR.width) / 2;
    const carY0 = bayDepth - NEIGHBOUR_CAR.length - 0.25;
    const rowX0 = -2 * bayWidth;
    const rowX1 = 3 * bayWidth;
    const obstacles: Obstacle[] = [
      { kind: 'wall', height: 2.5, polygon: rect(rowX0, bayDepth, rowX1, bayDepth + 0.2) },
      { kind: 'car', height: 1.6, polygon: rect(-bayWidth + carX, carY0, -bayWidth + carX + NEIGHBOUR_CAR.width, carY0 + NEIGHBOUR_CAR.length) },
      { kind: 'car', height: 1.6, polygon: rect(bayWidth + carX, carY0, bayWidth + carX + NEIGHBOUR_CAR.width, carY0 + NEIGHBOUR_CAR.length) },
      { kind: 'line', height: 0, polygon: rect(rowX0, -0.05, rowX1, 0.05) },
      { kind: 'line', height: 0, polygon: rect(rowX0, -aisleWidth - 0.05, rowX1, -aisleWidth + 0.05) },
    ];
    const target = rect(0, 0, bayWidth, bayDepth);
    const start = { x: bayWidth / 2 + 4.5, y: -aisleWidth / 2, theta: Math.PI, steer: 0, speed: 0 };
    const b = boundsOf([target, ...obstacles.map((o) => o.polygon)]);
    return {
      bounds: { minX: b.minX - BOUNDS_PAD, minY: b.minY - BOUNDS_PAD, maxX: b.maxX + BOUNDS_PAD + 3, maxY: b.maxY + BOUNDS_PAD },
      obstacles,
      target,
      start,
    };
  },
};
