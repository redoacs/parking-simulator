import { clampParams, getPreset } from '../scene/presets';
import type { Params } from '../scene/types';

export interface HashState {
  presetId: string;
  params: Params;
  mirrors: boolean;
}

export function encodeHash(h: HashState): string {
  const q = new URLSearchParams();
  q.set('p', h.presetId);
  for (const [k, v] of Object.entries(h.params)) q.set(k, String(v));
  q.set('m', h.mirrors ? '1' : '0');
  return q.toString();
}

export function decodeHash(hash: string): HashState | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (raw.length === 0) return null;
  const q = new URLSearchParams(raw);
  const def = getPreset(q.get('p') ?? '');
  if (!def) return null;
  const params: Params = {};
  for (const p of def.params) {
    const v = q.get(p.key);
    if (v !== null) params[p.key] = Number(v);
  }
  return { presetId: def.id, params: clampParams(def, params), mirrors: q.get('m') !== '0' };
}
