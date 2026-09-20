import type { Insets } from '../render/camera';
import type { DriveKey } from './input';

export interface OverlayOptions {
  /** Press-and-hold binding. It is per button, so two thumbs on two different buttons hold both at once. */
  bind(button: HTMLElement, key: DriveKey): void;
  onZoom(factor: number): void;
  onMenu(): void;
}

function button(label: string, name: string, className = ''): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.className = className;
  b.setAttribute('aria-label', name);
  return b;
}

/**
 * A tap that works while another finger is down. Browsers synthesise `click` only for a single-finger tap, so a second
 * thumb tapping Zoom while the first holds a steering button would do nothing. Pointer input acts on pointerdown;
 * `click` is kept for keyboard activation, which reports `detail === 0`.
 */
function onTap(b: HTMLButtonElement, action: () => void): void {
  b.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    action();
  });
  b.addEventListener('click', (e) => {
    if (e.detail === 0) action();
  });
}

function group(className: string, ...children: HTMLElement[]): HTMLDivElement {
  const d = document.createElement('div');
  d.className = className;
  d.append(...children);
  return d;
}

/**
 * Controls laid over the scene for the compact (phone) layout: steering under the left thumb, forward/reverse under the
 * right, and a menu button for the settings sheet. CSS hides the whole overlay in the wide layout.
 */
export function buildOverlay(root: HTMLElement, o: OverlayOptions): { freeAreas(): Insets[] } {
  const held = (label: string, name: string, key: DriveKey, className = ''): HTMLButtonElement => {
    const b = button(label, name, className);
    o.bind(b, key);
    return b;
  };
  const zoom = (label: string, name: string, factor: number): HTMLButtonElement => {
    const b = button(label, name, 'small');
    onTap(b, () => o.onZoom(factor));
    return b;
  };
  const menu = button('☰', 'Settings', 'menu');
  menu.setAttribute('aria-expanded', 'false');
  menu.setAttribute('aria-controls', 'panel');
  onTap(menu, () => o.onMenu());

  root.replaceChildren(
    menu,
    group(
      'thumb left',
      group('row', held('⟲', 'Rewind', 'rewind', 'small'), held('C', 'Centre steering', 'centre', 'small')),
      group('row', held('◀', 'Steer left', 'left'), held('▶', 'Steer right', 'right')),
    ),
    group(
      'thumb right',
      group('row', zoom('−', 'Zoom out', 1 / 1.25), zoom('+', 'Zoom in', 1.25)),
      group('column', held('▲', 'Forward', 'forward'), held('▼', 'Reverse', 'reverse')),
    ),
  );
  // A long press must hold the control, not open the browser's context menu.
  root.addEventListener('contextmenu', (e) => e.preventDefault());

  /**
   * Where the scene can be shown without controls on top of it: above the thumb clusters (suits portrait), or between
   * them (suits landscape). The first starts below the menu button. Empty when the overlay is hidden (wide layout).
   */
  const freeAreas = (): Insets[] => {
    const stage = root.getBoundingClientRect();
    const left = root.querySelector('.thumb.left')?.getBoundingClientRect();
    const right = root.querySelector('.thumb.right')?.getBoundingClientRect();
    if (!left || !right || left.width === 0 || stage.width === 0) return [];
    const top = menu.getBoundingClientRect().bottom - stage.top;
    const margin = 8;
    return [
      { top, right: 0, bottom: stage.bottom - Math.min(left.top, right.top) + margin, left: 0 },
      // Between the columns nothing needs the top strip: the menu button sits above the right column. (A long HUD line
      // can reach a little way into this band; it is text over the scene's margin, not over the scene.)
      { top: 0, right: stage.right - right.left + margin, bottom: 0, left: left.right - stage.left + margin },
    ];
  };
  return { freeAreas };
}
