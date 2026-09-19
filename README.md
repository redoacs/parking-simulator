# Parking Simulator

Top-down, WebGL2-rendered parking instrument: drive a real-dimension vehicle
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
pnpm test:e2e     # Playwright smoke (headless Chromium, no flags needed); builds and serves on port 4173,
                  # and fails if that port is busy. Another port: E2E_PORT=4174 pnpm test:e2e
pnpm build        # typecheck + production build in dist/
```

Requires a browser with WebGL2: any current Chrome, Edge, Firefox or Safari, desktop or mobile.

## Controls

Arrows / WASD drive · C centre steering · Space stop · Z hold to rewind ·
R reset · F fit view · drag to pan · wheel or the Zoom −/+ buttons to zoom.

On a phone or tablet the scene fills the screen: steer with the left thumb (◀ ▶), drive with the right (▲ ▼), hold
both to reverse while steering. One finger pans, two fingers pinch-zoom, ☰ opens the settings.

## Vehicle data

Every dimension in `src/vehicle/data/*.json` carries its source URL. Figures
VW does not publish (overhang split, width with mirrors, mirror position) are
marked `unverified` and shown as such in the UI.
