# Parking Simulator — Design

Date: 2026-09-18
Status: approved (brainstorm 2026-09-17/18)

## Purpose

A static web app that answers "will this vehicle fit in this spot, and what
manoeuvre gets it there?" with real-world vehicle dimensions. It is an
instrument, not a game: geometry is exact, the drive is a means of producing a
path. First vehicle: Volkswagen Taos Trendline, Mexico, model year 2025
(facelift).

## Decisions

| Topic | Decision |
|---|---|
| Interaction | Manual real-time driving with swept-path recording; data model planner-ready |
| View | Top-down orthographic plan view; 3D-capable data model (x, y, z + heights) |
| GPU stack | Raw WebGPU + WGSL, no rendering library; WebGL2 fallback deferred |
| Geometry | Analytic on CPU (exact); all pixels on GPU; swept envelope accumulated in a GPU texture |
| Environment | Parametric presets with editable numeric parameters; scene stored as plain obstacle polygons |
| Vehicle data | Researched from VW official sources, each figure cited; user confirms |
| Tooling | Vite, TypeScript strict, pnpm (via corepack), Vitest, Playwright smoke |
| Hosting | GitHub Pages via GitHub Actions on push to `main` |

## 1. Architecture

```
src/
  vehicle/   VehicleSpec JSON, validation, footprint derivation   (pure)
  sim/       kinematic bicycle model, control input, history      (pure)
  geom/      vectors, polygons, distances, turning geometry       (pure)
  render/    WebGPU device, passes, WGSL shaders, camera          (browser)
  ui/        panel, readouts, presets UI, input bindings          (browser)
  scene/     Scene type + parametric preset generators            (pure)
  main.ts    wiring: input → sim.step → geom.check → render.frame
```

Dependencies point downward only: `ui → main ← render`, and everything may
depend on `geom`/`vehicle`/`scene`/`sim`, which depend on nothing in the
browser. Pure modules are tested in Node.

`sim` consumes a `ControlInput { steer: number; speed: number }` per step from
any source. The keyboard is one source; a future planner is another. No planner
code in v1.

## 2. Data model

**Units**: metres, radians, seconds internally. UI displays cm and degrees.

**Coordinates**: right-handed; `x` east, `y` north, `z` up. Plan view looks
down `−z`. All v1 geometry lies at `z = 0` with a `height` field; no third
rendering axis yet.

**`VehicleSpec`** (`src/vehicle/data/<id>.json`):

```ts
interface Cited<T> { value: T; source: { url: string; accessed: string; note?: string } }
interface VehicleSpec {
  id: string; name: string; market: string; modelYear: number;
  length: Cited<number>;            // overall, m
  widthBody: Cited<number>;         // excl. mirrors, m
  widthMirrors: Cited<number>;      // incl. mirrors, m
  height: Cited<number>;
  wheelbase: Cited<number>;
  frontOverhang: Cited<number>;
  rearOverhang: Cited<number>;
  trackFront: Cited<number>;
  trackRear: Cited<number>;
  turningCircle: Cited<{ diameter: number; kind: 'kerb' | 'wall' }>;
  tireWidth: Cited<number>;
  wheelDiameter: Cited<number>;
}
```

A field that cannot be sourced from an official document is marked
`note: "unverified"` and shown as such in the UI. `length` must equal
`wheelbase + frontOverhang + rearOverhang` within 0.01 m or validation fails.

Derived at load (`vehicle/derive.ts`): max steer angle `δmax` from the
turning-circle diameter `D`, wheelbase `L`, and the bicycle-model radius of the
rear-axle centre `R = L / tan δ`. The quoted circle is traced by a reference
point at lateral offset `a` and longitudinal offset `b` from the rear-axle
centre, so `D/2 = sqrt((R + a)² + b²)`, hence
`R = sqrt((D/2)² − b²) − a` and `δmax = atan(L / R)`.
Kerb-to-kerb: `a = trackFront/2`, `b = L` (outer front wheel).
Wall-to-wall: `a = widthBody/2`, `b = L + frontOverhang` (outer front body
corner). Then: body footprint polygon in vehicle frame with
origin at the rear-axle centre, `+x` forward; two mirror polygons; four wheel
rectangles with their hub positions.

