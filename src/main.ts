import { getLanguage, initLanguage, LANGUAGE_TAGS, onLanguageChange, t } from './i18n';
import taos from './vehicle/data/taos-trendline-mx-2025.json';
import { validateVehicleSpec } from './vehicle/validate';
import { deriveVehicle } from './vehicle/derive';
import { Renderer } from './render/renderer';
import { WebGlUnavailableError } from './render/gl';
import { App, type Snapshot } from './app';
import type { DriveKey } from './ui/input';
import { decideOnDeviceLoss, type KeyValueStore } from './ui/deviceLoss';
import { decodeHash, encodeHash, type HashState } from './ui/hash';
import { buildOverlay } from './ui/overlay';
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

let fatalMessage: (() => string) | null = null;

function showFatal(message: () => string): void {
  const fatal = document.getElementById('fatal') as HTMLDivElement;
  if (!fatal.hidden) return; // first message wins: it is the root cause, later ones are fallout
  fatal.hidden = false;
  fatalMessage = message;
  fatal.textContent = message();
}

async function main(): Promise<void> {
  initLanguage();
  const refreshDocument = (): void => {
    document.documentElement.lang = getLanguage() === 'en' ? 'en' : LANGUAGE_TAGS.es;
    document.title = t()['app.title'];
    if (fatalMessage) document.getElementById('fatal')!.textContent = fatalMessage();
  };
  refreshDocument();
  onLanguageChange(refreshDocument);
  const canvas = document.getElementById('gpu') as HTMLCanvasElement;
  let vehicle;
  try {
    vehicle = deriveVehicle(validateVehicleSpec(taos));
  } catch (e) {
    showFatal(() => t()['error.vehicle']({ detail: String(e) }));
    return;
  }
  let renderer: Renderer;
  try {
    renderer = await Renderer.create(canvas);
  } catch (e) {
    showFatal(() => (e instanceof WebGlUnavailableError ? t()['error.webgl'] : t()['error.startup']({ detail: String(e) })));
    return;
  }
  renderer.onContextLost(() => {
    let store: KeyValueStore | null = null;
    try {
      store = window.sessionStorage;
    } catch {
      store = null;
    }
    if (decideOnDeviceLoss(store, Date.now()) === 'reload') location.reload();
    else showFatal(() => t()['error.gpu']);
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
  const readouts = createReadouts(hud, panel.readoutSection);
  app.onSnapshot = readouts.update;
  // Compact layout: the panel is a sheet over the scene. The class does nothing in the wide layout.
  const setSheet = (open: boolean): void => {
    const wasOpen = document.body.classList.contains('sheet-open');
    document.body.classList.toggle('sheet-open', open);
    const menu = document.querySelector('#overlay .menu');
    menu?.setAttribute('aria-expanded', String(open));
    // Keyboard users: the panel comes before the stage in the DOM, so without this the next Tab lands under the sheet.
    if (open && !wasOpen) panelRoot.focus();
    else if (!open && wasOpen && menu instanceof HTMLElement && panelRoot.contains(document.activeElement)) menu.focus();
  };
  const overlay = buildOverlay(document.getElementById('overlay')!, {
    bind: (b, k) => {
      app.input.bind(b, k);
    },
    onZoom: (f) => {
      app.zoomBy(f);
    },
    onMenu: () => {
      setSheet(!document.body.classList.contains('sheet-open'));
    },
  });
  app.viewInsets = () => overlay.freeAreas();
  onLanguageChange(() => {
    panel.refreshText();
    overlay.refreshText();
    readouts.refreshText();
    readouts.update(app.snapshot());
  });
  // A press on the scene, or Escape, closes the sheet.
  canvas.addEventListener('pointerdown', () => {
    setSheet(false);
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !(e.target instanceof HTMLSelectElement)) setSheet(false); // a select uses Escape to shut its own list
  });
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
window.addEventListener('error', (e) => showFatal(() => t()['error.unexpected']({ detail: e.message })));
window.addEventListener('unhandledrejection', (e) => showFatal(() => t()['error.unexpected']({ detail: String(e.reason) })));
main().catch((e: unknown) => showFatal(() => t()['error.startup']({ detail: String(e) })));
