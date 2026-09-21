# Frictions

Occurrences below are documented incidents, not counts of failed test assertions.
Current slice: [PR #10](https://github.com/redoacs/parking-simulator/pull/10),
[retrospective](../retrospectives/2026-09-20-suggested-maneuver-retro.md).

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

## Evidence note for F-2

In the first complete browser run, the WebKit Forward button started at
`y=737.3125` in a 720-pixel viewport. After scrolling it into view, the pointer
hold retained speed 2 when the keyboard source released. This was a fixture
placement error, not broken pointer handling.
