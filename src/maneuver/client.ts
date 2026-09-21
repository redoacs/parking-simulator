import { clampParams, getPreset } from '../scene/presets';
import { encodeHash } from '../ui/hash';
import type { Params } from '../scene/types';
import type { VehicleSpec } from '../vehicle/types';
import type { PlanResult } from './planner';
import type { Maneuver } from './types';

export interface PlanRequest {
  id: number;
  presetId: string;
  params: Params;
  mirrors: boolean;
  spec: VehicleSpec;
}
export interface WorkerReply {
  id: number;
  key: string;
  result: PlanResult | { status: 'error' };
}
export type PlanningState = { status: 'idle' | 'searching' | 'limit' | 'error' } | { status: 'ready'; maneuver: Maneuver };

/** One worker per request. Invalidation happens before termination, including results already queued for delivery. */
export class ManeuverClient {
  private generation = 0;
  private worker: Worker | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  constructor(private readonly changed: (state: PlanningState) => void) {}
  cancel(): void {
    this.generation++;
    this.worker?.terminate();
    this.worker = null;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.changed({ status: 'idle' });
  }
  request(input: Omit<PlanRequest, 'id'>): void {
    this.cancel();
    const id = this.generation;
    this.changed({ status: 'searching' });
    try {
      const preset = getPreset(input.presetId);
      if (!preset) throw Error('Unknown preset');
      const canonical = { ...input, params: clampParams(preset, input.params) };
      const key = encodeHash(canonical),
        start = preset.build(canonical.params).start;
      const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
      this.worker = worker;
      const finish = (state: PlanningState): void => {
        if (this.generation !== id || this.worker !== worker) return;
        clearTimeout(this.timer);
        this.timer = undefined;
        worker.terminate();
        this.worker = null;
        this.changed(state);
      };
      worker.onmessage = (event: MessageEvent<WorkerReply>) => {
        if (event.data.id !== id) return;
        const result = event.data.result;
        if (event.data.key !== key) {
          finish({ status: 'error' });
          return;
        }
        if (result.status === 'found') {
          const first = result.maneuver.states[0];
          if (!first || (['x', 'y', 'theta', 'steer', 'speed'] as const).some((k) => first[k] !== start[k])) {
            finish({ status: 'error' });
            return;
          }
        }
        finish(result.status === 'found' ? { status: 'ready', maneuver: result.maneuver } : { status: result.status });
      };
      worker.onerror = (event) => {
        event.preventDefault();
        finish({ status: 'error' });
      };
      worker.onmessageerror = () => finish({ status: 'error' });
      this.timer = setTimeout(() => finish({ status: 'limit' }), 30000);
      worker.postMessage({ ...canonical, id });
    } catch {
      this.worker?.terminate();
      this.worker = null;
      clearTimeout(this.timer);
      this.changed({ status: 'error' });
    }
  }
}
