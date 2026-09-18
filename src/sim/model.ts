import type { DerivedVehicle } from '../vehicle/derive';

export const SIM_DT = 1 / 120;
export const MAX_SPEED = 2;
export const LOCK_TO_LOCK_SECONDS = 1.5;

export interface VehicleState {
  /** Rear-axle centre, world frame. */
  x: number;
  y: number;
  theta: number;
  steer: number;
  speed: number;
}

export interface ControlInput {
  /** Desired steer angle (rad); the model rate-limits toward it. */
  steer: number;
  /** Desired speed (m/s), applied instantly (kinematic tool, no inertia). */
  speed: number;
}

export interface SimParams {
  wheelbase: number;
  maxSteer: number;
  steerRate: number;
  maxSpeed: number;
}

export function simParamsFor(v: DerivedVehicle): SimParams {
  return {
    wheelbase: v.dims.wheelbase,
    maxSteer: v.maxSteer,
    steerRate: (2 * v.maxSteer) / LOCK_TO_LOCK_SECONDS,
    maxSpeed: MAX_SPEED,
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** One fixed step. Integrates an exact circular arc for piecewise-constant steer and speed. */
export function stepVehicle(s: VehicleState, u: ControlInput, p: SimParams, dt: number): VehicleState {
  const target = clamp(u.steer, -p.maxSteer, p.maxSteer);
  const maxDelta = p.steerRate * dt;
  const steer = s.steer + clamp(target - s.steer, -maxDelta, maxDelta);
  const speed = clamp(u.speed, -p.maxSpeed, p.maxSpeed);
  const ds = speed * dt;
  if (ds === 0) return { ...s, steer, speed };

  const curvature = Math.tan(steer) / p.wheelbase;
  if (Math.abs(curvature) < 1e-9) {
    return { x: s.x + ds * Math.cos(s.theta), y: s.y + ds * Math.sin(s.theta), theta: s.theta, steer, speed };
  }
  const R = 1 / curvature;
  const dTheta = ds * curvature;
  const theta = s.theta + dTheta;
  return {
    x: s.x + R * (Math.sin(theta) - Math.sin(s.theta)),
    y: s.y - R * (Math.cos(theta) - Math.cos(s.theta)),
    theta,
    steer,
    speed,
  };
}
