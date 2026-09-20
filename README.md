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

## Languages

Choose **English / Español** at the top of the settings panel (☰ on a phone).
The choice is saved locally. On a first visit, the first supported browser
language wins; unsupported preferences fall back to English. If browser storage
is blocked, switching still works for the current page.

Switching updates labels, help, readouts, source notes, accessibility text, title
and errors without resetting the run or changing its scenario link. Spanish
uses Mexican terminology and `es-MX` number formatting; English numbers use
`en-US`. Measurements remain metric. Source-note explanations and US-sheet
labels are translated; snippets already in Spanish are reused. Vehicle names,
citation links, numerical source values and raw diagnostics retain their original
content.

Translations live in `src/i18n/en.ts` and `es.ts`. Both are bundled with the app;
there is no translation service or runtime dependency. Add a message to English
and its Spanish counterpart; parameterized messages are typed functions taking
named values, so the compiler checks their call sites and catalog compatibility.
Use `createTextBindings` for static UI text/attributes and `fmt` for displayed
measurements. Keep numeric input values and URL serialization canonical.

To add another language, provide a complete `Messages` catalog, register its
language code, formatting tag, preference matching and catalog selection in
`src/i18n/index.ts`, add its selector option in `src/ui/panel.ts` and document
language in `src/main.ts`, then exercise its startup, switching and layout in
Playwright. Source-note entries are keyed by vehicle id and field; the current
catalogs cover the bundled Taos. The Spanish source-note test protects numeric
tokens; changing source evidence requires reviewing its translation too.

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

Every dimension in `src/vehicle/data/*.json` carries its source URL and a required
`source.confidence` value (`verified` or `unverified`). The badge follows this
field independently of the note wording. The body-width
interpretation, estimated overhangs, and mirror geometry are marked `unverified`. Track widths and turning
circle come from VW's 2024 US Taos sheet; their applicability to the 2025 MX
vehicle is also marked `unverified`. Hover notes on the source links explain each
dimension, including the turning circle. These assumptions affect the clearances
and maneuvers the simulator reports.

## Verification

CI requires typecheck, lint, formatting, unit tests, build, and browser tests
before deployment. Shared smoke and language tests run on Chromium, Firefox, and WebKit;
multi-touch and orientation emulation use Chromium's CDP interface. These are
desktop engine checks and emulation, not qualification on a physical phone.
