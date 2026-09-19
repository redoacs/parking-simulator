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

Requires a browser with WebGPU enabled: current Chrome or Edge (Linux may need chrome://flags/#enable-unsafe-webgpu), Safari 26+, or Firefox 141+ (Windows first; other platforms in later releases).

Headless Chromium needs SwiftShader Vulkan for WebGPU: see the flags in `playwright.config.ts`.

## Controls

Arrows / WASD drive · C centre steering · Space stop · Z hold to rewind ·
R reset · F fit view · drag to pan · wheel or the Zoom −/+ buttons to zoom.

## Vehicle data

Every dimension in `src/vehicle/data/*.json` carries its source URL. Figures
VW does not publish (overhang split, width with mirrors, mirror position) are
marked `unverified` and shown as such in the UI.
