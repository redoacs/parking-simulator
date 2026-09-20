import { polygonDistance } from '../geom/distance';
import { worldOutline } from '../geom/clearance';
import { boundsOf, type Polygon } from '../geom/polygon';
import { isCollidable, type Scene } from '../scene/types';
import { SIM_DT, simParamsFor, stepVehicle, type VehicleState } from '../sim/model';
import { collisionOutline, type DerivedVehicle } from '../vehicle/derive';
import { drivingDomain, rectPolygon } from './domain';
import { isManeuverGoal } from './goal';
import { CLEARANCE_FLOOR, MAX_REPLAY_STEPS, type Command, type Maneuver } from './types';

/** Replay actual controls. Search's approximate collision checker is not used here. */
export function validateManeuver(commands: Command[], scene: Scene, v: DerivedVehicle, mirrors: boolean): Maneuver | null {
  const sp = simParamsFor(v),
    outline = collisionOutline(v, mirrors);
  const radius = Math.max(...outline.flat().map((p) => Math.hypot(p.x, p.y)));
  const { outer, blocked } = drivingDomain(scene.drivingArea);
  const blockers = blocked.map(rectPolygon);
  const obstacles = scene.obstacles.filter((o) => isCollidable(o.kind)).map((o) => o.polygon);
  let total = 0;
  for (const c of commands) {
    if (
      !Number.isInteger(c.steps) ||
      c.steps <= 0 ||
      !Number.isFinite(c.input.speed) ||
      Math.abs(c.input.speed) > 1 ||
      !Number.isFinite(c.input.steer) ||
      Math.abs(c.input.steer) > sp.maxSteer + 1e-12
    )
      return null;
    total += c.steps;
    if (total > MAX_REPLAY_STEPS) return null;
  }
  if (!total) return null;
  const minDistance = (parts: Polygon[], others: Polygon[]) => {
    let min = Infinity;
    for (const a of parts) for (const b of others) min = Math.min(min, polygonDistance(a, b).distance);
    return min;
  };
  const sample = (s: VehicleState) => {
    const parts = worldOutline(v, s, mirrors),
      bounds = boundsOf(parts);
    const actual = minDistance(parts, obstacles);
    return {
      actual,
      legal: Math.min(
        actual,
        minDistance(parts, blockers),
        bounds.minX - outer.minX,
        outer.maxX - bounds.maxX,
        bounds.minY - outer.minY,
        outer.maxY - bounds.maxY,
      ),
    };
  };
  let s = scene.start,
    previous = sample(s),
    clearance = previous.actual,
    distance = 0,
    lastGear = 0,
    directionChanges = 0;
  if (previous.legal < CLEARANCE_FLOOR) return null;
  const states = [s];
  for (const command of commands) {
    const gear = Math.sign(command.input.speed);
    if (gear) {
      if (lastGear && lastGear !== gear) directionChanges++;
      lastGear = gear;
    }
    for (let i = 0; i < command.steps; i++) {
      const next = stepVehicle(s, command.input, sp, SIM_DT);
      if (next.speed !== 0 && Math.abs(next.steer - command.input.steer) > 1e-9) return null;
      const current = sample(next);
      // stepVehicle applies the new steering angle before integrating an exact constant-curvature arc.
      // Every body point is within half this arclength bound of its nearest endpoint in time.
      // Distance to a fixed closed obstacle is 1-Lipschitz; both endpoints are checked.
      const motion = (Math.abs(next.speed) * SIM_DT * (1 + (radius * Math.abs(Math.tan(next.steer))) / sp.wheelbase)) / 2;
      if (Math.min(previous.legal, current.legal) - motion < CLEARANCE_FLOOR) return null;
      clearance = Math.min(clearance, Math.min(previous.actual, current.actual) - motion);
      distance += Math.abs(next.speed) * SIM_DT;
      states.push(next);
      s = next;
      previous = current;
    }
  }
  if (s.speed !== 0 || Math.abs(s.steer) > 1e-10 || !isManeuverGoal(s, scene, v)) return null;
  return { commands, states, distance, directionChanges, clearance };
}
