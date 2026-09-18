import { describe, expect, it } from 'vitest';
import { SIM_DT, stepVehicle, type SimParams, type VehicleState } from './model';

const p: SimParams = { wheelbase: 2.689, maxSteer: 0.61, steerRate: 100, maxSpeed: 2 };
const start: VehicleState = { x: 0, y: 0, theta: 0, steer: 0, speed: 0 };

describe('stepVehicle', () => {
  it('drives straight at zero steer', () => {
    let s = start;
    for (let i = 0; i < 120; i++) s = stepVehicle(s, { steer: 0, speed: 1 }, p, SIM_DT);
    expect(s.x).toBeCloseTo(1, 9);
    expect(s.y).toBeCloseTo(0, 12);
    expect(s.theta).toBeCloseTo(0, 12);
  });

  it('closes a full circle at constant steer within 1 mm', () => {
    const delta = 0.5;
    const R = p.wheelbase / Math.tan(delta);
    const v = 1;
    const T = (2 * Math.PI * R) / v;
    const n = Math.round(T / SIM_DT);
    const dt = T / n; // exact arc integration makes any dt exact; this just lands on the closure
    let s = { ...start, steer: delta };
    for (let i = 0; i < n; i++) s = stepVehicle(s, { steer: delta, speed: v }, p, dt);
    expect(Math.hypot(s.x, s.y)).toBeLessThan(1e-3);
    expect(Math.abs(((s.theta + Math.PI) % (2 * Math.PI)) - Math.PI)).toBeLessThan(1e-6);
  });

  it('integrates an exact arc in one coarse step (Euler would land at (ds, 0))', () => {
    const delta = 0.4;
    const R = p.wheelbase / Math.tan(delta);
    const v = 1;
    const dt = ((Math.PI / 2) * R) / v; // a quarter turn in a single step
    const s = stepVehicle({ ...start, steer: delta }, { steer: delta, speed: v }, p, dt);
    expect(s.x).toBeCloseTo(R, 9);
    expect(s.y).toBeCloseTo(R, 9);
    expect(s.theta).toBeCloseTo(Math.PI / 2, 9);
  });

  it('mirrors the arc for negative steer', () => {
    const delta = -0.4;
    const R = p.wheelbase / Math.tan(Math.abs(delta));
    const dt = (Math.PI / 2) * R;
    const s = stepVehicle({ ...start, steer: delta }, { steer: delta, speed: 1 }, p, dt);
    expect(s.x).toBeCloseTo(R, 9);
    expect(s.y).toBeCloseTo(-R, 9);
    expect(s.theta).toBeCloseTo(-Math.PI / 2, 9);
  });

  it('reversing with positive steer traces the same circle backwards', () => {
    const delta = 0.4;
    const R = p.wheelbase / Math.tan(delta);
    const dt = (Math.PI / 2) * R;
    const s = stepVehicle({ ...start, steer: delta }, { steer: delta, speed: -1 }, p, dt);
    expect(s.x).toBeCloseTo(-R, 9);
    expect(s.y).toBeCloseTo(R, 9);
    expect(s.theta).toBeCloseTo(-Math.PI / 2, 9);
  });

  it('turns left (theta increases) for positive steer going forward', () => {
    const s = stepVehicle({ ...start, steer: 0.3 }, { steer: 0.3, speed: 1 }, p, 0.5);
    expect(s.theta).toBeGreaterThan(0);
    expect(s.y).toBeGreaterThan(0);
  });

  it('reversing with positive steer turns theta negative', () => {
    const s = stepVehicle({ ...start, steer: 0.3 }, { steer: 0.3, speed: -1 }, p, 0.5);
    expect(s.theta).toBeLessThan(0);
    expect(s.x).toBeLessThan(0);
  });

  it('rate-limits steering', () => {
    const slow: SimParams = { ...p, steerRate: 0.2 };
    const s = stepVehicle(start, { steer: 0.61, speed: 0 }, slow, 0.5);
    expect(s.steer).toBeCloseTo(0.1, 12);
  });

  it('clamps steer and speed', () => {
    const s = stepVehicle(start, { steer: 5, speed: 9 }, p, 1);
    expect(s.steer).toBe(p.maxSteer);
    expect(s.speed).toBe(p.maxSpeed);
  });

  it('does not move with zero speed', () => {
    const s = stepVehicle(start, { steer: 0.4, speed: 0 }, p, 1);
    expect(s.x).toBe(0);
    expect(s.y).toBe(0);
  });
});
