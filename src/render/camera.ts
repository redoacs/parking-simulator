import type { Rect } from '../geom/polygon';
import type { Vec2 } from '../geom/vec2';

/** Orthographic top-down camera. ppm = device pixels per metre. */
export class Camera {
  cx = 0;
  cy = 0;
  ppm = 100;
  widthPx = 1;
  heightPx = 1;
  dpr = 1;

  resize(widthPx: number, heightPx: number, dpr: number): void {
    this.widthPx = Math.max(1, widthPx);
    this.heightPx = Math.max(1, heightPx);
    this.dpr = dpr;
  }

  private scaleX(): number {
    return (2 * this.ppm) / this.widthPx;
  }
  private scaleY(): number {
    return (2 * this.ppm) / this.heightPx;
  }

  /** [scale.x, scale.y, offset.x, offset.y, viewport.w, viewport.h, 0, 0] */
  uniformData(): Float32Array<ArrayBuffer> {
    const sx = this.scaleX();
    const sy = this.scaleY();
    return new Float32Array([sx, sy, -this.cx * sx, -this.cy * sy, this.widthPx, this.heightPx, 0, 0]);
  }

  screenToWorld(cssX: number, cssY: number): Vec2 {
    const clipX = ((cssX * this.dpr) / this.widthPx) * 2 - 1;
    const clipY = 1 - ((cssY * this.dpr) / this.heightPx) * 2;
    return { x: clipX / this.scaleX() + this.cx, y: clipY / this.scaleY() + this.cy };
  }

  panByCss(dx: number, dy: number): void {
    this.cx -= (dx * this.dpr) / this.ppm;
    this.cy += (dy * this.dpr) / this.ppm;
  }

  zoomAtCss(cssX: number, cssY: number, factor: number): void {
    const before = this.screenToWorld(cssX, cssY);
    this.ppm = Math.min(2000, Math.max(5, this.ppm * factor));
    const after = this.screenToWorld(cssX, cssY);
    this.cx += before.x - after.x;
    this.cy += before.y - after.y;
  }

  fit(r: Rect): void {
    const w = Math.max(1e-6, r.maxX - r.minX);
    const h = Math.max(1e-6, r.maxY - r.minY);
    this.cx = (r.minX + r.maxX) / 2;
    this.cy = (r.minY + r.maxY) / 2;
    this.ppm = Math.min(this.widthPx / w, this.heightPx / h) * 0.9;
  }
}
