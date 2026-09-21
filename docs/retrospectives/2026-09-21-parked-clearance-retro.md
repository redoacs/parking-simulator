# Final parked clearance

2026-09-21. Base `5b648fe`. The user selected final clearance to both solid
objects and space edges, favoring centering. Whole-route clearance and minimum
gear/steering changes are not the selected objective. The current
[design](../superpowers/specs/2026-09-20-suggested-maneuver-design.md) owns the
geometry, numerical tolerances and search contract; README owns usage. The
implementation PR carries final gate results, review dispositions and shipping
evidence.

## Changes and decisions

Candidates now rank by actual final parked margin, centering, then route cost.
Rounded micrometre buckets preserve meaningful centering ties. Replay happens
only for potential improvements; a failed replay cannot erase a previously
validated result. Search stops at the target quality instead of spending another
3,000 expansions optimizing route cost.

The default aligned center maximizes the minimum edge margin for the current
vehicle geometry. That claim does not imply route optimality or reachability.
Narrow spaces use a conservative boundary adjustment with a motion allowance;
the display distinguishes centered, adjusted and fallback finishes. Final
margin is prominent in the bilingual playback bar; compact playback also shows
approach clearance, which otherwise remains in settings.
Negative margin discloses footprint overhang without making painted edges
collidable.

The informed Fable 5.1/high lane contributed the transitive-ranking requirement,
the angular extent argument, the arrival-allowance constraint, and the need to
measure product budgets. Root rejected floor-to-millimetre ranking because
floating-point noise can straddle an exact millimetre boundary; Fable accepted
rounded micrometre buckets. The later suggestion “as centered as the space
allows” was not adopted: the conservative arrival allowance does not prove that
claim. The implemented wording is “adjusted for boundary clearance.”

A first endpoint probe on the unchanged base measured default margins of about
0.3 cm parallel, 20.1 cm perpendicular and 29.2 cm garage. Development replay
probes reached centered values of 15.1 cm, 20.1 cm and 45.1 cm respectively.
These are geometry measurements within the simulator, not real-car validation.

An initial implementation still missed the mirror-off parallel center. Adding
short staging connections fixed that case. Browser execution then exposed a
different failure: the 2 m wide parallel space returned `limit` in Chromium and
WebKit while Node and Firefox found a route. Direct worker probes reproduced
the failure with exhausted frontiers, rather than timeouts. Following Fable's
sampling diagnosis, root tried every nearby pose instead of only every eighth
expansion. All three engines then found routes for five tested widths from
2 m to 2.4 m. Different expansion counts do not establish their exact numerical
cause, and no cross-engine deterministic-route claim is made.

An ablation removed staging connections after denser sampling was in place.
Across 31 development cases it preserved found/limit status and final margin
and centering within 1 micrometre. Staging was therefore removed from the
candidate. This is a bounded observation, not a proof that staging could never
help another configuration. No local shuffle phase, new motion model, dependency
or planner framework was added.

## Verification and limits

Tests pin the current vehicle's centering premises, edge/obstacle scoring,
mirrors and overhang, plateau ranking, actual replay metrics, default toggle
combinations, and preservation of valid results when later replay fails.
The latter fault-injection tests exercise candidate management; they do not
claim a naturally occurring replay rejection was reproduced. Browser coverage
checks the three presets, both languages, compact playback and negative margin.

Development matrix runs used the product's 10-second budget in addition to the
unit suite's longer budget. Reported timings are local observations, not a
performance promise. The 5.5 m × 2.3 m parallel space with a 3 m lane remains an
off-center fallback; the 5 m × 2 m space with a 2.5 m lane can return `limit`.
No all-slider-combinations, arbitrary vehicle/scene, physical phone, screen
reader or real-world parking qualification follows. TypeScript/tooling changes
remain separate work.

The first exploratory browser gate found the narrow-space failure; subsequent
source edits overlapped that run, so it is not exact-candidate certification.
Final gates and independent review use a frozen candidate. The review must
cover this entire closeout as well as implementation and tests. Its first full
P-10 result is recorded separately from any repair confirmation in the PR and,
if admitted, the collaboration record.

The first full independent Fable 5.1/high review at `bdc7efe` returned READY with
0 Blocking, 2 Should-fix and 7 Optional findings. Both Should-fixes were accepted:
the unit matrix now declares expected placement explicitly for all default
toggle combinations, browser coverage includes mirrors-off parallel parking,
and the adjusted overhang result is pinned. Parked margin is prominent in both
settings and playback; the duplicate desktop approach line is hidden while
compact playback retains it. Minor corrections remove historical comparisons
from the current spec and name shallow perpendicular boundary adjustments.
The existing vehicle-premise guards, conservative arrival allowance and safe
validator label are retained with their stated limits. The amendment packet
includes the previously external matrix source manifest. Detailed dispositions
and any subsequent review result belong to the PR; later approval does not
replace this first-full-review yield.
