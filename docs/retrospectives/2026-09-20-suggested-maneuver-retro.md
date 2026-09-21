# Suggested maneuver retrospective

2026-09-20. Slice: [PR #10](https://github.com/redoacs/parking-simulator/pull/10),
branch `suggested-maneuver`, base `4a603741a92c1283c8a4456c05aacce4d97ac27b`.

## Result and assumptions

Each preset offers a feasible maneuver from its configured start, with a
forward/reverse route, separate purple ghost, English/Spanish instructions and
distance, direction-change and conservative clearance metrics. The user's
drive is paused and preserved. The [design](../superpowers/specs/2026-09-20-suggested-maneuver-design.md)
owns the numerical contracts and limits; README owns usage.

The informed Fable 5.1/high design lane and Codex implementation lane agreed on
completion at `2a36f48`, after the separate independent review's corrections.
The requested Fable 5.2 route returned `model_not_found` before design work;
the user explicitly selected 5.1/high. No silent model fallback occurred.

The useful design corrections were concrete:

- A one-shot swing-out calculation did not establish that the parallel preset
  needed extra road width. A measured multi-shift prototype fit the actual lane;
  the proposal to add hidden overrun was withdrawn.
- Same-gear forward/reverse Dubins connections plus gear-changing search met the
  representative cases. Full Reeds–Shepp and intermediate steering primitives
  did not earn their added machinery. The tolerance-region goal remained.
- Inverting the union of driving rectangles into complement blockers avoided
  hand-maintained garage exclusions and caught concave corner cuts.
- The motion proof uses an arclength bound and both endpoints, not half a vertex
  chord plus an unexplained allowance. The validator also enforces permitted
  headings, centring and settled steering before motion.
- Prototype exact replay took 53–809 ms for successful routes in its measured matrix. Repeating
  that work synchronously on the main thread was rejected; one authoritative
  replay remains in the worker, with request identity and consistency checks
  at acceptance. These prototype timings are not a final-build benchmark.
- A fixed 8 cm search floor lost tight cases in the prototype. The implemented
  1 cm acceptance floor and soft clearance cost preserve those possibilities.
  A bounded extra search window improved some routes, but the default parallel
  result still has only a 3.0 cm displayed lower bound, shown in red. No optimum,
  safest-route or all-dimensions success claim follows.

## Independent review

The reviewer used a new Fable 5.1/high session, separate from the author and
informed design collaborator. It inspected source and selected PNGs, but did not
execute tests or use assistive technologies. Root re-derived amendments; no
reviewer patch was applied. Counts below were extracted from terminal finding
groups, rather than inferred from verdict wording.

| Round | Candidate | Verdict wording | Blocking | Should-fix | Optional |
| --- | --- | --- | --- | --- | --- |
| Implementation 1 | `1eb7efe` | APPROVE, with findings | 0 | 3 | 7 |
| Implementation delta | `2a36f48` | APPROVE | 0 | 0 | 4 |

The first verdict's three Should-fix findings required correction despite its
APPROVE wording:

- **S1:** Idle/search-failure transitions cleared held driving keys, and closing
  a preview during a numeric edit stole focus. Absent-to-absent preview changes
  now do nothing; focus returns only from disappearing preview controls.
- **S2:** The tests covered straight-line clearance but did not pin the turning
  term. Added a full-lock metric check and a moving concave-corner case; renamed
  the coarse segment-endpoint test to describe its actual tick coverage.
- **S3:** Root added settled captures and changed the capture helper after the
  review began. The first 320-pixel image caught the settings sheet in motion.
  This was capture/handoff failure, not a layout defect. Both sets were retained;
  the next review read one frozen source/evidence directory. Its 133 listed
  files and 134 total files including the manifest matched after both readers
  and their supervisors exited. The original coherence failure still counts.

Round 1 optional dispositions: removed unused domain arguments/return fields;
derived the replay cap from `SIM_DT`; corrected expansions terminology; kept
focus on Next at completion using `aria-disabled`. The narrow browser case now
accepts a route or a search limit, so improving the solver is not a test failure.
Retained the cheap key/start consistency checks, one selected-candidate replay,
explicit stop/steer cues and fitting the view on entry/exit. These are recorded
tradeoffs, accepted by the reviewer and design collaborator. A reproduced
replay rejection with a valid alternative would reopen fallback-candidate work.
The default parallel clearance remains an acknowledged quality limitation.

Round 2 optional dispositions: no claim of deterministic browser coverage of
the limit branch; the watchdog pins its client state and source inspection
checks the translated UI mapping. Only the three named red runs below earn
executed mutation credit; the moving corner test's detection power is
source-traced. Root's concurrent observations are not a blinded independent
rediscovery. The questioned manifest count was remeasured, including hidden
files, and matched.

Root also clarified Space: it pauses outside demonstration buttons, while a
focused demonstration button uses Space for normal button activation.

The full P-10 closeout review follows this tracked artifact. Its first-pass
yield will be recorded before merge; later repairs will not erase that score.

## Validation and limits

At `2a36f48`, all required commands passed against the same unchanged clean
commit/tree: `pnpm test` (**302 tests**), `pnpm build`, `pnpm lint`,
`pnpm format:check`, `pnpm test:e2e` (**69 tests**, including 18 maneuver cases
across Chromium, Firefox and WebKit). The peer took these executions on trust.
Local browser runtimes and WebKit libraries were reused; no system install or
TypeScript upgrade was part of the feature.

Three controlled regressions failed at the intended assertions: restoring idle
input clearing produced speed 0 instead of 2; removing the turning term
overstated the clearance lower bound; restoring unconditional focus return
failed the first numeric ArrowUp focus assertion in Chromium. The complete
corrected suite then passed, including the focus case in all three engines.
The moving concave-corner case did not receive its own mutation run.

Root inspected desktop and compact Spanish captures, including a settled
320-pixel completion view. The independent reviewer inspected selected frames,
not every image. A first visual helper wrongly assumed every route had three
instructions; the straight garage route has one, so its correctly disabled Next
button exposed a capture-script error. The corrected helper uses actual step
count and waits for the settings sheet to finish closing.

No physical phone, screen reader or real-world parking maneuver was qualified.
Vehicle estimates remain estimates. The unit search matrix allows 60 seconds on
slow runners; browser tests use product budgets. The smallest tested parallel
and perpendicular configurations may return a bounded search limit. The current
pose is not a planning start, and camera fitting is not camera preservation.

## Friction, hygiene and next work

The previously absent friction ledger is now [FRICTIONS](../state/FRICTIONS.md).
The repeated compact-capture timing issue has two tracked occurrences and is
promoted to [L-1](../state/LESSONS.md#l-1--capture-the-settled-compact-layout).
This is a project procedure, not a proposed capture framework; no separate
refactor/tool promotion or roadmap entry is created.

README and current specs describe the feature; implementation plans and older
retrospectives remain historical. AGENTS stays an index. There is no dedicated
wrap-up protocol, separate architecture file or standing doc-audit hook here.

The memory-hygiene pass resolved the existing private parking-project store:
four indexed files, no orphan or dangling entries, no current promotion markers
or newly edited memory links. Two index lines exceed 200 characters (215 and
228). `repo-and-deploy` and `v1-deferred-minors` contain stale current-state
claims about informational browser CI, server reuse and keyboard support;
current tracked CI/config/docs supersede those claims. A scoped private-note
refresh is recommended, not performed. No memory modification was requested.
No structural-pattern file exists; consolidation is unwarranted for a four-line
index. Creative corner is skipped because this is a Codex run.

What worked: executable geometry probes settled design disagreements before UI
work, and a fresh reviewer found input/coverage defects the passing suite missed.
What should change: freeze the entire handoff before launching its reader, and
measure DOM state before reporting a layout defect. Root had prematurely called
the hidden-thumb inset a defect; the existing zero-width guard already handled
it. That claim was corrected, not counted as a fixed product bug.

Feedback and next priority: keep the distinction between a useful feasible
demonstration and an optimum. Observe it on the intended phones, then evaluate
clearance/shift tradeoffs in the default parallel route before adding more
planner machinery. The compiler migration question is separate tooling work;
this feature remains on TypeScript 5.9.3.
