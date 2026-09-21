import { SIM_DT, type SimParams } from '../sim/model';
import type { Leg } from './dubins';
import type { Command } from './types';

/** Coalesce identical arcs, then emit actual rate-limited steering at rest and fixed-tick motion. */
export function commandsFor(legs: Leg[], initialSteer: number, sp: SimParams): Command[] {
  const merged: Leg[] = [];
  for (const leg of legs) {
    const previous = merged.at(-1);
    if (previous?.steer === leg.steer && Math.sign(previous.distance) === Math.sign(leg.distance)) previous.distance += leg.distance;
    else merged.push({ ...leg });
  }
  const commands: Command[] = [];
  let steer = initialSteer;
  for (const leg of merged) {
    const ticks = Math.ceil(Math.abs(leg.steer - steer) / sp.steerRate / SIM_DT);
    if (ticks) commands.push({ input: { speed: 0, steer: leg.steer }, steps: ticks });
    steer = leg.steer;
    const steps = Math.floor(Math.abs(leg.distance) / SIM_DT),
      remainder = Math.abs(leg.distance) - steps * SIM_DT;
    const gear = Math.sign(leg.distance);
    if (steps) commands.push({ input: { steer, speed: gear }, steps });
    if (remainder > 1e-10) commands.push({ input: { steer, speed: (gear * remainder) / SIM_DT }, steps: 1 });
  }
  commands.push({ input: { speed: 0, steer: 0 }, steps: Math.ceil(Math.abs(steer) / sp.steerRate / SIM_DT) + 1 });
  return commands;
}
