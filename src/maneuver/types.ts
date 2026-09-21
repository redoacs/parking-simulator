import { SIM_DT, type ControlInput, type VehicleState } from '../sim/model';
import type { ParkedQuality } from './goal';

export interface Command {
  input: ControlInput;
  steps: number;
}
export interface Maneuver extends ParkedQuality {
  commands: Command[];
  states: VehicleState[];
  distance: number;
  directionChanges: number;
  /** Conservative continuous lower bound against real obstacles, in metres. */
  clearance: number;
  /** Centered within 1 mm; adjusted reaches a conservative boundary-constrained target. */
  placement: 'centered' | 'adjusted' | 'bestFound';
}
export const CLEARANCE_FLOOR = 0.01;
export const MAX_REPLAY_STEPS = Math.round(180 / SIM_DT);
