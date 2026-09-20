import { rect, boundsOf } from '../../geom/polygon';
import { rotateScene } from '../rotate';
import { BOUNDS_PAD, type Obstacle, type Params, type PresetDef, type Scene } from '../types';

const WALL = 0.2;

/** The door cannot exceed the interior; the driveway is at least as wide as the door. */
function constrain(p: Params): Params {
  const doorWidth = Math.min(p.doorWidth!, p.interiorWidth!);
  return { ...p, doorWidth, drivewayWidth: Math.max(p.drivewayWidth!, doorWidth) };
}

/**
 * Garage interior x in [0, interiorWidth], y in [0, interiorDepth], door in the
 * front wall (y = 0) centred on the interior. Driveway extends toward -y from
 * the door, flanked by kerbs. approachAngle 0: start on the driveway facing the
 * door. approachAngle 90: start on a street along x below the driveway, heading -x;
 * that scene is then rotated -90° so the car starts pointing up the screen with the garage on its right.
 */
export const garage: PresetDef = {
  id: 'garage',
  params: [
    { key: 'doorWidth', unit: 'm', min: 2.2, max: 3.0, step: 0.05, default: 2.4 },
    { key: 'interiorWidth', unit: 'm', min: 2.6, max: 4.0, step: 0.05, default: 3.0 },
    { key: 'interiorDepth', unit: 'm', min: 5.0, max: 7.0, step: 0.1, default: 5.5 },
    { key: 'drivewayWidth', unit: 'm', min: 2.5, max: 4.0, step: 0.05, default: 3.0 }, // same grid as doorWidth: constrain copies one into the other
    { key: 'drivewayLength', unit: 'm', min: 3.0, max: 8.0, step: 0.1, default: 5.0 },
    { key: 'approachAngle', unit: 'deg', min: 0, max: 90, step: 90, default: 0 },
  ],
  constrain,
  build(raw): Scene {
    const p = constrain(raw);
    const iw = p.interiorWidth!;
    const id = p.interiorDepth!;
    const dw = p.doorWidth!;
    const dvw = p.drivewayWidth!;
    const dvl = p.drivewayLength!;
    const side = p.approachAngle! >= 45;
    const doorX0 = (iw - dw) / 2;
    const doorX1 = (iw + dw) / 2;
    const dvX0 = iw / 2 - dvw / 2;
    const dvX1 = iw / 2 + dvw / 2;
    const streetWidth = 6;
    const obstacles: Obstacle[] = [
      { kind: 'wall', height: 2.4, polygon: rect(-WALL, -WALL, 0, id + WALL) },
      { kind: 'wall', height: 2.4, polygon: rect(iw, -WALL, iw + WALL, id + WALL) },
      { kind: 'wall', height: 2.4, polygon: rect(0, id, iw, id + WALL) },
      { kind: 'kerb', height: 0.1, polygon: rect(dvX0 - 0.3, -dvl, dvX0, -WALL) },
      { kind: 'kerb', height: 0.1, polygon: rect(dvX1, -dvl, dvX1 + 0.3, -WALL) },
    ];
    if (doorX0 > 1e-9) obstacles.push({ kind: 'wall', height: 2.4, polygon: rect(0, -WALL, doorX0, 0) });
    if (doorX1 < iw - 1e-9) obstacles.push({ kind: 'wall', height: 2.4, polygon: rect(doorX1, -WALL, iw, 0) });
    if (side) {
      obstacles.push({
        kind: 'line',
        height: 0,
        polygon: rect(iw / 2 - 12, -dvl - streetWidth - 0.05, iw / 2 + 12, -dvl - streetWidth + 0.05),
      });
    }
    const target = rect(0, 0, iw, id);
    const start = side
      ? { x: iw / 2 + 7, y: -dvl - streetWidth / 2, theta: Math.PI, steer: 0, speed: 0 }
      : { x: iw / 2, y: -dvl - 3.6, theta: Math.PI / 2, steer: 0, speed: 0 }; // front bumper just short of the driveway
    const b = boundsOf([target, ...obstacles.map((o) => o.polygon)]);
    const scene: Scene = {
      bounds: {
        minX: b.minX - BOUNDS_PAD,
        minY: Math.min(b.minY, side ? -dvl - streetWidth : -dvl - 5) - BOUNDS_PAD,
        maxX: b.maxX + BOUNDS_PAD,
        maxY: b.maxY + BOUNDS_PAD,
      },
      obstacles,
      target,
      start,
    };
    return side ? rotateScene(scene, -1) : scene;
  },
};
