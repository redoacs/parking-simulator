import type { Params, PresetDef } from '../types';
import { parallel } from './parallel';
import { perpendicular } from './perpendicular';
import { garage } from './garage';

export const PRESETS: PresetDef[] = [parallel, perpendicular, garage];

export function getPreset(id: string): PresetDef | undefined {
  return PRESETS.find((p) => p.id === id);
}

export function defaultParams(def: PresetDef): Params {
  return Object.fromEntries(def.params.map((p) => [p.key, p.default]));
}

/** Clamp to [min, max], snap to step, fill missing with defaults, drop unknown keys. */
export function clampParams(def: PresetDef, raw: Params): Params {
  const out: Params = {};
  for (const p of def.params) {
    const v = raw[p.key];
    if (v === undefined || !Number.isFinite(v)) {
      out[p.key] = p.default;
      continue;
    }
    const clamped = Math.min(p.max, Math.max(p.min, v));
    const snapped = p.min + Math.round((clamped - p.min) / p.step) * p.step;
    out[p.key] = Math.min(p.max, Number(snapped.toFixed(6)));
  }
  return out;
}
