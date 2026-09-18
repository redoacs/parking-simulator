import taos from './vehicle/data/taos-trendline-mx-2025.json';
import { validateVehicleSpec } from './vehicle/validate';
import { deriveVehicle } from './vehicle/derive';
import { Renderer } from './render/renderer';
import { WebGpuUnavailableError } from './render/gpu';
import { App, type Snapshot } from './app';
import type { DriveKey } from './ui/input';
import { decideOnDeviceLoss, type KeyValueStore } from './ui/deviceLoss';

declare global {
  interface Window {
    __sim?: {
      snapshot(): Snapshot;
      readEnvelopeAt(x: number, y: number): Promise<number>;
      setKey(key: DriveKey, down: boolean): void;
    };
  }
}

function showFatal(message: string): void {
  const fatal = document.getElementById('fatal') as HTMLDivElement;
  fatal.hidden = false;
  fatal.textContent = message;
}

async function main(): Promise<void> {
  const canvas = document.getElementById('gpu') as HTMLCanvasElement;
  let vehicle;
  try {
    vehicle = deriveVehicle(validateVehicleSpec(taos));
  } catch (e) {
    showFatal(`Vehicle data invalid: ${(e as Error).message}`);
    return;
  }
  let renderer: Renderer;
  try {
    renderer = await Renderer.create(canvas);
  } catch (e) {
    showFatal(e instanceof WebGpuUnavailableError ? `${e.message} Use Chrome/Edge 113+, Safari 26+, or Firefox 141+.` : String(e));
    return;
  }
  renderer.device.lost.then((info) => {
    if (info.reason === 'destroyed') return;
    let store: KeyValueStore | null = null;
    try { store = window.sessionStorage; } catch { store = null; }
    if (decideOnDeviceLoss(store, Date.now()) === 'reload') location.reload();
    else showFatal(`The GPU device was lost again (${info.message}). Reloading did not help; try another browser or GPU.`);
  });

  const app = new App(canvas, renderer, vehicle);
  window.__sim = {
    snapshot: () => app.snapshot(),
    readEnvelopeAt: (x, y) => renderer.readEnvelopeAt({ x, y }),
    setKey: (key, down) => app.input.setKey(key, down),
  };
  app.start();
}

void main();
