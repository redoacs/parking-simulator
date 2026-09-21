import { boundsOf } from '../geom/polygon';
import { worldOutline } from '../geom/clearance';
import type { Scene } from '../scene/types';
import { SIM_DT, simParamsFor, stepVehicle, type VehicleState } from '../sim/model';
import type { DerivedVehicle } from '../vehicle/derive';
import { commandsFor } from './controls';
import { domainFor } from './domain';
import { dubins, type Leg } from './dubins';
import { compareParking, isManeuverGoal, parkedQuality, targetGeometry } from './goal';
import { CLEARANCE_FLOOR, type Maneuver } from './types';
import { validateManeuver } from './validate';

type SearchEnd = 'target' | 'time' | 'expansions' | 'nodes' | 'exhausted' | 'invalid';
export type PlanResult = ({ status: 'found'; maneuver: Maneuver } | { status: 'limit' }) & { expanded: number; reason: SearchEnd };
interface Node {
  s: VehicleState;
  g: number;
  f: number;
  parent: Node | null;
  leg: Leg | null;
  gear: number;
}
class Heap {
  nodes: Node[] = [];
  push(n: Node) {
    this.nodes.push(n);
    let i = this.nodes.length - 1;
    while (i > 0) {
      const j = (i - 1) >> 1;
      if (this.nodes[j]!.f <= n.f) break;
      this.nodes[i] = this.nodes[j]!;
      i = j;
    }
    this.nodes[i] = n;
  }
  pop() {
    const top = this.nodes[0]!;
    const n = this.nodes.pop()!;
    if (this.nodes.length) {
      let i = 0;
      while (i * 2 + 1 < this.nodes.length) {
        let j = i * 2 + 1;
        if (j + 1 < this.nodes.length && this.nodes[j + 1]!.f < this.nodes[j]!.f) j++;
        if (this.nodes[j]!.f >= n.f) break;
        this.nodes[i] = this.nodes[j]!;
        i = j;
      }
      this.nodes[i] = n;
    }
    return top;
  }
}
const angle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const MAX_NODES = 250000;

