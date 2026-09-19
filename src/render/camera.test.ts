import { describe, expect, it } from 'vitest';
import { Camera } from './camera';

describe('Camera', () => {
  const cam = () => {
    const c = new Camera();
    c.resize(800, 600, 1);
    c.cx = 0;
    c.cy = 0;
    c.ppm = 100;
    return c;
  };

  it('worldToCss inverts screenToWorld', () => {
    const c = cam();
    c.cx = 3;
    c.cy = -2;
    c.resize(800, 600, 2);
    const css = c.worldToCss({ x: 4.5, y: -1.25 });
    const back = c.screenToWorld(css.x, css.y);
    expect(back.x).toBeCloseTo(4.5, 9);
    expect(back.y).toBeCloseTo(-1.25, 9);
  });

  it('uniform maps the centre to clip origin and scales by ppm', () => {
    const u = cam().uniformData();
    // The uniform is a Float32Array, so compare against the float32-rounded ideal.
    expect(u[0]).toBeCloseTo(Math.fround((2 * 100) / 800), 12);
    expect(u[1]).toBeCloseTo(Math.fround((2 * 100) / 600), 12);
    expect(u[2]).toBeCloseTo(0, 12);
    expect(u[3]).toBeCloseTo(0, 12);
    expect(u[4]).toBe(800);
    expect(u[5]).toBe(600);
  });

  it('screenToWorld inverts the projection (y up)', () => {
    const c = cam();
    expect(c.screenToWorld(400, 300)).toEqual({ x: 0, y: 0 });
    const w = c.screenToWorld(500, 200);
    expect(w.x).toBeCloseTo(1, 12);
    expect(w.y).toBeCloseTo(1, 12);
  });

  it('zoomAtCss keeps the point under the cursor fixed', () => {
    const c = cam();
    const before = c.screenToWorld(600, 100);
    c.zoomAtCss(600, 100, 1.5);
    const after = c.screenToWorld(600, 100);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
    expect(c.ppm).toBeCloseTo(150, 12);
  });

  it('panByCss moves the centre against the drag, honouring dpr', () => {
    const c = cam();
    c.resize(1600, 1200, 2);
    c.panByCss(100, 0);
    expect(c.cx).toBeCloseTo(-2, 12);
    c.panByCss(0, 50);
    expect(c.cy).toBeCloseTo(1, 12);
  });

  it('fit frames the rect with margin', () => {
    const c = cam();
    c.fit({ minX: 0, minY: 0, maxX: 40, maxY: 10 });
    expect(c.cx).toBe(20);
    expect(c.cy).toBe(5);
    expect(c.ppm).toBeCloseTo((800 / 40) * 0.9, 12);
  });

  describe('pinchCss', () => {
    it('a spread about a fixed midpoint zooms by the distance ratio and keeps the midpoint fixed', () => {
      const c = cam();
      const under = c.screenToWorld(400, 300);
      c.pinchCss({ x: 350, y: 300 }, { x: 450, y: 300 }, { x: 300, y: 300 }, { x: 500, y: 300 });
      expect(c.ppm).toBeCloseTo(200, 9);
      const after = c.screenToWorld(400, 300);
      expect(after.x).toBeCloseTo(under.x, 9);
      expect(after.y).toBeCloseTo(under.y, 9);
    });

    it('keeps the world point under each finger under that finger', () => {
      const c = cam();
      const a0 = { x: 200, y: 150 };
      const b0 = { x: 500, y: 450 };
      const wa = c.screenToWorld(a0.x, a0.y);
      const wb = c.screenToWorld(b0.x, b0.y);
      const a1 = { x: 140, y: 120 }; // spread along the same line, and the pair also drifts
      const b1 = { x: 590, y: 570 };
      c.pinchCss(a0, b0, a1, b1);
      const ca = c.worldToCss(wa);
      const cb = c.worldToCss(wb);
      expect(ca.x).toBeCloseTo(a1.x, 6);
      expect(ca.y).toBeCloseTo(a1.y, 6);
      expect(cb.x).toBeCloseTo(b1.x, 6);
      expect(cb.y).toBeCloseTo(b1.y, 6);
    });

    it('two fingers moving together pan without zooming', () => {
      const c = cam();
      const under = c.screenToWorld(300, 300);
      c.pinchCss({ x: 250, y: 300 }, { x: 350, y: 300 }, { x: 290, y: 320 }, { x: 390, y: 340 - 20 });
      expect(c.ppm).toBeCloseTo(100, 9);
      const moved = c.worldToCss(under);
      expect(moved.x).toBeCloseTo(340, 9);
      expect(moved.y).toBeCloseTo(320, 9);
    });

    it('coincident fingers never produce a non-finite camera', () => {
      const c = cam();
      c.pinchCss({ x: 100, y: 100 }, { x: 100, y: 100 }, { x: 100, y: 100 }, { x: 180, y: 100 });
      c.pinchCss({ x: 100, y: 100 }, { x: 180, y: 100 }, { x: 140, y: 100 }, { x: 140, y: 100 });
      expect(Number.isFinite(c.ppm)).toBe(true);
      expect(Number.isFinite(c.cx)).toBe(true);
      expect(Number.isFinite(c.cy)).toBe(true);
      expect(c.ppm).toBeGreaterThan(0);
    });
  });
});