**`VehicleState`**: `{ x, y, theta, steer, speed }` — pose of the rear-axle
centre.

**`Scene`**:

```ts
interface Obstacle { polygon: Vec2[]; height: number; kind: 'wall' | 'kerb' | 'car' | 'line' }
interface Scene { bounds: Rect; obstacles: Obstacle[]; target: Vec2[]; start: VehicleState }
```

`kind: 'line'` obstacles (painted lines) are drawn but not collided with.
Presets are functions `(params) → Scene`; the UI and the rest of the app only
see `Scene`, so a later drawing editor emits the same type.

**Presets (v1)** with their parameters:

1. Parallel spot between two parked cars — spot length, spot width, kerb
   present, lane width.
2. Perpendicular bay — bay width, bay depth, aisle width, neighbours present.
3. Single garage — door opening width, interior width, interior depth,
   approach (driveway) width and length, approach angle (0° straight, 90° side
   street).

Each parameter has a documented sane range; values are clamped.

## 3. Simulation

- Fixed step `dt = 1/120 s` via an accumulator in `requestAnimationFrame`.
- Kinematic bicycle model at the rear axle:
  `x += v·cosθ·dt; y += v·sinθ·dt; θ += (v / L)·tanδ·dt`.
- Steering rate-limited: full lock-to-lock in 1.5 s (constant). Speed clamped
  to ±2 m/s. A time-scale slider (0.1×–1×) scales `dt` for fine control.
- Keyboard: `↑/W` forward, `↓/S` reverse, `←/A` `→/D` steer, `Space` stop,
  `R` reset, `Z` rewind (hold). On-screen buttons mirror these for touch.
- History: ring buffer of `VehicleState` per step (capacity 5 min at 120 Hz).
  Rewind pops states and marks the envelope for rebuild from history. Reset
  clears history and the envelope and returns to `scene.start`.

## 4. Geometry & clearance

- Collision outline = body polygon ∪ mirror polygons (mirrors toggleable;
  folded mirrors is a real question). Polygons are transformed to world space
  per step.
- Per step, per collidable obstacle: signed distance between car outline and
  obstacle polygon. Positive: minimum segment–segment distance. Overlap
  (detected by SAT for convex parts; obstacles are convex or split into convex
  parts by the preset) yields a negative value equal to the SAT penetration
  depth. Report global minimum, the obstacle it is against, and the closest
  point pair.
- **Collision**: min distance ≤ 0. Drive continues; state flagged; the history
  index is recorded so the UI can show "first contact at t = …".
- **Parked**: body polygon fully inside `target` and `speed = 0`. Readouts then
  show lateral offset from the kerb/side line and heading error.
- Turning guides at current `δ`: instantaneous centre of rotation
  `ICR = rear-axle centre + R·n̂` with `R = L / tanδ`; circles for the inner
  rear wheel (smallest), outer front wheel, and outer front body corner
  (largest). Hidden when `|δ| < 0.5°`.

## 5. Rendering

WebGPU only in v1. One device, one canvas, per frame:

1. **Envelope accumulation** — offscreen `r8unorm` texture covering
   `scene.bounds` at 5 mm/px (a 30 m × 20 m scene = 6000 × 4000 px = 24 MB;
   bounded by presets). Each frame draws the footprints for the steps
   simulated since the previous frame with `max` blending. Never cleared until
   reset/rewind. On rewind the texture is cleared and rebuilt from history in
   one pass.
2. **Scene pass** — procedural grid (fullscreen triangle, line at 0.1 m minor
   / 1 m major, fading with zoom), obstacles as instanced triangulated
   polygons (ear-clipping at scene build; one vertex buffer, per-instance
   colour by kind), target spot.
3. **Overlay pass** — composite envelope texture (tinted, semi-transparent),
   turning-guide circles (instanced quads with SDF ring shader), clearance
   ruler (a thick line between closest points), then the car: body, four
   wheels rotated by steer (front) around their hubs, mirrors.
