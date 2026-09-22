import { bandFor } from '../render/scenePolys';
import { fmt, t } from '../i18n';
import type { PlanningState } from '../maneuver/client';
import type { ManeuverSnapshot } from '../maneuver/playback';
import { claimSpace } from './input';
import { createTextBindings } from './textBindings';

export function createManeuverUI(actions: { show: () => void; cancel: () => void; toggle: () => void; next: () => void }) {
  const labels = createTextBindings();
  let state: PlanningState = { status: 'idle' },
    preview: ManeuverSnapshot | null = null,
    mirrors = true;
  const section = document.createElement('fieldset');
  section.className = 'maneuver-panel';
  const legend = document.createElement('legend');
  legend.append(labels.text(() => t()['maneuver.title']));
  const about = document.createElement('p');
  about.className = 'source';
  about.append(labels.text(() => t()['maneuver.about']));
  const button = (text: () => string, action: () => void) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.append(labels.text(text));
    b.addEventListener('click', action);
    claimSpace(b);
    return b;
  };
  const show = button(() => t()['maneuver.show'], actions.show),
    cancel = button(() => (state.status === 'ready' ? t()['maneuver.close'] : t()['maneuver.cancel']), actions.cancel);
  const status = document.createElement('p');
  status.setAttribute('role', 'status');
  const metrics = document.createElement('p');
  metrics.className = 'maneuver-metrics';
  const panelOutcome = document.createElement('p');
  panelOutcome.className = 'maneuver-outcome';
  const controls = document.createElement('div');
  controls.className = 'maneuver-buttons';
  controls.append(show, cancel);
  section.append(legend, about, controls, status, panelOutcome, metrics);
  const bar = document.createElement('section');
  bar.className = 'maneuver-bar';
  bar.hidden = true;
  labels.attribute(bar, 'aria-label', () => t()['maneuver.title']);
  const caption = document.createElement('p');
  caption.className = 'maneuver-caption';
  caption.setAttribute('aria-atomic', 'true');
  const path = document.createElement('p');
  path.className = 'source';
  path.append(labels.text(() => `${t()['maneuver.path']} · ${t()['maneuver.forwardLegend']} · ${t()['maneuver.reverseLegend']}`));
  const outcome = document.createElement('p');
  outcome.className = 'maneuver-outcome';
  const approach = document.createElement('p');
  approach.className = 'maneuver-approach';
  const play = button(() => (preview?.playing ? t()['maneuver.pause'] : t()['maneuver.play']), actions.toggle);
  const next = button(() => t()['maneuver.next'], actions.next),
    close = button(() => t()['maneuver.close'], actions.cancel);
  const row = document.createElement('div');
  row.className = 'maneuver-buttons';
  row.append(play, next, close);
  bar.append(caption, row, outcome, approach, path);
  let lastCaption = '';
  const refresh = () => {
    labels.refresh();
    show.hidden = state.status === 'searching' || state.status === 'ready';
    cancel.hidden = state.status !== 'searching' && state.status !== 'ready';
    status.textContent = state.status === 'idle' ? '' : t()[`maneuver.${state.status === 'ready' ? 'ready' : state.status}`];
    if (state.status === 'ready') {
      const p = state.maneuver;
      metrics.className = `maneuver-metrics band-${bandFor(p.clearance)}`;
      metrics.textContent = t()['maneuver.metrics']({
        distance: fmt(p.distance, 1),
        changes: fmt(p.directionChanges, 0),
        clearance: fmt(Math.floor(p.clearance * 1000) / 10, 1),
      });
      for (const node of [panelOutcome, outcome]) {
        const headline = document.createElement('strong');
        headline.textContent = t()['maneuver.parkedMargin']({ margin: fmt(Math.floor(p.parkedMargin * 1000 + 1e-7) / 10, 1) });
        const detail = document.createElement('span');
        detail.className = 'source';
        detail.textContent =
          t()[mirrors ? 'maneuver.mirrorsOn' : 'maneuver.mirrorsOff'] +
          ' ' +
          t()[`maneuver.${p.placement}`] +
          (p.parkedMargin < -1e-6 ? ' ' + t()['maneuver.overhang'] : '');
        node.replaceChildren(headline, detail);
      }
      approach.className = `maneuver-approach band-${bandFor(p.clearance)}`;
      approach.textContent = t()['maneuver.approachClearance']({ clearance: fmt(Math.floor(p.clearance * 1000) / 10, 1) });
    } else {
      metrics.textContent = '';
      panelOutcome.textContent = '';
    }
    bar.hidden = !preview;
    if (!preview) return;
    next.setAttribute('aria-disabled', String(preview.frame === preview.frames - 1));
    const instruction = preview.instruction;
    const cue = instruction
      ? `${t()['maneuver.step']({ step: fmt(preview.step + 1, 0), total: fmt(preview.steps, 0) })}: ${t()[instruction.steer > 0 ? 'maneuver.left' : instruction.steer < 0 ? 'maneuver.right' : 'maneuver.straight']} ${instruction.gear ? t()['maneuver.move']({ direction: t()[instruction.gear > 0 ? 'drive.forward' : 'drive.reverse'], distance: fmt(instruction.distance, 1) }) : ''}`
      : t()['maneuver.complete'];
    caption.setAttribute('aria-live', preview.playing ? 'off' : 'polite');
    if (cue !== lastCaption) {
      caption.textContent = cue;
      lastCaption = cue;
    }
  };
  return {
    section,
    bar,
    setState(s: PlanningState, includeMirrors: boolean) {
      state = s;
      mirrors = includeMirrors;
      refresh();
    },
    update(s: ManeuverSnapshot | null) {
      const changed = s?.step !== preview?.step || s?.playing !== preview?.playing || !!s !== !!preview;
      preview = s;
      if (changed) refresh();
    },
    refreshText: refresh,
    focusPlay() {
      play.focus();
    },
    restoreFocus() {
      if (getComputedStyle(section).visibility === 'visible') show.focus();
      else document.querySelector<HTMLElement>('#overlay .menu')?.focus();
    },
  };
}
