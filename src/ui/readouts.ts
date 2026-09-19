import type { Snapshot } from '../app';
import { bandFor } from '../render/scenePolys';

function row(label: string): { root: HTMLElement; value: HTMLElement } {
  const value = document.createElement('span');
  value.className = 'value';
  const root = document.createElement('div');
  root.className = 'readout';
  const l = document.createElement('span');
  l.textContent = label;
  root.append(l, value);
  return { root, value };
}

export function createReadouts(hud: HTMLElement, section: HTMLElement): (s: Snapshot) => void {
  const clearance = row('Min clearance');
  const against = row('Against');
  const contact = row('First contact');
  const steer = row('Steer');
  const speed = row('Speed');
  const time = row('Sim time');
  const parked = row('Parked');
  section.append(clearance.root, against.root, contact.root, steer.root, speed.root, time.root, parked.root);
  const hudClearance = document.createElement('div');
  const hudStatus = document.createElement('div');
  hud.append(hudClearance, hudStatus);

  return (s: Snapshot): void => {
    if (s.clearance) {
      const d = s.clearance.distance;
      const band = d <= 0 ? 'bad' : bandFor(d);
      const text = d <= 0 ? `CONTACT (${(-d * 100).toFixed(1)} cm in)` : `${(d * 100).toFixed(1)} cm`;
      clearance.value.textContent = text;
      clearance.value.className = `value band-${band}`;
      hudClearance.textContent = `clearance ${text}`;
      hudClearance.className = `band-${band}`;
      against.value.textContent = s.obstacleKind ?? '—';
    } else {
      clearance.value.textContent = '—';
      clearance.value.className = 'value';
      against.value.textContent = '—';
      hudClearance.textContent = '';
    }
    contact.value.textContent = s.firstContactTime === null ? 'none' : `t = ${s.firstContactTime.toFixed(2)} s`;
    steer.value.textContent = `${((s.state.steer * 180) / Math.PI).toFixed(1)}°`;
    speed.value.textContent = `${(s.state.speed * 3.6).toFixed(1)} km/h`;
    time.value.textContent = `${s.simTime.toFixed(1)} s ×${s.timeScale.toFixed(2)}`;
    if (s.parked && s.parkedOffsets) {
      parked.value.textContent = `yes · left ${(s.parkedOffsets.left * 100).toFixed(0)} cm · right ${(s.parkedOffsets.right * 100).toFixed(0)} cm · heading ${s.parkedOffsets.headingErrorDeg.toFixed(1)}°`;
      parked.value.className = 'value band-ok';
      hudStatus.textContent = 'PARKED';
      hudStatus.className = 'band-ok';
    } else {
      parked.value.textContent = 'no';
      parked.value.className = 'value';
      hudStatus.textContent = s.contact ? 'CONTACT' : '';
      hudStatus.className = 'band-bad';
    }
  };
}