/** Bounded weighted Hybrid A*: maximize final margin, then centering. No global route-optimality guarantee. */
export function planManeuver(
  scene: Scene,
  v: DerivedVehicle,
  mirrors: boolean,
  maxExpansions = 100000,
  maxMilliseconds = 10000,
): PlanResult {
  const started = performance.now(),
    domain = domainFor(scene, v, mirrors),
    sp = simParamsFor(v),
    target = targetGeometry(scene, v);
  const headings = scene.parkingHeadings;
  const goals: VehicleState[] = [];
  // A moving tick needs a half-sweep allowance above the hard floor. Use the largest steering sweep
  // so a constrained target remains approachable without a second, slower motion model.
  const arrivalClearance = CLEARANCE_FLOOR + ((1 + (domain.radius * Math.abs(Math.tan(sp.maxSteer))) / sp.wheelbase) * SIM_DT) / 2 + 1e-5;
  for (const theta of headings) {
    const s = {
      x: target.x - target.bodyOffset * Math.cos(theta),
      y: target.y - target.bodyOffset * Math.sin(theta),
      theta,
      steer: 0,
      speed: 0,
    };
    // In narrow parallel spaces the kerb-side domain edge prevents centering, even with the kerb off.
    // Project onto the outer domain's feasible center interval instead of rounding a lateral grid.
    const b = boundsOf(worldOutline(v, s, mirrors));
    s.x += Math.max(domain.outer.minX + arrivalClearance - b.minX, Math.min(0, domain.outer.maxX - arrivalClearance - b.maxX));
    s.y += Math.max(domain.outer.minY + arrivalClearance - b.minY, Math.min(0, domain.outer.maxY - arrivalClearance - b.maxY));
    if (isManeuverGoal(s, scene, v) && domain.clearance(s) >= arrivalClearance - 1e-10) goals.push(s);
  }
  let expanded = 0;
  if (!goals.length || domain.clearance(scene.start) < CLEARANCE_FLOOR) return { status: 'limit', expanded, reason: 'invalid' };
  goals.sort((a, b) => compareParking(parkedQuality(a, scene, v, mirrors), parkedQuality(b, scene, v, mirrors)));
  const targetQuality = parkedQuality(goals[0]!, scene, v, mirrors);
  const h = (s: VehicleState) => Math.min(...goals.map((t) => Math.hypot(s.x - t.x, s.y - t.y) + 3 * Math.abs(angle(s.theta - t.theta))));
  const isGoal = (s: VehicleState) => isManeuverGoal(s, scene, v);
  const key = (s: VehicleState, gear: number) =>
    `${Math.round(s.x / 0.15)},${Math.round(s.y / 0.15)},${Math.round(((angle(s.theta) + 2 * Math.PI) % (2 * Math.PI)) / (Math.PI / 36)) % 72},${gear}`;
  const advance = (initial: VehicleState, leg: Leg): { s: VehicleState; gap: number } | null => {
    const gear = Math.sign(leg.distance),
      steer = leg.steer;
    // Settling at rest leaves pose unchanged. Batched constant-steer steps are exact arcs, just as SIM_DT replay is.
    let s = { ...initial, steer, speed: 0 };
    const fullSteps = Math.floor(Math.abs(leg.distance) / SIM_DT),
      rem = Math.abs(leg.distance) - fullSteps * SIM_DT;
    const sweep = (1 + (domain.radius * Math.abs(Math.tan(steer))) / sp.wheelbase) * SIM_DT;
    const threshold = CLEARANCE_FLOOR + sweep / 2 + 1e-6;
    let done = 0,
      minGap = domain.clearance(s);
    while (done < fullSteps) {
      const gap = domain.clearance(s);
      minGap = Math.min(minGap, gap);
      if (gap < threshold) return null;
      // A point cannot move farther than this arclength bound. Near obstacles, reduce to single ticks.
      const count = Math.min(fullSteps - done, 12, Math.max(1, Math.floor((gap - CLEARANCE_FLOOR) / sweep)));
      s = stepVehicle(s, { speed: gear, steer }, sp, count * SIM_DT);
      done += count;
    }
    if (rem > 1e-10) s = stepVehicle(s, { speed: (gear * rem) / SIM_DT, steer }, sp, SIM_DT);
    minGap = Math.min(minGap, domain.clearance(s));
    return minGap < threshold ? null : { s, gap: minGap };
  };
  const start: Node = { s: scene.start, g: 0, f: h(scene.start), parent: null, leg: null, gear: 0 };
  const open = new Heap();
  open.push(start);
  const visited = new Map<string, number>();
  let generated = 1;
  const cost = (n: Node, leg: Leg, gap: number) =>
    Math.abs(leg.distance) * (1 + (3 * Math.max(0, 0.3 - gap)) / 0.3) +
    (n.gear && n.gear !== Math.sign(leg.distance) ? 6 : 0) +
    (Math.abs(n.s.steer - leg.steer) > 0.001 ? 1 : 0);
  const finish = (n: Node): Maneuver | null => {
    const legs: Leg[] = [];
    let at: Node | null = n;
    while (at?.leg) {
      legs.unshift(at.leg);
      at = at.parent;
    }
    return validateManeuver(commandsFor(legs, scene.start.steer, sp), scene, v, mirrors);
  };
  const candidate: { maneuver: Maneuver | null; cost: number } = {
    maneuver: null,
    cost: Infinity,
  };
  const aligned = (m: Maneuver) => headings.some((theta) => Math.abs(angle(m.states.at(-1)!.theta - theta)) <= 1e-6);
  const reachesTarget = (m: Maneuver) =>
    aligned(m) && m.parkedMargin >= targetQuality.parkedMargin - 1e-6 && m.centerOffset <= targetQuality.centerOffset + 1e-6;
  const atTarget = () => candidate.maneuver !== null && reachesTarget(candidate.maneuver);
  const consider = (n: Node) => {
    const quality = parkedQuality(n.s, scene, v, mirrors);
    const order = candidate.maneuver ? compareParking(quality, candidate.maneuver) : -1;
    if (order > 0 || (order === 0 && n.g >= candidate.cost)) return;
    const maneuver = finish(n);
    if (!maneuver) return;
    const replayOrder = candidate.maneuver ? compareParking(maneuver, candidate.maneuver) : -1;
    if (replayOrder > 0 || (replayOrder === 0 && n.g >= candidate.cost)) return;
    maneuver.placement =
      maneuver.centerOffset <= 0.001 && aligned(maneuver) ? 'centered' : reachesTarget(maneuver) ? 'adjusted' : 'bestFound';
    candidate.maneuver = maneuver;
    candidate.cost = n.g;
  };
  let reason: SearchEnd = 'exhausted';
  while (open.nodes.length && expanded < maxExpansions && generated < MAX_NODES) {
    if (performance.now() - started >= maxMilliseconds) {
      reason = 'time';
      break;
    }
    const n = open.pop();
    if ((visited.get(key(n.s, n.gear)) ?? Infinity) < n.g) continue;
    expanded++;
    if (isGoal(n.s)) consider(n);
    if (atTarget()) break;
    // Try every nearby pose: sampling only each eighth pop can miss the sole usable connection
    // when tiny floating-point differences change heap order between browser engines.
    const nearGoal = goals.some((goal) => Math.hypot(n.s.x - goal.x, n.s.y - goal.y) <= v.dims.length);
    if (expanded === 1 || expanded % 8 === 0 || nearGoal) {
      const shots = goals.flatMap((goal) =>
        ([1, -1] as const).flatMap((gear) => dubins(n.s, goal, sp.wheelbase / Math.tan(sp.maxSteer), sp.maxSteer, gear)),
      );
      shots.sort((a, b) => a.reduce((v, l) => v + Math.abs(l.distance), 0) - b.reduce((v, l) => v + Math.abs(l.distance), 0));
      for (const shot of shots) {
        if (shot.reduce((v, l) => v + Math.abs(l.distance), 0) > 25) continue;
        let at = n;
        let ok = true;
        for (const leg of shot) {
          const result = advance(at.s, leg);
          if (!result) {
            ok = false;
            break;
          }
          at = { s: result.s, leg, g: at.g + cost(at, leg, result.gap), f: 0, parent: at, gear: Math.sign(leg.distance) };
        }
        if (ok && isGoal(at.s)) consider(at);
        if (atTarget()) break;
      }
    }
    if (atTarget()) break;
    for (const gear of [1, -1])
      for (const fraction of [-1, 0, 1])
        for (const length of [0.35, 1.4]) {
          const leg = { steer: fraction * sp.maxSteer, distance: gear * length };
          const result = advance(n.s, leg);
          if (!result) continue;
          const { s, gap } = result,
            k = key(s, gear),
            g = n.g + cost(n, leg, gap);
          if ((visited.get(k) ?? Infinity) <= g) continue;
          if (generated >= MAX_NODES) continue;
          visited.set(k, g);
          generated++;
          open.push({ s, g, f: g + 2.5 * h(s), parent: n, leg, gear });
        }
  }
  if (atTarget()) reason = 'target';
  else if (expanded >= maxExpansions) reason = 'expansions';
  else if (generated >= MAX_NODES) reason = 'nodes';
  return candidate.maneuver ? { status: 'found', maneuver: candidate.maneuver, expanded, reason } : { status: 'limit', expanded, reason };
}
