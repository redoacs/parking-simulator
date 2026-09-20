# Parking Simulator — Design

Date: 2026-09-18
Status: approved (brainstorm 2026-09-17/18), reconciled with implementation 2026-09-20

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
| GPU stack | Raw WebGL2 + GLSL, no rendering library. (WebGPU + WGSL until v1.2; replaced for phone support, see the v1.2 spec.) |
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
  render/    WebGL2 context, passes, GLSL shaders, camera         (browser)
  ui/        panel, readouts, text bindings, input bindings      (browser)
  i18n/      EN/ES catalogs, language preferences, number formatting
  scene/     Scene type + parametric preset generators            (pure)
  app.ts     fixed-step loop, history, clearance, render coordination
  main.ts    startup and UI wiring
```

`main.ts` constructs `App`, the renderer, and UI. `App` coordinates input,
simulation, clearance, and rendering. The geometry, vehicle, scene, and simulation
modules have no browser dependency and are tested in Node.

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
interface Cited<T> { value: T; source: { url: string; accessed: string; note?: string; confidence: 'verified' | 'unverified' } }
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
  mirrorLongitudinal: Cited<number>; // rear axle to mirror centre, m
  mirrorLength: Cited<number>;
}
```

A field that cannot be sourced from an official document for this vehicle is marked
`source.confidence: "unverified"` and shown as such in the UI, including the track widths and
turning circle borrowed from the 2024 US model and the interpretation of the
MX sheet's width as excluding mirrors. `length` must equal
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

Since v1.2 every preset starts with the car pointing up the screen
(`theta = π/2`), so the up/down keys match forward/reverse. Generators still
describe their scene in its natural frame (street along +x, and so on) and
`rotateScene` turns it by a multiple of 90° as the last step, which keeps what
was on the car's right on its right. The view does not rotate afterwards.

## 3. Simulation

- Fixed step `dt = 1/120 s` via an accumulator in `requestAnimationFrame`.
- Kinematic bicycle model at the rear axle: `dx/dt = v·cosθ`,
  `dy/dt = v·sinθ`, `dθ/dt = (v / L)·tanδ`. Each fixed step integrates the
  exact circular arc for its constant steering angle and speed.
- Steering rate-limited: full lock-to-lock in 1.5 s (constant). Speed clamped
  to ±2 m/s. A time-scale slider (0.1×–1×) scales `dt` for fine control.
- Keyboard: `↑/W` forward, `↓/S` reverse, `←/A` `→/D` steer, `Space` stop,
  `R` reset, `Z` rewind (hold). On-screen buttons mirror these for touch.
- History: timestamped movement and steering changes (capacity 36,000 active steps,
  five minutes at 120 Hz). Idle pauses advance sim time without consuming history.
  Rewind pops active steps at 2× real time, restores their timestamps, skips idle
  gaps, and stops the vehicle. It cannot pass the oldest retained state after eviction.
  The pre-rewind envelope stays visible while held and is rebuilt once on release.
  Reset clears history and the envelope and returns to `scene.start`.

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
  show lateral offset from the kerb/side line and heading error. If mirrors still
  contact an obstacle, the UI shows `PARKED · CONTACT` in red; green parked styling
  requires no contact. This does not change the body-only containment definition.
- Turning guides at current `δ`: instantaneous centre of rotation
  `ICR = rear-axle centre + R·n̂` with `R = L / tanδ`; circles for the inner
  rear wheel (smallest), outer front wheel, and outer front body corner
  (largest). Hidden when `|δ| < 0.5°`.

## 5. Rendering

WebGL2 (since v1.2). One context, one canvas, per frame:

1. **Envelope accumulation** — offscreen `R8` texture covering
   `scene.bounds` at 5 mm/px (a 30 m × 20 m scene = 6000 × 4000 px = 24 MB;
   bounded by presets). Each frame draws the footprints for the steps
   simulated since the previous frame with `max` blending. Reset clears it;
   toggling mirrors rebuilds it for the selected outline. When rewind is released the texture is cleared and rebuilt from retained
   history in one pass; the pre-rewind sweep stays visible while rewind is held.
   Stationary steering entries add no duplicate footprints to the rebuild.
2. **Scene pass** — procedural grid (fullscreen triangle, line at 0.1 m minor
   / 1 m major, fading with zoom), obstacles as instanced triangulated
   polygons (ear-clipping at scene build; one vertex buffer, per-instance
   colour by kind), target spot.
3. **Overlay pass** — composite envelope texture (tinted, semi-transparent),
   turning-guide circles (instanced quads with SDF ring shader), then the car:
   body, four wheels rotated by steer (front) around their hubs, mirrors, and
   the clearance ruler (a thick line between closest points) drawn over the car.
4. **Text** — HTML, absolutely positioned over the canvas. No GPU text.

