import { boundsOf, type Polygon } from '../geom/polygon';
import type { Vec2 } from '../geom/vec2';
import type { Scene } from './types';

/** An exact quarter turn: no trigonometry, so coordinates stay the numbers the preset wrote. `+ 0` turns -0 into 0. */
function turn(p: Vec2, quarterTurn: 1 | -1): Vec2 {
  return quarterTurn === 1 ? { x: -p.y + 0, y: p.x } : { x: p.y, y: -p.x + 0 };
}

/**
 * Rotate a whole scene about the origin by a quarter turn: 1 is 90° counter-clockwise, -1 is 90° clockwise.
 * A rigid rotation keeps polygon winding, and keeps what was on the car's right on its right.
 */
export function rotateScene(scene: Scene, quarterTurn: 1 | -1): Scene {
  const poly = (p: Polygon): Polygon => p.map((v) => turn(v, quarterTurn));
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
    start: { ...scene.start, ...turn(scene.start, quarterTurn), theta: scene.start.theta + (quarterTurn * Math.PI) / 2 },
  };
}
