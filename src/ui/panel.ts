import { PRESETS, getPreset, defaultParams, clampParams } from '../scene/presets';
import type { Params } from '../scene/types';
import { isUnverified, NUMERIC_FIELDS, type Cited } from '../vehicle/types';
import type { DerivedVehicle } from '../vehicle/derive';
import type { DriveKey } from './input';
import type { HashState } from './hash';

export interface PanelOptions {
  vehicle: DerivedVehicle;
  initial: HashState;
  onScenario(h: HashState): void;
  /** Mirrors are a display/clearance option: toggling must not restart the run. */
  onMirrors(on: boolean): void;
  onTimeScale(x: number): void;
  onReset(): void;
  onFit(): void;
  onZoom(factor: number): void;
  bind(button: HTMLElement, key: DriveKey): void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.append(...children);
  return e;
}

function citedRow(label: string, c: Cited<unknown>, valueText: string): HTMLElement {
  const link = el('a', { href: c.source.url, target: '_blank', rel: 'noopener', class: 'source', title: c.source.note ?? '' }, 'src');
  const badge = isUnverified(c) ? el('span', { class: 'unverified' }, 'unverified') : '';
  return el('div', { class: 'readout' }, el('span', {}, label, badge), el('span', { class: 'value' }, `${valueText} `, link));
}