Camera: orthographic; drag to pan, wheel to zoom about cursor, "fit" button
frames `scene.bounds`. Handles `devicePixelRatio` and resize.

`Renderer` is a class created by `Renderer.create(canvas)`, with `camera`,
`resize()`, `frame(FrameInput)`, `resetEnvelope()`, `rebuildEnvelope(polygons)`,
`readEnvelopeAt()`, and `onContextLost()`. `FrameInput` carries static and dynamic
polygons, rings, new footprints, bounds, and version counters. `App` derives
those inputs; the renderer owns GPU resources.

## 6. UI

Plain HTML/CSS/TS, no framework. English and Mexican Spanish use bundled typed
catalogs in `src/i18n/`. Preference order is saved choice, first supported browser
language, then English. Only the choice is stored locally; denied storage leaves
switching usable for the current page. The `Language / Idioma` selector updates
existing text nodes and attributes, including document title/language and fatal
summaries, without replacing controls or changing simulation/history/camera.
Displayed numbers use cached Intl formatters (en-US/es-MX, no grouping); numeric
inputs, scenario IDs/parameter keys and the URL hash remain locale-independent.
Source notes are translated by vehicle id/field; source quotes and diagnostic
details retain their original text. Required confidence metadata controls the
badge regardless of note language. The current catalogs cover the bundled Taos.

Left panel:

- Language selector (English / Español).
- Preset selector + its numeric inputs (live; changing a value rebuilds the
  scene and resets the car).
- Vehicle card: name, each dimension with a link to its source, "unverified"
  badge where applicable, mirrors toggle.
- Readouts: min clearance in cm (green ≥ 30, amber 10–30, red < 10, "CONTACT"
  ≤ 0 with the obstacle kind), steer angle (°), speed (km/h), sim time,
  time-scale slider, parked status with final offsets (red when also in contact).
- Buttons: reset, rewind (hold), fit view, zoom −/+ (touch has no wheel), on-screen drive controls.
- URL hash encodes `preset` + params + mirrors flag so a scenario is
  shareable; parsed on load, written on change.

**Two layouts, one DOM (since v1.2).** Wide — at least 900 px and a fine
pointer — is the panel beside the scene, as above. Anything narrower or
touch-driven gets the compact layout: the scene fills the screen; steering
(◀ ▶, with rewind and centre) sits under the left thumb and forward/reverse
(▲ ▼, with zoom −/+) under the right, so two thumbs can hold two controls at
once, or hold one and tap zoom; ☰ opens the same panel as a sheet, and a press on the scene closes it.
One finger pans, two fingers pinch-zoom. Fit-to-view keeps the scene clear of
the controls, using whichever free area shows it larger: above the thumb
clusters (portrait) or between them (landscape, tablets). Supported from
320 px wide.

## 7. Error handling

- No WebGL2 context: replace the app with a message listing supported
  browsers. Never a silent blank canvas.
- `webglcontextlost`: reload, unless the previous loss was under 60 s ago; then
  show the message (a reload loop is worse than a message).
- Vehicle JSON validated at load (positive finite numbers, length identity,
  sources and valid confidence present); a failure halts startup with the field named.
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

**Playwright smoke** (Chromium, Firefox, WebKit): app boots,
renderer initialises, a scripted key sequence moves the car, clearance readout
changes, envelope texture is non-empty (read back one pixel under the car's
path). Also used during development to verify visually.

## 9. Tooling, CI, deploy

- `pnpm` (corepack), Vite, TypeScript `strict`, ESLint
  (typescript-eslint strict + stylistic, type-checked) + Prettier (width 140),
  Vitest, Playwright.
- Scripts: `dev`, `build`, `preview`, `test`, `test:e2e`, `lint`, `typecheck`,
  `format`, `format:check`.
- GitHub Actions on push to `main` and on PRs: install (frozen lockfile),
  typecheck, lint, format check, unit tests, build, and required browser tests; on
  `main` deploy `dist/` only after both the check and browser jobs pass. Shared
  smoke and language tests run on Chromium, Firefox, and WebKit; CDP phone tests run on Chromium.
  The deployment build sets `BASE_PATH=/parking-simulator/`; Vite defaults to `/`
  when that environment variable is absent.
- Repository: `redoacs/parking-simulator`; publication uses GitHub Pages.

## 10. Out of scope (v1)

Automatic planner, obstacle editor, 3D camera, vehicle
dynamics (slip, suspension, acceleration curves), multiple vehicles at once,
simulation persistence beyond the URL hash, GPU text. Language preference is
stored locally since the English/Spanish update.

## Remaining verification

- Confirm the 2025 MX track widths and turning circle; the cited MX sheet does
  not list them. The current 2024 US proxy uses kerb-to-kerb and is unverified
  for the MX vehicle.
- Confirm whether the cited width excludes mirrors, and the exact mirror geometry
  (width contribution, length, fore/aft position). Current interpretations and
  estimates are marked `unverified`.
