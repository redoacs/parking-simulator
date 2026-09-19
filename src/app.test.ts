import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './app';
import { Camera } from './render/camera';
import type { Renderer } from './render/renderer';
import { defaultParams, getPreset } from './scene/presets';
import taos from './vehicle/data/taos-trendline-mx-2025.json';
import { validateVehicleSpec } from './vehicle/validate';
import { deriveVehicle } from './vehicle/derive';

const vehicle = deriveVehicle(validateVehicleSpec(taos));

/** App with the GPU and DOM stubbed out; `frames(n, hz)` runs n animation frames at a fixed refresh rate. */
function harness(historySeconds?: number): { app: App; camera: Camera; frames(n: number, hz?: number): void; until(done: () => boolean): void } {
  let pending: ((t: number) => void) | undefined;
  let now = 0;
  vi.stubGlobal('window', { addEventListener: () => undefined });
  vi.stubGlobal('ResizeObserver', class { observe(): void {} });
  vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => { pending = cb; return 0; });
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const camera = new Camera();
  camera.resize(800, 600, 1);
  const renderer = { camera, resize: () => undefined, frame: () => undefined, resetEnvelope: () => undefined, rebuildEnvelope: () => undefined };
  const canvas = { addEventListener: () => undefined, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) };
  const app = new App(canvas as unknown as HTMLCanvasElement, renderer as unknown as Renderer, vehicle, historySeconds);
  const garage = getPreset('garage')!;
  app.setPreset(garage.id, defaultParams(garage)); // starts on the driveway facing the back wall
  app.start();
  return {
    app,
    camera,
    frames(n, hz = 60) {
      for (let i = 0; i < n; i++) {
        now += 1000 / hz;
        pending!(now);
      }
    },
    /** Bounded: a synchronous loop that never ends cannot be interrupted by the test timeout. */
    until(done) {
      for (let i = 0; i < 5000 && !done(); i++) this.frames(1);
      if (!done()) throw new Error('condition not reached within 5000 frames');
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('App rewind', () => {
  it.each([60, 90, 144, 240])('pops history at 2x real time on a %i Hz display', (hz) => {
    const h = harness();
    h.app.input.setKey('forward', true);
    h.frames(4 * 60);
    h.app.input.setKey('forward', false);
    const before = h.app.snapshot().historyLength;
    h.app.input.setKey('rewind', true);
    h.frames(hz, hz); // one second
    expect(before - h.app.snapshot().historyLength).toBeGreaterThanOrEqual(239);
    expect(before - h.app.snapshot().historyLength).toBeLessThanOrEqual(241);
  });

  it('keeps first contact across ring eviction, clears it only when rewound past it, and never teleports to the start', () => {
    const h = harness(10);
    const startY = h.app.snapshot().state.y;
    h.app.input.setKey('forward', true);
    h.until(() => h.app.snapshot().firstContactTime !== null); // drive through the garage into the back wall
    const contactAt = h.app.snapshot().historyLength;
    const contactTime = h.app.snapshot().firstContactTime;
    expect(contactAt).toBeLessThan(1200); // contact is recorded before anything is evicted
    h.until(() => h.app.snapshot().historyLength >= 1200);
    h.frames(30); // 60 more states: the ring is full, so 60 are evicted
    h.app.input.setKey('forward', false);

    // Rewound to a length below the recorded one, but not past the contact itself. The car is still inside the wall
    // here, so a wrongly cleared contact is re-recorded at once: pin the time, not just its presence.
    h.app.input.setKey('rewind', true);
    h.until(() => h.app.snapshot().historyLength <= contactAt - 20);
    expect(h.app.snapshot().firstContactTime).toBe(contactTime);

    h.until(() => h.app.snapshot().historyLength <= contactAt - 100);
    expect(h.app.snapshot().firstContactTime).toBeNull();

    h.frames(20 * 60);
    expect(h.app.snapshot().historyLength).toBe(1);
    expect(h.app.snapshot().state.y).toBeGreaterThan(startY + 0.1);
  });

  it('tracks a first contact made after eviction has begun', () => {
    const h = harness(2); // 240 states: the ring is evicting long before the car reaches the back wall
    h.app.input.setKey('forward', true);
    h.until(() => h.app.snapshot().firstContactTime !== null);
    const contactTime = h.app.snapshot().firstContactTime;
    h.frames(15); // 30 states past the contact
    h.app.input.setKey('forward', false);
    h.app.input.setKey('rewind', true);
    h.frames(5); // 20 states back: still past the contact
    expect(h.app.snapshot().firstContactTime).toBe(contactTime);
    h.frames(5); // 40 back: before it
    expect(h.app.snapshot().firstContactTime).toBeNull();
  });

  it('with nothing evicted, a full rewind returns to the start pose', () => {
    const h = harness();
    const start = h.app.snapshot().state;
    h.app.input.setKey('forward', true);
    h.frames(60);
    h.app.input.setKey('forward', false);
    h.app.input.setKey('rewind', true);
    h.frames(5 * 60);
    expect(h.app.snapshot().historyLength).toBe(0);
    expect(h.app.snapshot().state).toEqual(start);
  });
});

describe('App.zoomBy', () => {
  it('zooms in for factors above 1, about the canvas centre', () => {
    const h = harness();
    const { ppm, cx, cy } = h.camera;
    h.app.zoomBy(1.25);
    expect(h.camera.ppm).toBeCloseTo(ppm * 1.25, 9);
    expect(h.camera.cx).toBeCloseTo(cx, 9);
    expect(h.camera.cy).toBeCloseTo(cy, 9);
  });
});
