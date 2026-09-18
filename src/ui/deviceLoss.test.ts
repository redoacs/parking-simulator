import { describe, expect, it } from 'vitest';
import { decideOnDeviceLoss, DEVICE_LOSS_KEY, DEVICE_LOSS_WINDOW_MS } from './deviceLoss';

function fakeStore(initial: Record<string, string> = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), map: m };
}

describe('decideOnDeviceLoss', () => {
  it('reloads on the first loss and records the time', () => {
    const s = fakeStore();
    expect(decideOnDeviceLoss(s, 1000)).toBe('reload');
    expect(s.map.get(DEVICE_LOSS_KEY)).toBe('1000');
  });
  it('gives up on a second loss inside the window', () => {
    const s = fakeStore({ [DEVICE_LOSS_KEY]: '1000' });
    expect(decideOnDeviceLoss(s, 1000 + DEVICE_LOSS_WINDOW_MS - 1)).toBe('fatal');
  });
  it('treats a stale marker as a fresh loss', () => {
    const s = fakeStore({ [DEVICE_LOSS_KEY]: '1000' });
    expect(decideOnDeviceLoss(s, 1000 + DEVICE_LOSS_WINDOW_MS)).toBe('reload');
    expect(s.map.get(DEVICE_LOSS_KEY)).toBe(String(1000 + DEVICE_LOSS_WINDOW_MS));
  });
  it('fails safe to the message when storage is unavailable or throws', () => {
    expect(decideOnDeviceLoss(null, 5)).toBe('reload');
    const throwing = { getItem: () => { throw new Error('blocked'); }, setItem: () => {} };
    expect(decideOnDeviceLoss(throwing, 5)).toBe('fatal');
  });
});
