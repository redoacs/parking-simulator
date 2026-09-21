# Lessons

## L-1 — Capture the settled compact layout

When verifying this simulator's compact layout, wait until the settings sheet
has reached its intended visibility before capturing. A visible playback bar
does not prove the panel's closing transition has ended. Bind captures to a
clean candidate and its built assets; finish the capture before handing it to
a reviewer. Changing or adding review inputs after launch requires a new
explicit handoff, not an unannounced update to the reader's directory.

Evidence: [i18n PR #9 retrospective](../retrospectives/2026-09-20-i18n-retro.md#friction-audit)
and [maneuver PR #10 retrospective](../retrospectives/2026-09-20-suggested-maneuver-retro.md#validation-and-limits).
Promoted from F-1 after two documented occurrences. This does not require a new
capture framework or establish physical-phone correctness.
