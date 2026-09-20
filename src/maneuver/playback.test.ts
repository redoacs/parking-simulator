import { expect, it } from 'vitest';
import { ManeuverPlayback } from './playback';
import type { Maneuver } from './types';
const plan: Maneuver = {
  commands: [
    { input: { speed: 0, steer: 0.5 }, steps: 2 },
    { input: { speed: 1, steer: 0.5 }, steps: 3 },
    { input: { speed: 0.25, steer: 0.5 }, steps: 1 },
    { input: { speed: -1, steer: 0.5 }, steps: 2 },
    { input: { speed: 0, steer: 0 }, steps: 1 },
  ],
  states: Array.from({ length: 10 }, (_, i) => ({ x: i, y: 0, theta: 0, steer: 0, speed: i === 9 ? 0 : 1 })),
  distance: 0.04,
  directionChanges: 1,
  clearance: 0.1,
};
it('groups settling and fractional motion into one instruction, and steps without playing', () => {
  const p = new ManeuverPlayback(plan);
  expect(p.steps).toHaveLength(3);
  expect(p.steps[0]).toMatchObject({ start: 0, end: 6, steer: 0.5, gear: 1 });
  p.next();
  expect(p.snapshot()).toMatchObject({ frame: 6, step: 1, playing: false });
  p.next();
  p.next();
  expect(p.snapshot()).toMatchObject({ frame: 9, instruction: null, playing: false });
  p.next();
  expect(p.frame).toBe(9);
});
it('advances only over validated frames, pauses, and restarts after completion', () => {
  const p = new ManeuverPlayback(plan);
  p.toggle();
  p.advance(1 / 240);
  expect(p.frame).toBe(0);
  p.advance(1 / 240);
  expect(p.frame).toBe(1);
  p.pause();
  p.advance(1);
  expect(p.frame).toBe(1);
  p.toggle();
  p.advance(1);
  expect(p.snapshot()).toMatchObject({ frame: 9, playing: false, state: plan.states[9] });
  p.toggle();
  expect(p.snapshot()).toMatchObject({ frame: 0, playing: true });
  p.restart();
  expect(p.snapshot()).toMatchObject({ frame: 0, playing: false });
  expect(plan.states[0]!.x).toBe(0);
});
