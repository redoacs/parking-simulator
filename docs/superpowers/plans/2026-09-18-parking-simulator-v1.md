# Parking Simulator v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static WebGPU web app in which you drive a Volkswagen Taos Trendline (MX 2025) top-down through parametric parking scenarios and read exact clearances and the swept envelope.

**Architecture:** Pure TypeScript modules (`geom`, `vehicle`, `sim`, `scene`) hold all maths and are unit-tested in Node; `render` draws everything with raw WebGPU (polygon pipeline, procedural grid, SDF rings, and a persistent `r8unorm` accumulation texture for the swept envelope); `ui` + `main.ts` wire keyboard input → fixed-step kinematic bicycle model → analytic clearance → frame.

**Tech Stack:** pnpm 12 (corepack), Vite 8.3, TypeScript 5.9 (strict), `@webgpu/types`, Vitest 5, Playwright 1.63, ESLint 10 + typescript-eslint 8, Prettier 3, GitHub Actions → GitHub Pages.

**Spec:** `docs/superpowers/specs/2026-09-18-parking-simulator-design.md`

## Global Constraints

- Units: metres, radians, seconds internally; UI shows cm, degrees, km/h.
- World frame: `x` east, `y` north, heading `θ` counter-clockwise from `+x`. Vehicle frame: origin at rear-axle centre, `+x` forward, `+y` left.
- Polygons are arrays of `Vec2`, counter-clockwise, convex (presets split concave shapes into convex parts).
- Sim step `dt = 1/120 s`. Max speed 2 m/s. Steering lock-to-lock 1.5 s.
- Envelope texture resolution 200 px/m (5 mm/px), clamped to `device.limits.maxTextureDimension2D`.
- Clearance colour bands: green ≥ 0.30 m, amber 0.10–0.30 m, red < 0.10 m, "CONTACT" ≤ 0.
- TypeScript pinned `^5.9.3` (typescript-eslint 8.70 peers `<6.1.0`). No rendering library. No UI framework.
- Every vehicle figure carries a `source`; figures VW does not publish carry `note: "unverified"`.
- Work happens on branch `feat/v1` in `.worktrees/feat/v1` (create it with `superpowers:using-git-worktrees` before Task 1). Commit after every task.
- Deviations from the spec, decided here: (a) the bicycle model integrates each step as an **exact circular arc** rather than Euler, so the closure test can be tight; (b) obstacles/car are drawn from **one interleaved vertex buffer** (position + colour) instead of instanced polygons — same pixels, less plumbing; (c) steering **holds** its angle when no steer key is pressed and `C` centres it (better for precision than self-centring).

## File structure

```
package.json, pnpm-lock.yaml, tsconfig.json, vite.config.ts, eslint.config.js, .prettierrc, index.html
.github/workflows/ci.yml
src/main.ts                       wiring + frame loop
src/style.css
src/geom/vec2.ts                  Vec2 + ops
src/geom/polygon.ts               Polygon, Rect, Pose, transforms, containment, fan triangles
src/geom/distance.ts              segment distance, SAT penetration, signed polygon distance
src/geom/turning.ts               max steer from turning circle, ICR, guide circles
src/geom/clearance.ts             checkClearance, isParked
src/vehicle/types.ts              Cited<T>, VehicleSpec, VehicleDims
src/vehicle/validate.ts           validateVehicleSpec
src/vehicle/derive.ts             DerivedVehicle, deriveVehicle, collisionOutline
src/vehicle/data/taos-trendline-mx-2025.json
src/sim/model.ts                  VehicleState, ControlInput, SimParams, stepVehicle
src/sim/history.ts                StateHistory ring buffer
src/scene/types.ts                Obstacle, Scene, ParamDef, PresetDef
src/scene/presets/{parallel,perpendicular,garage,index}.ts
src/render/gpu.ts                 initGpu, WebGpuUnavailableError
src/render/camera.ts              Camera (ortho, pan/zoom/fit, uniform data)
src/render/polygons.ts            PolygonPipeline + buffer builder
src/render/grid.ts                GridPipeline
src/render/envelope.ts            EnvelopePass (accumulate, composite, rebuild, readback)
src/render/rings.ts               RingPipeline
src/render/scenePolys.ts          Scene/vehicle → ColoredPolygon[]
src/render/renderer.ts            Renderer, FrameInput
src/render/shaders/{poly,grid,envelope,ring}.wgsl
src/ui/input.ts                   DriveInput (keyboard + on-screen buttons)
src/ui/hash.ts                    URL hash encode/decode
src/ui/panel.ts                   preset selector + param inputs + vehicle card
src/ui/readouts.ts                readout updates
e2e/smoke.spec.ts, playwright.config.ts
```

Tests are colocated: `src/**/*.test.ts`.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `eslint.config.js`, `.prettierrc`, `index.html`, `src/main.ts`, `src/style.css`, `src/scaffold.test.ts`

**Interfaces:**
- Produces: `pnpm dev|build|preview|test|lint|typecheck|format` scripts; `import x from './file.wgsl?raw'` typed via `vite/client`.

- [ ] **Step 1: Write package.json**

```json
{
  "name": "parking-simulator",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "packageManager": "pnpm@12.4.2",
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "format": "prettier --write ."
  }
}
```

- [ ] **Step 2: Install dependencies**

Run:
```bash
pnpm add -D vite@^8.3.0 typescript@^5.9.3 vitest@^5.0.1 @webgpu/types@^0.1.72 @types/node@^24 eslint@^10 typescript-eslint@^8.70.0 prettier@^3.9 @playwright/test@^1.63.0
```
Expected: `pnpm-lock.yaml` created, no peer warnings about typescript.

- [ ] **Step 3: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "types": ["@webgpu/types", "vite/client"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "exactOptionalPropertyTypes": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "e2e", "vite.config.ts", "playwright.config.ts"]
}
```

- [ ] **Step 4: Write vite.config.ts, eslint.config.js, .prettierrc**

`vite.config.ts`:
```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  build: { target: 'es2022' },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
```

`eslint.config.js`:
```js
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'node_modules/', '.worktrees/', 'playwright-report/', 'test-results/'] },
  ...tseslint.configs.recommended,
  { rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] } },
);
```

`.prettierrc`:
```json
{ "singleQuote": true, "semi": true, "printWidth": 100, "trailingComma": "all" }
```

- [ ] **Step 5: Write index.html, src/style.css, src/main.ts**

`index.html`:
```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Parking Simulator</title>
    <link rel="stylesheet" href="/src/style.css" />
  </head>
  <body>
    <div id="app">
      <aside id="panel"></aside>
      <main id="stage">
        <canvas id="gpu"></canvas>
        <div id="hud"></div>
        <div id="fatal" hidden></div>
      </main>
    </div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

`src/style.css`:
```css
:root { color-scheme: dark; font: 14px/1.4 system-ui, sans-serif; --bg: #14171c; --panel: #1d222a; --fg: #e6e9ef; --muted: #8a93a3; --ok: #3ddc84; --warn: #f5b942; --bad: #ff5c5c; }
* { box-sizing: border-box; }
html, body { margin: 0; height: 100%; background: var(--bg); color: var(--fg); }
#app { display: grid; grid-template-columns: 320px 1fr; height: 100%; }
#panel { background: var(--panel); padding: 12px; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; }
#stage { position: relative; overflow: hidden; }
#gpu { width: 100%; height: 100%; display: block; touch-action: none; }
#hud { position: absolute; left: 12px; top: 12px; pointer-events: none; display: flex; flex-direction: column; gap: 4px; }
#fatal { position: absolute; inset: 0; display: grid; place-items: center; padding: 24px; background: var(--bg); text-align: center; }
#fatal[hidden] { display: none; }
fieldset { border: 1px solid #2c333e; border-radius: 6px; padding: 8px 10px; }
legend { color: var(--muted); padding: 0 4px; }
label.param { display: grid; grid-template-columns: 1fr 80px; align-items: center; gap: 8px; margin: 4px 0; }
input[type="number"], select { background: #10131a; color: var(--fg); border: 1px solid #2c333e; border-radius: 4px; padding: 3px 6px; width: 100%; }
button { background: #2a3140; color: var(--fg); border: 1px solid #3a4354; border-radius: 4px; padding: 6px 10px; cursor: pointer; }
button:active { background: #3a4354; }
.readout { display: flex; justify-content: space-between; gap: 8px; }
.readout .value { font-variant-numeric: tabular-nums; }
.band-ok { color: var(--ok); } .band-warn { color: var(--warn); } .band-bad { color: var(--bad); font-weight: 600; }
.pad { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
.pad button { padding: 10px 0; }
.unverified { color: var(--warn); font-size: 11px; margin-left: 4px; }
.source { color: var(--muted); font-size: 11px; }
@media (max-width: 720px) { #app { grid-template-columns: 1fr; grid-template-rows: 1fr auto; } #panel { order: 2; max-height: 45vh; } }
```

`src/main.ts` (placeholder until Task 13):
```ts
console.log('parking-simulator scaffold');
```

`src/scaffold.test.ts`:
```ts
import { describe, expect, it } from 'vitest';

describe('scaffold', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: Verify all scripts run**

Run: `pnpm typecheck && pnpm lint && pnpm test && pnpm build`
Expected: all exit 0; `dist/index.html` exists; vitest reports 1 passed.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + TypeScript + Vitest project"
```

---

### Task 2: geom — vectors and polygons

**Files:**
- Create: `src/geom/vec2.ts`, `src/geom/polygon.ts`, `src/geom/polygon.test.ts`

**Interfaces:**
- Produces:
  - `Vec2 {x,y}`, `vec(x,y)`, `add`, `sub`, `scale(v,k)`, `dot`, `cross`, `len`, `dist`, `normalize`, `rotate(v, theta)`, `perp(v)` (rotates +90°).
  - `Polygon = Vec2[]` (CCW), `Rect {minX,minY,maxX,maxY}`, `Pose {x,y,theta}`.
  - `rect(minX,minY,maxX,maxY): Polygon`, `rectCentered(cx,cy,w,h): Polygon`, `transformPolygon(poly, pose): Polygon`, `signedArea(poly)`, `isConvex(poly)`, `boundsOf(polys: Polygon[]): Rect`, `pointInConvex(p, poly)`, `polygonInsideConvex(inner, outer)`, `fanTriangles(poly): Vec2[]` (3 n−6 vertices), `rectFromSegment(a, b, width): Polygon`.

- [ ] **Step 1: Write the failing tests**

`src/geom/polygon.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { vec, rotate } from './vec2';
import {
  rect, rectCentered, transformPolygon, signedArea, isConvex, boundsOf,
  pointInConvex, polygonInsideConvex, fanTriangles, rectFromSegment,
} from './polygon';

describe('vec2', () => {
  it('rotates +x by 90° to +y', () => {
    const r = rotate(vec(1, 0), Math.PI / 2);
    expect(r.x).toBeCloseTo(0, 12);
    expect(r.y).toBeCloseTo(1, 12);
  });
});

describe('polygon', () => {
  it('rect is CCW with positive area', () => {
    const p = rect(0, 0, 2, 1);
    expect(p).toHaveLength(4);
    expect(signedArea(p)).toBeCloseTo(2, 12);
    expect(isConvex(p)).toBe(true);
  });

  it('rectCentered matches rect', () => {
    expect(rectCentered(1, 0.5, 2, 1)).toEqual(rect(0, 0, 2, 1));
  });

  it('transformPolygon rotates then translates', () => {
    const p = transformPolygon([vec(1, 0)], { x: 10, y: 20, theta: Math.PI / 2 });
    expect(p[0]!.x).toBeCloseTo(10, 12);
    expect(p[0]!.y).toBeCloseTo(21, 12);
  });

  it('boundsOf spans all polygons', () => {
    expect(boundsOf([rect(0, 0, 1, 1), rect(5, -2, 6, 3)])).toEqual({ minX: 0, minY: -2, maxX: 6, maxY: 3 });
  });

  it('pointInConvex', () => {
    const p = rect(0, 0, 2, 2);
    expect(pointInConvex(vec(1, 1), p)).toBe(true);
    expect(pointInConvex(vec(3, 1), p)).toBe(false);
    expect(pointInConvex(vec(2, 1), p)).toBe(true); // boundary counts as inside
  });

  it('polygonInsideConvex', () => {
    const outer = rect(0, 0, 6, 3);
    expect(polygonInsideConvex(rect(1, 1, 5, 2), outer)).toBe(true);
    expect(polygonInsideConvex(rect(1, 1, 7, 2), outer)).toBe(false);
  });

  it('fanTriangles of a quad gives two triangles', () => {
    const t = fanTriangles(rect(0, 0, 1, 1));
    expect(t).toHaveLength(6);
    expect(t[0]).toEqual(vec(0, 0));
    expect(t[3]).toEqual(vec(0, 0));
  });

  it('rectFromSegment builds a CCW strip of the given width', () => {
    const s = rectFromSegment(vec(0, 0), vec(4, 0), 0.2);
    expect(signedArea(s)).toBeCloseTo(0.8, 12);
    expect(boundsOf([s])).toEqual({ minX: 0, minY: -0.1, maxX: 4, maxY: 0.1 });
  });

  it('isConvex rejects a concave polygon', () => {
    expect(isConvex([vec(0, 0), vec(2, 0), vec(1, 0.5), vec(2, 2), vec(0, 2)])).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/geom/polygon.test.ts`
Expected: FAIL — cannot resolve `./vec2` / `./polygon`.

- [ ] **Step 3: Implement**

`src/geom/vec2.ts`:
```ts
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export const vec = (x: number, y: number): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, k: number): Vec2 => ({ x: a.x * k, y: a.y * k });
export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y;
/** z-component of the 3D cross product; positive when b is CCW from a. */
export const cross = (a: Vec2, b: Vec2): number => a.x * b.y - a.y * b.x;
export const len = (a: Vec2): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(a.x - b.x, a.y - b.y);
export const perp = (a: Vec2): Vec2 => ({ x: -a.y, y: a.x });

export function normalize(a: Vec2): Vec2 {
  const l = len(a);
  return l === 0 ? a : { x: a.x / l, y: a.y / l };
}

export function rotate(a: Vec2, theta: number): Vec2 {
  const c = Math.cos(theta);
  const s = Math.sin(theta);
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
}
```

`src/geom/polygon.ts`:
```ts
import { type Vec2, vec, sub, cross, normalize, perp, scale, add } from './vec2';

/** Counter-clockwise, convex. */
export type Polygon = Vec2[];

export interface Rect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Pose {
  x: number;
  y: number;
  theta: number;
}

export function rect(minX: number, minY: number, maxX: number, maxY: number): Polygon {
  return [vec(minX, minY), vec(maxX, minY), vec(maxX, maxY), vec(minX, maxY)];
}

export function rectCentered(cx: number, cy: number, w: number, h: number): Polygon {
  return rect(cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2);
}

/** Strip of `width` centred on segment a→b. */
export function rectFromSegment(a: Vec2, b: Vec2, width: number): Polygon {
  const n = scale(normalize(perp(sub(b, a))), width / 2);
  return [sub(a, n), sub(b, n), add(b, n), add(a, n)];
}

export function transformPolygon(poly: Polygon, pose: Pose): Polygon {
  const c = Math.cos(pose.theta);
  const s = Math.sin(pose.theta);
  return poly.map((p) => vec(pose.x + p.x * c - p.y * s, pose.y + p.x * s + p.y * c));
}

export function signedArea(poly: Polygon): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

export function isConvex(poly: Polygon): boolean {
  const n = poly.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % n]!;
    const c = poly[(i + 2) % n]!;
    if (cross(sub(b, a), sub(c, b)) < -1e-12) return false;
  }
  return true;
}

export function boundsOf(polys: Polygon[]): Rect {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const poly of polys) {
    for (const p of poly) {
      if (p.x < minX) minX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.x > maxX) maxX = p.x;
      if (p.y > maxY) maxY = p.y;
    }
  }
  return { minX, minY, maxX, maxY };
}

/** Boundary counts as inside. */
export function pointInConvex(p: Vec2, poly: Polygon): boolean {
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % n]!;
    if (cross(sub(b, a), sub(p, a)) < -1e-9) return false;
  }
  return true;
}

export function polygonInsideConvex(inner: Polygon, outer: Polygon): boolean {
  return inner.every((p) => pointInConvex(p, outer));
}

/** Triangle list (fan from vertex 0) for a convex polygon. */
export function fanTriangles(poly: Polygon): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 1; i + 1 < poly.length; i++) out.push(poly[0]!, poly[i]!, poly[i + 1]!);
  return out;
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/geom/polygon.test.ts`
Expected: PASS (10 tests).

- [ ] **Step 5: Commit**

```bash
git add src/geom
git commit -m "feat(geom): vec2 and convex polygon primitives"
```

---

### Task 3: geom — signed polygon distance

**Files:**
- Create: `src/geom/distance.ts`, `src/geom/distance.test.ts`

**Interfaces:**
- Consumes: `Vec2`, `Polygon` from Task 2.
- Produces:
  - `closestPointOnSegment(p, a, b): Vec2`
  - `segmentDistance(a0, a1, b0, b1): { d: number; pa: Vec2; pb: Vec2 }`
  - `convexPenetration(a, b): number` — SAT minimum overlap; `0` when separated or touching.
  - `polygonDistance(a, b): PolygonDistance` where `PolygonDistance { distance: number; pa: Vec2; pb: Vec2 }`; `distance` is negative penetration depth when overlapping.

- [ ] **Step 1: Write the failing tests**

`src/geom/distance.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { vec } from './vec2';
import { rect } from './polygon';
import { closestPointOnSegment, segmentDistance, convexPenetration, polygonDistance } from './distance';

describe('closestPointOnSegment', () => {
  it('clamps to endpoints', () => {
    expect(closestPointOnSegment(vec(-1, 1), vec(0, 0), vec(2, 0))).toEqual(vec(0, 0));
    expect(closestPointOnSegment(vec(3, 1), vec(0, 0), vec(2, 0))).toEqual(vec(2, 0));
  });
  it('projects onto the interior', () => {
    expect(closestPointOnSegment(vec(1, 1), vec(0, 0), vec(2, 0))).toEqual(vec(1, 0));
  });
});

describe('segmentDistance', () => {
  it('parallel segments', () => {
    const r = segmentDistance(vec(0, 0), vec(2, 0), vec(0, 1), vec(2, 1));
    expect(r.d).toBeCloseTo(1, 12);
  });
  it('crossing segments give 0', () => {
    expect(segmentDistance(vec(0, 0), vec(2, 2), vec(0, 2), vec(2, 0)).d).toBeCloseTo(0, 12);
  });
  it('endpoint to endpoint', () => {
    const r = segmentDistance(vec(0, 0), vec(1, 0), vec(2, 1), vec(3, 1));
    expect(r.d).toBeCloseTo(Math.SQRT2, 12);
    expect(r.pa).toEqual(vec(1, 0));
    expect(r.pb).toEqual(vec(2, 1));
  });
});

describe('convexPenetration', () => {
  it('is 0 for separated squares', () => {
    expect(convexPenetration(rect(0, 0, 1, 1), rect(1.5, 0, 2.5, 1))).toBe(0);
  });
  it('is 0 for touching squares', () => {
    expect(convexPenetration(rect(0, 0, 1, 1), rect(1, 0, 2, 1))).toBeCloseTo(0, 12);
  });
  it('is the overlap depth', () => {
    expect(convexPenetration(rect(0, 0, 1, 1), rect(0.8, 0, 1.8, 1))).toBeCloseTo(0.2, 12);
    expect(convexPenetration(rect(0, 0, 1, 1), rect(0.3, 0.9, 0.6, 1.9))).toBeCloseTo(0.1, 12);
  });
  it('uses the minimum translation, not the interval intersection, when intervals nest', () => {
    expect(convexPenetration(rect(0, 0, 4, 4), rect(1, -1, 2, 5))).toBeCloseTo(2, 12);
    expect(convexPenetration(rect(0, 0, 4.5, 1.8), rect(2.15, -1, 2.35, 3))).toBeCloseTo(2.35, 12);
  });
});

describe('polygonDistance', () => {
  it('positive gap with closest points', () => {
    const r = polygonDistance(rect(0, 0, 1, 1), rect(1.5, 0.25, 2.5, 0.75));
    expect(r.distance).toBeCloseTo(0.5, 12);
    expect(r.pa.x).toBeCloseTo(1, 12);
    expect(r.pb.x).toBeCloseTo(1.5, 12);
  });
  it('diagonal gap', () => {
    const r = polygonDistance(rect(0, 0, 1, 1), rect(2, 2, 3, 3));
    expect(r.distance).toBeCloseTo(Math.SQRT2, 12);
  });
  it('touching is 0', () => {
    expect(polygonDistance(rect(0, 0, 1, 1), rect(1, 0, 2, 1)).distance).toBeCloseTo(0, 12);
  });
  it('overlap is negative depth', () => {
    expect(polygonDistance(rect(0, 0, 1, 1), rect(0.8, 0, 1.8, 1)).distance).toBeCloseTo(-0.2, 12);
  });
  it('containment is negative', () => {
    expect(polygonDistance(rect(0, 0, 4, 4), rect(1, 1, 2, 2)).distance).toBeLessThan(0);
  });
  it('containment depth is the shortest way out', () => {
    expect(polygonDistance(rect(0, 0, 4, 4), rect(1, 1, 2, 2)).distance).toBeCloseTo(-2, 12);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/geom/distance.test.ts`
