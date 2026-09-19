import taos from './vehicle/data/taos-trendline-mx-2025.json';
import { validateVehicleSpec } from './vehicle/validate';
import { deriveVehicle } from './vehicle/derive';
import { Renderer } from './render/renderer';
import { WebGpuUnavailableError } from './render/gpu';
import { App, type Snapshot } from './app';
import type { DriveKey } from './ui/input';
import { decideOnDeviceLoss, type KeyValueStore } from './ui/deviceLoss';
import { decodeHash, encodeHash, type HashState } from './ui/hash';
import { buildPanel } from './ui/panel';
import { createReadouts } from './ui/readouts';
import { PRESETS, defaultParams } from './scene/presets';

declare global {
  interface Window {
    __sim?: {
      snapshot(): Snapshot;
      readEnvelopeAt(x: number, y: number): Promise<number>;
      setKey(key: DriveKey, down: boolean): void;
      /** Canvas-relative CSS pixels for a world point; lets the e2e suite look at what is actually drawn. */
      worldToCss(x: number, y: number): { x: number; y: number };
    };
  }
}

function showFatal(message: string): void {
  const fatal = document.getElementById('fatal') as HTMLDivElement;
  if (!fatal.hidden) return; // first message wins: it is the root cause, later ones are fallout
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
    showFatal(
      e instanceof WebGpuUnavailableError
        ? `${e.message} Requires a browser with WebGPU enabled: current Chrome or Edge (Linux may need chrome://flags/#enable-unsafe-webgpu), Safari 26+, or Firefox 141+ (Windows first; other platforms in later releases).`
        : String(e),
    );
    return;
  }
  // `lost` never rejects, and a throw in the handler reaches the unhandledrejection listener below.
  void renderer.device.lost.then((info) => {
    if (info.reason === 'destroyed') return;
    let store: KeyValueStore | null = null;
    try {
      store = window.sessionStorage;
    } catch {
      store = null;
    }
    if (decideOnDeviceLoss(store, Date.now()) === 'reload') location.reload();
    else
      showFatal(
        `The GPU device was lost (${info.message}) and reloading cannot safely be retried. Reload the page manually, or try another browser or GPU.`,
      );
  });

  const app = new App(canvas, renderer, vehicle);
  window.__sim = {
    snapshot: () => app.snapshot(),
    readEnvelopeAt: (x, y) => renderer.readEnvelopeAt({ x, y }),
    setKey: (key, down) => app.input.setKey(key, down),
    worldToCss: (x, y) => renderer.camera.worldToCss({ x, y }),
  };

  const panelRoot = document.getElementById('panel')!;
  const hud = document.getElementById('hud')!;
  const initial: HashState = decodeHash(location.hash) ?? { presetId: PRESETS[0]!.id, params: defaultParams(PRESETS[0]!), mirrors: true };
  const applyScenario = (h: HashState): void => {
    app.setPreset(h.presetId, h.params);
    app.setMirrors(h.mirrors);
    history.replaceState(null, '', '#' + encodeHash(h));
  };
  const panel = buildPanel(panelRoot, {
    vehicle,
    initial,
    onScenario: applyScenario,
    onMirrors: (on) => {
      app.setMirrors(on);
      const s = app.snapshot();
      history.replaceState(null, '', '#' + encodeHash({ presetId: s.presetId, params: s.params, mirrors: on }));
    },
    onTimeScale: (x) => app.setTimeScale(x),
    onReset: () => app.reset(),
    onFit: () => app.fitView(),
    onZoom: (f) => app.zoomBy(f),
    bind: (b, k) => app.input.bind(b, k),
  });
  app.onSnapshot = createReadouts(hud, panel.readoutSection);
  window.addEventListener('hashchange', () => {
    const h = decodeHash(location.hash);
    if (h) {
      panel.setScenario(h);
      applyScenario(h);
    }
  });
  applyScenario(initial);
  app.start();
}

// Never a silent blank canvas: anything that escapes main() or fires later lands in #fatal.
window.addEventListener('error', (e) => showFatal(`Unexpected error: ${e.message}`));
window.addEventListener('unhandledrejection', (e) => showFatal(`Unexpected error: ${String(e.reason)}`));
main().catch((e: unknown) => showFatal(`Startup failed: ${String(e)}`));
