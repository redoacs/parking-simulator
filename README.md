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
pnpm exec playwright install --with-deps chromium firefox webkit  # browser test runtimes; Linux dependencies need admin access
# On display-less Linux, run xvfb-run --auto-servernum pnpm test:e2e.
pnpm test:e2e     # Chromium phone tests + Chromium/Firefox/WebKit smoke; builds and serves on port 4173,
                  # and fails if that port is busy. Another port: E2E_PORT=4174 pnpm test:e2e
pnpm build        # typecheck + production build in dist/
```

Requires a browser with WebGL2: any current Chrome, Edge, Firefox or Safari, desktop or mobile.

## Controls

Arrows / WASD drive · C centre steering · Space stop · Z hold to rewind ·
R reset · F fit view · drag to pan · wheel or the Zoom −/+ buttons to zoom.
Tab to a drive button and hold Enter to operate it; Space still stops the car.

Rewind retains up to five minutes of movement and steering activity. Pauses are
skipped, and the clock returns to each recorded timestamp. The orange sweep
stays visible while rewinding and updates once you release rewind.

“Parked” means the stopped body is inside the target. Contact, including mirrors,
still takes red styling and is shown alongside the parked status.

On a phone or tablet the scene fills the screen: steer with the left thumb (◀ ▶), drive with the right (▲ ▼), hold
both to reverse while steering. One finger pans, two fingers pinch-zoom, ☰ opens the settings.

## Vehicle data

Every dimension in `src/vehicle/data/*.json` carries its source URL. The body-width
interpretation, estimated overhangs, and mirror geometry are marked `unverified`. Track widths and turning
circle come from VW's 2024 US Taos sheet; their applicability to the 2025 MX
vehicle is also marked `unverified`. Hover notes on the source links explain each
dimension, including the turning circle. These assumptions affect the clearances
and maneuvers the simulator reports.

## Verification

CI requires typecheck, lint, formatting, unit tests, build, and browser tests
before deployment. Shared smoke tests run on Chromium, Firefox, and WebKit;
multi-touch and orientation emulation use Chromium's CDP interface. These are
desktop engine checks and emulation, not qualification on a physical phone.
