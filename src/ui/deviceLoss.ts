export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const DEVICE_LOSS_KEY = 'parking-simulator.gpu-lost-at';
/** A second loss within this window means reloading did not help. */
export const DEVICE_LOSS_WINDOW_MS = 60_000;

export type DeviceLossAction = 'reload' | 'fatal';

/** Decide whether to reload once or give up, remembering the attempt in `store`. Never throws. */
export function decideOnDeviceLoss(store: KeyValueStore | null, now: number): DeviceLossAction {
  try {
    const raw = store?.getItem(DEVICE_LOSS_KEY);
    const last = raw === null || raw === undefined ? NaN : Number(raw);
    if (Number.isFinite(last) && now - last < DEVICE_LOSS_WINDOW_MS) return 'fatal';
    store?.setItem(DEVICE_LOSS_KEY, String(now));
    return 'reload';
  } catch {
    return 'fatal';
  }
}
