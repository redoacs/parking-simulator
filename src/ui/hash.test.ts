import { describe, expect, it } from 'vitest';
import { decodeHash, encodeHash } from './hash';

describe('hash', () => {
  it('round-trips', () => {
    const h = { presetId: 'garage', params: { doorWidth: 2.4, interiorWidth: 3, interiorDepth: 5.5, drivewayWidth: 3, drivewayLength: 5, approachAngle: 90 }, mirrors: false };
    const s = encodeHash(h);
    expect(s).toContain('p=garage');
    expect(s).toContain('m=0');
    expect(decodeHash('#' + s)).toEqual(h);
  });
  it('fills defaults and clamps', () => {
    const d = decodeHash('p=parallel&spotLength=99')!;
    expect(d.presetId).toBe('parallel');
    expect(d.params.spotLength).toBe(8);
    expect(d.params.spotWidth).toBe(2.4);
    expect(d.mirrors).toBe(true);
  });
  it('rejects unknown presets and empty hashes', () => {
    expect(decodeHash('p=bogus')).toBeNull();
    expect(decodeHash('')).toBeNull();
    expect(decodeHash('#')).toBeNull();
  });
});
