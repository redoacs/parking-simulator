import { boundsOf, rect, type Rect } from '../geom/polygon';
import { isCollidable, type Scene } from '../scene/types';
import type { VehicleState } from '../sim/model';
import { collisionOutline, type DerivedVehicle } from '../vehicle/derive';

/** Complement of the road union inside its bounding box. Includes whole cells, not just corner tests. */
export function drivingDomain(roads: Rect[]) {
  const xs = [...new Set(roads.flatMap((r) => [r.minX, r.maxX]))].sort((a, b) => a - b);
  const ys = [...new Set(roads.flatMap((r) => [r.minY, r.maxY]))].sort((a, b) => a - b);
  const outer = { minX: xs[0]!, maxX: xs.at(-1)!, minY: ys[0]!, maxY: ys.at(-1)! };
  const blocked: Rect[] = [];
  for (let y = 0; y < ys.length - 1; y++)
    for (let x = 0; x < xs.length - 1; x++) {
      const cell = { minX: xs[x]!, maxX: xs[x + 1]!, minY: ys[y]!, maxY: ys[y + 1]! };
      const cx = (cell.minX + cell.maxX) / 2,
        cy = (cell.minY + cell.maxY) / 2;
      if (!roads.some((r) => cx >= r.minX && cx <= r.maxX && cy >= r.minY && cy <= r.maxY)) blocked.push(cell);
    }
  return { outer, blocked };
}
export function rectPolygon(r: Rect) {
  return rect(r.minX, r.minY, r.maxX, r.maxY);
}

/** Fast, conservative separating-axis clearance for search. Final replay uses polygonDistance independently. */
export function domainFor(scene: Scene, vehicle: DerivedVehicle, mirrors: boolean) {
  const { outer, blocked } = drivingDomain(scene.drivingArea);
  const obstacles = [...scene.obstacles.filter((o) => isCollidable(o.kind)).map((o) => boundsOf([o.polygon])), ...blocked];
  const box = (r: Rect) => ({ x: (r.minX + r.maxX) / 2, y: (r.minY + r.maxY) / 2, hx: (r.maxX - r.minX) / 2, hy: (r.maxY - r.minY) / 2 });
  // Bounding boxes are exact for the current rectangular presets; a future non-rectangular obstacle is conservative.
  const boxes = obstacles.map(box);
  const outline = collisionOutline(vehicle, mirrors);
  const parts = outline.map((p) => box(boundsOf([p])));
  const radius = Math.max(...outline.flat().map((p) => Math.hypot(p.x, p.y)));
  const clearance = (state: VehicleState): number => {
    const c = Math.cos(state.theta),
      s = Math.sin(state.theta),
      ac = Math.abs(c),
      as = Math.abs(s);
    let gap = Infinity;
    for (const p of parts) {
      const x = state.x + p.x * c - p.y * s,
        y = state.y + p.x * s + p.y * c;
      const hx = p.hx * ac + p.hy * as,
        hy = p.hx * as + p.hy * ac;
      gap = Math.min(gap, x - hx - outer.minX, outer.maxX - x - hx, y - hy - outer.minY, outer.maxY - y - hy);
      for (const b of boxes) {
        const dx = x - b.x,
          dy = y - b.y;
        const d = Math.max(
          Math.abs(dx) - hx - b.hx,
          Math.abs(dy) - hy - b.hy,
          Math.abs(dx * c + dy * s) - p.hx - b.hx * ac - b.hy * as,
          Math.abs(-dx * s + dy * c) - p.hy - b.hx * as - b.hy * ac,
        );
        gap = Math.min(gap, d);
      }
    }
    return gap;
  };
  return { clearance, radius };
}