export function buildPanel(root: HTMLElement, o: PanelOptions): { setScenario(h: HashState): void; readoutSection: HTMLElement } {
  let presetId = o.initial.presetId;
  let params: Params = { ...o.initial.params };
  let mirrors = o.initial.mirrors;

  const presetSelect = el('select', { 'aria-label': 'Scenario preset' });
  for (const p of PRESETS) presetSelect.append(el('option', { value: p.id }, p.name));
  const paramsBox = el('div');
  const scenario = el('fieldset', {}, el('legend', {}, 'Scenario'), presetSelect, paramsBox);

  const emit = (): void => o.onScenario({ presetId, params: { ...params }, mirrors });

  const renderParams = (): void => {
    paramsBox.replaceChildren();
    const def = getPreset(presetId)!;
    const inputs = new Map<string, HTMLInputElement>();
    for (const p of def.params) {
      const input = el('input', {
        type: 'number',
        min: String(p.min),
        max: String(p.max),
        step: String(p.step),
        value: String(params[p.key] ?? p.default),
      });
      inputs.set(p.key, input);
      input.addEventListener('change', () => {
        // An emptied or unparseable field reads as '': keep the current value rather than let it clamp to the minimum.
        const next = input.value === '' ? params : clampParams(def, { ...params, [p.key]: Number(input.value) });
        const changed = def.params.some((q) => next[q.key] !== params[q.key]);
        params = next;
        // Rewrite every field: a preset's cross-param rules may have moved another one.
        for (const [key, other] of inputs) other.value = String(params[key]);
        if (changed) emit(); // a commit that changes nothing must not restart the run
      });
      // Committed edits return focus to the canvas so the drive keys work (DriveInput ignores keys aimed at controls).
      // Number inputs commit on Enter only: `change` also fires per arrow/spinner step, and blurring there would end stepping.
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') input.blur();
      });
      paramsBox.append(el('label', { class: 'param' }, `${p.label} (${p.unit === 'flag' ? '0/1' : p.unit})`, input));
    }
  };

  presetSelect.addEventListener('change', () => {
    presetId = presetSelect.value;
    params = defaultParams(getPreset(presetId)!);
    renderParams();
    emit();
    presetSelect.blur();
  });

  const mirrorsInput = el('input', { type: 'checkbox' });
  mirrorsInput.checked = mirrors;
  mirrorsInput.addEventListener('change', () => {
    mirrors = mirrorsInput.checked;
    o.onMirrors(mirrors);
    mirrorsInput.blur();
  });
  const d = o.vehicle.spec;
  const labels: Record<(typeof NUMERIC_FIELDS)[number], string> = {
    length: 'Length',
    widthBody: 'Width (body)',
    widthMirrors: 'Width (mirrors)',
    height: 'Height',
    wheelbase: 'Wheelbase',
    frontOverhang: 'Front overhang',
    rearOverhang: 'Rear overhang',
    trackFront: 'Track front',
    trackRear: 'Track rear',
    tireWidth: 'Tyre width',
    wheelDiameter: 'Wheel diameter',
    mirrorLongitudinal: 'Mirror position',
    mirrorLength: 'Mirror length',
  };
  const vehicleCard = el(
    'fieldset',
    {},
    el('legend', {}, `${d.name} · ${d.market} ${d.modelYear}`),
    ...NUMERIC_FIELDS.map((f) => citedRow(labels[f], d[f], `${(d[f].value * 1000).toFixed(0)} mm`)),
    citedRow(`Turning circle (${d.turningCircle.value.kind})`, d.turningCircle, `${d.turningCircle.value.diameter.toFixed(2)} m`),
    el(
      'div',
      { class: 'readout' },
      el('span', {}, 'Max steer (derived)'),
      el('span', { class: 'value' }, `${((o.vehicle.maxSteer * 180) / Math.PI).toFixed(1)}°`),
    ),
    el('label', { class: 'param' }, 'Include mirrors', mirrorsInput),
  );

  const timeScale = el('input', { type: 'range', min: '0.1', max: '1', step: '0.05', value: '1' });
  timeScale.addEventListener('input', () => o.onTimeScale(Number(timeScale.value)));
  // Mouse/touch commits return focus to driving; a `change` listener would also blur on every keyboard step, so keyboard stepping after Tab-focus would stop.
  timeScale.addEventListener('pointerup', () => timeScale.blur());
  const resetBtn = el('button', { type: 'button' }, 'Reset (R)');
  resetBtn.addEventListener('click', () => o.onReset());
  const fitBtn = el('button', { type: 'button' }, 'Fit view (F)');
  fitBtn.addEventListener('click', () => o.onFit());
  // Touch has no wheel, and the narrow layout is where touch is likely.
  const zoomOutBtn = el('button', { type: 'button' }, 'Zoom −');
  zoomOutBtn.addEventListener('click', () => o.onZoom(1 / 1.25));
  const zoomInBtn = el('button', { type: 'button' }, 'Zoom +');
  zoomInBtn.addEventListener('click', () => o.onZoom(1.25));
  const pad = el('div', { class: 'pad wide-only' });
  const padKeys: [string, DriveKey, string][] = [
    ['◀', 'left', 'Steer left'],
    ['▲', 'forward', 'Forward'],
    ['▶', 'right', 'Steer right'],
    ['⟲ rewind', 'rewind', 'Rewind'],
    ['▼', 'reverse', 'Reverse'],
    ['centre', 'centre', 'Centre steering'],
  ];
  for (const [label, key, name] of padKeys) {
    const b = el('button', { type: 'button', 'aria-label': name }, label);
    o.bind(b, key);
    pad.append(b);
  }
  const controls = el(
    'fieldset',
    {},
    el('legend', {}, 'Drive'),
    el('label', { class: 'param' }, 'Time scale', timeScale),
    pad,
    el('div', { class: 'pad two' }, resetBtn, fitBtn, zoomOutBtn, zoomInBtn),
    el(
      'p',
      { class: 'source keys-hint' },
      'Keys: arrows/WASD drive · Tab to a drive button, hold Enter · C centre steering · Space stop · Z rewind · R reset · F fit · drag to pan · wheel or Zoom buttons to zoom',
    ),
  );

  const readoutSection = el('fieldset', {}, el('legend', {}, 'Readouts'));
  root.replaceChildren(scenario, readoutSection, controls, vehicleCard);

  const setScenario = (h: HashState): void => {
    presetId = h.presetId;
    params = { ...h.params };
    mirrors = h.mirrors;
    presetSelect.value = presetId;
    mirrorsInput.checked = mirrors;
    renderParams();
  };
  setScenario(o.initial);
  return { setScenario, readoutSection };
}
