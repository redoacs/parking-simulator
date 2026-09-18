import { checkClearance, isParked, parkedOffsets, worldOutline, type Clearance } from './geom/clearance';
import { transformPolygon, type Polygon } from './geom/polygon';
import { guideCircles } from './geom/turning';
import type { Renderer } from './render/renderer';
import { ringInstancesFor, rulerPolygon, scenePolygons, vehiclePolygons } from './render/scenePolys';
import type { ColoredPolygon } from './render/polygons';
import { clampParams, getPreset, PRESETS, defaultParams } from './scene/presets';
import type { Params, Scene } from './scene/types';
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
  contact: boolean;
  firstContactTime: number | null;
  parked: boolean;
  parkedOffsets: { lateral: number; headingErrorDeg: number } | null;
  simTime: number;
  historyLength: number;
}

export class App {
  readonly input = new DriveInput();
  onSnapshot?: (s: Snapshot) => void;

  private presetId = PRESETS[0]!.id;
  private params: Params = defaultParams(PRESETS[0]!);
  private scene: Scene = PRESETS[0]!.build(this.params);
  private mirrors = true;
  private timeScale = 1;
  private state: VehicleState = this.scene.start;
  private readonly history = new StateHistory(Math.round(HISTORY_SECONDS / SIM_DT));
  private simTime = 0;
  private firstContactTime: number | null = null;
  private clearance: Clearance | null = null;
  private staticPolys: ColoredPolygon[] = scenePolygons(this.scene);
  private staticVersion = 1;
  private envelopeVersion = 1;
  private pendingFootprints: Polygon[] = [];
  private accumulator = 0;
  private lastFrame = 0;
  private wasRewinding = false;
  private readonly simParams: SimParams;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly renderer: Renderer,
    private readonly vehicle: DerivedVehicle,
  ) {
    this.simParams = simParamsFor(vehicle);
    this.attachCameraControls();
    this.input.attach(window);
    new ResizeObserver(() => this.renderer.resize()).observe(canvas);
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
    this.pendingFootprints = [];
    this.accumulator = 0;
    this.renderer.resetEnvelope();
    this.updateClearance();
  }

  fitView(): void {
    this.renderer.resize();
    this.renderer.camera.fit(this.scene.bounds);
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
      contact: this.clearance !== null && this.clearance.distance <= 0,
      firstContactTime: this.firstContactTime,
      parked,
      parkedOffsets: parked ? parkedOffsets(this.state, this.scene) : null,
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
    while (this.accumulator >= SIM_DT && steps < 240) {
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
    const n = Math.max(1, Math.round((frameDt * REWIND_SPEED) / SIM_DT));
    for (let i = 0; i < n; i++) {
      if (this.history.pop() === undefined) break;
      this.simTime = Math.max(0, this.simTime - SIM_DT);
    }
    this.state = { ...(this.history.last() ?? this.scene.start), speed: 0 };
    if (this.firstContactTime !== null && this.simTime < this.firstContactTime) this.firstContactTime = null;
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
    if (this.clearance && this.clearance.distance <= 0 && this.firstContactTime === null) this.firstContactTime = this.simTime;
  }

  private attachCameraControls(): void {
    const cam = this.renderer.camera;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    this.canvas.addEventListener('pointerdown', (e) => {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      this.canvas.setPointerCapture(e.pointerId);
    });
    this.canvas.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      cam.panByCss(e.clientX - lastX, e.clientY - lastY);
      lastX = e.clientX;
      lastY = e.clientY;
    });
    const end = (): void => {
      dragging = false;
    };
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = this.canvas.getBoundingClientRect();
      cam.zoomAtCss(e.clientX - r.left, e.clientY - r.top, Math.exp(-e.deltaY * 0.001));
    }, { passive: false });
  }
}