Expected: FAIL — cannot resolve `./distance`.

- [ ] **Step 3: Implement**

`src/geom/distance.ts`:
```ts
import { type Vec2, sub, dot, dist, perp, normalize, cross } from './vec2';
import type { Polygon } from './polygon';

export interface PolygonDistance {
  /** > 0 gap, 0 touching, < 0 penetration depth. */
  distance: number;
  pa: Vec2;
  pb: Vec2;
}

export function closestPointOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const ab = sub(b, a);
  const l2 = dot(ab, ab);
  if (l2 === 0) return a;
  const t = Math.max(0, Math.min(1, dot(sub(p, a), ab) / l2));
  return { x: a.x + ab.x * t, y: a.y + ab.y * t };
}

function segmentsIntersect(a0: Vec2, a1: Vec2, b0: Vec2, b1: Vec2): boolean {
  const d1 = cross(sub(a1, a0), sub(b0, a0));
  const d2 = cross(sub(a1, a0), sub(b1, a0));
  const d3 = cross(sub(b1, b0), sub(a0, b0));
  const d4 = cross(sub(b1, b0), sub(a1, b0));
  return d1 * d2 < 0 && d3 * d4 < 0;
}

export function segmentDistance(a0: Vec2, a1: Vec2, b0: Vec2, b1: Vec2): { d: number; pa: Vec2; pb: Vec2 } {
  if (segmentsIntersect(a0, a1, b0, b1)) {
    // Any interior point works; use the intersection.
    const r = sub(a1, a0);
    const s = sub(b1, b0);
    const t = cross(sub(b0, a0), s) / cross(r, s);
    const p = { x: a0.x + r.x * t, y: a0.y + r.y * t };
    return { d: 0, pa: p, pb: p };
  }
  const candidates: Array<[Vec2, Vec2]> = [
    [a0, closestPointOnSegment(a0, b0, b1)],
    [a1, closestPointOnSegment(a1, b0, b1)],
    [closestPointOnSegment(b0, a0, a1), b0],
    [closestPointOnSegment(b1, a0, a1), b1],
  ];
  let best = candidates[0]!;
  let bestD = dist(best[0], best[1]);
  for (let i = 1; i < candidates.length; i++) {
    const c = candidates[i]!;
    const d = dist(c[0], c[1]);
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return { d: bestD, pa: best[0], pb: best[1] };
}

function project(poly: Polygon, axis: Vec2): [number, number] {
  let min = Infinity;
  let max = -Infinity;
  for (const p of poly) {
    const v = dot(p, axis);
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return [min, max];
}

/** Separating-axis minimum overlap for convex polygons. 0 when separated or touching. */
export function convexPenetration(a: Polygon, b: Polygon): number {
  let minOverlap = Infinity;
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const axis = normalize(perp(sub(poly[(i + 1) % poly.length]!, poly[i]!)));
      const [amin, amax] = project(a, axis);
      const [bmin, bmax] = project(b, axis);
      // Minimum translation along this axis: b moves until bmin >= amax or bmax <= amin.
      // (Not the interval intersection — that under-reports when one interval nests in the other.)
      const overlap = Math.min(amax - bmin, bmax - amin);
      if (overlap <= 1e-12) return 0;
      if (overlap < minOverlap) minOverlap = overlap;
    }
  }
  return minOverlap;
}

export function polygonDistance(a: Polygon, b: Polygon): PolygonDistance {
  const pen = convexPenetration(a, b);
  let best: PolygonDistance = { distance: Infinity, pa: a[0]!, pb: b[0]! };
  for (let i = 0; i < a.length; i++) {
    const a0 = a[i]!;
    const a1 = a[(i + 1) % a.length]!;
    for (let j = 0; j < b.length; j++) {
      const r = segmentDistance(a0, a1, b[j]!, b[(j + 1) % b.length]!);
      if (r.d < best.distance) best = { distance: r.d, pa: r.pa, pb: r.pb };
    }
  }
  if (pen > 0) return { distance: -pen, pa: best.pa, pb: best.pb };
  return best;
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/geom/distance.test.ts`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add src/geom/distance.ts src/geom/distance.test.ts
git commit -m "feat(geom): exact signed distance between convex polygons"
```

---

### Task 4: vehicle — spec types, cited data, validation

**Files:**
- Create: `src/vehicle/types.ts`, `src/vehicle/validate.ts`, `src/vehicle/validate.test.ts`, `src/vehicle/data/taos-trendline-mx-2025.json`

**Interfaces:**
- Produces:
  - `Cited<T> { value: T; source: Source }`, `Source { url: string; accessed: string; note?: string }`
  - `VehicleSpec` (all fields below), `VehicleDims` (numbers only), `dimsOf(spec): VehicleDims`
  - `validateVehicleSpec(raw: unknown): VehicleSpec`, `class VehicleSpecError extends Error { field: string }`
  - `isUnverified(c: Cited<unknown>): boolean` — true when `note` starts with `"unverified"`.

Data provenance (verified 2026-09-18):
- VW México MY25 ficha técnica PDF: Largo 4467, Ancho 1841, Alto 1638, Distancia entre ejes 2689 (mm); Trendline "Rines de aluminio 17" / Llantas 215/55/ 94H". URL: `https://www.vw.com.mx/idhub/content/dam/onehub_pkw/importers/mx/fichas-tecnicas/producto/2025/taos/volkswagen-nuevo-taos-2025-ficha-tecnica.pdf`
- VW USA 2024 Taos Technical Specs PDF, 1.5T FWD column (same body: wheelbase 2689, width 1841, 215/55 R17): Front Track 1572 mm, Rear Track 1537 mm, Turning Circle (curb to curb) 35.1 ft / 10.70 m, Turns lock-to-lock 2.69. URL: `https://media.vw.com/assets/documents/original/17285-2024TaosTechnicalSpecsFINAL.pdf`
- Not published by VW (marked unverified): overhang split (only the sum, 4.467 − 2.689 = 1.778 m, is sourced), width incl. mirrors (dealer sites quote 82.6 in ≈ 2.098 m), mirror longitudinal position.

- [ ] **Step 1: Write the vehicle JSON**

`src/vehicle/data/taos-trendline-mx-2025.json`:
```json
{
  "id": "taos-trendline-mx-2025",
  "name": "Volkswagen Taos Trendline",
  "market": "MX",
  "modelYear": 2025,
  "length": { "value": 4.467, "source": { "url": "https://www.vw.com.mx/idhub/content/dam/onehub_pkw/importers/mx/fichas-tecnicas/producto/2025/taos/volkswagen-nuevo-taos-2025-ficha-tecnica.pdf", "accessed": "2026-09-18", "note": "Largo (mm) 4467" } },
  "widthBody": { "value": 1.841, "source": { "url": "https://www.vw.com.mx/idhub/content/dam/onehub_pkw/importers/mx/fichas-tecnicas/producto/2025/taos/volkswagen-nuevo-taos-2025-ficha-tecnica.pdf", "accessed": "2026-09-18", "note": "Ancho (mm) 1841; VW USA sheet states width excludes mirrors" } },
  "widthMirrors": { "value": 2.098, "source": { "url": "https://www.elkgrovevw.com/2025-volkswagen-taos-dimensions/", "accessed": "2026-09-18", "note": "unverified: dealer-quoted 82.6 in incl. mirrors; not published by VW" } },
  "height": { "value": 1.638, "source": { "url": "https://www.vw.com.mx/idhub/content/dam/onehub_pkw/importers/mx/fichas-tecnicas/producto/2025/taos/volkswagen-nuevo-taos-2025-ficha-tecnica.pdf", "accessed": "2026-09-18", "note": "Alto (mm) 1638" } },
  "wheelbase": { "value": 2.689, "source": { "url": "https://www.vw.com.mx/idhub/content/dam/onehub_pkw/importers/mx/fichas-tecnicas/producto/2025/taos/volkswagen-nuevo-taos-2025-ficha-tecnica.pdf", "accessed": "2026-09-18", "note": "Distancia entre ejes (mm) 2689" } },
  "frontOverhang": { "value": 0.870, "source": { "url": "https://www.vw.com.mx/idhub/content/dam/onehub_pkw/importers/mx/fichas-tecnicas/producto/2025/taos/volkswagen-nuevo-taos-2025-ficha-tecnica.pdf", "accessed": "2026-09-18", "note": "unverified: split estimated; only front+rear = 1.778 m (length - wheelbase) is sourced" } },
  "rearOverhang": { "value": 0.908, "source": { "url": "https://www.vw.com.mx/idhub/content/dam/onehub_pkw/importers/mx/fichas-tecnicas/producto/2025/taos/volkswagen-nuevo-taos-2025-ficha-tecnica.pdf", "accessed": "2026-09-18", "note": "unverified: split estimated; only front+rear = 1.778 m (length - wheelbase) is sourced" } },
  "trackFront": { "value": 1.572, "source": { "url": "https://media.vw.com/assets/documents/original/17285-2024TaosTechnicalSpecsFINAL.pdf", "accessed": "2026-09-18", "note": "VW USA 2024 Taos 1.5T FWD: Front Track 61.9 in / 1572 mm (same body: wb 2689, width 1841, 215/55 R17)" } },
  "trackRear": { "value": 1.537, "source": { "url": "https://media.vw.com/assets/documents/original/17285-2024TaosTechnicalSpecsFINAL.pdf", "accessed": "2026-09-18", "note": "VW USA 2024 Taos 1.5T FWD: Rear Track 60.5 in / 1537 mm" } },
  "turningCircle": { "value": { "diameter": 10.70, "kind": "kerb" }, "source": { "url": "https://media.vw.com/assets/documents/original/17285-2024TaosTechnicalSpecsFINAL.pdf", "accessed": "2026-09-18", "note": "VW USA 2024 Taos 1.5T FWD: Turning Circle (curb to curb) 35.1 ft / 10.70 m; 2.69 turns lock-to-lock" } },
  "tireWidth": { "value": 0.215, "source": { "url": "https://www.vw.com.mx/idhub/content/dam/onehub_pkw/importers/mx/fichas-tecnicas/producto/2025/taos/volkswagen-nuevo-taos-2025-ficha-tecnica.pdf", "accessed": "2026-09-18", "note": "Trendline: Llantas 215/55 R17" } },
  "wheelDiameter": { "value": 0.668, "source": { "url": "https://www.vw.com.mx/idhub/content/dam/onehub_pkw/importers/mx/fichas-tecnicas/producto/2025/taos/volkswagen-nuevo-taos-2025-ficha-tecnica.pdf", "accessed": "2026-09-18", "note": "computed from 215/55 R17: 17*25.4 + 2*0.55*215 = 668 mm" } },
  "mirrorLongitudinal": { "value": 1.839, "source": { "url": "https://www.vw.com.mx/idhub/content/dam/onehub_pkw/importers/mx/fichas-tecnicas/producto/2025/taos/volkswagen-nuevo-taos-2025-ficha-tecnica.pdf", "accessed": "2026-09-18", "note": "unverified: mirror centre assumed 0.85 m behind the front axle (wheelbase - 0.85)" } },
  "mirrorLength": { "value": 0.20, "source": { "url": "https://www.elkgrovevw.com/2025-volkswagen-taos-dimensions/", "accessed": "2026-09-18", "note": "unverified: typical housing fore-aft length" } }
}
```

- [ ] **Step 2: Write types**

`src/vehicle/types.ts`:
```ts
export interface Source {
  url: string;
  accessed: string;
  note?: string;
}

export interface Cited<T> {
  value: T;
  source: Source;
}

export type TurningCircleKind = 'kerb' | 'wall';

export interface TurningCircle {
  diameter: number;
  kind: TurningCircleKind;
}

export interface VehicleSpec {
  id: string;
  name: string;
  market: string;
  modelYear: number;
  length: Cited<number>;
  widthBody: Cited<number>;
  widthMirrors: Cited<number>;
  height: Cited<number>;
  wheelbase: Cited<number>;
  frontOverhang: Cited<number>;
  rearOverhang: Cited<number>;
  trackFront: Cited<number>;
  trackRear: Cited<number>;
  turningCircle: Cited<TurningCircle>;
  tireWidth: Cited<number>;
  wheelDiameter: Cited<number>;
  /** Distance from rear axle to mirror housing centre, vehicle frame. */
  mirrorLongitudinal: Cited<number>;
  mirrorLength: Cited<number>;
}

export const NUMERIC_FIELDS = [
  'length', 'widthBody', 'widthMirrors', 'height', 'wheelbase', 'frontOverhang', 'rearOverhang',
  'trackFront', 'trackRear', 'tireWidth', 'wheelDiameter', 'mirrorLongitudinal', 'mirrorLength',
] as const;

export type NumericField = (typeof NUMERIC_FIELDS)[number];

export type VehicleDims = { [K in NumericField]: number } & { turningCircle: TurningCircle };

export function dimsOf(spec: VehicleSpec): VehicleDims {
  const out = {} as Record<NumericField, number>;
  for (const f of NUMERIC_FIELDS) out[f] = spec[f].value;
  return { ...out, turningCircle: spec.turningCircle.value };
}

export function isUnverified(c: Cited<unknown>): boolean {
  return (c.source.note ?? '').startsWith('unverified');
}
```

- [ ] **Step 3: Write the failing validation tests**

`src/vehicle/validate.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import taos from './data/taos-trendline-mx-2025.json';
import { validateVehicleSpec, VehicleSpecError } from './validate';
import { dimsOf, isUnverified } from './types';

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

describe('validateVehicleSpec', () => {
  it('accepts the Taos data', () => {
    const spec = validateVehicleSpec(taos);
    const d = dimsOf(spec);
    expect(d.wheelbase).toBe(2.689);
    expect(d.turningCircle).toEqual({ diameter: 10.7, kind: 'kerb' });
    expect(isUnverified(spec.frontOverhang)).toBe(true);
    expect(isUnverified(spec.wheelbase)).toBe(false);
  });

  it('rejects a broken length identity', () => {
    const bad = clone(taos);
    bad.frontOverhang.value = 1.0;
    expect(() => validateVehicleSpec(bad)).toThrow(VehicleSpecError);
    try {
      validateVehicleSpec(bad);
    } catch (e) {
      expect((e as VehicleSpecError).field).toBe('length');
    }
  });

  it('rejects a missing source', () => {
    const bad = clone(taos) as unknown as Record<string, unknown>;
    bad.trackFront = { value: 1.572 };
    expect(() => validateVehicleSpec(bad)).toThrow(/trackFront/);
  });

  it('rejects non-positive numbers', () => {
    const bad = clone(taos);
    bad.tireWidth.value = 0;
    expect(() => validateVehicleSpec(bad)).toThrow(/tireWidth/);
  });

  it('rejects mirrors narrower than the body', () => {
    const bad = clone(taos);
    bad.widthMirrors.value = 1.8;
    expect(() => validateVehicleSpec(bad)).toThrow(/widthMirrors/);
  });

  it('rejects an unknown turning circle kind', () => {
    const bad = clone(taos) as unknown as { turningCircle: { value: { kind: string } } };
    bad.turningCircle.value.kind = 'curb';
    expect(() => validateVehicleSpec(bad)).toThrow(/turningCircle/);
  });
});
```

- [ ] **Step 4: Run to verify failure**

Run: `pnpm vitest run src/vehicle/validate.test.ts`
Expected: FAIL — cannot resolve `./validate`.

- [ ] **Step 5: Implement validation**

`src/vehicle/validate.ts`:
```ts
import { NUMERIC_FIELDS, dimsOf, type Cited, type Source, type VehicleSpec } from './types';
import { minimumTurningDiameter } from '../geom/turning';

export class VehicleSpecError extends Error {
  constructor(
    public readonly field: string,
    message: string,
  ) {
    super(`vehicle spec field "${field}": ${message}`);
    this.name = 'VehicleSpecError';
  }
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null;
}

function readSource(field: string, raw: unknown): Source {
  if (!isRecord(raw)) throw new VehicleSpecError(field, 'missing source');
  if (typeof raw.url !== 'string' || raw.url.length === 0) throw new VehicleSpecError(field, 'source.url required');
  if (typeof raw.accessed !== 'string') throw new VehicleSpecError(field, 'source.accessed required');
  const s: Source = { url: raw.url, accessed: raw.accessed };
  if (typeof raw.note === 'string') s.note = raw.note;
  return s;
}

function readCitedNumber(obj: Record<string, unknown>, field: string): Cited<number> {
  const raw = obj[field];
  if (!isRecord(raw)) throw new VehicleSpecError(field, 'missing');
  const v = raw.value;
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0) throw new VehicleSpecError(field, 'value must be a positive finite number');
  return { value: v, source: readSource(field, raw.source) };
}

function readString(obj: Record<string, unknown>, field: string): string {
  const v = obj[field];
  if (typeof v !== 'string' || v.length === 0) throw new VehicleSpecError(field, 'must be a non-empty string');
  return v;
}

export function validateVehicleSpec(raw: unknown): VehicleSpec {
  if (!isRecord(raw)) throw new VehicleSpecError('<root>', 'not an object');
  const nums = {} as Record<(typeof NUMERIC_FIELDS)[number], Cited<number>>;
  for (const f of NUMERIC_FIELDS) nums[f] = readCitedNumber(raw, f);

  const tcRaw = raw.turningCircle;
  if (!isRecord(tcRaw) || !isRecord(tcRaw.value)) throw new VehicleSpecError('turningCircle', 'missing');
  const diameter = tcRaw.value.diameter;
  const kind = tcRaw.value.kind;
  if (typeof diameter !== 'number' || !Number.isFinite(diameter) || diameter <= 0) throw new VehicleSpecError('turningCircle', 'diameter must be positive');
  if (kind !== 'kerb' && kind !== 'wall') throw new VehicleSpecError('turningCircle', `kind must be "kerb" or "wall", got ${String(kind)}`);

  const modelYear = raw.modelYear;
  if (typeof modelYear !== 'number' || !Number.isInteger(modelYear)) throw new VehicleSpecError('modelYear', 'must be an integer');

  const spec: VehicleSpec = {
    id: readString(raw, 'id'),
    name: readString(raw, 'name'),
    market: readString(raw, 'market'),
    modelYear,
    ...nums,
    turningCircle: { value: { diameter, kind }, source: readSource('turningCircle', tcRaw.source) },
  };

  const sum = spec.wheelbase.value + spec.frontOverhang.value + spec.rearOverhang.value;
  if (Math.abs(sum - spec.length.value) > 0.01) {
    throw new VehicleSpecError('length', `wheelbase + overhangs = ${sum.toFixed(3)} but length = ${spec.length.value}`);
  }
  if (spec.widthMirrors.value < spec.widthBody.value) throw new VehicleSpecError('widthMirrors', 'must be >= widthBody');
  if (spec.trackFront.value >= spec.widthBody.value) throw new VehicleSpecError('trackFront', 'must be < widthBody');
  if (spec.trackRear.value >= spec.widthBody.value) throw new VehicleSpecError('trackRear', 'must be < widthBody');
  // Task 5 ruling: the exact feasibility condition lives in geom/turning.ts (minimumTurningDiameter).
  const minDiameter = minimumTurningDiameter(dimsOf(spec));
  if (spec.turningCircle.value.diameter <= minDiameter) {
    throw new VehicleSpecError('turningCircle', `diameter ${spec.turningCircle.value.diameter} m is not feasible for a ${spec.turningCircle.value.kind} reference point; must exceed ${minDiameter.toFixed(3)} m`);
  }
  return spec;
}
```

