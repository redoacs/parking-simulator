import type { Rect } from '../geom/polygon';
import type { Vec2 } from '../geom/vec2';

export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };

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

  worldToCss(p: Vec2): Vec2 {
    const clipX = (p.x - this.cx) * this.scaleX();
    const clipY = (p.y - this.cy) * this.scaleY();
    return { x: (((clipX + 1) / 2) * this.widthPx) / this.dpr, y: (((1 - clipY) / 2) * this.heightPx) / this.dpr };
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

  /**
   * Two-finger gesture between two frames, in canvas-relative CSS pixels: zoom about the previous midpoint by the change
   * in finger distance, then pan by the midpoint's movement. The world point under each finger stays under it, as long
   * as the fingers do not twist about each other (the view never rotates).
   */
  pinchCss(prevA: Vec2, prevB: Vec2, a: Vec2, b: Vec2): void {
    const prevDist = Math.hypot(prevB.x - prevA.x, prevB.y - prevA.y);
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const prevMid = { x: (prevA.x + prevB.x) / 2, y: (prevA.y + prevB.y) / 2 };
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (prevDist > 0 && dist > 0) this.zoomAtCss(prevMid.x, prevMid.y, dist / prevDist);
    this.panByCss(mid.x - prevMid.x, mid.y - prevMid.y);
  }

  /** Fit a world rect into the canvas, or into the part of it that `inset` (CSS pixels per side) leaves free. */
  fit(r: Rect, inset: Insets = NO_INSETS): void {
    const w = Math.max(1e-6, r.maxX - r.minX);
    const h = Math.max(1e-6, r.maxY - r.minY);
    const freeW = Math.max(1, this.widthPx - (inset.left + inset.right) * this.dpr);
    const freeH = Math.max(1, this.heightPx - (inset.top + inset.bottom) * this.dpr);
    this.ppm = Math.min(freeW / w, freeH / h) * 0.9;
    // The free area's centre sits this many device pixels right of and below the canvas centre.
    const ox = ((inset.left - inset.right) / 2) * this.dpr;
    const oy = ((inset.top - inset.bottom) / 2) * this.dpr;
    this.cx = (r.minX + r.maxX) / 2 - ox / this.ppm;
    this.cy = (r.minY + r.maxY) / 2 + oy / this.ppm;
  }
}
