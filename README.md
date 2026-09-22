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
pnpm test:e2e     # Chromium phone tests + Chromium/Firefox/WebKit smoke, i18n and maneuver suites;
                  # builds and serves on port 4173,
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

## Suggested maneuver

Choose a scenario, dimensions and mirror setting, then **Show maneuver**
(**Mostrar maniobra**). The route starts at the scenario's preset position.
Solid cyan marks forward travel and dashed pink marks reverse travel, measured
at the rear axle. The purple car demonstrates the route: play/pause it or use
**Next instruction** to advance one steering/direction segment. Space pauses
when focus is outside the demonstration buttons; on a focused demonstration
button, Space activates that button. R restarts the demonstration.
The turning guides follow the purple car's position and steering during the demonstration.
Closing it resumes your own car and its history.
Your driving clock and swept envelope are paused during the demonstration.

Instructions and metrics work in English and Spanish. Switching languages keeps
the route and playback position. Changing scenario dimensions, mirrors or the
scenario URL cancels the search and clears the route. Search runs locally in a
worker; **Cancel search** keeps the rest of the simulator usable.

The search prioritizes the final parked margin, then centering. It aims for an
aligned, centered finish; a bounded search can return its best validated
off-center finish instead. Route length and gear changes do not outrank final
placement, and the route itself is not guaranteed shortest or simplest. It stays
within the modeled lane, parking area, driveway and apron, including finite ends
inside the fitted view. Removing the parallel kerb does not permit off-road
travel. These planning limits do not prevent manual driving over painted lines.

**Parked margin** is the smallest final gap to any space edge or solid obstacle,
including mirrors when enabled. It appears in the playback bar. Negative values
mean the enabled footprint extends over a space edge; painted edges remain
noncollidable. Narrow parallel spaces may require an off-center finish to stay
clear of the kerb-side planning boundary, even with the kerb turned off; a
shallow perpendicular bay may need a small adjustment away from its back wall.
The demonstration distinguishes a centered finish, a position adjusted for
boundary clearance, and an off-center fallback found before search ends.
**Approach clearance** is a conservative lower bound along
the whole movement against solid obstacles. Both are rounded down for display;
only the parked metric includes space edges. Some suggestions pass close to
another car; the same estimated vehicle
dimensions described below affect these results. A failed search means **no
maneuver was found within the search limit**, not that parking is impossible.
The defaults and representative tight/spacious cases are tested; success at every
slider combination is not guaranteed. Planning from your current driven pose is
not included.
The tested 5.5 m × 2.3 m parallel space with a 3 m lane still returns an
off-center fallback; the 5 m × 2 m space with a 2.5 m lane can return no route.

See the [maneuver design](docs/superpowers/specs/2026-09-20-suggested-maneuver-design.md)
for the solver, replay contract and search limits.

## Vehicle data

Every dimension in `src/vehicle/data/*.json` carries its source URL and a required
`source.confidence` value (`verified` or `unverified`). The badge follows this
field independently of the note wording. The body-width
interpretation, estimated overhangs, and mirror geometry are marked `unverified`. Track widths and turning
circle come from VW's 2024 US Taos sheet; their applicability to the 2025 MX
vehicle is also marked `unverified`. Tap or click a dimension to read its source note,
including the turning circle's, and to reach its source link. These assumptions affect the clearances
and maneuvers the simulator reports.

## Verification

CI requires typecheck, lint, formatting, unit tests, build, and browser tests
before deployment. Shared smoke, language and maneuver tests run on Chromium, Firefox, and WebKit;
multi-touch and orientation emulation use Chromium's CDP interface. These are
desktop engine checks and emulation, not qualification on a physical phone.