- [ ] **Step 6: Run tests**

Run: `pnpm vitest run src/vehicle/validate.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 7: Commit**

```bash
git add src/vehicle
git commit -m "feat(vehicle): cited Taos Trendline MX 2025 spec with validation"
```

---

### Task 5: vehicle — derived geometry (max steer, footprint, mirrors, wheels)

**Files:**
- Create: `src/geom/turning.ts` (only `steerFromTurningCircle` here; guides come in Task 7), `src/vehicle/derive.ts`, `src/vehicle/derive.test.ts`

**Interfaces:**
- Consumes: `VehicleSpec`, `dimsOf`, `VehicleDims` (Task 4); `Polygon`, `rect`, `rectCentered` (Task 2).
- Produces:
  - `steerFromTurningCircle(dims: VehicleDims): number` (radians, per spec §2 formula).
  - `DerivedVehicle { spec: VehicleSpec; dims: VehicleDims; maxSteer: number; body: Polygon; mirrors: [Polygon, Polygon]; wheels: Wheel[] }`, `Wheel { hub: Vec2; steered: boolean; outline: Polygon /* wheel-local, centred at origin */ }`.
  - `deriveVehicle(spec): DerivedVehicle`, `collisionOutline(v: DerivedVehicle, mirrors: boolean): Polygon[]` (vehicle frame).

- [ ] **Step 1: Write the failing tests**

`src/vehicle/derive.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import taos from './data/taos-trendline-mx-2025.json';
import { validateVehicleSpec } from './validate';
import { deriveVehicle, collisionOutline } from './derive';
import { steerFromTurningCircle } from '../geom/turning';
import { boundsOf, signedArea } from '../geom/polygon';

const spec = validateVehicleSpec(taos);
const v = deriveVehicle(spec);
const d = v.dims;

describe('steerFromTurningCircle', () => {
  it('reproduces the quoted kerb circle at max steer', () => {
    const R = d.wheelbase / Math.tan(v.maxSteer);
    const outerFront = Math.hypot(R + d.trackFront / 2, d.wheelbase);
    expect(outerFront * 2).toBeCloseTo(d.turningCircle.diameter, 9);
  });
  it('is a plausible passenger-car lock angle', () => {
    const deg = (v.maxSteer * 180) / Math.PI;
    expect(deg).toBeGreaterThan(30);
    expect(deg).toBeLessThan(40);
  });
  it('wall variant uses the outer front body corner', () => {
    const wall = steerFromTurningCircle({ ...d, turningCircle: { diameter: 11.5, kind: 'wall' } });
    const R = d.wheelbase / Math.tan(wall);
    const corner = Math.hypot(R + d.widthBody / 2, d.wheelbase + d.frontOverhang);
    expect(corner * 2).toBeCloseTo(11.5, 9);
  });
});

