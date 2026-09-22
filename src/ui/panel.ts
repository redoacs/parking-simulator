import { fmt, getLanguage, selectLanguage, t } from '../i18n';
import type { MessageKey, Messages } from '../i18n/en';
import { createTextBindings } from './textBindings';
import { PRESETS, getPreset, defaultParams, clampParams } from '../scene/presets';
import type { Params } from '../scene/types';
import { isUnverified, NUMERIC_FIELDS, type Cited } from '../vehicle/types';
import type { DerivedVehicle } from '../vehicle/derive';
import { claimSpace, type DriveKey } from './input';
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

export function buildPanel(
  root: HTMLElement,
  o: PanelOptions,
): { setScenario(h: HashState): void; readoutSection: HTMLElement; refreshText(): void } {
  const labels = createTextBindings();
  let paramLabels = createTextBindings();
  type TextKey = { [K in MessageKey]: Messages[K] extends string ? K : never }[MessageKey];
  const text = (key: TextKey): Text => labels.text(() => t()[key]);
  const citedRow = (
    label: () => string,
    field: (typeof NUMERIC_FIELDS)[number] | 'turningCircle',
    c: Cited<unknown>,
    value: () => string,
  ): HTMLElement => {
    const link = el('a', { href: c.source.url, target: '_blank', rel: 'noopener', class: 'source' }, text('vehicle.source'));
    labels.attribute(link, 'aria-label', () => `${t()['vehicle.source']}: ${label()}`);
    const note = el(
      'p',
      { class: 'note' },
      labels.text(() => (o.vehicle.spec.id === 'taos-trendline-mx-2025' ? t()[`taos-trendline-mx-2025.${field}`] : (c.source.note ?? ''))),
    );
    // The space is the line break before the badge; without it the badge joins the label's last word into one unbreakable run.
    const badge = isUnverified(c) ? [' ', el('span', { class: 'unverified' }, text('vehicle.unverified'))] : [];
    // A tap opens the note: touch has no hover, and the link cannot sit in the summary, which is itself the control.
    const summary = el(
      'summary',
      { class: 'readout' },
      el('span', {}, labels.text(label), ...badge),
      el('span', { class: 'value' }, labels.text(value)),
    );
    claimSpace(summary);
    return el('details', { class: 'cited' }, summary, note, link);
  };
  const languageSelect = el(
    'select',
    { 'aria-label': 'Language / Idioma' },
    el('option', { value: 'en', lang: 'en' }, 'English'),
    el('option', { value: 'es', lang: 'es-MX' }, 'Español'),
  );
  languageSelect.value = getLanguage();
  languageSelect.addEventListener('change', () => {
    const value = languageSelect.value;
    if (value === 'en' || value === 'es') selectLanguage(value);
    languageSelect.blur();
  });
  const languageRow = el('label', { class: 'language' }, text('language'), languageSelect);
  let presetId = o.initial.presetId;
  let params: Params = { ...o.initial.params };
  let mirrors = o.initial.mirrors;

  const presetSelect = el('select');
  labels.attribute(presetSelect, 'aria-label', () => t()['scenario.select']);
  for (const p of PRESETS) presetSelect.append(el('option', { value: p.id }, text(`scenario.${p.id}`)));
  const paramsBox = el('div');
  const scenario = el('fieldset', {}, el('legend', {}, text('scenario')), presetSelect, paramsBox);

  const emit = (): void => o.onScenario({ presetId, params: { ...params }, mirrors });

  const renderParams = (): void => {
    paramsBox.replaceChildren();
    paramLabels = createTextBindings();
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
      paramsBox.append(
        el(
          'label',
          { class: 'param' },
          paramLabels.text(() => `${t()[`param.${p.key}`]} (${p.unit === 'flag' ? '0/1' : p.unit === 'deg' ? '°' : p.unit})`),
          input,
        ),
      );
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
  const vehicleCard = el(
    'fieldset',
    {},
    el('legend', {}, `${d.name} · ${d.market} ${d.modelYear}`),
    ...NUMERIC_FIELDS.map((f) =>
      citedRow(
        () => t()[`vehicle.${f}`],
        f,
        d[f],
        () => `${fmt(d[f].value * 1000, 0)} mm`,
      ),
    ),
    citedRow(
      () => t()[`vehicle.turningCircle.${d.turningCircle.value.kind}`],
      'turningCircle',
      d.turningCircle,
      () => `${fmt(d.turningCircle.value.diameter, 2)} m`,
    ),
    el(
      'div',
      { class: 'readout' },
      el('span', {}, text('vehicle.maxSteer')),
      el(
        'span',
        { class: 'value' },
        labels.text(() => `${fmt((o.vehicle.maxSteer * 180) / Math.PI, 1)}°`),
      ),
    ),
    el('label', { class: 'param' }, text('vehicle.mirrors'), mirrorsInput),
  );

  const timeScale = el('input', { type: 'range', min: '0.1', max: '1', step: '0.05', value: '1' });
  timeScale.addEventListener('input', () => o.onTimeScale(Number(timeScale.value)));
  // Mouse/touch commits return focus to driving; a `change` listener would also blur on every keyboard step, so keyboard stepping after Tab-focus would stop.
  timeScale.addEventListener('pointerup', () => timeScale.blur());
  const resetBtn = el('button', { type: 'button' }, text('controls.reset'));
  resetBtn.addEventListener('click', () => o.onReset());
  const fitBtn = el('button', { type: 'button' }, text('controls.fit'));
  fitBtn.addEventListener('click', () => o.onFit());
  // Touch has no wheel, and the narrow layout is where touch is likely.
  const zoomOutBtn = el('button', { type: 'button' }, text('controls.zoomOut'));
  zoomOutBtn.addEventListener('click', () => o.onZoom(1 / 1.25));
  const zoomInBtn = el('button', { type: 'button' }, text('controls.zoomIn'));
  zoomInBtn.addEventListener('click', () => o.onZoom(1.25));
  const pad = el('div', { class: 'pad wide-only' });
  const padKeys: [() => string, DriveKey, TextKey][] = [
    [() => '◀', 'left', 'drive.left'],
    [() => '▲', 'forward', 'drive.forward'],
    [() => '▶', 'right', 'drive.right'],
    [() => t()['controls.rewind'], 'rewind', 'drive.rewind'],
    [() => '▼', 'reverse', 'drive.reverse'],
    [() => t()['controls.centre'], 'centre', 'drive.centre'],
  ];
  for (const [label, key, name] of padKeys) {
    const b = el('button', { type: 'button' }, labels.text(label));
    labels.attribute(b, 'aria-label', () => t()[name]);
    o.bind(b, key);
    pad.append(b);
  }
  const controls = el(
    'fieldset',
    {},
    el('legend', {}, text('controls')),
    el('label', { class: 'param' }, text('controls.timeScale'), timeScale),
    pad,
    el('div', { class: 'pad two' }, resetBtn, fitBtn, zoomOutBtn, zoomInBtn),
    el('p', { class: 'source keys-hint' }, text('controls.hint')),
  );

  const readoutSection = el('fieldset', {}, el('legend', {}, text('readouts')));
  root.replaceChildren(languageRow, scenario, readoutSection, controls, vehicleCard);

  const setScenario = (h: HashState): void => {
    presetId = h.presetId;
    params = { ...h.params };
    mirrors = h.mirrors;
    presetSelect.value = presetId;
    mirrorsInput.checked = mirrors;
    renderParams();
  };
  setScenario(o.initial);
  return {
    setScenario,
    readoutSection,
    refreshText() {
      labels.refresh();
      paramLabels.refresh();
      languageSelect.value = getLanguage();
    },
  };
}
