import { encodeHash } from '../ui/hash';
import { clampParams, getPreset } from '../scene/presets';
import { deriveVehicle } from '../vehicle/derive';
import { planManeuver } from './planner';
import type { PlanRequest, WorkerReply } from './client';

self.onmessage = (event: MessageEvent<PlanRequest>) => {
  const request = event.data;
  let reply: WorkerReply;
  let key = encodeHash(request);
  try {
    const preset = getPreset(request.presetId);
    if (!preset) throw Error('Unknown preset');
    const params = clampParams(preset, request.params);
    key = encodeHash({ ...request, params });
    const scene = preset.build(params);
    reply = { id: request.id, key, result: planManeuver(scene, deriveVehicle(request.spec), request.mirrors) };
  } catch {
    reply = { id: request.id, key, result: { status: 'error' } };
  }
  self.postMessage(reply);
};
