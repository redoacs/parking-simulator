import { boundsOf, type Polygon } from '../geom/polygon';
import type { Vec2 } from '../geom/vec2';
import type { Scene } from './types';

/** Exact quarter turns: no trigonometry, so coordinates stay the numbers the preset wrote. `+ 0` turns -0 into 0. */
function turn(p: Vec2, quarterTurns: number): Vec2 {
  switch (((quarterTurns % 4) + 4) % 4) {
    case 1:
      return { x: -p.y + 0, y: p.x };
    case 2:
      return { x: -p.x + 0, y: -p.y + 0 };
    case 3:
      return { x: p.y, y: -p.x + 0 };
    default:
      return { x: p.x, y: p.y };
  }
}

/**
 * Rotate a whole scene about the origin by `quarterTurns` × 90° (positive is counter-clockwise).
 * A rigid rotation keeps polygon winding, and keeps what was on the car's right on its right.
 */
export function rotateScene(scene: Scene, quarterTurns: number): Scene {
  const poly = (p: Polygon): Polygon => p.map((v) => turn(v, quarterTurns));
  const b = scene.bounds;
  return {
    bounds: boundsOf([
      poly([
        { x: b.minX, y: b.minY },
        { x: b.maxX, y: b.maxY },
      ]),
    ]),
    obstacles: scene.obstacles.map((o) => ({ ...o, polygon: poly(o.polygon) })),
    target: poly(scene.target),
    start: { ...scene.start, ...turn(scene.start, quarterTurns), theta: scene.start.theta + (quarterTurns * Math.PI) / 2 },
  };
}
