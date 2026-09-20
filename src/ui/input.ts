import type { ControlInput, SimParams, VehicleState } from '../sim/model';

export type DriveKey = 'forward' | 'reverse' | 'left' | 'right' | 'centre' | 'stop' | 'rewind' | 'reset' | 'fit';

const KEYMAP: Record<string, DriveKey> = {
  ArrowUp: 'forward',
  KeyW: 'forward',
  ArrowDown: 'reverse',
  KeyS: 'reverse',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  KeyC: 'centre',
  Space: 'stop',
  KeyZ: 'rewind',
  KeyR: 'reset',
  KeyF: 'fit',
};

export interface KeyEventLike {
  code: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

/** Drive key for a keyboard event, or undefined when unmapped or when a modifier is held (browser shortcuts win). */
export function keyFromEvent(e: KeyEventLike): DriveKey | undefined {
  if (e.ctrlKey || e.metaKey || e.altKey) return undefined;
  return KEYMAP[e.code];
}

export class DriveInput {
  private readonly down = new Map<DriveKey, Set<string | symbol>>();
  private resetPending = false;
  private fitPending = false;

  setKey(key: DriveKey, isDown: boolean, source: string | symbol = 'programmatic'): void {
    if (isDown) {
      const sources = this.down.get(key) ?? new Set<string | symbol>();
      sources.add(source);
      this.down.set(key, sources);
    } else {
      const sources = this.down.get(key);
      sources?.delete(source);
      if (sources?.size === 0) this.down.delete(key);
    }
    if (isDown && key === 'reset') this.resetPending = true;
    if (isDown && key === 'fit') this.fitPending = true;
  }

  /** Returns true when the code is a drive key (caller should preventDefault). */
  handleKey(code: string, isDown: boolean): boolean {
    const key = KEYMAP[code];
    if (!key) return false;
    this.setKey(key, isDown, `keyboard:${code}`);
    return true;
  }

  attach(target: Window): void {
    target.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) return;
      const key = keyFromEvent(e);
      if (!key) return;
      e.preventDefault();
      if (!e.repeat) this.handleKey(e.code, true);
    });
    target.addEventListener('keyup', (e) => {
      // Not gated by modifiers: the keydown may predate the modifier, and a skipped keyup leaves the key stuck down.
      if (this.handleKey(e.code, false)) e.preventDefault();
    });
    target.addEventListener('blur', () => this.down.clear());
  }

  /** Press-and-hold semantics for on-screen buttons. */
  bind(button: HTMLElement, key: DriveKey): void {
    const downH = (e: PointerEvent): void => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      this.setKey(key, true, `pointer:${e.pointerId}`);
    };
    const upH = (e: PointerEvent): void => this.setKey(key, false, `pointer:${e.pointerId}`);
    button.addEventListener('pointerdown', downH);
    button.addEventListener('pointerup', upH);
    button.addEventListener('pointerleave', upH);
    button.addEventListener('pointercancel', upH);
    const enter = Symbol('button-enter');
    button.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.ctrlKey || e.metaKey || e.altKey) return;
      e.preventDefault();
      if (!e.repeat) this.setKey(key, true, enter);
    });
    button.addEventListener('keyup', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      this.setKey(key, false, enter);
    });
    button.addEventListener('blur', () => this.setKey(key, false, enter));
  }

  clear(): void {
    this.down.clear();
    this.resetPending = false;
    this.fitPending = false;
  }
  get stopHeld(): boolean {
    return this.down.has('stop');
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
