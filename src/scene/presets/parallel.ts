import { rect, boundsOf } from '../../geom/polygon';
import { rotateScene } from '../rotate';
import { BOUNDS_PAD, NEIGHBOUR_CAR, type Obstacle, type PresetDef, type Scene } from '../types';

/**
 * Described in the street frame, then rotated +90° so the car starts pointing up the screen (kerb still on its right).
 * Street frame: street runs along +x. Kerb along y = 0 (kerb body at y < 0). Spot occupies
 * x in [0, spotLength], y in [0, spotWidth]. Neighbours front (x > spotLength)
 * and rear (x < 0). Lane above the parked row. Car starts in the lane beside
 * the front neighbour, heading +x, ready to reverse in. `kerb` (flag) omits the kerb when 0.
 */
export const parallel: PresetDef = {
  id: 'parallel',
  params: [
    { key: 'spotLength', unit: 'm', min: 5.0, max: 8.0, step: 0.1, default: 6.2 },
    { key: 'spotWidth', unit: 'm', min: 2.0, max: 3.0, step: 0.05, default: 2.4 },
    { key: 'laneWidth', unit: 'm', min: 2.5, max: 5.0, step: 0.1, default: 3.2 },
    { key: 'kerb', unit: 'flag', min: 0, max: 1, step: 1, default: 1 },
  ],
  build(p): Scene {
    const spotLength = p.spotLength!;
    const spotWidth = p.spotWidth!;
    const laneWidth = p.laneWidth!;
    const carY0 = (spotWidth - NEIGHBOUR_CAR.width) / 2;
    const kerb: Obstacle[] =
      p.kerb! > 0
        ? [{ kind: 'kerb', height: 0.12, polygon: rect(-NEIGHBOUR_CAR.length - 3, -0.3, spotLength + NEIGHBOUR_CAR.length + 3, 0) }]
        : [];
    const obstacles: Obstacle[] = [
      ...kerb,
      { kind: 'car', height: 1.6, polygon: rect(-NEIGHBOUR_CAR.length, carY0, 0, carY0 + NEIGHBOUR_CAR.width) },
      { kind: 'car', height: 1.6, polygon: rect(spotLength, carY0, spotLength + NEIGHBOUR_CAR.length, carY0 + NEIGHBOUR_CAR.width) },
      {
        kind: 'line',
        height: 0,
        polygon: rect(-NEIGHBOUR_CAR.length - 3, spotWidth + laneWidth, spotLength + NEIGHBOUR_CAR.length + 3, spotWidth + laneWidth + 0.1),
      },
    ];
    const target = rect(0, 0, spotLength, spotWidth);
    const start = { x: spotLength + 0.6, y: spotWidth + laneWidth / 2, theta: 0, steer: 0, speed: 0 };
    const b = boundsOf([target, ...obstacles.map((o) => o.polygon)]);
    return rotateScene(
      {
        bounds: { minX: b.minX - BOUNDS_PAD, minY: b.minY - BOUNDS_PAD, maxX: b.maxX + BOUNDS_PAD + 4, maxY: b.maxY + BOUNDS_PAD },
        parkingHeadings: [0],
        drivingArea: [
          { minX: -NEIGHBOUR_CAR.length - 3, minY: 0, maxX: spotLength + NEIGHBOUR_CAR.length + 3, maxY: spotWidth + laneWidth },
        ],
        obstacles,
        target,
        start,
      },
      1,
    );
  },
};
