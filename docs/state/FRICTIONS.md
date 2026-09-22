# Frictions

Occurrences below are documented incidents, not counts of failed test assertions.
In F-1–F-9, "current retro" means the [PR #10 retrospective](../retrospectives/2026-09-20-suggested-maneuver-retro.md).

| ID | Friction | Occurrences / evidence | Status |
| --- | --- | --- | --- |
| F-1 | Compact screenshots capture a closing sheet instead of settled layout | 2: [i18n retro](../retrospectives/2026-09-20-i18n-retro.md#friction-audit), current retro | promoted → L-1 |
| F-2 | Raw pointer coordinates target a control below the viewport after panel growth | 1: current retro; WebKit held-control fixture | Fixed with explicit scroll before coordinates |
| F-3 | A capture helper assumes a minimum instruction count | 1: current retro; one-step garage | Fixed by using the actual count |
| F-4 | Review inputs change after the reader starts | 1: current retro S3 | Fixed with an immutable handoff directory; original failure retained |
| F-5 | Turning clearance promise lacks a test for its curvature term | 1: current retro S2 | Added a full-lock check and demonstrated its detection power |
| F-6 | Preview cancellation affects unrelated held keys and numeric focus | 1: current retro S1 | Fixed; unit/browser regressions demonstrated |
| F-7 | Requested peer model is inaccessible | 1: current retro | User explicitly selected the available model |
| F-8 | A layout defect is asserted before reading the existing inset guard | 1: current retro | Claim corrected after source inspection |
| F-9 | Coarse search or a fixed clearance threshold loses useful tight routes | 1: current retro design probes | Exact connectors plus soft clearance cost; no completeness claim |
| F-10 | A local WebKit run fails at launch on a missing shared library and reads as test failures | 2: [i18n retro](../retrospectives/2026-09-20-i18n-retro.md#friction-audit), [PR #13](https://github.com/redoacs/parking-simulator/pull/13) | promoted → L-2 |
| F-11 | The WebKit smoke envelope pixel check read swept and untouched pixels as equal | 1: [PR #13](https://github.com/redoacs/parking-simulator/pull/13), first full local run | Open: passed the next full run and 8 of 8 alone; cause not investigated |
| F-12 | A badge with no space before it joins the label's last word into one unbreakable run | 1: [PR #13](https://github.com/redoacs/parking-simulator/pull/13); `nowrap` widened the 320 px sheet | Fixed with a real space, which also separates the words in the row's accessible name |
| F-13 | Text assertions on a disclosure's note pass while the row is closed | 1: [PR #13](https://github.com/redoacs/parking-simulator/pull/13) review S2 | Fixed: notes must be visible; hiding them, dropping Space or blocking Enter each fails a test |
| F-14 | A stale memory rule ("Space never activates a focused button") shaped a design claim the spec had narrowed | 1: [PR #13](https://github.com/redoacs/parking-simulator/pull/13) review S1 | Fixed: rows and maneuver buttons share `claimSpace`; the memory rule was corrected |

## Evidence note for F-2

In the first complete browser run, the WebKit Forward button started at
`y=737.3125` in a 720-pixel viewport. After scrolling it into view, the pointer
hold retained speed 2 when the keyboard source released. This was a fixture
placement error, not broken pointer handling.
