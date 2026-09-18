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
  bind(button: HTMLElement, key: DriveKey): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.append(...children);
  return e;
}

function citedRow(label: string, c: Cited<number>): HTMLElement {
  const link = el('a', { href: c.source.url, target: '_blank', rel: 'noopener', class: 'source', title: c.source.note ?? '' }, 'src');
  const badge = isUnverified(c) ? el('span', { class: 'unverified' }, 'unverified') : '';
  return el('div', { class: 'readout' }, el('span', {}, label, badge), el('span', { class: 'value' }, `${(c.value * 1000).toFixed(0)} mm `, link));
}

export function buildPanel(root: HTMLElement, o: PanelOptions): { setScenario(h: HashState): void; readoutSection: HTMLElement } {
  let presetId = o.initial.presetId;
  let params: Params = { ...o.initial.params };
  let mirrors = o.initial.mirrors;

  const presetSelect = el('select');
  for (const p of PRESETS) presetSelect.append(el('option', { value: p.id }, p.name));
  const paramsBox = el('div');
  const scenario = el('fieldset', {}, el('legend', {}, 'Scenario'), presetSelect, paramsBox);

  const emit = (): void => o.onScenario({ presetId, params: { ...params }, mirrors });

  const renderParams = (): void => {
    paramsBox.replaceChildren();
    const def = getPreset(presetId)!;
    for (const p of def.params) {
      const input = el('input', { type: 'number', min: String(p.min), max: String(p.max), step: String(p.step), value: String(params[p.key] ?? p.default) });
      input.addEventListener('change', () => {
        params[p.key] = Number(input.value);
        params = clampParams(def, params);
        input.value = String(params[p.key]);
        emit();
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
    length: 'Length', widthBody: 'Width (body)', widthMirrors: 'Width (mirrors)', height: 'Height', wheelbase: 'Wheelbase',
    frontOverhang: 'Front overhang', rearOverhang: 'Rear overhang', trackFront: 'Track front', trackRear: 'Track rear',
    tireWidth: 'Tyre width', wheelDiameter: 'Wheel diameter', mirrorLongitudinal: 'Mirror position', mirrorLength: 'Mirror length',
  };
  const vehicleCard = el('fieldset', {}, el('legend', {}, `${d.name} · ${d.market} ${d.modelYear}`),
    ...NUMERIC_FIELDS.map((f) => citedRow(labels[f], d[f])),
    el('div', { class: 'readout' }, el('span', {}, `Turning circle (${d.turningCircle.value.kind})`), el('span', { class: 'value' }, `${d.turningCircle.value.diameter.toFixed(2)} m `, el('a', { href: d.turningCircle.source.url, target: '_blank', rel: 'noopener', class: 'source' }, 'src'))),
    el('div', { class: 'readout' }, el('span', {}, 'Max steer (derived)'), el('span', { class: 'value' }, `${((o.vehicle.maxSteer * 180) / Math.PI).toFixed(1)}°`)),
    el('label', { class: 'param' }, 'Include mirrors', mirrorsInput),
  );

  const timeScale = el('input', { type: 'range', min: '0.1', max: '1', step: '0.05', value: '1' });
  timeScale.addEventListener('input', () => o.onTimeScale(Number(timeScale.value)));
  timeScale.addEventListener('change', () => timeScale.blur());
  const resetBtn = el('button', { type: 'button' }, 'Reset (R)');
  resetBtn.addEventListener('click', () => o.onReset());
  const fitBtn = el('button', { type: 'button' }, 'Fit view (F)');
  fitBtn.addEventListener('click', () => o.onFit());
  const pad = el('div', { class: 'pad' });
  const padKeys: Array<[string, DriveKey | null]> = [['◀', 'left'], ['▲', 'forward'], ['▶', 'right'], ['⟲ rewind', 'rewind'], ['▼', 'reverse'], ['centre', 'centre']];
  for (const [label, key] of padKeys) {
    const b = el('button', { type: 'button' }, label);
    if (key) o.bind(b, key);
    pad.append(b);
  }
  const controls = el('fieldset', {}, el('legend', {}, 'Drive'),
    el('label', { class: 'param' }, 'Time scale', timeScale), pad,
    el('div', { class: 'pad' }, resetBtn, fitBtn),
    el('p', { class: 'source' }, 'Keys: arrows/WASD drive · C centre steering · Space stop · Z rewind · R reset · F fit · drag to pan · wheel to zoom'),
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
