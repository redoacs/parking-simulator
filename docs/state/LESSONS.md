# Lessons

## L-1 — Capture the settled compact layout

When verifying this simulator's compact layout, wait until the settings sheet
has reached its intended visibility before capturing. A visible playback bar
does not prove the panel's closing transition has ended. Bind captures to a
clean candidate and its built assets; finish the capture before handing it to
a reviewer.

Evidence: [i18n PR #9 retrospective](../retrospectives/2026-09-20-i18n-retro.md#friction-audit)
and [maneuver PR #10 retrospective](../retrospectives/2026-09-20-suggested-maneuver-retro.md#validation-and-limits).
Promoted from F-1 after two documented occurrences. This does not require a new
capture framework or establish physical-phone correctness.

## L-2 — Read a WebKit launch failure as a void run

When local WebKit tests fail within milliseconds, read the browser log before
the assertions. A missing shared library means the browser never started: that
run's WebKit results are void, neither failures nor passes. Rerun with a
Playwright runtime that carries the libraries (`PLAYWRIGHT_BROWSERS_PATH`) or
with the system dependencies installed, and report only the rerun.

Evidence: [i18n PR #9 retrospective](../retrospectives/2026-09-20-i18n-retro.md#friction-audit)
and [PR #13](https://github.com/redoacs/parking-simulator/pull/13). Promoted from F-10 after two documented occurrences. The runtime's
location is specific to a workstation and is not recorded here.
