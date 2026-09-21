import type { Pose } from '../geom/polygon';
import type { Scene } from '../scene/types';
import { SIM_DT, simParamsFor, stepVehicle, type VehicleState } from '../sim/model';
import type { DerivedVehicle } from '../vehicle/derive';
import { commandsFor } from './controls';
import { domainFor } from './domain';
import { dubins, type Leg } from './dubins';
import { isManeuverGoal, targetGeometry } from './goal';
import { CLEARANCE_FLOOR, type Maneuver } from './types';
import { validateManeuver } from './validate';

export type PlanResult = { status: 'found'; maneuver: Maneuver; expanded: number } | { status: 'limit'; expanded: number };
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

/** Bounded weighted Hybrid A*. Feasible suggestion only; discretization and heuristic do not guarantee an optimum. */
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
  const goals: Pose[] = [];
  for (const theta of headings) {
    // A centred mirror can touch the kerb in a 2 m spot. Prefer the nearest valid lateral placement.
    for (let i = 0; i <= 30; i++) {
      const shift = (i % 2 === 0 ? -1 : 1) * Math.ceil(i / 2) * 0.01;
      const s = {
        x: target.x - target.bodyOffset * Math.cos(theta) - shift * Math.sin(target.theta),
        y: target.y - target.bodyOffset * Math.sin(theta) + shift * Math.cos(target.theta),
        theta,
        steer: 0,
        speed: 0,
      };
      if (isManeuverGoal(s, scene, v) && domain.clearance(s) >= CLEARANCE_FLOOR) {
        goals.push(s);
        break;
      }
    }
  }
  let expanded = 0;
  if (!goals.length || domain.clearance(scene.start) < CLEARANCE_FLOOR) return { status: 'limit', expanded };
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
  const finish = (n: Node): PlanResult | null => {
    const legs: Leg[] = [];
    let at: Node | null = n;
    while (at?.leg) {
      legs.unshift(at.leg);
      at = at.parent;
    }
    const maneuver = validateManeuver(commandsFor(legs, scene.start.steer, sp), scene, v, mirrors);
    return maneuver ? { status: 'found', maneuver, expanded } : null;
  };
  const candidate: { node: Node | null; finishAfter: number } = { node: null, finishAfter: Infinity };
  const consider = (n: Node) => {
    if (!candidate.node || n.g < candidate.node.g) candidate.node = n;
    candidate.finishAfter = Math.min(candidate.finishAfter, expanded + 3000);
  };
  while (open.nodes.length && expanded < maxExpansions && generated < MAX_NODES && expanded < candidate.finishAfter) {
    if (performance.now() - started >= maxMilliseconds) break;
    const n = open.pop();
    if ((visited.get(key(n.s, n.gear)) ?? Infinity) < n.g) continue;
    expanded++;
    if (isGoal(n.s)) consider(n);
    if (expanded === 1 || expanded % 8 === 0) {
      const shots = goals.flatMap((goal) =>
        ([1, -1] as const).flatMap((gear) => dubins(n.s, goal, sp.wheelbase / Math.tan(sp.maxSteer), sp.maxSteer, gear)),
      );
      shots.sort((a, b) => a.reduce((v, l) => v + Math.abs(l.distance), 0) - b.reduce((v, l) => v + Math.abs(l.distance), 0));
      let chosen: Node | null = null;
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
        if (ok && isGoal(at.s) && (!chosen || at.g < chosen.g)) chosen = at;
      }
      if (chosen) consider(chosen);
    }
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
  return (candidate.node ? finish(candidate.node) : null) ?? { status: 'limit', expanded };
}
