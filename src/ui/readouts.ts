import { fmt, t } from '../i18n';
import { createTextBindings } from './textBindings';
import type { Snapshot } from '../app';
import { bandFor } from '../render/scenePolys';

function row(label: Text): { root: HTMLElement; value: HTMLElement } {
  const value = document.createElement('span');
  value.className = 'value';
  const root = document.createElement('div');
  root.className = 'readout';
  const l = document.createElement('span');
  l.append(label);
  root.append(l, value);
  return { root, value };
}

export function createReadouts(hud: HTMLElement, section: HTMLElement): { update: (s: Snapshot) => void; refreshText: () => void } {
  const labels = createTextBindings();
  const clearance = row(labels.text(() => t()['readout.clearance']));
  const against = row(labels.text(() => t()['readout.against']));
  const contact = row(labels.text(() => t()['readout.contact']));
  const steer = row(labels.text(() => t()['readout.steer']));
  const speed = row(labels.text(() => t()['readout.speed']));
  const time = row(labels.text(() => t()['readout.time']));
  const parked = row(labels.text(() => t()['readout.parked']));
  section.append(clearance.root, against.root, contact.root, steer.root, speed.root, time.root, parked.root);
  const hudClearance = document.createElement('div');
  const hudStatus = document.createElement('div');
  hud.append(hudClearance, hudStatus);

  const update = (s: Snapshot): void => {
    const m = t();
    if (s.clearance) {
      const d = s.clearance.distance;
      const band = d <= 0 ? 'bad' : bandFor(d);
      const text = d <= 0 ? m['readout.penetration']({ depth: fmt(-d * 100, 1) }) : `${fmt(d * 100, 1)} cm`;
      clearance.value.textContent = text;
      clearance.value.className = `value band-${band}`;
      hudClearance.textContent =
        d <= 0 ? m['hud.penetration']({ depth: fmt(-d * 100, 1) }) : m['hud.clearance']({ distance: fmt(d * 100, 1) });
      hudClearance.className = `band-${band}`;
      against.value.textContent = s.obstacleKind ? m[`obstacle.${s.obstacleKind}`] : '—';
    } else {
      clearance.value.textContent = '—';
      clearance.value.className = 'value';
      against.value.textContent = '—';
      hudClearance.textContent = '';
    }
    contact.value.textContent = s.firstContactTime === null ? m['readout.noContact'] : `t = ${fmt(s.firstContactTime, 2)} s`;
    steer.value.textContent = `${fmt((s.state.steer * 180) / Math.PI, 1)}°`;
    speed.value.textContent = `${fmt(s.state.speed * 3.6, 1)} km/h`;
    time.value.textContent = `${fmt(s.simTime, 1)} s ×${fmt(s.timeScale, 2)}`;
    if (s.parked && s.parkedOffsets) {
      parked.value.textContent = m['readout.offsets']({
        left: fmt(s.parkedOffsets.left * 100, 0),
        right: fmt(s.parkedOffsets.right * 100, 0),
        heading: fmt(s.parkedOffsets.headingErrorDeg, 1),
      });
      parked.value.className = s.contact ? 'value band-bad' : 'value band-ok';
      hudStatus.textContent = s.contact ? m['status.parkedContact'] : m['status.parked'];
      hudStatus.className = s.contact ? 'band-bad' : 'band-ok';
    } else {
      parked.value.textContent = m['readout.no'];
      parked.value.className = 'value';
      hudStatus.textContent = s.contact ? m['status.contact'] : '';
      hudStatus.className = 'band-bad';
    }
  };
  return { update, refreshText: labels.refresh };
}