describe('deriveVehicle', () => {
  it('body spans rear overhang to front overhang, full body width', () => {
    const b = boundsOf([v.body]);
    expect(b.minX).toBeCloseTo(-d.rearOverhang, 12);
    expect(b.maxX).toBeCloseTo(d.wheelbase + d.frontOverhang, 12);
    expect(b.maxX - b.minX).toBeCloseTo(d.length, 9);
    expect(b.minY).toBeCloseTo(-d.widthBody / 2, 12);
    expect(b.maxY).toBeCloseTo(d.widthBody / 2, 12);
    expect(signedArea(v.body)).toBeGreaterThan(0);
  });
  it('mirrors extend to widthMirrors', () => {
    const b = boundsOf(v.mirrors);
    expect(b.maxY).toBeCloseTo(d.widthMirrors / 2, 12);
    expect(b.minY).toBeCloseTo(-d.widthMirrors / 2, 12);
    expect(b.maxX - b.minX).toBeCloseTo(d.mirrorLength, 12);
    expect((b.maxX + b.minX) / 2).toBeCloseTo(d.mirrorLongitudinal, 12);
  });
  it('wheels sit on the axles at track width', () => {
    expect(v.wheels).toHaveLength(4);
    const front = v.wheels.filter((w) => w.steered);
    const rear = v.wheels.filter((w) => !w.steered);
    expect(front.map((w) => w.hub.x)).toEqual([d.wheelbase, d.wheelbase]);
    expect(rear.map((w) => w.hub.x)).toEqual([0, 0]);
    expect(Math.abs(front[0]!.hub.y)).toBeCloseTo(d.trackFront / 2, 12);
    expect(Math.abs(rear[0]!.hub.y)).toBeCloseTo(d.trackRear / 2, 12);
    const wb = boundsOf([front[0]!.outline]);
    expect(wb.maxX - wb.minX).toBeCloseTo(d.wheelDiameter, 12);
    expect(wb.maxY - wb.minY).toBeCloseTo(d.tireWidth, 12);
  });
  it('collisionOutline includes mirrors only when asked', () => {
    expect(collisionOutline(v, false)).toHaveLength(1);
    expect(collisionOutline(v, true)).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/vehicle/derive.test.ts`
Expected: FAIL — cannot resolve `./derive` / `../geom/turning`.

- [ ] **Step 3: Implement**

`src/geom/turning.ts` (initial content; Task 7 appends to it):
```ts
import type { VehicleDims } from '../vehicle/types';

/**
 * Max steer angle (rad) that makes the reference point trace the quoted
 * turning circle. Bicycle model: rear-axle-centre radius R = L / tan(delta).
 * Reference point at lateral offset a and longitudinal offset b from the
 * rear-axle centre traces sqrt((R + a)^2 + b^2) = D / 2.
 */
function referenceOffsets(dims: VehicleDims): { a: number; b: number } {
  const L = dims.wheelbase;
  return dims.turningCircle.kind === 'kerb'
    ? { a: dims.trackFront / 2, b: L }
    : { a: dims.widthBody / 2, b: L + dims.frontOverhang };
}

/** Smallest diameter the reference point can trace (R → 0⁺). Below this the spec is inconsistent. */
export function minimumTurningDiameter(dims: VehicleDims): number {
  const { a, b } = referenceOffsets(dims);
  return 2 * Math.hypot(a, b);
}

export function steerFromTurningCircle(dims: VehicleDims): number {
  const { diameter } = dims.turningCircle;
  const min = minimumTurningDiameter(dims);
  if (!(diameter > min)) {
    throw new RangeError(`turning circle ${diameter} m is not feasible for a ${dims.turningCircle.kind} reference point; must exceed ${min.toFixed(3)} m`);
  }
  const { a, b } = referenceOffsets(dims);
  const half = diameter / 2;
  const R = Math.sqrt(half * half - b * b) - a;
  return Math.atan(dims.wheelbase / R);
}
```

(Task 5 review ruling: validation's `D/2 > wheelbase` is weaker than the formula's requirement `(D/2)² > a² + b²`; `validateVehicleSpec` uses `minimumTurningDiameter` for its `turningCircle` check instead of the radius-vs-wheelbase line, and `steerFromTurningCircle` throws on the same condition.)

`src/vehicle/derive.ts`:
```ts
import { type Polygon, rect, rectCentered } from '../geom/polygon';
import { vec, type Vec2 } from '../geom/vec2';
import { steerFromTurningCircle } from '../geom/turning';
import { dimsOf, type VehicleDims, type VehicleSpec } from './types';

export interface Wheel {
  hub: Vec2;
  steered: boolean;
  /** Wheel-local rectangle centred at the origin, +x forward. */
  outline: Polygon;
}

export interface DerivedVehicle {
  spec: VehicleSpec;
  dims: VehicleDims;
  maxSteer: number;
  /** Body footprint, vehicle frame (origin rear-axle centre, +x forward, +y left). Rectangle: conservative. */
  body: Polygon;
  /** [left, right] */
  mirrors: [Polygon, Polygon];
  wheels: Wheel[];
}

export function deriveVehicle(spec: VehicleSpec): DerivedVehicle {
  const d = dimsOf(spec);
  const halfW = d.widthBody / 2;
  const body = rect(-d.rearOverhang, -halfW, d.wheelbase + d.frontOverhang, halfW);
  const mx0 = d.mirrorLongitudinal - d.mirrorLength / 2;
  const mx1 = d.mirrorLongitudinal + d.mirrorLength / 2;
  const mirrors: [Polygon, Polygon] = [
    rect(mx0, halfW, mx1, d.widthMirrors / 2),
    rect(mx0, -d.widthMirrors / 2, mx1, -halfW),
  ];
  const wheelOutline = rectCentered(0, 0, d.wheelDiameter, d.tireWidth);
  const wheels: Wheel[] = [
    { hub: vec(d.wheelbase, d.trackFront / 2), steered: true, outline: wheelOutline },
    { hub: vec(d.wheelbase, -d.trackFront / 2), steered: true, outline: wheelOutline },
    { hub: vec(0, d.trackRear / 2), steered: false, outline: wheelOutline },
    { hub: vec(0, -d.trackRear / 2), steered: false, outline: wheelOutline },
  ];
  return { spec, dims: d, maxSteer: steerFromTurningCircle(d), body, mirrors, wheels };
}

export function collisionOutline(v: DerivedVehicle, mirrors: boolean): Polygon[] {
  return mirrors ? [v.body, v.mirrors[0], v.mirrors[1]] : [v.body];
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/vehicle`
Expected: PASS (13 tests across both files).

- [ ] **Step 5: Commit**

```bash
git add src/geom/turning.ts src/vehicle/derive.ts src/vehicle/derive.test.ts
git commit -m "feat(vehicle): derive max steer and footprint geometry from spec"
```

---

### Task 6: sim — kinematic bicycle model and history

**Files:**
- Create: `src/sim/model.ts`, `src/sim/model.test.ts`, `src/sim/history.ts`, `src/sim/history.test.ts`

**Interfaces:**
- Produces:
  - `VehicleState { x; y; theta; steer; speed }`, `ControlInput { steer: number /* desired angle */; speed: number /* desired, m/s */ }`, `SimParams { wheelbase; maxSteer; steerRate /* rad/s */; maxSpeed }`.
  - `stepVehicle(s: VehicleState, u: ControlInput, p: SimParams, dt: number): VehicleState` — clamps and rate-limits steer, clamps speed, integrates an exact arc at the *new* steer and speed.
  - `simParamsFor(v: DerivedVehicle): SimParams` (steerRate = 2·maxSteer / 1.5, maxSpeed = 2).
  - `class StateHistory { constructor(capacity: number); push(s); pop(): VehicleState | undefined; last(): VehicleState | undefined; at(i): VehicleState; readonly length; clear(); forEach(fn) }`.
  - `SIM_DT = 1 / 120`.

- [ ] **Step 1: Write the failing model tests**

`src/sim/model.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { SIM_DT, stepVehicle, type SimParams, type VehicleState } from './model';

const p: SimParams = { wheelbase: 2.689, maxSteer: 0.61, steerRate: 100, maxSpeed: 2 };
const start: VehicleState = { x: 0, y: 0, theta: 0, steer: 0, speed: 0 };

describe('stepVehicle', () => {
  it('drives straight at zero steer', () => {
    let s = start;
    for (let i = 0; i < 120; i++) s = stepVehicle(s, { steer: 0, speed: 1 }, p, SIM_DT);
    expect(s.x).toBeCloseTo(1, 9);
    expect(s.y).toBeCloseTo(0, 12);
    expect(s.theta).toBeCloseTo(0, 12);
  });

  it('closes a full circle at constant steer within 1 mm', () => {
    const delta = 0.5;
    const R = p.wheelbase / Math.tan(delta);
    const v = 1;
    const T = (2 * Math.PI * R) / v;
    const n = Math.round(T / SIM_DT);
    const dt = T / n; // exact arc integration makes any dt exact; this just lands on the closure
    let s = { ...start, steer: delta };
    for (let i = 0; i < n; i++) s = stepVehicle(s, { steer: delta, speed: v }, p, dt);
    expect(Math.hypot(s.x, s.y)).toBeLessThan(1e-3);
    expect(Math.abs(((s.theta + Math.PI) % (2 * Math.PI)) - Math.PI)).toBeLessThan(1e-6);
  });

  it('turns left (theta increases) for positive steer going forward', () => {
    const s = stepVehicle({ ...start, steer: 0.3 }, { steer: 0.3, speed: 1 }, p, 0.5);
    expect(s.theta).toBeGreaterThan(0);
    expect(s.y).toBeGreaterThan(0);
  });

  it('reversing with positive steer turns theta negative', () => {
    const s = stepVehicle({ ...start, steer: 0.3 }, { steer: 0.3, speed: -1 }, p, 0.5);
    expect(s.theta).toBeLessThan(0);
    expect(s.x).toBeLessThan(0);
  });

  it('rate-limits steering', () => {
    const slow: SimParams = { ...p, steerRate: 0.2 };
    const s = stepVehicle(start, { steer: 0.61, speed: 0 }, slow, 0.5);
    expect(s.steer).toBeCloseTo(0.1, 12);
  });

  it('clamps steer and speed', () => {
    const s = stepVehicle(start, { steer: 5, speed: 9 }, p, 1);
    expect(s.steer).toBe(p.maxSteer);
    expect(s.speed).toBe(p.maxSpeed);
  });

  it('does not move with zero speed', () => {
    const s = stepVehicle(start, { steer: 0.4, speed: 0 }, p, 1);
    expect(s.x).toBe(0);
    expect(s.y).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/sim/model.test.ts`
Expected: FAIL — cannot resolve `./model`.

- [ ] **Step 3: Implement the model**

`src/sim/model.ts`:
```ts
import type { DerivedVehicle } from '../vehicle/derive';

export const SIM_DT = 1 / 120;
export const MAX_SPEED = 2;
export const LOCK_TO_LOCK_SECONDS = 1.5;

export interface VehicleState {
  /** Rear-axle centre, world frame. */
  x: number;
  y: number;
  theta: number;
  steer: number;
  speed: number;
}

export interface ControlInput {
  /** Desired steer angle (rad); the model rate-limits toward it. */
  steer: number;
  /** Desired speed (m/s), applied instantly (kinematic tool, no inertia). */
  speed: number;
}

export interface SimParams {
  wheelbase: number;
  maxSteer: number;
  steerRate: number;
  maxSpeed: number;
}

export function simParamsFor(v: DerivedVehicle): SimParams {
  return {
    wheelbase: v.dims.wheelbase,
    maxSteer: v.maxSteer,
    steerRate: (2 * v.maxSteer) / LOCK_TO_LOCK_SECONDS,
    maxSpeed: MAX_SPEED,
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** One fixed step. Integrates an exact circular arc for piecewise-constant steer and speed. */
export function stepVehicle(s: VehicleState, u: ControlInput, p: SimParams, dt: number): VehicleState {
  const target = clamp(u.steer, -p.maxSteer, p.maxSteer);
  const maxDelta = p.steerRate * dt;
  const steer = s.steer + clamp(target - s.steer, -maxDelta, maxDelta);
  const speed = clamp(u.speed, -p.maxSpeed, p.maxSpeed);
  const ds = speed * dt;
  if (ds === 0) return { ...s, steer, speed };

  const curvature = Math.tan(steer) / p.wheelbase;
  if (Math.abs(curvature) < 1e-9) {
    return { x: s.x + ds * Math.cos(s.theta), y: s.y + ds * Math.sin(s.theta), theta: s.theta, steer, speed };
  }
  const R = 1 / curvature;
  const dTheta = ds * curvature;
  const theta = s.theta + dTheta;
  return {
    x: s.x + R * (Math.sin(theta) - Math.sin(s.theta)),
    y: s.y - R * (Math.cos(theta) - Math.cos(s.theta)),
    theta,
    steer,
    speed,
  };
}
```

- [ ] **Step 4: Run model tests**

Run: `pnpm vitest run src/sim/model.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Write the failing history tests**

`src/sim/history.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { StateHistory } from './history';
import type { VehicleState } from './model';

const st = (x: number): VehicleState => ({ x, y: 0, theta: 0, steer: 0, speed: 0 });

describe('StateHistory', () => {
  it('pushes, reads back, pops', () => {
    const h = new StateHistory(4);
    h.push(st(1));
    h.push(st(2));
    expect(h.length).toBe(2);
    expect(h.last()?.x).toBe(2);
    expect(h.at(0).x).toBe(1);
    expect(h.pop()?.x).toBe(2);
    expect(h.length).toBe(1);
  });

  it('drops the oldest when full', () => {
    const h = new StateHistory(3);
    for (let i = 1; i <= 5; i++) h.push(st(i));
    expect(h.length).toBe(3);
    expect(h.at(0).x).toBe(3);
    expect(h.last()?.x).toBe(5);
  });

  it('clear empties it', () => {
    const h = new StateHistory(3);
    h.push(st(1));
    h.clear();
    expect(h.length).toBe(0);
    expect(h.last()).toBeUndefined();
    expect(h.pop()).toBeUndefined();
  });

  it('forEach iterates oldest to newest', () => {
    const h = new StateHistory(2);
    h.push(st(1));
    h.push(st(2));
    h.push(st(3));
    const xs: number[] = [];
    h.forEach((s) => xs.push(s.x));
    expect(xs).toEqual([2, 3]);
  });
});
```

- [ ] **Step 6: Run to verify failure**

Run: `pnpm vitest run src/sim/history.test.ts`
Expected: FAIL — cannot resolve `./history`.

- [ ] **Step 7: Implement history**

`src/sim/history.ts`:
```ts
import type { VehicleState } from './model';

const STRIDE = 5;

/** Fixed-capacity ring buffer of VehicleState, oldest dropped first. */
export class StateHistory {
  private readonly buf: Float64Array;
  private start = 0;
  private count = 0;

  constructor(public readonly capacity: number) {
    this.buf = new Float64Array(capacity * STRIDE);
  }

  get length(): number {
    return this.count;
  }

  push(s: VehicleState): void {
    const idx = (this.start + this.count) % this.capacity;
    this.write(idx, s);
    if (this.count < this.capacity) this.count++;
    else this.start = (this.start + 1) % this.capacity;
  }

  pop(): VehicleState | undefined {
    if (this.count === 0) return undefined;
    this.count--;
    return this.read((this.start + this.count) % this.capacity);
  }

  last(): VehicleState | undefined {
    return this.count === 0 ? undefined : this.at(this.count - 1);
  }

  at(i: number): VehicleState {
    if (i < 0 || i >= this.count) throw new RangeError(`history index ${i} out of range`);
    return this.read((this.start + i) % this.capacity);
  }

  clear(): void {
    this.start = 0;
    this.count = 0;
  }

  forEach(fn: (s: VehicleState, i: number) => void): void {
    for (let i = 0; i < this.count; i++) fn(this.at(i), i);
  }

  private write(idx: number, s: VehicleState): void {
    const o = idx * STRIDE;
    this.buf[o] = s.x;
    this.buf[o + 1] = s.y;
    this.buf[o + 2] = s.theta;
    this.buf[o + 3] = s.steer;
    this.buf[o + 4] = s.speed;
  }

  private read(idx: number): VehicleState {
    const o = idx * STRIDE;
    return { x: this.buf[o]!, y: this.buf[o + 1]!, theta: this.buf[o + 2]!, steer: this.buf[o + 3]!, speed: this.buf[o + 4]! };
  }
}
```

- [ ] **Step 8: Run all sim tests**

Run: `pnpm vitest run src/sim`
Expected: PASS (11 tests).

- [ ] **Step 9: Commit**

```bash
git add src/sim
git commit -m "feat(sim): exact-arc kinematic bicycle model and state history"
```

---

### Task 7: geom — turning guides (ICR and guide circles)

**Files:**
- Modify: `src/geom/turning.ts` (append)
- Create: `src/geom/turning.test.ts`

**Interfaces:**
- Consumes: `VehicleState` (Task 6), `DerivedVehicle` (Task 5).
- Produces:
  - `GUIDE_MIN_STEER = 0.5° in rad`
  - `GuideCircle { center: Vec2; radius: number; kind: 'innerRear' | 'outerFront' | 'outerCorner' }`
  - `instantaneousCentre(s: VehicleState, wheelbase): Vec2 | null` (null below `GUIDE_MIN_STEER`)
  - `guideCircles(s: VehicleState, v: DerivedVehicle): GuideCircle[]` (empty below threshold)

- [ ] **Step 1: Write the failing tests**

`src/geom/turning.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import taos from '../vehicle/data/taos-trendline-mx-2025.json';
import { validateVehicleSpec } from '../vehicle/validate';
import { deriveVehicle } from '../vehicle/derive';
import { guideCircles, instantaneousCentre } from './turning';

const v = deriveVehicle(validateVehicleSpec(taos));
const d = v.dims;

describe('instantaneousCentre', () => {
  it('is null when steering is centred', () => {
    expect(instantaneousCentre({ x: 0, y: 0, theta: 0, steer: 0, speed: 0 }, d.wheelbase)).toBeNull();
  });
  it('lies to the left at +y for positive steer, heading +x', () => {
    const c = instantaneousCentre({ x: 1, y: 2, theta: 0, steer: 0.5, speed: 0 }, d.wheelbase)!;
    expect(c.x).toBeCloseTo(1, 12);
    expect(c.y).toBeCloseTo(2 + d.wheelbase / Math.tan(0.5), 12);
  });
  it('rotates with heading', () => {
    const c = instantaneousCentre({ x: 0, y: 0, theta: Math.PI / 2, steer: 0.5, speed: 0 }, d.wheelbase)!;
    expect(c.x).toBeCloseTo(-d.wheelbase / Math.tan(0.5), 12);
    expect(c.y).toBeCloseTo(0, 12);
  });
});

describe('guideCircles', () => {
  it('at max steer the outer front wheel circle matches the quoted turning circle', () => {
    const g = guideCircles({ x: 0, y: 0, theta: 0, steer: v.maxSteer, speed: 0 }, v);
    const outer = g.find((c) => c.kind === 'outerFront')!;
    expect(outer.radius * 2).toBeCloseTo(d.turningCircle.diameter, 9);
  });
  it('orders radii innerRear < outerFront < outerCorner', () => {
    const g = guideCircles({ x: 0, y: 0, theta: 0, steer: -0.4, speed: 0 }, v);
    const r = Object.fromEntries(g.map((c) => [c.kind, c.radius]));
    expect(r.innerRear).toBeLessThan(r.outerFront!);
    expect(r.outerFront).toBeLessThan(r.outerCorner!);
  });
  it('is empty below the threshold', () => {
    expect(guideCircles({ x: 0, y: 0, theta: 0, steer: 0.001, speed: 0 }, v)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/geom/turning.test.ts`
Expected: FAIL — `guideCircles` is not exported.

- [ ] **Step 3: Append to turning.ts**

Append to `src/geom/turning.ts`:
```ts
import type { VehicleState } from '../sim/model';
import type { DerivedVehicle } from '../vehicle/derive';
import { type Vec2, vec } from './vec2';

export const GUIDE_MIN_STEER = (0.5 * Math.PI) / 180;

export type GuideKind = 'innerRear' | 'outerFront' | 'outerCorner';

export interface GuideCircle {
  center: Vec2;
  radius: number;
  kind: GuideKind;
}

/** Signed rear-axle radius (positive = turning left). */
function signedRadius(steer: number, wheelbase: number): number {
  return wheelbase / Math.tan(steer);
}

export function instantaneousCentre(s: VehicleState, wheelbase: number): Vec2 | null {
  if (Math.abs(s.steer) < GUIDE_MIN_STEER) return null;
  const R = signedRadius(s.steer, wheelbase);
  // Left normal of heading is (-sin, cos); ICR = rear axle + R * leftNormal.
  return vec(s.x - R * Math.sin(s.theta), s.y + R * Math.cos(s.theta));
}

export function guideCircles(s: VehicleState, v: DerivedVehicle): GuideCircle[] {
  const c = instantaneousCentre(s, v.dims.wheelbase);
  if (!c) return [];
  const R = Math.abs(signedRadius(s.steer, v.dims.wheelbase));
  const L = v.dims.wheelbase;
  const innerRear = R - v.dims.trackRear / 2;
  const outerFront = Math.hypot(R + v.dims.trackFront / 2, L);
  const outerCorner = Math.hypot(R + v.dims.widthBody / 2, L + v.dims.frontOverhang);
  return [
    { center: c, radius: innerRear, kind: 'innerRear' },
    { center: c, radius: outerFront, kind: 'outerFront' },
    { center: c, radius: outerCorner, kind: 'outerCorner' },
  ];
}
```

Move the `import` lines to the top of the file (ESLint `import/first` is not enabled, but keep the file tidy) and merge the `vec2` import.

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/geom`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/geom/turning.ts src/geom/turning.test.ts
git commit -m "feat(geom): instantaneous centre and turning guide circles"
```

---

### Task 8: scene — types and the three parametric presets

**Files:**
- Create: `src/scene/types.ts`, `src/scene/presets/parallel.ts`, `src/scene/presets/perpendicular.ts`, `src/scene/presets/garage.ts`, `src/scene/presets/index.ts`, `src/scene/presets/presets.test.ts`

**Interfaces:**
- Consumes: `Polygon`, `Rect`, `rect`, `boundsOf`, `isConvex`, `signedArea` (Task 2); `convexPenetration` (Task 3); `VehicleState` (Task 6).
- Produces:
  - `ObstacleKind = 'wall' | 'kerb' | 'car' | 'line'`, `Obstacle { polygon; height; kind }`, `Scene { bounds: Rect; obstacles: Obstacle[]; target: Polygon; start: VehicleState }`
  - `ParamDef { key; label; unit: 'm' | 'deg'; min; max; step; default }`, `Params = Record<string, number>`
  - `PresetDef { id; name; params: ParamDef[]; build(p: Params): Scene }`
  - `PRESETS: PresetDef[]`, `getPreset(id): PresetDef | undefined`, `defaultParams(def): Params`, `clampParams(def, p: Params): Params`
  - `isCollidable(kind): boolean` (everything except `'line'`).
  - Neighbour cars are drawn 4.5 × 1.85 m. Bounds pad 1.5 m around all geometry.

- [ ] **Step 1: Write types**

`src/scene/types.ts`:
```ts
import type { Polygon, Rect } from '../geom/polygon';
import type { VehicleState } from '../sim/model';

export type ObstacleKind = 'wall' | 'kerb' | 'car' | 'line';

export interface Obstacle {
  polygon: Polygon;
  height: number;
  kind: ObstacleKind;
}

export interface Scene {
  bounds: Rect;
  obstacles: Obstacle[];
  /** The spot: parked = body fully inside. Convex. */
  target: Polygon;
  start: VehicleState;
}

export interface ParamDef {
  key: string;
  label: string;
  unit: 'm' | 'deg';
  min: number;
  max: number;
  step: number;
  default: number;
}

export type Params = Record<string, number>;

export interface PresetDef {
  id: string;
  name: string;
  params: ParamDef[];
  build(p: Params): Scene;
}

export const isCollidable = (kind: ObstacleKind): boolean => kind !== 'line';

export const NEIGHBOUR_CAR = { length: 4.5, width: 1.85 } as const;
export const BOUNDS_PAD = 1.5;
```

- [ ] **Step 2: Write the failing preset tests**

`src/scene/presets/presets.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { PRESETS, getPreset, defaultParams, clampParams } from './index';
import { isConvex, signedArea, transformPolygon, boundsOf } from '../../geom/polygon';
import { convexPenetration, polygonDistance } from '../../geom/distance';
import { isCollidable } from '../types';
import taos from '../../vehicle/data/taos-trendline-mx-2025.json';
import { validateVehicleSpec } from '../../vehicle/validate';
import { deriveVehicle, collisionOutline } from '../../vehicle/derive';

const vehicle = deriveVehicle(validateVehicleSpec(taos));

/** Every combination of each param at min and max, plus the defaults. */
function paramGrid(def: (typeof PRESETS)[number]): Record<string, number>[] {
  let combos: Record<string, number>[] = [{}];
  for (const p of def.params) {
    combos = combos.flatMap((c) => [
      { ...c, [p.key]: p.min },
      { ...c, [p.key]: p.max },
    ]);
  }
  return [defaultParams(def), ...combos];
}

describe.each(PRESETS.map((p) => [p.id, p] as const))('preset %s', (_id, def) => {
  it.each(paramGrid(def).map((p, i) => [i, p] as const))('is valid for param set %i', (_i, params) => {
    const scene = def.build(params);
    expect(isConvex(scene.target)).toBe(true);
    for (const o of scene.obstacles) {
      expect(isConvex(o.polygon)).toBe(true);
      expect(signedArea(o.polygon)).toBeGreaterThan(0);
      expect(o.height).toBeGreaterThanOrEqual(0);
    }
    const solid = scene.obstacles.filter((o) => isCollidable(o.kind));
    for (let i = 0; i < solid.length; i++) {
      for (let j = i + 1; j < solid.length; j++) {
        expect(convexPenetration(solid[i]!.polygon, solid[j]!.polygon)).toBe(0);
      }
    }
    // start pose has positive clearance for the Taos with mirrors
    const outline = collisionOutline(vehicle, true).map((poly) => transformPolygon(poly, scene.start));
    for (const o of solid) {
      for (const part of outline) expect(polygonDistance(part, o.polygon).distance).toBeGreaterThan(0);
    }
    // everything lies inside bounds
    const all = boundsOf([scene.target, ...scene.obstacles.map((o) => o.polygon), ...outline]);
    expect(all.minX).toBeGreaterThanOrEqual(scene.bounds.minX);
    expect(all.minY).toBeGreaterThanOrEqual(scene.bounds.minY);
    expect(all.maxX).toBeLessThanOrEqual(scene.bounds.maxX);
    expect(all.maxY).toBeLessThanOrEqual(scene.bounds.maxY);
  });
});

describe('registry', () => {
  it('has three presets with unique ids', () => {
    expect(PRESETS.map((p) => p.id)).toEqual(['parallel', 'perpendicular', 'garage']);
    expect(getPreset('garage')?.name).toMatch(/garage/i);
    expect(getPreset('nope')).toBeUndefined();
  });
  it('clampParams clamps, fills defaults, drops unknown keys', () => {
    const def = getPreset('parallel')!;
    const out = clampParams(def, { spotLength: 99, bogus: 1 });
    expect(out.spotLength).toBe(def.params.find((p) => p.key === 'spotLength')!.max);
    expect(out.laneWidth).toBe(def.params.find((p) => p.key === 'laneWidth')!.default);
    expect('bogus' in out).toBe(false);
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm vitest run src/scene`
Expected: FAIL — cannot resolve `./index`.

- [ ] **Step 4: Implement the presets**

`src/scene/presets/parallel.ts`:
```ts
import { rect, boundsOf } from '../../geom/polygon';
import { BOUNDS_PAD, NEIGHBOUR_CAR, type Obstacle, type PresetDef, type Scene } from '../types';

/**
 * Street runs along +x. Kerb along y = 0 (kerb body at y < 0). Spot occupies
 * x in [0, spotLength], y in [0, spotWidth]. Neighbours front (x > spotLength)
 * and rear (x < 0). Lane above the parked row. Car starts in the lane beside
 * the front neighbour, heading +x, ready to reverse in.
 */
export const parallel: PresetDef = {
  id: 'parallel',
  name: 'Parallel spot between two cars',
  params: [
    { key: 'spotLength', label: 'Spot length', unit: 'm', min: 5.0, max: 8.0, step: 0.1, default: 6.2 },
    { key: 'spotWidth', label: 'Spot width', unit: 'm', min: 2.0, max: 3.0, step: 0.05, default: 2.4 },
    { key: 'laneWidth', label: 'Lane width', unit: 'm', min: 2.5, max: 5.0, step: 0.1, default: 3.2 },
  ],
  build(p): Scene {
    const spotLength = p.spotLength!;
    const spotWidth = p.spotWidth!;
    const laneWidth = p.laneWidth!;
    const carY0 = (spotWidth - NEIGHBOUR_CAR.width) / 2;
    const obstacles: Obstacle[] = [
      { kind: 'kerb', height: 0.12, polygon: rect(-NEIGHBOUR_CAR.length - 3, -0.3, spotLength + NEIGHBOUR_CAR.length + 3, 0) },
      { kind: 'car', height: 1.6, polygon: rect(-NEIGHBOUR_CAR.length, carY0, 0, carY0 + NEIGHBOUR_CAR.width) },
      { kind: 'car', height: 1.6, polygon: rect(spotLength, carY0, spotLength + NEIGHBOUR_CAR.length, carY0 + NEIGHBOUR_CAR.width) },
      { kind: 'line', height: 0, polygon: rect(-NEIGHBOUR_CAR.length - 3, spotWidth + laneWidth, spotLength + NEIGHBOUR_CAR.length + 3, spotWidth + laneWidth + 0.1) },
    ];
    const target = rect(0, 0, spotLength, spotWidth);
    const start = { x: spotLength + 0.6, y: spotWidth + laneWidth / 2, theta: 0, steer: 0, speed: 0 };
    const b = boundsOf([target, ...obstacles.map((o) => o.polygon)]);
    return {
      bounds: { minX: b.minX - BOUNDS_PAD, minY: b.minY - BOUNDS_PAD, maxX: b.maxX + BOUNDS_PAD + 4, maxY: b.maxY + BOUNDS_PAD },
      obstacles,
      target,
      start,
    };
  },
};
```

`src/scene/presets/perpendicular.ts`:
```ts
import { rect, boundsOf } from '../../geom/polygon';
import { BOUNDS_PAD, NEIGHBOUR_CAR, type Obstacle, type PresetDef, type Scene } from '../types';

/**
 * Bay opens toward -y onto an aisle. Target x in [0, bayWidth], y in [0, bayDepth].
 * Wall behind the bay row, neighbour cars either side, aisle y in [-aisleWidth, 0].
 * Car starts in the aisle heading -x with the bay on its left, ready to reverse in.
 */
export const perpendicular: PresetDef = {
  id: 'perpendicular',
  name: 'Perpendicular bay',
  params: [
    { key: 'bayWidth', label: 'Bay width', unit: 'm', min: 2.3, max: 3.2, step: 0.05, default: 2.5 },
    { key: 'bayDepth', label: 'Bay depth', unit: 'm', min: 4.5, max: 6.0, step: 0.1, default: 5.0 },
    { key: 'aisleWidth', label: 'Aisle width', unit: 'm', min: 5.0, max: 8.0, step: 0.1, default: 6.0 },
  ],
  build(p): Scene {
    const bayWidth = p.bayWidth!;
    const bayDepth = p.bayDepth!;
    const aisleWidth = p.aisleWidth!;
    const carX = (bayWidth - NEIGHBOUR_CAR.width) / 2;
    const carY0 = bayDepth - NEIGHBOUR_CAR.length - 0.25;
    const rowX0 = -2 * bayWidth;
    const rowX1 = 3 * bayWidth;
    const obstacles: Obstacle[] = [
      { kind: 'wall', height: 2.5, polygon: rect(rowX0, bayDepth, rowX1, bayDepth + 0.2) },
      { kind: 'car', height: 1.6, polygon: rect(-bayWidth + carX, carY0, -bayWidth + carX + NEIGHBOUR_CAR.width, carY0 + NEIGHBOUR_CAR.length) },
      { kind: 'car', height: 1.6, polygon: rect(bayWidth + carX, carY0, bayWidth + carX + NEIGHBOUR_CAR.width, carY0 + NEIGHBOUR_CAR.length) },
      { kind: 'line', height: 0, polygon: rect(rowX0, -0.05, rowX1, 0.05) },
      { kind: 'line', height: 0, polygon: rect(rowX0, -aisleWidth - 0.05, rowX1, -aisleWidth + 0.05) },
    ];
    const target = rect(0, 0, bayWidth, bayDepth);
    const start = { x: bayWidth / 2 + 4.5, y: -aisleWidth / 2, theta: Math.PI, steer: 0, speed: 0 };
    const b = boundsOf([target, ...obstacles.map((o) => o.polygon)]);
    return {
      bounds: { minX: b.minX - BOUNDS_PAD, minY: b.minY - BOUNDS_PAD, maxX: b.maxX + BOUNDS_PAD + 3, maxY: b.maxY + BOUNDS_PAD },
      obstacles,
      target,
      start,
    };
  },
};
```

`src/scene/presets/garage.ts`:
```ts
import { rect, boundsOf } from '../../geom/polygon';
import { BOUNDS_PAD, type Obstacle, type PresetDef, type Scene } from '../types';

const WALL = 0.2;

/**
 * Garage interior x in [0, interiorWidth], y in [0, interiorDepth], door in the
 * front wall (y = 0) centred on the interior. Driveway extends toward -y from
 * the door, flanked by kerbs. approachAngle 0: start on the driveway facing the
 * door. approachAngle 90: start on a street along x below the driveway, heading -x.
 */
export const garage: PresetDef = {
  id: 'garage',
  name: 'Single garage with driveway',
  params: [
    { key: 'doorWidth', label: 'Door opening', unit: 'm', min: 2.2, max: 3.0, step: 0.05, default: 2.4 },
    { key: 'interiorWidth', label: 'Interior width', unit: 'm', min: 2.6, max: 4.0, step: 0.05, default: 3.0 },
    { key: 'interiorDepth', label: 'Interior depth', unit: 'm', min: 5.0, max: 7.0, step: 0.1, default: 5.5 },
    { key: 'drivewayWidth', label: 'Driveway width', unit: 'm', min: 2.5, max: 4.0, step: 0.1, default: 3.0 },
    { key: 'drivewayLength', label: 'Driveway length', unit: 'm', min: 3.0, max: 8.0, step: 0.1, default: 5.0 },
    { key: 'approachAngle', label: 'Approach', unit: 'deg', min: 0, max: 90, step: 90, default: 0 },
  ],
  build(p): Scene {
    const iw = p.interiorWidth!;
    const id = p.interiorDepth!;
    const dw = Math.min(p.doorWidth!, iw); // door cannot exceed the interior
    const dvw = Math.max(p.drivewayWidth!, dw); // driveway at least as wide as the door
    const dvl = p.drivewayLength!;
    const side = p.approachAngle! >= 45;
    const doorX0 = (iw - dw) / 2;
    const doorX1 = (iw + dw) / 2;
    const dvX0 = iw / 2 - dvw / 2;
    const dvX1 = iw / 2 + dvw / 2;
    const streetWidth = 6;
    const obstacles: Obstacle[] = [
      { kind: 'wall', height: 2.4, polygon: rect(-WALL, -WALL, 0, id + WALL) },
      { kind: 'wall', height: 2.4, polygon: rect(iw, -WALL, iw + WALL, id + WALL) },
      { kind: 'wall', height: 2.4, polygon: rect(0, id, iw, id + WALL) },
      { kind: 'kerb', height: 0.1, polygon: rect(dvX0 - 0.3, -dvl, dvX0, -WALL) },
      { kind: 'kerb', height: 0.1, polygon: rect(dvX1, -dvl, dvX1 + 0.3, -WALL) },
    ];
    if (doorX0 > 1e-9) obstacles.push({ kind: 'wall', height: 2.4, polygon: rect(0, -WALL, doorX0, 0) });
    if (doorX1 < iw - 1e-9) obstacles.push({ kind: 'wall', height: 2.4, polygon: rect(doorX1, -WALL, iw, 0) });
    if (side) {
      obstacles.push({ kind: 'line', height: 0, polygon: rect(iw / 2 - 12, -dvl - streetWidth - 0.05, iw / 2 + 12, -dvl - streetWidth + 0.05) });
    }
    const target = rect(0, 0, iw, id);
    const start = side
      ? { x: iw / 2 + 7, y: -dvl - streetWidth / 2, theta: Math.PI, steer: 0, speed: 0 }
      : { x: iw / 2, y: -dvl - 3.6, theta: Math.PI / 2, steer: 0, speed: 0 }; // front bumper just short of the driveway
    const b = boundsOf([target, ...obstacles.map((o) => o.polygon)]);
    return {
      bounds: {
        minX: Math.min(b.minX, side ? iw / 2 - 12 : b.minX) - BOUNDS_PAD,
        minY: Math.min(b.minY, side ? -dvl - streetWidth : -dvl - 5) - BOUNDS_PAD,
        maxX: Math.max(b.maxX, side ? iw / 2 + 12 : b.maxX) + BOUNDS_PAD,
        maxY: b.maxY + BOUNDS_PAD,
      },
      obstacles,
      target,
      start,
    };
  },
};
```

`src/scene/presets/index.ts`:
```ts
import type { Params, PresetDef } from '../types';
import { parallel } from './parallel';
import { perpendicular } from './perpendicular';
import { garage } from './garage';

export const PRESETS: PresetDef[] = [parallel, perpendicular, garage];

export function getPreset(id: string): PresetDef | undefined {
  return PRESETS.find((p) => p.id === id);
}

export function defaultParams(def: PresetDef): Params {
  return Object.fromEntries(def.params.map((p) => [p.key, p.default]));
}

/** Clamp to [min, max], snap to step, fill missing with defaults, drop unknown keys. */
export function clampParams(def: PresetDef, raw: Params): Params {
  const out: Params = {};
  for (const p of def.params) {
    const v = raw[p.key];
    if (v === undefined || !Number.isFinite(v)) {
      out[p.key] = p.default;
      continue;
    }
    const clamped = Math.min(p.max, Math.max(p.min, v));
    const snapped = p.min + Math.round((clamped - p.min) / p.step) * p.step;
    out[p.key] = Math.min(p.max, Number(snapped.toFixed(6)));
  }
  return out;
}
```

- [ ] **Step 5: Run tests; fix any preset geometry the grid test rejects**

Run: `pnpm vitest run src/scene`
Expected: PASS. If a corner of the parameter grid fails the start-clearance or overlap assertion, adjust *that preset's* start pose or obstacle placement (never loosen the test) and re-run.

- [ ] **Step 6: Commit**

```bash
git add src/scene
git commit -m "feat(scene): parametric parallel, perpendicular and garage presets"
```

---

### Task 9: geom — clearance check and parked test

**Files:**
- Create: `src/geom/clearance.ts`, `src/geom/clearance.test.ts`

**Interfaces:**
- Consumes: `polygonDistance` (Task 3), `polygonInsideConvex`, `transformPolygon` (Task 2), `Scene`, `isCollidable` (Task 8), `VehicleState` (Task 6).
- Produces:
  - `Clearance { distance: number; obstacleIndex: number; pa: Vec2 /* on car */; pb: Vec2 /* on obstacle */ }`
  - `checkClearance(outlineWorld: Polygon[], scene: Scene): Clearance | null` (null when no collidable obstacles)
  - `worldOutline(v: DerivedVehicle, s: VehicleState, mirrors: boolean): Polygon[]`
  - `isParked(bodyWorld: Polygon, scene: Scene, speed: number): boolean`
  - `parkedOffsets(s: VehicleState, scene: Scene): { lateral: number; headingErrorDeg: number }` — lateral distance from rear-axle centre to the target's long axis centre-line, heading error vs. the target's long axis (mod 180°).

- [ ] **Step 1: Write the failing tests**

`src/geom/clearance.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { rect } from './polygon';
import { checkClearance, isParked, parkedOffsets, worldOutline } from './clearance';
import type { Scene } from '../scene/types';
import taos from '../vehicle/data/taos-trendline-mx-2025.json';
import { validateVehicleSpec } from '../vehicle/validate';
import { deriveVehicle } from '../vehicle/derive';

const v = deriveVehicle(validateVehicleSpec(taos));
const scene: Scene = {
  bounds: { minX: -10, minY: -10, maxX: 10, maxY: 10 },
  obstacles: [
    { kind: 'wall', height: 2, polygon: rect(5, -5, 5.2, 5) },
    { kind: 'line', height: 0, polygon: rect(4, -5, 4.1, 5) }, // must be ignored
    { kind: 'car', height: 1.6, polygon: rect(-8, -8, -6, -6) },
  ],
  target: rect(-3, -1.2, 3, 1.2),
  start: { x: 0, y: 0, theta: 0, steer: 0, speed: 0 },
};

describe('checkClearance', () => {
  it('reports the nearest collidable obstacle and closest points', () => {
    const s = { x: 0, y: 0, theta: 0, steer: 0, speed: 0 };
    const c = checkClearance(worldOutline(v, s, false), scene)!;
    const front = v.dims.wheelbase + v.dims.frontOverhang;
    expect(c.obstacleIndex).toBe(0);
    expect(c.distance).toBeCloseTo(5 - front, 9);
    expect(c.pa.x).toBeCloseTo(front, 9);
    expect(c.pb.x).toBeCloseTo(5, 9);
  });
  it('goes negative on contact', () => {
    const s = { x: 2, y: 0, theta: 0, steer: 0, speed: 0 };
    expect(checkClearance(worldOutline(v, s, false), scene)!.distance).toBeLessThan(0);
  });
  it('mirrors reduce lateral clearance', () => {
    const s = { x: 3, y: 0, theta: Math.PI / 2, steer: 0, speed: 0 }; // heading +y, wall 1.08 m to the right (+x)
    const without = checkClearance(worldOutline(v, s, false), scene)!.distance;
    const withM = checkClearance(worldOutline(v, s, true), scene)!.distance;
    expect(withM).toBeLessThan(without);
    expect(without - withM).toBeCloseTo((v.dims.widthMirrors - v.dims.widthBody) / 2, 9);
  });
  it('returns null with no collidable obstacles', () => {
    expect(checkClearance([rect(0, 0, 1, 1)], { ...scene, obstacles: [scene.obstacles[1]!] })).toBeNull();
  });
});

describe('isParked / parkedOffsets', () => {
  it('parked when body is inside the target and stopped', () => {
    const s = { x: -1.5, y: 0, theta: 0, steer: 0, speed: 0 };
    const body = worldOutline(v, s, false)[0]!;
    expect(isParked(body, scene, 0)).toBe(true);
    expect(isParked(body, scene, 0.1)).toBe(false);
  });
  it('not parked when poking out', () => {
    const body = worldOutline(v, { x: 1.5, y: 0, theta: 0, steer: 0, speed: 0 }, false)[0]!;
    expect(isParked(body, scene, 0)).toBe(false);
  });
  it('offsets measure lateral shift and heading error against the long axis', () => {
    const o = parkedOffsets({ x: -1, y: 0.2, theta: 0.05, steer: 0, speed: 0 }, scene);
    expect(o.lateral).toBeCloseTo(0.2, 9);
    expect(o.headingErrorDeg).toBeCloseTo((0.05 * 180) / Math.PI, 9);
    const rev = parkedOffsets({ x: -1, y: -0.2, theta: Math.PI + 0.05, steer: 0, speed: 0 }, scene);
    expect(rev.lateral).toBeCloseTo(-0.2, 9);
    expect(rev.headingErrorDeg).toBeCloseTo((0.05 * 180) / Math.PI, 9);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/geom/clearance.test.ts`
Expected: FAIL — cannot resolve `./clearance`.

- [ ] **Step 3: Implement**

`src/geom/clearance.ts`:
```ts
import { type Polygon, polygonInsideConvex, transformPolygon, boundsOf } from './polygon';
import { polygonDistance } from './distance';
import { type Vec2 } from './vec2';
import { isCollidable, type Scene } from '../scene/types';
import type { VehicleState } from '../sim/model';
import { collisionOutline, type DerivedVehicle } from '../vehicle/derive';

export interface Clearance {
  distance: number;
  obstacleIndex: number;
  /** Closest point on the car. */
  pa: Vec2;
  /** Closest point on the obstacle. */
  pb: Vec2;
}

export function worldOutline(v: DerivedVehicle, s: VehicleState, mirrors: boolean): Polygon[] {
  return collisionOutline(v, mirrors).map((poly) => transformPolygon(poly, s));
}

export function checkClearance(outlineWorld: Polygon[], scene: Scene): Clearance | null {
  let best: Clearance | null = null;
  scene.obstacles.forEach((o, i) => {
    if (!isCollidable(o.kind)) return;
    for (const part of outlineWorld) {
      const r = polygonDistance(part, o.polygon);
      if (!best || r.distance < best.distance) best = { distance: r.distance, obstacleIndex: i, pa: r.pa, pb: r.pb };
    }
  });
  return best;
}

export function isParked(bodyWorld: Polygon, scene: Scene, speed: number): boolean {
  return speed === 0 && polygonInsideConvex(bodyWorld, scene.target);
}

/** Target long axis: the longer side of its bounding box (targets are axis-aligned rectangles in v1). */
export function parkedOffsets(s: VehicleState, scene: Scene): { lateral: number; headingErrorDeg: number } {
  const b = boundsOf([scene.target]);
  const cx = (b.minX + b.maxX) / 2;
  const cy = (b.minY + b.maxY) / 2;
  const alongX = b.maxX - b.minX >= b.maxY - b.minY;
  const lateral = alongX ? s.y - cy : -(s.x - cx);
  const axis = alongX ? 0 : Math.PI / 2;
  let err = (s.theta - axis) % Math.PI;
  if (err > Math.PI / 2) err -= Math.PI;
  if (err < -Math.PI / 2) err += Math.PI;
  return { lateral, headingErrorDeg: (err * 180) / Math.PI };
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm vitest run src/geom/clearance.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Run the whole suite, lint, typecheck; commit**

Run: `pnpm test && pnpm lint && pnpm typecheck`
Expected: all green.

```bash
git add src/geom/clearance.ts src/geom/clearance.test.ts
git commit -m "feat(geom): clearance check and parked detection"
```

---

### Task 10: render — WebGPU device, camera, polygon pipeline, grid (first pixels)

**Files:**
- Create: `src/render/gpu.ts`, `src/render/camera.ts`, `src/render/camera.test.ts`, `src/render/polygons.ts`, `src/render/grid.ts`, `src/render/scenePolys.ts`, `src/render/renderer.ts`, `src/render/shaders/poly.wgsl`, `src/render/shaders/grid.wgsl`
- Modify: `src/main.ts` (temporary preview; replaced in Task 13)

**Interfaces:**
- Produces:
  - `initGpu(canvas): Promise<GpuContext>`, `GpuContext { device; context; format; canvas }`, `class WebGpuUnavailableError extends Error`.
  - `class Camera { cx; cy; ppm; widthPx; heightPx; dpr; resize(widthPx, heightPx, dpr); fit(rect: Rect); panByCss(dx, dy); zoomAtCss(px, py, factor); screenToWorld(px, py): Vec2; uniformData(): Float32Array /* 8 floats */ }`.
  - `RGBA = [number, number, number, number]`, `ColoredPolygon { polygon: Polygon; color: RGBA }`, `RingInstance { center: Vec2; radius: number; thickness: number; color: RGBA }`.
  - `FrameInput { staticPolys: ColoredPolygon[]; staticVersion: number; dynamicPolys: ColoredPolygon[]; rings: RingInstance[]; newFootprints: Polygon[]; envelopeBounds: Rect; envelopeVersion: number }` — `rings`, `newFootprints`, `envelope*` are consumed from Tasks 11–12 onward.
  - `class Renderer { readonly camera: Camera; static create(canvas): Promise<Renderer>; resize(); frame(input: FrameInput): void; resetEnvelope(); rebuildEnvelope(footprints: Polygon[]); readEnvelopeAt(p: Vec2): Promise<number> }` — the last three are implemented in Task 11 (stubs here).
  - `scenePolygons(scene): ColoredPolygon[]`, `vehiclePolygons(v, s, mirrors): ColoredPolygon[]`, `rulerPolygon(c: Clearance): ColoredPolygon`, `COLORS`, `bandFor(distance): 'ok' | 'warn' | 'bad'`.
  - `class PolygonPipeline { constructor(device, format, cameraLayout); upload(polys: ColoredPolygon[]): PolygonBatch; draw(pass, batch, cameraBindGroup) }` — internal to `render/`.

- [ ] **Step 1: Write the failing camera tests**

`src/render/camera.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { Camera } from './camera';

describe('Camera', () => {
  const cam = () => {
    const c = new Camera();
    c.resize(800, 600, 1);
    c.cx = 0;
    c.cy = 0;
    c.ppm = 100;
    return c;
  };

  it('uniform maps the centre to clip origin and scales by ppm', () => {
    const u = cam().uniformData();
    expect(u[0]).toBeCloseTo((2 * 100) / 800, 12);
    expect(u[1]).toBeCloseTo((2 * 100) / 600, 12);
    expect(u[2]).toBeCloseTo(0, 12);
    expect(u[3]).toBeCloseTo(0, 12);
    expect(u[4]).toBe(800);
    expect(u[5]).toBe(600);
  });

  it('screenToWorld inverts the projection (y up)', () => {
    const c = cam();
    expect(c.screenToWorld(400, 300)).toEqual({ x: 0, y: 0 });
    const w = c.screenToWorld(500, 200);
    expect(w.x).toBeCloseTo(1, 12);
    expect(w.y).toBeCloseTo(1, 12);
  });

  it('zoomAtCss keeps the point under the cursor fixed', () => {
    const c = cam();
    const before = c.screenToWorld(600, 100);
    c.zoomAtCss(600, 100, 1.5);
    const after = c.screenToWorld(600, 100);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
    expect(c.ppm).toBeCloseTo(150, 12);
  });

  it('panByCss moves the centre against the drag, honouring dpr', () => {
    const c = cam();
    c.resize(1600, 1200, 2);
    c.panByCss(100, 0);
    expect(c.cx).toBeCloseTo(-2, 12);
    c.panByCss(0, 50);
    expect(c.cy).toBeCloseTo(1, 12);
  });

  it('fit frames the rect with margin', () => {
    const c = cam();
    c.fit({ minX: 0, minY: 0, maxX: 40, maxY: 10 });
    expect(c.cx).toBe(20);
    expect(c.cy).toBe(5);
    expect(c.ppm).toBeCloseTo((800 / 40) * 0.9, 12);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/render/camera.test.ts`
Expected: FAIL — cannot resolve `./camera`.

- [ ] **Step 3: Implement camera**

`src/render/camera.ts`:
```ts
import type { Rect } from '../geom/polygon';
import type { Vec2 } from '../geom/vec2';

/** Orthographic top-down camera. ppm = device pixels per metre. */
export class Camera {
  cx = 0;
  cy = 0;
  ppm = 100;
  widthPx = 1;
  heightPx = 1;
  dpr = 1;

  resize(widthPx: number, heightPx: number, dpr: number): void {
    this.widthPx = Math.max(1, widthPx);
    this.heightPx = Math.max(1, heightPx);
    this.dpr = dpr;
  }

  private scaleX(): number {
    return (2 * this.ppm) / this.widthPx;
  }
  private scaleY(): number {
    return (2 * this.ppm) / this.heightPx;
  }

  /** [scale.x, scale.y, offset.x, offset.y, viewport.w, viewport.h, 0, 0] */
  uniformData(): Float32Array {
    const sx = this.scaleX();
    const sy = this.scaleY();
    return new Float32Array([sx, sy, -this.cx * sx, -this.cy * sy, this.widthPx, this.heightPx, 0, 0]);
  }

  screenToWorld(cssX: number, cssY: number): Vec2 {
    const clipX = ((cssX * this.dpr) / this.widthPx) * 2 - 1;
    const clipY = 1 - ((cssY * this.dpr) / this.heightPx) * 2;
    return { x: clipX / this.scaleX() + this.cx, y: clipY / this.scaleY() + this.cy };
  }

  panByCss(dx: number, dy: number): void {
    this.cx -= (dx * this.dpr) / this.ppm;
    this.cy += (dy * this.dpr) / this.ppm;
  }

  zoomAtCss(cssX: number, cssY: number, factor: number): void {
    const before = this.screenToWorld(cssX, cssY);
    this.ppm = Math.min(2000, Math.max(5, this.ppm * factor));
    const after = this.screenToWorld(cssX, cssY);
    this.cx += before.x - after.x;
    this.cy += before.y - after.y;
  }

  fit(r: Rect): void {
    const w = Math.max(1e-6, r.maxX - r.minX);
    const h = Math.max(1e-6, r.maxY - r.minY);
    this.cx = (r.minX + r.maxX) / 2;
    this.cy = (r.minY + r.maxY) / 2;
    this.ppm = Math.min(this.widthPx / w, this.heightPx / h) * 0.9;
  }
}
```

- [ ] **Step 4: Run camera tests**

Run: `pnpm vitest run src/render/camera.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Write the shaders**

`src/render/shaders/poly.wgsl`:
```wgsl
struct Camera {
  scale: vec2f,
  offset: vec2f,
  viewport: vec2f,
  pad: vec2f,
};
@group(0) @binding(0) var<uniform> cam: Camera;

struct VSIn {
  @location(0) pos: vec2f,
  @location(1) color: vec4f,
};
struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) color: vec4f,
};

@vertex fn vs(in: VSIn) -> VSOut {
  var o: VSOut;
  o.pos = vec4f(in.pos * cam.scale + cam.offset, 0.0, 1.0);
  o.color = in.color;
  return o;
}

@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  return vec4f(in.color.rgb * in.color.a, in.color.a); // premultiplied
}
```

`src/render/shaders/grid.wgsl`:
```wgsl
struct Camera {
  scale: vec2f,
  offset: vec2f,
  viewport: vec2f,
  pad: vec2f,
};
@group(0) @binding(0) var<uniform> cam: Camera;

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) clip: vec2f,
};

@vertex fn vs(@builtin(vertex_index) i: u32) -> VSOut {
  // Fullscreen triangle.
  var p = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var o: VSOut;
  o.pos = vec4f(p[i], 0.0, 1.0);
  o.clip = p[i];
  return o;
}

fn lineMask(world: vec2f, spacing: f32) -> f32 {
  let g = abs(fract(world / spacing - 0.5) - 0.5) / fwidth(world / spacing);
  return 1.0 - min(min(g.x, g.y), 1.0);
}

@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  let world = (in.clip - cam.offset) / cam.scale;
  let metresPerPx = fwidth(world.x);
  let bg = vec3f(0.078, 0.090, 0.110);
  let minorPx = 0.1 / metresPerPx;
  let minorFade = smoothstep(4.0, 12.0, minorPx);
  let minor = lineMask(world, 0.1) * 0.14 * minorFade;
  let major = lineMask(world, 1.0) * 0.30;
  let a = max(minor, major);
  let col = mix(bg, vec3f(0.55, 0.60, 0.70), a);
  return vec4f(col, 1.0);
}
```

- [ ] **Step 6: Implement gpu.ts, polygons.ts, grid.ts**

`src/render/gpu.ts`:
```ts
export class WebGpuUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WebGpuUnavailableError';
  }
}

export interface GpuContext {
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  canvas: HTMLCanvasElement;
}

export async function initGpu(canvas: HTMLCanvasElement): Promise<GpuContext> {
  if (!('gpu' in navigator) || !navigator.gpu) throw new WebGpuUnavailableError('This browser has no WebGPU (navigator.gpu is missing).');
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new WebGpuUnavailableError('WebGPU is present but no adapter was returned (GPU blocked or unsupported).');
  const device = await adapter.requestDevice();
  const context = canvas.getContext('webgpu');
  if (!context) throw new WebGpuUnavailableError('Could not get a webgpu canvas context.');
  const format = navigator.gpu.getPreferredCanvasFormat();
  context.configure({ device, format, alphaMode: 'opaque' });
  return { device, context, format, canvas };
}

export const CAMERA_UNIFORM_BYTES = 32;

export function createCameraBindGroupLayout(device: GPUDevice): GPUBindGroupLayout {
  return device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
  });
}
```

`src/render/polygons.ts`:
```ts
import polyWgsl from './shaders/poly.wgsl?raw';
import { fanTriangles, type Polygon } from '../geom/polygon';

export type RGBA = [number, number, number, number];

export interface ColoredPolygon {
  polygon: Polygon;
  color: RGBA;
}

const FLOATS_PER_VERTEX = 6;

/** Interleaved [x, y, r, g, b, a] triangle list for a set of convex polygons. */
export function buildVertexData(polys: ColoredPolygon[]): Float32Array {
  let count = 0;
  for (const p of polys) count += Math.max(0, p.polygon.length - 2) * 3;
  const out = new Float32Array(count * FLOATS_PER_VERTEX);
  let o = 0;
  for (const p of polys) {
    for (const v of fanTriangles(p.polygon)) {
      out[o++] = v.x;
      out[o++] = v.y;
      out[o++] = p.color[0];
      out[o++] = p.color[1];
      out[o++] = p.color[2];
      out[o++] = p.color[3];
    }
  }
  return out;
}

/** A GPU vertex buffer that grows to fit; `vertexCount` is what to draw. */
export class PolygonBatch {
  buffer: GPUBuffer;
  capacityBytes: number;
  vertexCount = 0;

  constructor(private readonly device: GPUDevice, initialBytes = 64 * 1024) {
    this.capacityBytes = initialBytes;
    this.buffer = device.createBuffer({ size: initialBytes, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  }

  upload(data: Float32Array): void {
    if (data.byteLength > this.capacityBytes) {
      this.buffer.destroy();
      this.capacityBytes = Math.max(data.byteLength, this.capacityBytes * 2);
      this.buffer = this.device.createBuffer({ size: this.capacityBytes, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    }
    if (data.byteLength > 0) this.device.queue.writeBuffer(this.buffer, 0, data);
    this.vertexCount = data.length / FLOATS_PER_VERTEX;
  }

  destroy(): void {
    this.buffer.destroy();
  }
}

export const POLYGON_VERTEX_LAYOUT: GPUVertexBufferLayout = {
  arrayStride: FLOATS_PER_VERTEX * 4,
  attributes: [
    { shaderLocation: 0, offset: 0, format: 'float32x2' },
    { shaderLocation: 1, offset: 8, format: 'float32x4' },
  ],
};

export const PREMULTIPLIED_BLEND: GPUBlendState = {
  color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
  alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
};

export class PolygonPipeline {
  readonly pipeline: GPURenderPipeline;

  constructor(device: GPUDevice, format: GPUTextureFormat, cameraLayout: GPUBindGroupLayout, blend: GPUBlendState | undefined = PREMULTIPLIED_BLEND) {
    const module = device.createShaderModule({ code: polyWgsl });
    this.pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [cameraLayout] }),
      vertex: { module, entryPoint: 'vs', buffers: [POLYGON_VERTEX_LAYOUT] },
      fragment: { module, entryPoint: 'fs', targets: [blend ? { format, blend } : { format }] },
      primitive: { topology: 'triangle-list' },
    });
  }

  draw(pass: GPURenderPassEncoder, batch: PolygonBatch, cameraBindGroup: GPUBindGroup): void {
    if (batch.vertexCount === 0) return;
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, cameraBindGroup);
    pass.setVertexBuffer(0, batch.buffer);
    pass.draw(batch.vertexCount);
  }
}
```

`src/render/grid.ts`:
```ts
import gridWgsl from './shaders/grid.wgsl?raw';

export class GridPipeline {
  readonly pipeline: GPURenderPipeline;

  constructor(device: GPUDevice, format: GPUTextureFormat, cameraLayout: GPUBindGroupLayout) {
    const module = device.createShaderModule({ code: gridWgsl });
    this.pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [cameraLayout] }),
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    });
  }

  draw(pass: GPURenderPassEncoder, cameraBindGroup: GPUBindGroup): void {
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, cameraBindGroup);
    pass.draw(3);
  }
}
```

- [ ] **Step 7: Implement scenePolys.ts**

`src/render/scenePolys.ts`:
```ts
import { rectFromSegment, transformPolygon } from '../geom/polygon';
import type { Clearance } from '../geom/clearance';
import type { Scene, ObstacleKind } from '../scene/types';
import type { VehicleState } from '../sim/model';
import type { DerivedVehicle } from '../vehicle/derive';
import type { ColoredPolygon, RGBA } from './polygons';

export const COLORS = {
  wall: [0.42, 0.45, 0.50, 1] as RGBA,
  kerb: [0.60, 0.56, 0.42, 1] as RGBA,
  car: [0.29, 0.33, 0.39, 1] as RGBA,
  line: [0.90, 0.91, 0.93, 0.8] as RGBA,
  targetFill: [0.24, 0.86, 0.52, 0.10] as RGBA,
  targetEdge: [0.24, 0.86, 0.52, 0.8] as RGBA,
  body: [0.23, 0.51, 0.96, 0.92] as RGBA,
  mirror: [0.38, 0.65, 0.98, 0.92] as RGBA,
  wheel: [0.08, 0.08, 0.09, 1] as RGBA,
  envelope: [1.0, 0.55, 0.10, 0.35] as RGBA,
  ok: [0.24, 0.86, 0.52, 1] as RGBA,
  warn: [0.96, 0.73, 0.26, 1] as RGBA,
  bad: [1.0, 0.36, 0.36, 1] as RGBA,
  guide: [0.9, 0.9, 1.0, 0.45] as RGBA,
} as const;

export type Band = 'ok' | 'warn' | 'bad';

export function bandFor(distance: number): Band {
  if (distance >= 0.3) return 'ok';
  if (distance >= 0.1) return 'warn';
  return 'bad';
}

const kindColor: Record<ObstacleKind, RGBA> = { wall: COLORS.wall, kerb: COLORS.kerb, car: COLORS.car, line: COLORS.line };

export function scenePolygons(scene: Scene): ColoredPolygon[] {
  const out: ColoredPolygon[] = [{ polygon: scene.target, color: COLORS.targetFill }];
  const t = scene.target;
  for (let i = 0; i < t.length; i++) out.push({ polygon: rectFromSegment(t[i]!, t[(i + 1) % t.length]!, 0.03), color: COLORS.targetEdge });
  for (const o of scene.obstacles) out.push({ polygon: o.polygon, color: kindColor[o.kind] });
  return out;
}

export function vehiclePolygons(v: DerivedVehicle, s: VehicleState, mirrors: boolean): ColoredPolygon[] {
  const out: ColoredPolygon[] = [];
  for (const w of v.wheels) {
    const local = transformPolygon(w.outline, { x: w.hub.x, y: w.hub.y, theta: w.steered ? s.steer : 0 });
    out.push({ polygon: transformPolygon(local, s), color: COLORS.wheel });
  }
  out.push({ polygon: transformPolygon(v.body, s), color: COLORS.body });
  if (mirrors) for (const m of v.mirrors) out.push({ polygon: transformPolygon(m, s), color: COLORS.mirror });
  return out;
}

export function rulerPolygon(c: Clearance): ColoredPolygon | null {
  if (c.distance <= 0) return null;
  return { polygon: rectFromSegment(c.pa, c.pb, 0.04), color: COLORS[bandFor(c.distance)] };
}
```

- [ ] **Step 8: Implement renderer.ts (envelope/rings stubbed)**

`src/render/renderer.ts`:
```ts
import type { Polygon, Rect } from '../geom/polygon';
import type { Vec2 } from '../geom/vec2';
import { Camera } from './camera';
import { CAMERA_UNIFORM_BYTES, createCameraBindGroupLayout, initGpu, type GpuContext } from './gpu';
import { GridPipeline } from './grid';
import { buildVertexData, PolygonBatch, PolygonPipeline, type ColoredPolygon, type RGBA } from './polygons';

export interface RingInstance {
  center: Vec2;
  radius: number;
  thickness: number;
  color: RGBA;
}

export interface FrameInput {
  staticPolys: ColoredPolygon[];
  /** Bump when staticPolys change; the renderer re-uploads only then. */
  staticVersion: number;
  dynamicPolys: ColoredPolygon[];
  rings: RingInstance[];
  /** Footprints simulated since the previous frame, to accumulate into the envelope. */
  newFootprints: Polygon[];
  envelopeBounds: Rect;
  /** Bump when envelopeBounds change; the renderer reallocates and clears. */
  envelopeVersion: number;
}

export class Renderer {
  readonly camera = new Camera();
  private readonly cameraBuffer: GPUBuffer;
  private readonly cameraBindGroup: GPUBindGroup;
  private readonly grid: GridPipeline;
  private readonly polys: PolygonPipeline;
  private readonly staticBatch: PolygonBatch;
  private readonly dynamicBatch: PolygonBatch;
  private uploadedStaticVersion = -1;

  private constructor(private readonly gpu: GpuContext) {
    const { device, format } = gpu;
    const layout = createCameraBindGroupLayout(device);
    this.cameraBuffer = device.createBuffer({ size: CAMERA_UNIFORM_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.cameraBindGroup = device.createBindGroup({ layout, entries: [{ binding: 0, resource: { buffer: this.cameraBuffer } }] });
    this.grid = new GridPipeline(device, format, layout);
    this.polys = new PolygonPipeline(device, format, layout);
    this.staticBatch = new PolygonBatch(device);
    this.dynamicBatch = new PolygonBatch(device);
    this.resize();
  }

  static async create(canvas: HTMLCanvasElement): Promise<Renderer> {
    return new Renderer(await initGpu(canvas));
  }

  get device(): GPUDevice {
    return this.gpu.device;
  }

  /** Match the canvas backing store to its CSS size × devicePixelRatio. */
  resize(): void {
    const c = this.gpu.canvas;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(c.clientWidth * dpr));
    const h = Math.max(1, Math.round(c.clientHeight * dpr));
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
    }
    this.camera.resize(w, h, dpr);
  }

  frame(input: FrameInput): void {
    const { device, context } = this.gpu;
    if (input.staticVersion !== this.uploadedStaticVersion) {
      this.staticBatch.upload(buildVertexData(input.staticPolys));
      this.uploadedStaticVersion = input.staticVersion;
    }
    this.dynamicBatch.upload(buildVertexData(input.dynamicPolys));
    device.queue.writeBuffer(this.cameraBuffer, 0, this.camera.uniformData());

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{ view: context.getCurrentTexture().createView(), loadOp: 'clear', clearValue: { r: 0.078, g: 0.09, b: 0.11, a: 1 }, storeOp: 'store' }],
    });
    this.grid.draw(pass, this.cameraBindGroup);
    this.polys.draw(pass, this.staticBatch, this.cameraBindGroup);
    this.polys.draw(pass, this.dynamicBatch, this.cameraBindGroup);
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  // Implemented in Task 11.
  resetEnvelope(): void {}
  rebuildEnvelope(_footprints: Polygon[]): void {}
  async readEnvelopeAt(_p: Vec2): Promise<number> {
    return 0;
  }
}
```

- [ ] **Step 9: Temporary preview main.ts**

Replace `src/main.ts`:
```ts
import taos from './vehicle/data/taos-trendline-mx-2025.json';
import { validateVehicleSpec } from './vehicle/validate';
import { deriveVehicle } from './vehicle/derive';
import { getPreset, defaultParams } from './scene/presets';
import { Renderer } from './render/renderer';
import { scenePolygons, vehiclePolygons } from './render/scenePolys';
import { WebGpuUnavailableError } from './render/gpu';

async function main(): Promise<void> {
  const canvas = document.getElementById('gpu') as HTMLCanvasElement;
  const fatal = document.getElementById('fatal') as HTMLDivElement;
  const vehicle = deriveVehicle(validateVehicleSpec(taos));
  const preset = getPreset('parallel')!;
  const scene = preset.build(defaultParams(preset));
  let renderer: Renderer;
  try {
    renderer = await Renderer.create(canvas);
  } catch (e) {
    fatal.hidden = false;
    fatal.textContent = e instanceof WebGpuUnavailableError ? `${e.message} Use Chrome/Edge 113+, Safari 26+, or Firefox 141+.` : String(e);
    return;
  }
  renderer.camera.fit(scene.bounds);
  const staticPolys = scenePolygons(scene);
  const draw = (): void => {
    renderer.resize();
    renderer.frame({
      staticPolys,
      staticVersion: 1,
      dynamicPolys: vehiclePolygons(vehicle, scene.start, true),
      rings: [],
      newFootprints: [],
      envelopeBounds: scene.bounds,
      envelopeVersion: 1,
    });
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
}

void main();
```

- [ ] **Step 10: Typecheck, lint, then look at it**

Run: `pnpm typecheck && pnpm lint`
Expected: clean. (`?raw` imports type-check via `vite/client`; if `tsc` complains about `.wgsl?raw`, add `src/vite-env.d.ts` containing `/// <reference types="vite/client" />`.)

Run `pnpm dev` in the background, then open `http://localhost:5173/` with the Playwright MCP tool (`browser_navigate`, then `browser_take_screenshot`). Expected: dark grid with 1 m major lines, a green-outlined spot between two grey cars along a kerb, and the blue Taos with four black wheels and light-blue mirrors in the lane. If the page shows the fatal message, launch Chromium with `--enable-unsafe-webgpu` (Playwright MCP: check its config) or use a local Chrome. Stop the dev server afterwards.

- [ ] **Step 11: Commit**

```bash
git add src/render src/main.ts src/vite-env.d.ts
git commit -m "feat(render): WebGPU renderer with camera, procedural grid and polygon pass"
```

---

### Task 11: render — swept-envelope accumulation texture

**Files:**
- Create: `src/render/envelope.ts`, `src/render/envelope.test.ts`, `src/render/shaders/envelope.wgsl`
- Modify: `src/render/renderer.ts` (replace the three stubs; add the composite draw), `src/main.ts` (feed a footprint so the pass is exercised)

**Interfaces:**
- Consumes: `PolygonPipeline`, `PolygonBatch`, `buildVertexData` (Task 10); `Polygon`, `Rect` (Task 2).
- Produces:
  - `ENVELOPE_PX_PER_M = 200`
  - `envelopeTextureSize(bounds, maxDim): { width; height; pxPerM }` (pure)
  - `envelopeTexel(bounds, width, height, p: Vec2): { x; y } | null` (pure; null outside bounds)
  - `class EnvelopePass { constructor(device, canvasFormat, cameraLayout); setBounds(bounds: Rect, maxDim); accumulate(encoder, footprints: Polygon[]); clear(encoder); composite(pass, cameraBindGroup); readAt(p): Promise<number>; }`
  - `Renderer.resetEnvelope()`, `Renderer.rebuildEnvelope(footprints)`, `Renderer.readEnvelopeAt(p)` become real.

- [ ] **Step 1: Write the failing pure tests**

`src/render/envelope.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { envelopeTextureSize, envelopeTexel, ENVELOPE_PX_PER_M } from './envelope';

const bounds = { minX: -2, minY: -1, maxX: 8, maxY: 4 }; // 10 × 5 m

describe('envelopeTextureSize', () => {
  it('uses 200 px/m when it fits', () => {
    expect(envelopeTextureSize(bounds, 8192)).toEqual({ width: 2000, height: 1000, pxPerM: ENVELOPE_PX_PER_M });
  });
  it('scales down uniformly to the device limit', () => {
    const s = envelopeTextureSize(bounds, 1000);
    expect(s.width).toBe(1000);
    expect(s.height).toBe(500);
    expect(s.pxPerM).toBeCloseTo(100, 12);
  });
});

describe('envelopeTexel', () => {
  it('maps minX/maxY to the top-left texel and maxX/minY to bottom-right', () => {
    expect(envelopeTexel(bounds, 2000, 1000, { x: -2, y: 4 })).toEqual({ x: 0, y: 0 });
    expect(envelopeTexel(bounds, 2000, 1000, { x: 7.999, y: -0.999 })).toEqual({ x: 1999, y: 999 });
  });
  it('returns null outside the bounds', () => {
    expect(envelopeTexel(bounds, 2000, 1000, { x: 9, y: 0 })).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/render/envelope.test.ts`
Expected: FAIL — cannot resolve `./envelope`.

- [ ] **Step 3: Write the composite shader**

`src/render/shaders/envelope.wgsl`:
```wgsl
struct Camera {
  scale: vec2f,
  offset: vec2f,
  viewport: vec2f,
  pad: vec2f,
};
struct Envelope {
  boundsMin: vec2f,
  boundsMax: vec2f,
  tint: vec4f,
};
@group(0) @binding(0) var<uniform> cam: Camera;
@group(1) @binding(0) var<uniform> env: Envelope;
@group(1) @binding(1) var tex: texture_2d<f32>;
@group(1) @binding(2) var samp: sampler;

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
};

@vertex fn vs(@builtin(vertex_index) i: u32) -> VSOut {
  var corners = array<vec2f, 6>(
    vec2f(0.0, 0.0), vec2f(1.0, 0.0), vec2f(1.0, 1.0),
    vec2f(0.0, 0.0), vec2f(1.0, 1.0), vec2f(0.0, 1.0));
  let c = corners[i];
  let world = mix(env.boundsMin, env.boundsMax, c);
  var o: VSOut;
  o.pos = vec4f(world * cam.scale + cam.offset, 0.0, 1.0);
  o.uv = vec2f(c.x, 1.0 - c.y); // texture row 0 is maxY
  return o;
}

@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  let a = textureSample(tex, samp, in.uv).r * env.tint.a;
  return vec4f(env.tint.rgb * a, a);
}
```

- [ ] **Step 4: Implement envelope.ts**

`src/render/envelope.ts`:
```ts
import envelopeWgsl from './shaders/envelope.wgsl?raw';
import type { Polygon, Rect } from '../geom/polygon';
import type { Vec2 } from '../geom/vec2';
import { CAMERA_UNIFORM_BYTES } from './gpu';
import { buildVertexData, PolygonBatch, PolygonPipeline, type ColoredPolygon, type RGBA } from './polygons';
import { COLORS } from './scenePolys';

export const ENVELOPE_PX_PER_M = 200;
const ENVELOPE_FORMAT: GPUTextureFormat = 'r8unorm';

export function envelopeTextureSize(b: Rect, maxDim: number): { width: number; height: number; pxPerM: number } {
  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  const pxPerM = Math.min(ENVELOPE_PX_PER_M, maxDim / w, maxDim / h);
  return { width: Math.max(1, Math.round(w * pxPerM)), height: Math.max(1, Math.round(h * pxPerM)), pxPerM };
}

export function envelopeTexel(b: Rect, width: number, height: number, p: Vec2): { x: number; y: number } | null {
  if (p.x < b.minX || p.x >= b.maxX || p.y <= b.minY || p.y > b.maxY) return null;
  const x = Math.floor(((p.x - b.minX) / (b.maxX - b.minX)) * width);
  const y = Math.floor(((b.maxY - p.y) / (b.maxY - b.minY)) * height);
  return { x: Math.min(width - 1, x), y: Math.min(height - 1, y) };
}

const MAX_BLEND: GPUBlendState = {
  color: { srcFactor: 'one', dstFactor: 'one', operation: 'max' },
  alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'max' },
};

const WHITE: RGBA = [1, 1, 1, 1];

export class EnvelopePass {
  private texture: GPUTexture | null = null;
  private view: GPUTextureView | null = null;
  private bounds: Rect = { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  private width = 1;
  private height = 1;
  private readonly accumPipeline: PolygonPipeline;
  private readonly accumBatch: PolygonBatch;
  private readonly accumCameraBuffer: GPUBuffer;
  private readonly accumCameraBindGroup: GPUBindGroup;
  private readonly compositePipeline: GPURenderPipeline;
  private readonly compositeLayout: GPUBindGroupLayout;
  private readonly envUniform: GPUBuffer;
  private readonly sampler: GPUSampler;
  private compositeBindGroup: GPUBindGroup | null = null;
  private readonly readback: GPUBuffer;

  constructor(private readonly device: GPUDevice, canvasFormat: GPUTextureFormat, cameraLayout: GPUBindGroupLayout) {
    this.accumPipeline = new PolygonPipeline(device, ENVELOPE_FORMAT, cameraLayout, MAX_BLEND);
    this.accumBatch = new PolygonBatch(device, 256 * 1024);
    this.accumCameraBuffer = device.createBuffer({ size: CAMERA_UNIFORM_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.accumCameraBindGroup = device.createBindGroup({ layout: cameraLayout, entries: [{ binding: 0, resource: { buffer: this.accumCameraBuffer } }] });

    this.compositeLayout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    });
    const module = device.createShaderModule({ code: envelopeWgsl });
    this.compositePipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [cameraLayout, this.compositeLayout] }),
      vertex: { module, entryPoint: 'vs' },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [{ format: canvasFormat, blend: { color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' }, alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' } } }],
      },
      primitive: { topology: 'triangle-list' },
    });
    this.envUniform = device.createBuffer({ size: 32, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    this.readback = device.createBuffer({ size: 256, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
  }

  /** (Re)allocate for new bounds. The texture starts cleared to 0. */
  setBounds(bounds: Rect, maxDim: number): void {
    this.texture?.destroy();
    const size = envelopeTextureSize(bounds, maxDim);
    this.bounds = bounds;
    this.width = size.width;
    this.height = size.height;
    this.texture = this.device.createTexture({
      size: { width: size.width, height: size.height },
      format: ENVELOPE_FORMAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_SRC,
    });
    this.view = this.texture.createView();
    const w = bounds.maxX - bounds.minX;
    const h = bounds.maxY - bounds.minY;
    const sx = 2 / w;
    const sy = 2 / h;
    this.device.queue.writeBuffer(
      this.accumCameraBuffer, 0,
      new Float32Array([sx, sy, -((bounds.minX + bounds.maxX) / 2) * sx, -((bounds.minY + bounds.maxY) / 2) * sy, size.width, size.height, 0, 0]),
    );
    const t = COLORS.envelope;
    this.device.queue.writeBuffer(this.envUniform, 0, new Float32Array([bounds.minX, bounds.minY, bounds.maxX, bounds.maxY, t[0], t[1], t[2], t[3]]));
    this.compositeBindGroup = this.device.createBindGroup({
      layout: this.compositeLayout,
      entries: [
        { binding: 0, resource: { buffer: this.envUniform } },
        { binding: 1, resource: this.view },
        { binding: 2, resource: this.sampler },
      ],
    });
  }

  clear(encoder: GPUCommandEncoder): void {
    if (!this.view) return;
    encoder.beginRenderPass({ colorAttachments: [{ view: this.view, loadOp: 'clear', clearValue: { r: 0, g: 0, b: 0, a: 0 }, storeOp: 'store' }] }).end();
  }

  accumulate(encoder: GPUCommandEncoder, footprints: Polygon[]): void {
    if (!this.view || footprints.length === 0) return;
    const polys: ColoredPolygon[] = footprints.map((polygon) => ({ polygon, color: WHITE }));
    this.accumBatch.upload(buildVertexData(polys));
    const pass = encoder.beginRenderPass({ colorAttachments: [{ view: this.view, loadOp: 'load', storeOp: 'store' }] });
    this.accumPipeline.draw(pass, this.accumBatch, this.accumCameraBindGroup);
    pass.end();
  }

  composite(pass: GPURenderPassEncoder, cameraBindGroup: GPUBindGroup): void {
    if (!this.compositeBindGroup) return;
    pass.setPipeline(this.compositePipeline);
    pass.setBindGroup(0, cameraBindGroup);
    pass.setBindGroup(1, this.compositeBindGroup);
    pass.draw(6);
  }

  /** Coverage 0..1 at a world point (0 outside bounds). Used by the e2e smoke test. */
  async readAt(p: Vec2): Promise<number> {
    if (!this.texture) return 0;
    const t = envelopeTexel(this.bounds, this.width, this.height, p);
    if (!t) return 0;
    const encoder = this.device.createCommandEncoder();
    encoder.copyTextureToBuffer({ texture: this.texture, origin: { x: t.x, y: t.y } }, { buffer: this.readback, bytesPerRow: 256 }, { width: 1, height: 1 });
    this.device.queue.submit([encoder.finish()]);
    await this.readback.mapAsync(GPUMapMode.READ);
    const value = new Uint8Array(this.readback.getMappedRange())[0]! / 255;
    this.readback.unmap();
    return value;
  }
}
```

- [ ] **Step 5: Wire into renderer.ts**

In `src/render/renderer.ts`:
- import `EnvelopePass` from `./envelope`;
- add field `private readonly envelope: EnvelopePass;` and `private envelopeVersion = -1;`, construct it in the constructor after `this.polys` with `new EnvelopePass(device, format, layout)`;
- at the top of `frame()`, before creating the encoder:
```ts
    if (input.envelopeVersion !== this.envelopeVersion) {
      this.envelope.setBounds(input.envelopeBounds, device.limits.maxTextureDimension2D);
      this.envelopeVersion = input.envelopeVersion;
    }
```
- after `const encoder = device.createCommandEncoder();` add `this.envelope.accumulate(encoder, input.newFootprints);`
- in the main pass, between the static and dynamic polygon draws, add `this.envelope.composite(pass, this.cameraBindGroup);`
- replace the stubs:
```ts
  resetEnvelope(): void {
    const encoder = this.device.createCommandEncoder();
    this.envelope.clear(encoder);
    this.device.queue.submit([encoder.finish()]);
  }

  rebuildEnvelope(footprints: Polygon[]): void {
    const encoder = this.device.createCommandEncoder();
    this.envelope.clear(encoder);
    this.envelope.accumulate(encoder, footprints);
    this.device.queue.submit([encoder.finish()]);
  }

  readEnvelopeAt(p: Vec2): Promise<number> {
    return this.envelope.readAt(p);
  }
```

- [ ] **Step 6: Exercise it from the preview main**

In `src/main.ts`, replace `newFootprints: []` with a one-shot footprint on the first frame so something accumulates:
```ts
  let first = true;
  // inside draw(), before renderer.frame:
  const footprints = first ? [transformPolygon(vehicle.body, { ...scene.start, x: scene.start.x - 3 })] : [];
  first = false;
```
(import `transformPolygon` from `./geom/polygon`) and pass `newFootprints: footprints`.

- [ ] **Step 7: Verify**

Run: `pnpm vitest run src/render && pnpm typecheck && pnpm lint`
Expected: PASS / clean.

Run `pnpm dev`, screenshot via Playwright MCP. Expected: an orange translucent rectangle 3 m behind the car (the accumulated footprint) drawn *under* the car and *over* the scene. Stop the dev server.

- [ ] **Step 8: Commit**

```bash
git add src/render src/main.ts
git commit -m "feat(render): GPU-accumulated swept envelope texture with composite and readback"
```

---

### Task 12: render — SDF ring pipeline for turning guides

**Files:**
- Create: `src/render/rings.ts`, `src/render/shaders/ring.wgsl`
- Modify: `src/render/renderer.ts` (draw rings after the envelope, before dynamic polys)

**Interfaces:**
- Consumes: `RingInstance` (Task 10).
- Produces: `class RingPipeline { constructor(device, format, cameraLayout); upload(rings: RingInstance[]); draw(pass, cameraBindGroup) }`; `ringInstancesFor(guides: GuideCircle[], thicknessM: number): RingInstance[]` in `scenePolys.ts`.

- [ ] **Step 1: Write the shader**

`src/render/shaders/ring.wgsl`:
```wgsl
struct Camera {
  scale: vec2f,
  offset: vec2f,
  viewport: vec2f,
  pad: vec2f,
};
@group(0) @binding(0) var<uniform> cam: Camera;

struct Inst {
  @location(0) center: vec2f,
  @location(1) radius: f32,
  @location(2) thickness: f32,
  @location(3) color: vec4f,
};
struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) off: vec2f,
  @location(1) radius: f32,
  @location(2) thickness: f32,
  @location(3) color: vec4f,
};

@vertex fn vs(@builtin(vertex_index) i: u32, inst: Inst) -> VSOut {
  var corners = array<vec2f, 6>(
    vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0),
    vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0));
  let ext = inst.radius + inst.thickness;
  let off = corners[i] * ext;
  var o: VSOut;
  o.pos = vec4f((inst.center + off) * cam.scale + cam.offset, 0.0, 1.0);
  o.off = off;
  o.radius = inst.radius;
  o.thickness = inst.thickness;
  o.color = inst.color;
  return o;
}

@fragment fn fs(in: VSOut) -> @location(0) vec4f {
  let d = abs(length(in.off) - in.radius);
  let aa = fwidth(d);
  let half = in.thickness * 0.5;
  let a = (1.0 - smoothstep(half - aa, half + aa, d)) * in.color.a;
  return vec4f(in.color.rgb * a, a);
}
```

- [ ] **Step 2: Implement rings.ts**

`src/render/rings.ts`:
```ts
import ringWgsl from './shaders/ring.wgsl?raw';
import { PREMULTIPLIED_BLEND } from './polygons';
import type { RingInstance } from './renderer';

const FLOATS_PER_INSTANCE = 8;

export class RingPipeline {
  readonly pipeline: GPURenderPipeline;
  private buffer: GPUBuffer;
  private capacityBytes = 64 * FLOATS_PER_INSTANCE * 4;
  private count = 0;

  constructor(private readonly device: GPUDevice, format: GPUTextureFormat, cameraLayout: GPUBindGroupLayout) {
    const module = device.createShaderModule({ code: ringWgsl });
    this.pipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [cameraLayout] }),
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [
          {
            arrayStride: FLOATS_PER_INSTANCE * 4,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'float32x2' },
              { shaderLocation: 1, offset: 8, format: 'float32' },
              { shaderLocation: 2, offset: 12, format: 'float32' },
              { shaderLocation: 3, offset: 16, format: 'float32x4' },
            ],
          },
        ],
      },
      fragment: { module, entryPoint: 'fs', targets: [{ format, blend: PREMULTIPLIED_BLEND }] },
      primitive: { topology: 'triangle-list' },
    });
    this.buffer = device.createBuffer({ size: this.capacityBytes, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
  }

  upload(rings: RingInstance[]): void {
    const data = new Float32Array(rings.length * FLOATS_PER_INSTANCE);
    rings.forEach((r, i) => {
      data.set([r.center.x, r.center.y, r.radius, r.thickness, ...r.color], i * FLOATS_PER_INSTANCE);
    });
    if (data.byteLength > this.capacityBytes) {
      this.buffer.destroy();
      this.capacityBytes = Math.max(data.byteLength, this.capacityBytes * 2);
      this.buffer = this.device.createBuffer({ size: this.capacityBytes, usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST });
    }
    if (data.byteLength > 0) this.device.queue.writeBuffer(this.buffer, 0, data);
    this.count = rings.length;
  }

  draw(pass: GPURenderPassEncoder, cameraBindGroup: GPUBindGroup): void {
    if (this.count === 0) return;
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, cameraBindGroup);
    pass.setVertexBuffer(0, this.buffer);
    pass.draw(6, this.count);
  }
}
```

Append to `src/render/scenePolys.ts`:
```ts
import type { GuideCircle } from '../geom/turning';
import type { RingInstance } from './renderer';

export function ringInstancesFor(guides: GuideCircle[], thicknessM: number): RingInstance[] {
  return guides.map((g) => ({ center: g.center, radius: g.radius, thickness: thicknessM, color: COLORS.guide }));
}
```
(Hoist the imports to the top of the file.)

- [ ] **Step 3: Wire into renderer.ts**

- import `RingPipeline`; add field `private readonly rings: RingPipeline;` constructed with `new RingPipeline(device, format, layout)`;
- in `frame()`, before the encoder: `this.rings.upload(input.rings);`
- in the main pass, after `this.envelope.composite(...)` and before the dynamic polys: `this.rings.draw(pass, this.cameraBindGroup);`

- [ ] **Step 4: Exercise from the preview main**

In `src/main.ts`, import `guideCircles` from `./geom/turning` and `ringInstancesFor` from `./render/scenePolys`, and pass
```ts
      rings: ringInstancesFor(guideCircles({ ...scene.start, steer: vehicle.maxSteer }, vehicle), 2 / renderer.camera.ppm),
```

- [ ] **Step 5: Verify**

Run: `pnpm typecheck && pnpm lint`
Then `pnpm dev` + Playwright screenshot. Expected: three thin concentric pale rings centred to the car's left; the outer-most passes just outside the front-left body corner. Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add src/render src/main.ts
git commit -m "feat(render): instanced SDF rings for turning guides"
```

---

### Task 13: app loop — keyboard driving, camera controls, envelope recording, rewind/reset

**Files:**
- Create: `src/ui/input.ts`, `src/ui/input.test.ts`, `src/app.ts`
- Modify: `src/main.ts` (bootstrap only)

**Interfaces:**
- Consumes: everything above.
- Produces:
  - `class DriveInput { constructor(); attach(target: Window); bind(button: HTMLElement, key: DriveKey); control(current: VehicleState, p: SimParams): ControlInput; readonly rewindHeld: boolean; takeReset(): boolean; takeFit(): boolean; setKey(key: DriveKey, down: boolean) }`, `DriveKey = 'forward' | 'reverse' | 'left' | 'right' | 'centre' | 'stop' | 'rewind' | 'reset' | 'fit'`.
  - `class App { constructor(canvas, renderer, vehicle); readonly input: DriveInput; setPreset(id, params: Params); setMirrors(b); setTimeScale(x); reset(); fitView(); snapshot(): Snapshot; start(); }`
  - `Snapshot { presetId; params; mirrors; timeScale; state: VehicleState; clearance: Clearance | null; contact: boolean; firstContactTime: number | null; parked: boolean; parkedOffsets: {lateral; headingErrorDeg} | null; simTime: number; historyLength: number }`
  - `App.onSnapshot?: (s: Snapshot) => void` called once per rendered frame.
  - `window.__sim` debug hook: `{ snapshot(): Snapshot; readEnvelopeAt(x, y): Promise<number>; setKey(key, down) }` — used by the e2e test.

- [ ] **Step 1: Write the failing input tests**

`src/ui/input.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { DriveInput } from './input';
import type { SimParams, VehicleState } from '../sim/model';

const p: SimParams = { wheelbase: 2.689, maxSteer: 0.6, steerRate: 1, maxSpeed: 2 };
const s: VehicleState = { x: 0, y: 0, theta: 0, steer: 0.25, speed: 0 };

describe('DriveInput.control', () => {
  it('holds the current steer with no steer key', () => {
    const i = new DriveInput();
    expect(i.control(s, p)).toEqual({ steer: 0.25, speed: 0 });
  });
  it('left steers to +maxSteer, right to -maxSteer, both cancel to hold', () => {
    const i = new DriveInput();
    i.setKey('left', true);
    expect(i.control(s, p).steer).toBe(0.6);
    i.setKey('right', true);
    expect(i.control(s, p).steer).toBe(0.25);
    i.setKey('left', false);
    expect(i.control(s, p).steer).toBe(-0.6);
  });
  it('centre targets zero and wins over left/right', () => {
    const i = new DriveInput();
    i.setKey('left', true);
    i.setKey('centre', true);
    expect(i.control(s, p).steer).toBe(0);
  });
  it('forward/reverse set speed; stop or both cancel to zero', () => {
    const i = new DriveInput();
    i.setKey('forward', true);
    expect(i.control(s, p).speed).toBe(2);
    i.setKey('reverse', true);
    expect(i.control(s, p).speed).toBe(0);
    i.setKey('forward', false);
    expect(i.control(s, p).speed).toBe(-2);
    i.setKey('stop', true);
    expect(i.control(s, p).speed).toBe(0);
  });
  it('reset and fit are one-shot', () => {
    const i = new DriveInput();
    i.setKey('reset', true);
    expect(i.takeReset()).toBe(true);
    expect(i.takeReset()).toBe(false);
    i.setKey('fit', true);
    expect(i.takeFit()).toBe(true);
    expect(i.takeFit()).toBe(false);
  });
  it('maps key codes', () => {
    const i = new DriveInput();
    i.handleKey('ArrowUp', true);
    i.handleKey('KeyA', true);
    expect(i.control(s, p)).toEqual({ steer: 0.6, speed: 2 });
    i.handleKey('KeyZ', true);
    expect(i.rewindHeld).toBe(true);
    expect(i.handleKey('KeyQ', true)).toBe(false); // unmapped → not handled
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/ui/input.test.ts`
Expected: FAIL — cannot resolve `./input`.

- [ ] **Step 3: Implement input.ts**

`src/ui/input.ts`:
```ts
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
```

- [ ] **Step 4: Run input tests**

Run: `pnpm vitest run src/ui/input.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Implement app.ts**

`src/app.ts`:
```ts
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
```

- [ ] **Step 6: Rewrite main.ts as bootstrap**

`src/main.ts`:
```ts
import taos from './vehicle/data/taos-trendline-mx-2025.json';
import { validateVehicleSpec } from './vehicle/validate';
import { deriveVehicle } from './vehicle/derive';
import { Renderer } from './render/renderer';
import { WebGpuUnavailableError } from './render/gpu';
import { App, type Snapshot } from './app';
import type { DriveKey } from './ui/input';

declare global {
  interface Window {
    __sim?: {
      snapshot(): Snapshot;
      readEnvelopeAt(x: number, y: number): Promise<number>;
      setKey(key: DriveKey, down: boolean): void;
    };
  }
}

function showFatal(message: string): void {
  const fatal = document.getElementById('fatal') as HTMLDivElement;
  fatal.hidden = false;
  fatal.textContent = message;
}

async function main(): Promise<void> {
  const canvas = document.getElementById('gpu') as HTMLCanvasElement;
  let vehicle;
  try {
    vehicle = deriveVehicle(validateVehicleSpec(taos));
  } catch (e) {
    showFatal(`Vehicle data invalid: ${(e as Error).message}`);
    return;
  }
  let renderer: Renderer;
  try {
    renderer = await Renderer.create(canvas);
  } catch (e) {
    showFatal(e instanceof WebGpuUnavailableError ? `${e.message} Use Chrome/Edge 113+, Safari 26+, or Firefox 141+.` : String(e));
    return;
  }
  let lostOnce = false;
  renderer.device.lost.then((info) => {
    if (info.reason === 'destroyed') return;
    if (lostOnce) showFatal(`GPU device lost twice (${info.message}). Reload the page.`);
    else {
      lostOnce = true;
      location.reload();
    }
  });

  const app = new App(canvas, renderer, vehicle);
  window.__sim = {
    snapshot: () => app.snapshot(),
    readEnvelopeAt: (x, y) => renderer.readEnvelopeAt({ x, y }),
    setKey: (key, down) => app.input.setKey(key, down),
  };
  app.start();
}

void main();
```

- [ ] **Step 7: Verify by driving**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: clean, all tests pass.

Run `pnpm dev`; with Playwright MCP: `browser_navigate` to the app, `browser_press_key` `ArrowDown` a few times is not a hold — instead use `browser_evaluate` with `window.__sim.setKey('reverse', true)`, wait 1 s, `setKey('reverse', false)`, then `browser_take_screenshot`. Expected: car moved backwards ~2 m, an orange envelope trails behind it, the ruler points at the nearest obstacle. Evaluate `window.__sim.snapshot().state.x` and confirm it decreased by ≈ 2 from the preset start. Hold `left` + `reverse` and confirm the rings appear and the car arcs. Press `KeyZ` (via `setKey('rewind', true)`), wait, release: envelope shrinks accordingly. Stop the dev server.

- [ ] **Step 8: Commit**

```bash
git add src/app.ts src/main.ts src/ui
git commit -m "feat(app): fixed-step drive loop with envelope recording, rewind, reset and camera controls"
```

---

### Task 14: UI — panel, vehicle card, readouts, URL hash

**Files:**
- Create: `src/ui/hash.ts`, `src/ui/hash.test.ts`, `src/ui/panel.ts`, `src/ui/readouts.ts`
- Modify: `src/main.ts` (build the panel; wire the hash), `index.html` (no change needed — the panel builds into `#panel`)

**Interfaces:**
- Consumes: `App`, `Snapshot` (Task 13); `PRESETS`, `getPreset`, `clampParams`, `defaultParams` (Task 8); `bandFor` (Task 10); `isUnverified`, `VehicleSpec` (Task 4).
- Produces:
  - `HashState { presetId: string; params: Params; mirrors: boolean }`, `encodeHash(h: HashState): string` (no leading `#`), `decodeHash(hash: string): HashState | null` (validates preset id, clamps params).
  - `buildPanel(root: HTMLElement, opts: { vehicle: DerivedVehicle; initial: HashState; onScenario(h: HashState): void; onTimeScale(x: number): void; onReset(): void; onFit(): void; bind(button: HTMLElement, key: DriveKey): void }): { setScenario(h: HashState): void }`
  - `createReadouts(hud: HTMLElement, panelSection: HTMLElement): (s: Snapshot) => void`

- [ ] **Step 1: Write the failing hash tests**

`src/ui/hash.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { decodeHash, encodeHash } from './hash';

describe('hash', () => {
  it('round-trips', () => {
    const h = { presetId: 'garage', params: { doorWidth: 2.4, interiorWidth: 3, interiorDepth: 5.5, drivewayWidth: 3, drivewayLength: 5, approachAngle: 90 }, mirrors: false };
    const s = encodeHash(h);
    expect(s).toContain('p=garage');
    expect(s).toContain('m=0');
    expect(decodeHash('#' + s)).toEqual(h);
  });
  it('fills defaults and clamps', () => {
    const d = decodeHash('p=parallel&spotLength=99')!;
    expect(d.presetId).toBe('parallel');
    expect(d.params.spotLength).toBe(8);
    expect(d.params.spotWidth).toBe(2.4);
    expect(d.mirrors).toBe(true);
  });
  it('rejects unknown presets and empty hashes', () => {
    expect(decodeHash('p=bogus')).toBeNull();
    expect(decodeHash('')).toBeNull();
    expect(decodeHash('#')).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm vitest run src/ui/hash.test.ts`
Expected: FAIL — cannot resolve `./hash`.

- [ ] **Step 3: Implement hash.ts**

`src/ui/hash.ts`:
```ts
import { clampParams, getPreset } from '../scene/presets';
import type { Params } from '../scene/types';

export interface HashState {
  presetId: string;
  params: Params;
  mirrors: boolean;
}

export function encodeHash(h: HashState): string {
  const q = new URLSearchParams();
  q.set('p', h.presetId);
  for (const [k, v] of Object.entries(h.params)) q.set(k, String(v));
  q.set('m', h.mirrors ? '1' : '0');
  return q.toString();
}

export function decodeHash(hash: string): HashState | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (raw.length === 0) return null;
  const q = new URLSearchParams(raw);
  const def = getPreset(q.get('p') ?? '');
  if (!def) return null;
  const params: Params = {};
  for (const p of def.params) {
    const v = q.get(p.key);
    if (v !== null) params[p.key] = Number(v);
  }
  return { presetId: def.id, params: clampParams(def, params), mirrors: q.get('m') !== '0' };
}
```

- [ ] **Step 4: Run hash tests**

Run: `pnpm vitest run src/ui/hash.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Implement panel.ts**

`src/ui/panel.ts`:
```ts
import { PRESETS, getPreset, defaultParams, clampParams } from '../scene/presets';
import type { Params } from '../scene/types';
import { isUnverified, NUMERIC_FIELDS, type Cited } from '../vehicle/types';
import type { DerivedVehicle } from '../vehicle/derive';
import type { DriveKey } from './input';
import type { HashState } from './hash';

export interface PanelOptions {
  vehicle: DerivedVehicle;
  initial: HashState;
  onScenario(h: HashState): void;
  onTimeScale(x: number): void;
  onReset(): void;
  onFit(): void;
  bind(button: HTMLElement, key: DriveKey): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Record<string, string> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.append(...children);
  return e;
}

function citedRow(label: string, c: Cited<number>): HTMLElement {
  const link = el('a', { href: c.source.url, target: '_blank', rel: 'noopener', class: 'source', title: c.source.note ?? '' }, 'src');
  const badge = isUnverified(c) ? el('span', { class: 'unverified' }, 'unverified') : '';
  return el('div', { class: 'readout' }, el('span', {}, label, badge), el('span', { class: 'value' }, `${(c.value * 1000).toFixed(0)} mm `, link));
}

export function buildPanel(root: HTMLElement, o: PanelOptions): { setScenario(h: HashState): void; readoutSection: HTMLElement } {
  let presetId = o.initial.presetId;
  let params: Params = { ...o.initial.params };
  let mirrors = o.initial.mirrors;

  const presetSelect = el('select');
  for (const p of PRESETS) presetSelect.append(el('option', { value: p.id }, p.name));
  const paramsBox = el('div');
  const scenario = el('fieldset', {}, el('legend', {}, 'Scenario'), presetSelect, paramsBox);

  const emit = (): void => o.onScenario({ presetId, params: { ...params }, mirrors });

  const renderParams = (): void => {
    paramsBox.replaceChildren();
    const def = getPreset(presetId)!;
    for (const p of def.params) {
      const input = el('input', { type: 'number', min: String(p.min), max: String(p.max), step: String(p.step), value: String(params[p.key] ?? p.default) });
      input.addEventListener('change', () => {
        params[p.key] = Number(input.value);
        params = clampParams(def, params);
        input.value = String(params[p.key]);
        emit();
      });
      paramsBox.append(el('label', { class: 'param' }, `${p.label} (${p.unit})`, input));
    }
  };

  presetSelect.addEventListener('change', () => {
    presetId = presetSelect.value;
    params = defaultParams(getPreset(presetId)!);
    renderParams();
    emit();
  });

  const mirrorsInput = el('input', { type: 'checkbox' });
  mirrorsInput.checked = mirrors;
  mirrorsInput.addEventListener('change', () => {
    mirrors = mirrorsInput.checked;
    emit();
  });
  const d = o.vehicle.spec;
  const labels: Record<(typeof NUMERIC_FIELDS)[number], string> = {
    length: 'Length', widthBody: 'Width (body)', widthMirrors: 'Width (mirrors)', height: 'Height', wheelbase: 'Wheelbase',
    frontOverhang: 'Front overhang', rearOverhang: 'Rear overhang', trackFront: 'Track front', trackRear: 'Track rear',
    tireWidth: 'Tyre width', wheelDiameter: 'Wheel diameter', mirrorLongitudinal: 'Mirror position', mirrorLength: 'Mirror length',
  };
  const vehicleCard = el('fieldset', {}, el('legend', {}, `${d.name} · ${d.market} ${d.modelYear}`),
    ...NUMERIC_FIELDS.map((f) => citedRow(labels[f], d[f])),
    el('div', { class: 'readout' }, el('span', {}, `Turning circle (${d.turningCircle.value.kind})`), el('span', { class: 'value' }, `${d.turningCircle.value.diameter.toFixed(2)} m `, el('a', { href: d.turningCircle.source.url, target: '_blank', rel: 'noopener', class: 'source' }, 'src'))),
    el('div', { class: 'readout' }, el('span', {}, 'Max steer (derived)'), el('span', { class: 'value' }, `${((o.vehicle.maxSteer * 180) / Math.PI).toFixed(1)}°`)),
    el('label', { class: 'param' }, 'Include mirrors', mirrorsInput),
  );

  const timeScale = el('input', { type: 'range', min: '0.1', max: '1', step: '0.05', value: '1' });
  timeScale.addEventListener('input', () => o.onTimeScale(Number(timeScale.value)));
  const resetBtn = el('button', { type: 'button' }, 'Reset (R)');
  resetBtn.addEventListener('click', () => o.onReset());
  const fitBtn = el('button', { type: 'button' }, 'Fit view (F)');
  fitBtn.addEventListener('click', () => o.onFit());
  const pad = el('div', { class: 'pad' });
  const padKeys: Array<[string, DriveKey | null]> = [['◀', 'left'], ['▲', 'forward'], ['▶', 'right'], ['⟲ rewind', 'rewind'], ['▼', 'reverse'], ['centre', 'centre']];
  for (const [label, key] of padKeys) {
    const b = el('button', { type: 'button' }, label);
    if (key) o.bind(b, key);
    pad.append(b);
  }
  const controls = el('fieldset', {}, el('legend', {}, 'Drive'),
    el('label', { class: 'param' }, 'Time scale', timeScale), pad,
    el('div', { class: 'pad' }, resetBtn, fitBtn),
    el('p', { class: 'source' }, 'Keys: arrows/WASD drive · C centre steering · Space stop · Z rewind · R reset · F fit · drag to pan · wheel to zoom'),
  );

  const readoutSection = el('fieldset', {}, el('legend', {}, 'Readouts'));
  root.replaceChildren(scenario, readoutSection, controls, vehicleCard);

  const setScenario = (h: HashState): void => {
    presetId = h.presetId;
    params = { ...h.params };
    mirrors = h.mirrors;
    presetSelect.value = presetId;
    mirrorsInput.checked = mirrors;
    renderParams();
  };
  setScenario(o.initial);
  return { setScenario, readoutSection };
}
```

- [ ] **Step 6: Implement readouts.ts**

`src/ui/readouts.ts`:
```ts
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
      against.value.textContent = `obstacle #${s.clearance.obstacleIndex}`;
    } else {
      clearance.value.textContent = '—';
      hudClearance.textContent = '';
    }
    contact.value.textContent = s.firstContactTime === null ? 'none' : `t = ${s.firstContactTime.toFixed(2)} s`;
    steer.value.textContent = `${((s.state.steer * 180) / Math.PI).toFixed(1)}°`;
    speed.value.textContent = `${(s.state.speed * 3.6).toFixed(1)} km/h`;
    time.value.textContent = `${s.simTime.toFixed(1)} s ×${s.timeScale.toFixed(2)}`;
    if (s.parked && s.parkedOffsets) {
      parked.value.textContent = `yes · lateral ${(s.parkedOffsets.lateral * 100).toFixed(0)} cm · heading ${s.parkedOffsets.headingErrorDeg.toFixed(1)}°`;
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
```

- [ ] **Step 7: Wire panel, readouts, and hash into main.ts**

In `src/main.ts`, after `const app = new App(...)` and before `app.start()`:
```ts
  const panelRoot = document.getElementById('panel') as HTMLElement;
  const hud = document.getElementById('hud') as HTMLElement;
  const initial: HashState = decodeHash(location.hash) ?? { presetId: PRESETS[0]!.id, params: defaultParams(PRESETS[0]!), mirrors: true };
  const applyScenario = (h: HashState): void => {
    app.setPreset(h.presetId, h.params);
    app.setMirrors(h.mirrors);
    history.replaceState(null, '', '#' + encodeHash(h));
  };
  const panel = buildPanel(panelRoot, {
    vehicle,
    initial,
    onScenario: applyScenario,
    onTimeScale: (x) => app.setTimeScale(x),
    onReset: () => app.reset(),
    onFit: () => app.fitView(),
    bind: (b, k) => app.input.bind(b, k),
  });
  app.onSnapshot = createReadouts(hud, panel.readoutSection);
  window.addEventListener('hashchange', () => {
    const h = decodeHash(location.hash);
    if (h) {
      panel.setScenario(h);
      applyScenario(h);
    }
  });
  applyScenario(initial);
```
with imports: `import { decodeHash, encodeHash, type HashState } from './ui/hash'; import { buildPanel } from './ui/panel'; import { createReadouts } from './ui/readouts'; import { PRESETS, defaultParams } from './scene/presets';`.

- [ ] **Step 8: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: clean.

`pnpm dev` + Playwright MCP: screenshot shows the left panel (scenario select + three numeric inputs, readouts, drive pad, vehicle card with `unverified` badges on overhangs/mirrors). Change the preset to "garage" via `browser_select_option`; the scene changes, the URL hash contains `p=garage`. Navigate to `/#p=perpendicular&bayWidth=2.3&m=0` and confirm the perpendicular scene loads with mirrors unchecked. Drive into a neighbour car; readout shows `CONTACT` in red and "First contact t = …". Stop the dev server.

- [ ] **Step 9: Commit**

```bash
git add src/ui src/main.ts
git commit -m "feat(ui): scenario panel, cited vehicle card, readouts and shareable URL hash"
```

---

### Task 15: Playwright smoke test

**Files:**
- Create: `playwright.config.ts`, `e2e/smoke.spec.ts`
- Modify: `.gitignore` (add `playwright-report/`, `test-results/`)

**Interfaces:**
- Consumes: `window.__sim` (Task 13), `#fatal` (Task 1).

- [ ] **Step 1: Install a Chromium for Playwright**

Run: `pnpm exec playwright install chromium`
Expected: downloads a Chromium build (one-time, ~150 MB).

- [ ] **Step 2: Write the config**

`playwright.config.ts`:
```ts
import { defineConfig } from '@playwright/test';

// WebGPU in headless Chromium on Linux needs these flags. If `requestAdapter()`
// returns null (the test reports the #fatal text), try adding
// '--use-angle=vulkan' and '--use-vulkan=swiftshader' to fall back to a
// software Vulkan implementation, and record here which set worked.
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:4173',
    launchOptions: {
      args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--ignore-gpu-blocklist'],
    },
  },
  webServer: {
    command: 'pnpm build && pnpm preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
```

- [ ] **Step 3: Write the smoke test**

`e2e/smoke.spec.ts`:
```ts
import { expect, test } from '@playwright/test';

test('boots WebGPU, drives, records clearance and envelope', async ({ page }) => {
  await page.goto('/#p=parallel');
  await page.waitForFunction(() => Boolean(window.__sim), null, { timeout: 20_000 });

  const fatal = page.locator('#fatal');
  expect(await fatal.textContent(), 'fatal message shown').toBe('');
  await expect(fatal).toBeHidden();

  const start = await page.evaluate(() => window.__sim!.snapshot());
  expect(start.clearance).not.toBeNull();
  expect(start.clearance!.distance).toBeGreaterThan(0);

  await page.evaluate(() => window.__sim!.setKey('reverse', true));
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.__sim!.setKey('reverse', false));
  await page.waitForTimeout(100);

  const after = await page.evaluate(() => window.__sim!.snapshot());
  expect(after.state.x).toBeLessThan(start.state.x - 1.0);
  expect(after.historyLength).toBeGreaterThan(60);
  expect(Number.isFinite(after.clearance!.distance)).toBe(true);

  // A straight reverse in this preset slides the mirror along the neighbour's flat edge, so the
  // clearance can legitimately stay put (Task 13 measurement). An arc toward the kerb must change it.
  await page.evaluate(() => {
    window.__sim!.setKey('left', true);
    window.__sim!.setKey('reverse', true);
  });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    window.__sim!.setKey('left', false);
    window.__sim!.setKey('reverse', false);
  });
  await page.waitForTimeout(100);
  const arced = await page.evaluate(() => window.__sim!.snapshot());
  expect(arced.state.theta).not.toBeCloseTo(after.state.theta, 3);
  expect(arced.clearance!.distance).not.toBeCloseTo(after.clearance!.distance, 3);

  // The start pose lies inside the swept envelope: read back the texel under the original rear axle.
  const coverage = await page.evaluate(([x, y]) => window.__sim!.readEnvelopeAt(x, y), [start.state.x, start.state.y] as const);
  expect(coverage).toBeGreaterThan(0.5);

  // Readout text reflects the state.
  await expect(page.locator('#hud')).toContainText('clearance');
});

test('shows a message instead of a blank page without WebGPU', async ({ browser }) => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'gpu', { value: undefined, configurable: true });
  });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('#fatal')).toBeVisible();
  await expect(page.locator('#fatal')).toContainText('WebGPU');
  await context.close();
});
```

Add to `tsconfig.json` `include` nothing new (already includes `e2e`); the `window.__sim` type comes from the `declare global` in `src/main.ts` — add `"src/main.ts"` is already included. If `tsc` cannot see the global from `e2e/`, move the `declare global` block into `src/sim-debug.d.ts` (importing `Snapshot` and `DriveKey` types) and reference it from both.

- [ ] **Step 4: Run it**

Run: `pnpm test:e2e`
Expected: 2 passed. If the first test fails at the `#fatal` assertion with an adapter message, apply the flag fallback described in the config comment, re-run, and update the comment with what worked. If no flag combination yields an adapter on this machine, record that in the config comment and in the Task 16 CI notes; the unit suite remains the gate and e2e runs where a WebGPU-capable Chromium exists.

- [ ] **Step 5: Commit**

```bash
printf 'playwright-report/\ntest-results/\n' >> .gitignore
git add playwright.config.ts e2e .gitignore
git commit -m "test(e2e): Playwright smoke test for boot, drive, clearance and envelope"
```

---

### Task 16: CI and GitHub Pages deploy

**Files:**
- Create: `.github/workflows/ci.yml`, `README.md`

**Interfaces:**
- Consumes: scripts from Task 1; `BASE_PATH` env honoured by `vite.config.ts`.

- [ ] **Step 1: Write the workflow**

`.github/workflows/ci.yml`:
```yaml
name: ci
on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages-${{ github.ref }}
  cancel-in-progress: true

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm typecheck
      - run: pnpm lint
      - run: pnpm test
      - run: pnpm build
        env:
          BASE_PATH: /parking-simulator/
      - uses: actions/upload-pages-artifact@v3
        if: github.ref == 'refs/heads/main' && github.event_name == 'push'
        with:
          path: dist

  deploy:
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'
    needs: check
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```

`pnpm/action-setup@v4` reads the version from `packageManager` in `package.json`, so no `version:` input is needed. The e2e suite is deliberately not in CI until Task 15 has shown which Chromium flags produce a WebGPU adapter on a GPU-less runner; add a `pnpm exec playwright install --with-deps chromium && pnpm test:e2e` step then.

- [ ] **Step 2: Write README.md**

```markdown
# Parking Simulator

Top-down, WebGPU-rendered parking instrument: drive a real-dimension vehicle
(first: Volkswagen Taos Trendline, MX 2025) through parametric parking
scenarios and read exact clearances and the swept envelope.

- Live: https://redoacs.github.io/parking-simulator/
- Design: `docs/superpowers/specs/2026-09-18-parking-simulator-design.md`

## Develop

```sh
corepack enable pnpm
pnpm install
pnpm dev          # http://localhost:5173
pnpm test         # unit tests (Vitest)
pnpm test:e2e     # Playwright smoke (needs a WebGPU-capable Chromium)
pnpm build        # typecheck + production build in dist/
```

Requires a WebGPU browser: Chrome/Edge 113+, Safari 26+, Firefox 141+.

## Controls

Arrows / WASD drive · C centre steering · Space stop · Z hold to rewind ·
R reset · F fit view · drag to pan · wheel to zoom.

## Vehicle data

Every dimension in `src/vehicle/data/*.json` carries its source URL. Figures
VW does not publish (overhang split, width with mirrors, mirror position) are
marked `unverified` and shown as such in the UI.
```

- [ ] **Step 3: Verify the build the way CI runs it**

Run: `BASE_PATH=/parking-simulator/ pnpm build && grep -c '/parking-simulator/assets/' dist/index.html`
Expected: build succeeds; grep prints a count ≥ 1.

- [ ] **Step 4: Commit**

```bash
git add .github README.md
git commit -m "ci: typecheck, lint, test, build and deploy to GitHub Pages"
```

- [ ] **Step 5: Merge and publish — ask the user first**

Creating the public repository and pushing is outward-facing. Stop and ask the user to confirm: "Create public repo `redoacs/parking-simulator`, push `main`, and enable Pages (source: GitHub Actions)?" Only on a yes:

```bash
gh repo create redoacs/parking-simulator --public --source . --remote origin --description "WebGPU parking-fit simulator with real vehicle dimensions"
git push -u origin main
```
Then open the branch `feat/v1` as a PR (`gh pr create --fill`), wait for the `check` job to be green, and hand the merge to the user (`ship` is user-invoked only). After the merge lands, enable Pages: `gh api -X POST repos/redoacs/parking-simulator/pages -f build_type=workflow` (idempotent-ish: a 409 means it already exists), re-run the workflow if it deployed before Pages was enabled, and confirm `https://redoacs.github.io/parking-simulator/` loads.

---

## Plan self-review

**Spec coverage** (spec § → task): §1 architecture → file structure + Tasks 2–14; §2 data model (units, frames, `VehicleSpec` with `Cited`, derived footprint, `Scene`, presets and param ranges) → Tasks 4, 5, 8; §3 simulation (fixed step, bicycle model, rate-limited steering, keys, history, rewind, reset, time-scale) → Tasks 6, 13; §4 geometry (collision outline with toggleable mirrors, signed distance, collision flag with first-contact time, parked with offsets, turning guides hidden below 0.5°) → Tasks 3, 7, 9, 13; §5 rendering (envelope accumulation at 5 mm/px with max blend and rebuild-on-rewind, procedural grid, polygon pass, envelope composite, SDF rings, ruler, HTML text, ortho camera with pan/zoom/fit, `Renderer` seam) → Tasks 10–13; §6 UI (preset selector + inputs, vehicle card with sources and unverified badges, readouts with bands, buttons, on-screen controls, URL hash) → Task 14; §7 error handling (no WebGPU message, device loss re-init once, JSON validation halts with field named, param clamping + grid test) → Tasks 4, 8, 13 (`main.ts`); §8 testing (bicycle invariants, distance cases, footprint derivation, validation rejections, preset grid, Playwright smoke incl. envelope readback) → Tasks 2–9, 15; §9 tooling/CI/deploy → Tasks 1, 16. Deviations from the spec are listed under Global Constraints.

**Placeholder scan:** none of the forbidden phrases remain; every code step carries its code. Two empirical steps (Playwright WebGPU flags in Task 15, preset-grid adjustments in Task 8 Step 5) state concrete candidates and a stop condition instead of a fixed outcome.

**Type consistency:** `Clearance`/`checkClearance`/`worldOutline` (Task 9) are the names used in Tasks 10, 13; `FrameInput`/`RingInstance`/`ColoredPolygon`/`RGBA` (Task 10) are used unchanged in Tasks 11–13; `GuideCircle`/`guideCircles` (Task 7) feed `ringInstancesFor` (Task 12); `DriveKey`/`DriveInput.setKey` (Task 13) match `window.__sim.setKey` in Task 15 and `PanelOptions.bind` in Task 14; `Params`/`clampParams`/`defaultParams`/`getPreset`/`PRESETS` (Task 8) are used in Tasks 13–14; `SimParams.maxSteer` drives `DriveInput.control`; `Snapshot` fields consumed by `createReadouts` and the e2e test (`state`, `clearance`, `historyLength`) exist on the type.

