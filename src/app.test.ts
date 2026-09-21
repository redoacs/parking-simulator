import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './app';
import { Camera } from './render/camera';
import type { Renderer } from './render/renderer';
import { defaultParams, getPreset } from './scene/presets';
import taos from './vehicle/data/taos-trendline-mx-2025.json';
import { validateVehicleSpec } from './vehicle/validate';
import { deriveVehicle } from './vehicle/derive';
import { SIM_DT, type VehicleState } from './sim/model';

const vehicle = deriveVehicle(validateVehicleSpec(taos));

/** App with the GPU and DOM stubbed out; `frames(n, hz)` runs n animation frames at a fixed refresh rate. */
function harness(
  historySeconds?: number,
  start?: VehicleState,
): {
  app: App;
  camera: Camera;
  rebuildEnvelope: ReturnType<typeof vi.fn>;
  frames(n: number, hz?: number): void;
  until(done: () => boolean): void;
} {
  let pending: ((t: number) => void) | undefined;
  let now = 0;
  vi.stubGlobal('window', { addEventListener: () => undefined });
  vi.stubGlobal('screen', {}); // no orientation API here: App must cope, as it does in browsers without one
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {
        // stub
      }
    },
  );
  vi.stubGlobal('requestAnimationFrame', (cb: (t: number) => void) => {
    pending = cb;
    return 0;
  });
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  const camera = new Camera();
  camera.resize(800, 600, 1);
  const renderer = {
    camera,
    resize: () => undefined,
    frame: () => undefined,
    resetEnvelope: () => undefined,
    rebuildEnvelope: vi.fn(),
  };
  const canvas = { addEventListener: () => undefined, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }) };
  const app = new App(canvas as unknown as HTMLCanvasElement, renderer as unknown as Renderer, vehicle, historySeconds);
  const garage = getPreset('garage')!;
  if (start) {
    const build = garage.build.bind(garage);
    vi.spyOn(garage, 'build').mockImplementation((params) => ({ ...build(params), start }));
  }
  app.setPreset(garage.id, defaultParams(garage)); // starts on the driveway facing the back wall
  app.start();
  return {
    app,
    camera,
    rebuildEnvelope: renderer.rebuildEnvelope,
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

it('keeps held driving input when no preview exists, including a mirror edit', () => {
  const h = harness();
  h.app.input.setKey('forward', true);
  h.frames(2);
  h.app.showManeuver(null); // searching, limit, error or idle cancellation
  h.app.setMirrors(false);
  h.frames(2);
  expect(h.app.snapshot().state.speed).toBe(2);
});

describe('App rewind', () => {
  it('does not retain a future contact time when rewind skips an idle mirror toggle', () => {
    const h = harness(undefined, { x: 0.94, y: 1.5, theta: Math.PI / 2, steer: 0, speed: 0 });
    h.app.setMirrors(false);
    h.app.reset();
    h.frames(120);
    expect(h.app.snapshot().firstContactTime).toBeNull();
    h.app.setMirrors(true);
    expect(h.app.snapshot().firstContactTime).toBeGreaterThan(1);
    h.app.input.setKey('rewind', true);
    h.frames(1);
    const after = h.app.snapshot();
    expect(after.simTime).toBe(0);
    expect(after.contact).toBe(true);
    expect(after.firstContactTime).toBe(0);
  });

  it('rebuilds the envelope once on release and skips repeated poses from stationary steering', () => {
    const h = harness();
    h.app.input.setKey('forward', true);
    h.frames(30);
    h.app.input.setKey('forward', false);
    const moved = h.app.snapshot().historyLength;
    h.app.input.setKey('left', true);
    h.frames(30);
    h.app.input.setKey('left', false);
    h.app.input.setKey('rewind', true);
    h.frames(5);
    expect(h.rebuildEnvelope).not.toHaveBeenCalled();
    h.app.input.setKey('rewind', false);
    h.frames(1);
    expect(h.rebuildEnvelope).toHaveBeenCalledTimes(1);
    expect(h.rebuildEnvelope.mock.calls[0]![0]).toHaveLength(moved * 3); // body and two mirrors per moving pose
  });
  it('rewinds elapsed pauses as well as movement and returns the clock to zero', () => {
    const h = harness();
    const start = h.app.snapshot().state;
    h.app.input.setKey('forward', true);
    h.frames(60);
    h.app.input.setKey('forward', false);
    h.frames(120);
    h.app.input.setKey('rewind', true);
    h.frames(2 * 60);
    expect(h.app.snapshot().historyLength).toBe(0);
    expect(h.app.snapshot().state).toEqual(start);
    expect(h.app.snapshot().simTime).toBe(0);
  });

  it('rewinds stationary steering through its intermediate angles', () => {
    const h = harness();
    h.app.input.setKey('left', true);
    h.frames(30);
    h.app.input.setKey('left', false);
    const before = h.app.snapshot();
    h.app.input.setKey('rewind', true);
    h.frames(5);
    const after = h.app.snapshot();
    expect(after.state.x).toBe(before.state.x);
    expect(after.state.y).toBe(before.state.y);
    expect(after.state.steer).toBeGreaterThan(0);
    expect(after.state.steer).toBeLessThan(before.state.steer);
    expect(before.simTime - after.simTime).toBeCloseTo((before.historyLength - after.historyLength) * SIM_DT, 12);
  });

  it('skips idle gaps without evicting the preceding activity', () => {
    const h = harness(2);
    h.app.input.setKey('forward', true);
    h.frames(30);
    h.app.input.setKey('forward', false);
    const beforePause = h.app.snapshot();
    h.frames(5 * 60);
    expect(h.app.snapshot().historyLength).toBe(beforePause.historyLength);
    h.app.input.setKey('forward', true);
    h.frames(30);
    h.app.input.setKey('forward', false);
    h.app.input.setKey('rewind', true);
    h.until(() => h.app.snapshot().historyLength <= beforePause.historyLength);
    const after = h.app.snapshot();
    expect(after.simTime).toBeCloseTo(beforePause.simTime - (beforePause.historyLength - after.historyLength) * SIM_DT, 12);
    expect(after.state.y).toBeLessThanOrEqual(beforePause.state.y);
  });

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

describe('App contact timing', () => {
  it('records a brief contact between two clear render-frame endpoints', () => {
    // A bounded arc past a real driveway kerb: the body/mirror union is clear at both endpoints,
    // but the intervening fixed steps overlap. This fixture relies on 12 fixed steps in the clamped 0.1 s frame.
    // It is a fixture pose, not a recorded drive from the preset start.
    const h = harness(undefined, {
      x: 2.714578051585704,
      y: -6.996801107865759,
      theta: 0.7561329143937879,
      steer: 0.5962563737537455,
      speed: 0,
    });
    expect(h.app.snapshot().contact).toBe(false);
    h.app.input.setKey('forward', true);
    h.frames(1, 10);
    expect(h.app.snapshot().contact).toBe(false);
    expect(h.app.snapshot().firstContactTime).toBeCloseTo(SIM_DT, 12);
  });

  it.each([10, 30, 60, 120])('records the same first-contact step at %i rendered frames per second', (hz) => {
    const h = harness();
    h.app.input.setKey('forward', true);
    h.frames(6 * hz, hz);
    expect(h.app.snapshot().firstContactTime).toBeCloseTo(5.275, 9);
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