4. **Text** — HTML, absolutely positioned over the canvas. No GPU text.

Camera: orthographic; drag to pan, wheel to zoom about cursor, "fit" button
frames `scene.bounds`. Handles `devicePixelRatio` and resize.

`Renderer` interface: `init(canvas)`, `resize()`, `frame(view: FrameInput)`,
`resetEnvelope()`, `rebuildEnvelope(states)`. `FrameInput` carries the scene
buffers, car pose, guide circles, ruler, and camera. This is the seam for a
later WebGL2 or 3D backend.

## 6. UI

Plain HTML/CSS/TS, no framework. Left panel:

- Preset selector + its numeric inputs (live; changing a value rebuilds the
  scene and resets the car).
- Vehicle card: name, each dimension with a link to its source, "unverified"
  badge where applicable, mirrors toggle.
- Readouts: min clearance in cm (green ≥ 30, amber 10–30, red < 10, "CONTACT"
  ≤ 0 with the obstacle kind), steer angle (°), speed (km/h), sim time,
  time-scale slider, parked status with final offsets.
- Buttons: reset, rewind (hold), fit view, zoom −/+ (touch has no wheel), on-screen drive controls.
- URL hash encodes `preset` + params + mirrors flag so a scenario is
  shareable; parsed on load, written on change.

## 7. Error handling

- No `navigator.gpu` or no adapter/device: replace the app with a message
  listing supported browsers. Never a silent blank canvas.
- `device.lost`: re-initialise once; on second loss show the message.
- Vehicle JSON validated at load (positive finite numbers, length identity,
  sources present); a failure halts startup with the field named.
- Preset params clamped; generators are written so no clamped combination
  yields overlapping or self-intersecting obstacles, and a unit test asserts
  it across the parameter grid corners.

## 8. Testing

**Vitest (Node)**, TDD for pure modules:

- Bicycle model: straight line at `δ = 0`; constant-`δ` circle closes to the
  start within 1 mm after `2πR/v` seconds; radius of the outer front wheel
  matches `turningCircle/2` within 1 % at `δmax` (kerb variant).
- Geometry: segment–segment distance and SAT penetration against hand-computed
  cases, including touching (0) and overlapping (negative) polygons.
- Vehicle: footprint derivation from the Taos spec (corner positions vs. hand
  computation); validation rejects a spec with a broken length identity or a
  missing source.
- Scene: every preset over the corners of its parameter ranges produces
  non-overlapping, non-self-intersecting obstacles and a car start pose that
  is clearance-positive.

**Playwright smoke** (headless Chromium with WebGPU enabled): app boots,
renderer initialises, a scripted key sequence moves the car, clearance readout
changes, envelope texture is non-empty (read back one pixel under the car's
path). Also used during development to verify visually.

## 9. Tooling, CI, deploy

- `pnpm` (corepack), Vite, TypeScript `strict`, `@webgpu/types`, ESLint
  (typescript-eslint recommended) + Prettier, Vitest, Playwright.
- Scripts: `dev`, `build`, `preview`, `test`, `test:e2e`, `lint`, `typecheck`.
- GitHub Actions on push to `main` and on PRs: install (frozen lockfile),
  typecheck, lint, unit tests, build; on `main` additionally deploy `dist/`
  to GitHub Pages. Vite `base` = `/parking-simulator/`.
- The GitHub repository `redoacs/parking-simulator` (public) is created at the
  deploy step, not before.

## 10. Out of scope (v1)

Automatic planner, obstacle editor, 3D camera, WebGL2 fallback, vehicle
dynamics (slip, suspension, acceleration curves), multiple vehicles at once,
persistence beyond the URL hash, GPU text.

## Open items to resolve during implementation

- Which turning-circle variant (kerb or wall) VW Mexico quotes for the 2025
  Taos; the derivation branches on it.
- Exact mirror geometry (width contribution and fore/aft position) — likely
  approximate from `widthMirrors − widthBody` and a typical A-pillar position;
  will be marked `unverified`.
