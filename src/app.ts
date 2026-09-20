import { checkClearance, isParked, parkedOffsets, worldOutline, type Clearance } from './geom/clearance';
import { transformPolygon, type Polygon } from './geom/polygon';
import { guideCircles } from './geom/turning';
import type { Insets } from './render/camera';
import type { Renderer } from './render/renderer';
import { ringInstancesFor, rulerPolygon, scenePolygons, vehiclePolygons } from './render/scenePolys';
import type { ColoredPolygon } from './render/polygons';
import { clampParams, getPreset, PRESETS, defaultParams } from './scene/presets';
import type { ObstacleKind, Params, Scene } from './scene/types';
import { StateHistory } from './sim/history';
import { SIM_DT, simParamsFor, stepVehicle, type SimParams, type VehicleState } from './sim/model';
import { DriveInput } from './ui/input';
import type { DerivedVehicle } from './vehicle/derive';

const HISTORY_SECONDS = 300;
const REWIND_SPEED = 2; // × real time

export interface Snapshot {
  presetId: string;
  params: Params;
  mirrors: boolean;
  timeScale: number;
  state: VehicleState;
  clearance: Clearance | null;
  /** Kind of the obstacle the clearance is measured against. */
  obstacleKind: ObstacleKind | null;
  contact: boolean;
  firstContactTime: number | null;
  parked: boolean;
  parkedOffsets: { left: number; right: number; headingErrorDeg: number } | null;
  simTime: number;
  historyLength: number;
}

export class App {
  readonly input = new DriveInput();
  onSnapshot?: (s: Snapshot) => void;
  /**
   * Areas of the canvas that controls laid over it leave free, as insets in CSS pixels. Several candidates may be given
   * (below the menu button and above a bottom band of controls, or between two side columns); fitView uses whichever shows the
   * scene larger. None means the whole canvas.
   */
  viewInsets?: () => Insets[];

