import type { ControlInput, SimParams, VehicleState } from '../sim/model';

export type DriveKey = 'forward' | 'reverse' | 'left' | 'right' | 'centre' | 'stop' | 'rewind' | 'reset' | 'fit';

const KEYMAP: Record<string, DriveKey> = {
  ArrowUp: 'forward', KeyW: 'forward',
  ArrowDown: 'reverse', KeyS: 'reverse',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  KeyC: 'centre',
  Space: 'stop',
  KeyZ: 'rewind',
  KeyR: 'reset',
  KeyF: 'fit',
};

export class DriveInput {
  private readonly down = new Set<DriveKey>();
  private resetPending = false;
  private fitPending = false;

  setKey(key: DriveKey, isDown: boolean): void {
    if (isDown) this.down.add(key);
    else this.down.delete(key);
    if (isDown && key === 'reset') this.resetPending = true;
    if (isDown && key === 'fit') this.fitPending = true;
  }

  /** Returns true when the code is a drive key (caller should preventDefault). */
  handleKey(code: string, isDown: boolean): boolean {
    const key = KEYMAP[code];
    if (!key) return false;
    this.setKey(key, isDown);
    return true;
  }

  attach(target: Window): void {
    target.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      if (e.repeat) {
        if (KEYMAP[e.code]) e.preventDefault();
        return;
      }
      if (this.handleKey(e.code, true)) e.preventDefault();
    });
    target.addEventListener('keyup', (e) => {
      if (this.handleKey(e.code, false)) e.preventDefault();
    });
    target.addEventListener('blur', () => this.down.clear());
  }

  /** Press-and-hold semantics for on-screen buttons. */
  bind(button: HTMLElement, key: DriveKey): void {
    const downH = (e: Event): void => {
      e.preventDefault();
      this.setKey(key, true);
    };
    const upH = (): void => this.setKey(key, false);
    button.addEventListener('pointerdown', downH);
    button.addEventListener('pointerup', upH);
    button.addEventListener('pointerleave', upH);
    button.addEventListener('pointercancel', upH);
  }

  get rewindHeld(): boolean {
    return this.down.has('rewind');
  }

  takeReset(): boolean {
    const r = this.resetPending;
    this.resetPending = false;
    return r;
  }

  takeFit(): boolean {
    const r = this.fitPending;
    this.fitPending = false;
    return r;
  }

  control(current: VehicleState, p: SimParams): ControlInput {
    const left = this.down.has('left');
    const right = this.down.has('right');
    let steer = current.steer;
    if (this.down.has('centre')) steer = 0;
    else if (left && !right) steer = p.maxSteer;
    else if (right && !left) steer = -p.maxSteer;
    const fwd = this.down.has('forward');
    const rev = this.down.has('reverse');
    let speed = 0;
    if (!this.down.has('stop')) {
      if (fwd && !rev) speed = p.maxSpeed;
      else if (rev && !fwd) speed = -p.maxSpeed;
    }
    return { steer, speed };
  }
}
