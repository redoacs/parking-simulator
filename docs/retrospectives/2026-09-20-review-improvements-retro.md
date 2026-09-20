# Repository review improvements — retrospective

2026-09-20 · [PR #8](https://github.com/redoacs/parking-simulator/pull/8) ·
branch `fix/review-improvements` · base `81508dd4a098f0006511416439abc59daa5ea01e`.
This is the pre-merge closeout; final-head CI and the independent closeout verdict
are recorded on the PR before shipping.

## Outcome and scope

The review produced eight dispositions, agreed by Codex and Claude Code
`claude-fable-5-1` at `high`. Codex authored all code, tests and documentation
and ran the checks. The Fable design session proposed and challenged the
semantics; a separate Fable session reviewed the candidate without authoring it.
Peer runtime evidence was taken on trust, even when a reviewer read the log.

| Item | Resolution | Implementation / verification |
| --- | --- | --- |
| 1. Contact missed between rendered frames | Check clearance after every fixed simulation step; first contact names that step. | `src/app.ts`, `src/app.test.ts`: brief-contact fixture and 10/30/60/120 Hz timing. |
| 2. Idle time and stationary steering lost on rewind | Record timestamped movement/steering changes, restore timestamps and skip idle gaps. Idle does not consume ring capacity. | `src/sim/history.ts`, `src/app.test.ts`: timestamp round-trip, idle gaps, steering and eviction floor. |
| 3. One input release cancels another hold | Track source identities independently and idempotently. | `src/ui/input.ts`, its unit tests and browser held-controls test. |
| 4. Enter does not operate held buttons; unnamed controls | Enter holds until release/focus loss; name the selector and wide-pad buttons; preserve Space stop. | `src/ui/input.ts`, `panel.ts`, `e2e/smoke.spec.ts`. Physical keyboard support; no screen-reader click-to-hold claim. |
| 5. Green PARKED during mirror contact | Keep body-only containment; display red `PARKED · CONTACT` and retain offsets. | `src/ui/readouts.ts`, garage-wall browser fixture. |
| 6. Envelope stays visible during held rewind | Retain the planned single rebuild on release; clarify README/spec and pin it. | `src/app.test.ts`: no held rebuild, one release rebuild, no duplicate footprints for steering-only history. |
| 7. Borrowed dimensions look vehicle-specific | Mark 2024 US track/turning figures unverified for MX 2025; show turning-circle note/badge. Also mark the body-width interpretation unverified. | Vehicle JSON, shared `citedRow`, separate browser disclosure test. Numerical dimensions unchanged. |
| 8. Advisory browser tests do not gate deployment | Require E2E success before deployment; shared smoke on Chromium/Firefox/WebKit, CDP phone suite on Chromium. | `playwright.config.ts`, `.github/workflows/ci.yml`. No branch-protection change. |

Storing every idle step was rejected: it would spend rewind capacity on pauses.
Timestamped activity earned its extra field because it preserves steering and
clock semantics without that cost. A live envelope rebuild was not adopted:
the existing MAX accumulation cannot subtract old coverage, and no full-capacity
frame-time measurement justified rebuilding it every frame. This is a design
choice, not a claim that a particular device was benchmarked.

## Independent implementation review

Counts below are new findings per saved terminal report, not cumulative totals.
The hosted-CI prerequisite carried across rounds until the PR existed.

| Round / exact candidate | New Blocking | New Should-fix | New Optional | Verdict and disposition |
| --- | ---: | ---: | ---: | --- |
| r1 / `6f32d08` | 0 | 2 | 6 | Changes requested. Corrected a stale Chromium-only spec clause; retained hosted green as a precondition. Reproduced and fixed an idle mirror-toggle contact stamp later than the rewound clock. The suggested hidden-pad Enter failure did not reproduce on the three tested engines; retained a guard without a speculative production path. Split status/data tests, added the Enter hint, and bounded negative-test claims. |
| r2 / `9b1f928` | 0 | 0 | 2 | Approve, subject to hosted CI and closeout review. Added the data test's real startup/fatal wait and an explanatory idle-contact comment. |
| r3 / `d9504a4` | 0 | 0 | 0 | Approve for local review. Both r2 findings closed; hosted CI and full closeout review remained publication gates. |

The design/consensus lane additionally raised five ungraded follow-ups, all
resolved: disclose the status fixture's live-state alias, document the contact
fixture's 12-step dependence, say hover notes explicitly, scope the gate claim
to deployment, and add `CLAUDE.md → AGENTS.md`. The final closeout pass reads
this whole retrospective and its design evidence; its receipt belongs to PR #8.

## Verification and limits

Local command receipts, preserved outside the reapable worktree:

| Check | Observed result / scope |
| --- | --- |
| `pnpm test` at `9b1f928` source | 241 passed across 17 files. |
| `pnpm test:e2e` at `9b1f928` source | 27 passed: 15 Chromium (including 9 CDP phone tests), 6 Firefox, 6 WebKit. The command also builds/typechecks. |
| `pnpm lint`, `pnpm format:check`, `git diff --check` | Passed for the implementation candidate. |
| Changed disclosure test at `d9504a4` | Passed separately on all three engines after its startup-wait amendment. |
| Earlier regression body against original production source | Seven failures. This does not establish a failing baseline run for every final added test. |
| Idle mirror-toggle contact-clock fixture before correction | Failed with first contact about 2 s while the restored clock was 0; corrected test passes. |

The brief-contact and parked/contact cases use labelled fixture poses, not
recorded maneuvers from a stock preset's start. The status fixture deliberately
uses the existing live-state alias in the debug snapshot; a defensive snapshot
copy would make it fail, requiring a replacement fixture. The 100 ms contact
fixture relies on 12 fixed steps. Its arithmetic is deterministic, but changing
the accumulator may require re-deriving the fixture.

WebKit initially failed because local system libraries were missing. Standard
distro libraries in a temporary browser copy allowed local execution; the
MiniBrowser binary's SHA-256 matched the original. CI uses Playwright's standard
`--with-deps` installation. The first hosted run at `d9504a4` passed 22 browser
tests but failed five Firefox tests because WebGL2 was unavailable. A controlled
local probe reproduced WebGL2 success with `DISPLAY` and failure without it.
The E2E command now runs under `xvfb-run --auto-servernum`; its hosted result
remains a gate, recorded on PR #8 before shipping. No browser engine was removed and no retry allowance
was added. The E2E job loads a separate `/` build; the deployed artifact uses
`/parking-simulator/`. The gate is not an exact-artifact deployment smoke test.

Clearances are for the modeled 2D polygons and sampled fixed steps. This work
neither certifies a physical vehicle nor provides continuous collision detection
between those steps. The source check read the complete cited VW MX and US
PDFs: donor provenance is verified, MX applicability remains uncertain. Both
width rows omit an explicit mirror-inclusion qualification. The raw US scripted
fetch returned HTML; it was not treated as a PDF verification receipt.

## Friction audit

The repository has no friction ledger or lessons log. This audit records the
observed gaps here; no repeated-occurrence promotion, new memory store, or
roadmap process was invented for this slice.

1. **Frame sampling hid a real contact.** Render-end checks can look correct
   while an intermediate fixed step overlaps. The new regression exercises that
   mechanism, beyond checking only contact-time rounding.
2. **Clock and history had different meanings.** Activity timestamps resolve
   idle/steering rewind, but review then exposed an idle mirror-toggle timestamp
   outside that history. Recompute contact after discarding a future stamp.
3. **The test's timing assumption was too strict.** An early steering test
   assumed an exact number of steps in a fractional frame interval. It was
   corrected to measure the entries actually popped and their timestamp delta;
   tolerances were not widened to conceal a failure.
4. **Browser prerequisites differed from app failures.** Missing WebKit libraries
   and unavailable local administrator authentication required an isolated test
   runtime. Hosted Firefox then lacked WebGL2 without an X display, despite
   local success. The display probe identified an environment dependency; CI
   now supplies a virtual display and remains a separate qualification gate.
5. **Facts drifted across docs and private notes.** The browser scope, renderer
   API, exact-arc integration, draw order, source confidence and Enter behavior
   needed reconciliation. Publication claims now distinguish provenance from
   applicability and deployment gating from branch protection.
6. **Publication authority was lost at an approval boundary.** Automatic review
   rejected push/PR creation despite the active user-provided shipping goal.
   The work was checkpointed, a direct user approval obtained, and the same
   publishing action resumed; no alternate route bypassed the rejection.

## Docs and memory hygiene

The two specs now distinguish current behavior from the historical migration
plan. The three implementation plans remain historical. The small agent index
points to those owners and the shared collaboration playbook; `CLAUDE.md` is a
symlink to that index. No separate architecture document or standing doc-audit
hook exists; the v1 spec owns architecture.

The memory-hygiene skill resolved the existing private project store, not an
in-repo store. Its four index links resolve with no orphan files. Two existing
index lines exceed the skill's 200-character threshold (215 and 228 characters).
No specified self-staleness marker was found; broader matches described domain
states, not a memory declaring itself obsolete. A live-source audit nevertheless
found stale advisory-CI, idle-rewind, Enter and source-publication claims in
`repo-and-deploy.md`, `v1-deferred-minors.md`, and `vw-spec-sources.md`.
Private-memory edits were not authorized by a direct memory-update request, so
those files remain untouched. Current decisions are published in this PR's docs.
No promotion markers, new/substantially edited memory files, or index-polarity
fixes required action. Consolidation was inapplicable; the structural-pattern
catalog was absent. These are explicit skips, not passed heuristic checks.
Codex skips the Claude-only creative corner.

## Reflections and next priority

The useful correction was the distinction between a pose history and a clock:
recording more states was not automatically more faithful. A second useful
lesson was that PARKED was a correct containment result with misleading success
styling; changing the geometry definition would have solved the wrong problem.

The review worked better when proposed defects could be rejected or narrowed.
Keep that permission in future slices. Next, verify the uncertain dimensions
against the actual vehicle and exercise the existing touch layout on physical
phones before expanding its feature set. The outstanding device checks include
thumb slide-off, long press, background/foreground holds, number-field keyboards,
safe areas and screen-reader interaction; desktop engine passes do not close them.
