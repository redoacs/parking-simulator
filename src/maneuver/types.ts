import type { ControlInput, VehicleState } from '../sim/model';

export interface Command {
  input: ControlInput;
  steps: number;
}
export interface Maneuver {
  commands: Command[];
  states: VehicleState[];
  distance: number;
  directionChanges: number;
  /** Conservative continuous lower bound against real obstacles, in metres. */
  clearance: number;
}
export const CLEARANCE_FLOOR = 0.01;
export const MAX_REPLAY_STEPS = 120 * 180;
