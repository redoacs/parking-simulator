import { describe, expect, it } from 'vitest';
import { envelopeTextureSize, envelopeTexel, ENVELOPE_PX_PER_M } from './envelope';

const bounds = { minX: -2, minY: -1, maxX: 8, maxY: 4 }; // 10 × 5 m

describe('envelopeTextureSize', () => {
  it('uses 200 px/m when it fits', () => {
    expect(envelopeTextureSize(bounds, 8192)).toEqual({ width: 2000, height: 1000, pxPerM: ENVELOPE_PX_PER_M });
  });
  it('scales down uniformly to the device limit', () => {
    const s = envelopeTextureSize(bounds, 1000);
    expect(s.width).toBe(1000);
    expect(s.height).toBe(500);
    expect(s.pxPerM).toBeCloseTo(100, 12);
  });
});

describe('envelopeTexel', () => {
  it('maps minX/maxY to the top-left texel and maxX/minY to bottom-right', () => {
    expect(envelopeTexel(bounds, 2000, 1000, { x: -2, y: 4 })).toEqual({ x: 0, y: 0 });
    expect(envelopeTexel(bounds, 2000, 1000, { x: 7.999, y: -0.999 })).toEqual({ x: 1999, y: 999 });
  });
  it('returns null outside the bounds', () => {
    expect(envelopeTexel(bounds, 2000, 1000, { x: 9, y: 0 })).toBeNull();
  });
});
