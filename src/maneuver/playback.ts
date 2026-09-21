import { SIM_DT, type VehicleState } from '../sim/model';
import type { Maneuver } from './types';

export interface ManeuverStep {
  start: number;
  end: number;
  steer: number;
  gear: number;
  distance: number;
}
export interface ManeuverSnapshot {
  frame: number;
  frames: number;
  playing: boolean;
  state: VehicleState;
  step: number;
  steps: number;
  instruction: ManeuverStep | null;
  distance: number;
  directionChanges: number;
  clearance: number;
  parkedMargin: number;
  centerOffset: number;
  placement: Maneuver['placement'];
}
export class ManeuverPlayback {
  readonly steps: ManeuverStep[] = [];
  frame = 0;
  playing = false;
  private remainder = 0;
  constructor(readonly plan: Maneuver) {
    let frame = 0;
    for (const c of plan.commands) {
      const gear = Math.sign(c.input.speed),
        last = this.steps.at(-1),
        end = frame + c.steps;
      if (last?.steer === c.input.steer && (!last.gear || !gear || last.gear === gear)) {
        last.end = end;
        last.gear = gear || last.gear;
        last.distance += Math.abs(c.input.speed) * c.steps * SIM_DT;
      } else this.steps.push({ start: frame, end, steer: c.input.steer, gear, distance: Math.abs(c.input.speed) * c.steps * SIM_DT });
      frame = end;
    }
  }
  toggle(): void {
    if (this.frame === this.plan.states.length - 1) this.restart();
    this.playing = !this.playing;
  }
  pause(): void {
    this.playing = false;
  }
  restart(): void {
    this.frame = 0;
    this.remainder = 0;
    this.playing = false;
  }
  next(): void {
    this.pause();
    this.remainder = 0;
    this.frame = this.steps.find((s) => s.end > this.frame)?.end ?? this.frame;
  }
  advance(seconds: number): void {
    if (!this.playing) return;
    this.remainder += seconds;
    const ticks = Math.floor(this.remainder / SIM_DT);
    this.remainder -= ticks * SIM_DT;
    this.frame = Math.min(this.plan.states.length - 1, this.frame + ticks);
    if (this.frame === this.plan.states.length - 1) this.pause();
  }
  snapshot(): ManeuverSnapshot {
    const step = this.steps.findIndex((s) => s.end > this.frame);
    return {
      frame: this.frame,
      frames: this.plan.states.length,
      playing: this.playing,
      state: this.plan.states[this.frame]!,
      step: step < 0 ? this.steps.length : step,
      steps: this.steps.length,
      instruction: step < 0 ? null : this.steps[step]!,
      distance: this.plan.distance,
      directionChanges: this.plan.directionChanges,
      clearance: this.plan.clearance,
      parkedMargin: this.plan.parkedMargin,
      centerOffset: this.plan.centerOffset,
      placement: this.plan.placement,
    };
  }
}