  private presetId = PRESETS[0]!.id;
  private params: Params = defaultParams(PRESETS[0]!);
  private scene: Scene = PRESETS[0]!.build(this.params);
  private mirrors = true;
  private timeScale = 1;
  private state: VehicleState = this.scene.start;
  private readonly history: StateHistory;
  private simTime = 0;
  private firstContactTime: number | null = null;
  /** `history.evicted + history.length` at first contact: a length alone shifts once the ring evicts. */
  private firstContactPosition: number | null = null;
  private clearance: Clearance | null = null;
  private staticPolys: ColoredPolygon[] = scenePolygons(this.scene);
  private staticVersion = 1;
  private envelopeVersion = 1;
  private pendingFootprints: Polygon[] = [];
  private accumulator = 0;
  private rewindAccumulator = 0;
  private lastFrame = 0;
  private wasRewinding = false;
  private readonly simParams: SimParams;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly renderer: Renderer,
    private readonly vehicle: DerivedVehicle,
    historySeconds = HISTORY_SECONDS,
  ) {
    this.history = new StateHistory(Math.round(historySeconds / SIM_DT));
    this.simParams = simParamsFor(vehicle);
    this.attachCameraControls();
    this.input.attach(window);
    // Turning a phone flips the canvas between portrait and landscape, and the free area with it: fit again, or the scene
    // keeps the old scale and overflows. Any other resize (a window drag, a phone's toolbar sliding away) keeps the
    // user's view.
    let wasPortrait: boolean | undefined;
    new ResizeObserver(() => {
      const portrait = canvas.clientHeight >= canvas.clientWidth;
      if (wasPortrait !== undefined && portrait !== wasPortrait) this.fitView();
      else this.renderer.resize();
      wasPortrait = portrait;
    }).observe(canvas);
  }

  setPreset(id: string, params: Params): void {
    const def = getPreset(id) ?? PRESETS[0]!;
    this.presetId = def.id;
    this.params = clampParams(def, params);
    this.scene = def.build(this.params);
    this.staticPolys = scenePolygons(this.scene);
    this.staticVersion++;
    this.envelopeVersion++;
    this.reset();
    this.fitView();
  }

  setMirrors(on: boolean): void {
    this.mirrors = on;
    this.renderer.rebuildEnvelope(this.allFootprints());
  }

  setTimeScale(x: number): void {
    this.timeScale = Math.min(1, Math.max(0.1, x));
  }

  reset(): void {
    this.state = this.scene.start;
    this.history.clear();
    this.simTime = 0;
    this.firstContactTime = null;
    this.firstContactPosition = null;
    this.pendingFootprints = [];
    this.accumulator = 0;
    this.rewindAccumulator = 0;
    this.renderer.resetEnvelope();
    this.updateClearance();
  }

  zoomBy(factor: number): void {
    const r = this.canvas.getBoundingClientRect();
    this.renderer.camera.zoomAtCss(r.width / 2, r.height / 2, factor);
  }

  fitView(): void {
    this.renderer.resize();
    const cam = this.renderer.camera;
    const candidates = this.viewInsets?.() ?? [];
    let best: Insets | undefined;
    let bestPpm = 0;
    for (const inset of candidates) {
      cam.fit(this.scene.bounds, inset);
      if (cam.ppm > bestPpm) {
        bestPpm = cam.ppm;
        best = inset;
      }
    }
    cam.fit(this.scene.bounds, best);
  }

  snapshot(): Snapshot {
    const body = worldOutline(this.vehicle, this.state, false)[0]!;
    const parked = isParked(body, this.scene, this.state.speed);
    return {
      presetId: this.presetId,
      params: { ...this.params },
      mirrors: this.mirrors,
      timeScale: this.timeScale,
      state: this.state,
      clearance: this.clearance,
      obstacleKind: this.clearance ? (this.scene.obstacles[this.clearance.obstacleIndex]?.kind ?? null) : null,
      contact: this.clearance !== null && this.clearance.distance <= 0,
      firstContactTime: this.firstContactTime,
      parked,
      parkedOffsets: parked ? parkedOffsets(body, this.state, this.scene) : null,
      simTime: this.simTime,
      historyLength: this.history.length,
    };
  }

  start(): void {
    this.fitView();
    this.updateClearance();
    this.lastFrame = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  private frame(now: number): void {
    const frameDt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;

    if (this.input.takeReset()) this.reset();
    if (this.input.takeFit()) this.fitView();

    if (this.input.rewindHeld) {
      this.rewind(frameDt);
      this.wasRewinding = true;
    } else {
      if (this.wasRewinding) {
        this.renderer.rebuildEnvelope(this.allFootprints());
        this.wasRewinding = false;
        this.rewindAccumulator = 0;
      }
      this.simulate(frameDt * this.timeScale);
    }

    const ringThickness = 2 / this.renderer.camera.ppm;
    const dynamicPolys = vehiclePolygons(this.vehicle, this.state, this.mirrors);
    if (this.clearance) {
      const ruler = rulerPolygon(this.clearance);
      if (ruler) dynamicPolys.push(ruler);
    }
    this.renderer.frame({
      staticPolys: this.staticPolys,
      staticVersion: this.staticVersion,
      dynamicPolys,
      rings: ringInstancesFor(guideCircles(this.state, this.vehicle), ringThickness),
      newFootprints: this.pendingFootprints,
      envelopeBounds: this.scene.bounds,
      envelopeVersion: this.envelopeVersion,
    });
    this.pendingFootprints = [];
    this.onSnapshot?.(this.snapshot());
    requestAnimationFrame((t) => this.frame(t));
  }

  private simulate(dt: number): void {
    this.accumulator += dt;
    let steps = 0;
    while (this.accumulator >= SIM_DT) {
      const u = this.input.control(this.state, this.simParams);
      const next = stepVehicle(this.state, u, this.simParams, SIM_DT);
      const moved = next.x !== this.state.x || next.y !== this.state.y || next.theta !== this.state.theta;
      this.state = next;
      this.simTime += SIM_DT;
      if (moved) {
        this.history.push(next);
        this.pendingFootprints.push(...this.footprints(next));
      }
      this.accumulator -= SIM_DT;
      steps++;
    }
    if (steps > 0) this.updateClearance();
  }

  private rewind(frameDt: number): void {
    // Carry the fraction so rewind speed does not depend on the display refresh rate.
    this.rewindAccumulator += frameDt * REWIND_SPEED;
    while (this.rewindAccumulator >= SIM_DT) {
      this.rewindAccumulator -= SIM_DT;
      // After eviction the state before the oldest one is gone: stop on it rather than fall back to the start pose.
      if (this.history.evicted > 0 && this.history.length === 1) break;
      if (this.history.pop() === undefined) break;
      this.simTime = Math.max(0, this.simTime - SIM_DT);
    }
    this.state = { ...(this.history.last() ?? this.scene.start), speed: 0 };
    if (this.firstContactPosition !== null && this.history.evicted + this.history.length < this.firstContactPosition) {
      this.firstContactTime = null;
      this.firstContactPosition = null;
    }
    this.updateClearance();
  }

  private footprints(s: VehicleState): Polygon[] {
    const parts = this.mirrors ? [this.vehicle.body, ...this.vehicle.mirrors] : [this.vehicle.body];
    return parts.map((p) => transformPolygon(p, s));
  }

  private allFootprints(): Polygon[] {
    const out: Polygon[] = [];
    this.history.forEach((s) => out.push(...this.footprints(s)));
    return out;
  }

  private updateClearance(): void {
    this.clearance = checkClearance(worldOutline(this.vehicle, this.state, this.mirrors), this.scene);
    if (this.clearance && this.clearance.distance <= 0 && this.firstContactTime === null) {
      this.firstContactTime = this.simTime;
      this.firstContactPosition = this.history.evicted + this.history.length;
    }
  }

  private attachCameraControls(): void {
    const cam = this.renderer.camera;
    // Active pointers in canvas-relative CSS pixels: one pans, two pinch, any further ones are ignored.
    const pointers = new Map<number, { x: number; y: number }>();
    const at = (e: PointerEvent): { x: number; y: number } => {
      const r = this.canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return; // a right-click opens a menu that swallows the pointerup
      if (pointers.size >= 2) return;
      pointers.set(e.pointerId, at(e));
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      if (e.pointerType === 'mouse' && e.buttons === 0) {
        pointers.delete(e.pointerId); // the release was missed (it went to a native menu, or happened off-window)
        return;
      }
      const now = at(e);
      if (pointers.size === 1) {
        cam.panByCss(now.x - prev.x, now.y - prev.y);
      } else {
        const other = [...pointers].find(([id]) => id !== e.pointerId)![1];
        cam.pinchCss(prev, other, now, other);
      }
      pointers.set(e.pointerId, now);
    });
    const end = (e: PointerEvent): void => {
      pointers.delete(e.pointerId);
    };
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
    this.canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const r = this.canvas.getBoundingClientRect();
        cam.zoomAtCss(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.001));
      },
      { passive: false },
    );
  }
}
