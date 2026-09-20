import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { defaultParams, getPreset } from '../scene/presets';
import { encodeHash } from '../ui/hash';
import { validateVehicleSpec } from '../vehicle/validate';
import taos from '../vehicle/data/taos-trendline-mx-2025.json';
import { ManeuverClient, type PlanningState, type PlanRequest, type WorkerReply } from './client';
import type { Maneuver } from './types';
class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((e: MessageEvent<WorkerReply>) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  sent!: PlanRequest;
  terminated = false;
  constructor() {
    FakeWorker.instances.push(this);
  }
  postMessage(input: PlanRequest) {
    this.sent = input;
  }
  terminate() {
    this.terminated = true;
  }
  reply(result: WorkerReply['result'], key = encodeHash(this.sent)) {
    this.onmessage?.({ data: { id: this.sent.id, key, result } } as MessageEvent<WorkerReply>);
  }
}
const preset = getPreset('garage')!,
  params = defaultParams(preset),
  input = { presetId: preset.id, params, mirrors: true, spec: validateVehicleSpec(taos) };
// Transport-only fixture. Physics validity is the validator suite's responsibility.
const fixture: Maneuver = { commands: [], states: [preset.build(params).start], distance: 0, directionChanges: 0, clearance: 1 };
let events: PlanningState[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('Worker', FakeWorker);
  FakeWorker.instances = [];
  events = [];
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it('rejects late results after cancellation and after a replacement request', () => {
  const client = new ManeuverClient((s) => events.push(s));
  client.request(input);
  const old = FakeWorker.instances[0]!;
  client.cancel();
  old.reply({ status: 'found', expanded: 1, maneuver: fixture });
  expect(events.at(-1)!.status).toBe('idle');
  client.request({ ...input, mirrors: false });
  old.reply({ status: 'found', expanded: 1, maneuver: fixture });
  expect(events.at(-1)!.status).toBe('searching');
  const current = FakeWorker.instances[1]!;
  current.reply({ status: 'found', expanded: 1, maneuver: fixture });
  expect(events.at(-1)!.status).toBe('ready');
  expect(old.terminated).toBe(true);
  expect(current.terminated).toBe(true);
});
it('requires matching scenario identity and exact preset start', () => {
  const client = new ManeuverClient((s) => events.push(s));
  client.request(input);
  FakeWorker.instances[0]!.reply({ status: 'found', expanded: 1, maneuver: fixture }, 'different-scenario');
  expect(events.at(-1)!.status).toBe('error');
  client.request(input);
  FakeWorker.instances[1]!.reply({ status: 'found', expanded: 1, maneuver: { ...fixture, states: [{ ...fixture.states[0]!, x: 999 }] } });
  expect(events.at(-1)!.status).toBe('error');
});
it('terminates an unresponsive worker at the watchdog and contains worker errors', () => {
  const client = new ManeuverClient((s) => events.push(s));
  client.request(input);
  vi.advanceTimersByTime(30000);
  expect(events.at(-1)!.status).toBe('limit');
  expect(FakeWorker.instances[0]!.terminated).toBe(true);
  client.request(input);
  const preventDefault = vi.fn();
  FakeWorker.instances[1]!.onerror?.({ preventDefault } as unknown as ErrorEvent);
  expect(preventDefault).toHaveBeenCalled();
  expect(events.at(-1)!.status).toBe('error');
  vi.advanceTimersByTime(30000);
  expect(events.at(-1)!.status).toBe('error');
});
