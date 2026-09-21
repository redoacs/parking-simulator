# Suggested maneuver

The three presets can calculate a maneuver from their starting pose with the
current dimensions and mirror choice. This extends the simulator with a
geometric demonstration; it does not certify a globally optimal route or the
accuracy of the vehicle's estimated dimensions.

## Boundaries and goal

`Scene.drivingArea` describes a finite union of axis-aligned rectangles in world
coordinates. Presets create it in their natural frame; `rotateScene` rotates it
and `parkingHeadings` with the rest of the scene. The area stays inside the
existing Fit bounds. Parallel uses the road between the kerb edge and far lane
line, even with the kerb disabled. Perpendicular uses the aisle and bay row.
Garage uses the street/apron, driveway and interior. The planner cannot bypass
walls by driving across land outside those areas. Manual driving is unchanged.

`drivingDomain` converts the union's complement into rectangular blockers.
Checking only the car's corners would miss an edge across a concave corner;
the blockers are checked against complete body and mirror polygons. Shared
domain construction has its own corner-cut, width-ordering and extent tests.

A successful replay ends stopped with centred steering, the body inside the
target, heading within 1.5 degrees of an allowed heading, and body centre within
0.25 m longitudinally and 0.15 m laterally of the target centre. Parallel permits
only the original traffic direction; the other presets permit either direction.
Collision clearance includes mirrors when enabled. This is stricter than the
manual readout's existing body-only `Parked` definition.

## Search and controls

`planner.ts` performs bounded weighted Hybrid A* with continuous vehicle poses
and discrete position/heading/gear cells. It explores full-left, straight and
full-right arcs in both directions, with 0.35 m and 1.4 m primitives. Steering
changes happen while stopped. Consecutive identical arcs are merged into one
instruction. Search uses batched constant-curvature calls to `stepVehicle`;
verification of the route comes from the separate fixed-step replay below.

Forward and reverse same-gear Dubins connections allow precise final placement.
Connections run at every node whose rear axle is
within one vehicle length of a target, and every eighth expansion elsewhere.
Checking each nearby pose avoids missing useful connections when a tiny change
in heap order shifts the every-eighth sampling schedule.
The equations in `dubins.ts` are adapted from
[Andrew Walker's Dubins-Curves](https://github.com/AndrewWalker/Dubins-Curves);
the source retains its MIT notice. Search prefixes can change gear. This is not
a full Reeds–Shepp solver. A tolerance-region goal remains available when an
exact connection cannot fit. Final candidates rank by parked margin, then
body-center distance to the bay center, then route cost. The first two use
rounded micrometre buckets so floating-point noise cannot beat centering on a
margin plateau. Route cost still guides exploration and prefers fewer shifts
and steering stops while penalizing travel near obstacles.

Parked margin is the minimum of four signed distances from the enabled
body/mirror outline to the rectangular target edges and polygon distance to
solid obstacles. A negative margin means overhang across a space edge; it does
not add a collision rule for painted lines. Hard replay/domain checks still
apply. Metrics come from the replay's actual last state.

For the current symmetric body/mirror footprint at an allowed aligned heading,
opposing edge gaps sum to the remaining width or length. Therefore their minimum
cannot exceed half the smaller remaining dimension. Centering attains that
bound when the outline fits, the centered pose is legal, and solid obstacles
stay outside the bay interior, as in the three default presets. It also resolves
the plateau when one dimension has surplus room. This is a final-position
argument, not a proof of route optimality or reachability.

The current Taos also cannot improve that edge bound by tilting within the
1.5-degree goal window. Its projected width is at least
`widthMirrors*cos(a) + mirrorLength*sin(abs(a))` with mirrors, or
`widthBody*cos(a) + bodyLength*sin(abs(a))` without them; projected length is
at least `bodyLength*cos(a) + widthBody*sin(abs(a))`. For each `A*cos(a) +
B*sin(abs(a))`, the extent cannot shrink when `tan(abs(a)/2) <= B/A`.
`goal.test.ts` pins those ratios and the mirrors' longitudinal containment for
the supplied vehicle. This argument assumes the centered pose satisfies the
hard constraints and obstacles remain outside the target interior; it does not
certify arbitrary replacement vehicle geometry.

The search targets the centered aligned pose for each allowed heading. Where
the outer driving boundary prevents that pose, it projects the footprint into
the boundary with the 1 cm floor plus a maximum-steering half-tick sweep and
0.01 mm numerical slack. This replaces the old 1 cm lateral grid. It is a
conservative approachable target, not an exact constrained optimum. In a narrow
parallel space it sacrifices at most that sweep allowance plus slack against
the aligned static supremum at the hard clearance floor. Other footprint shapes,
headings, or obstacles inside a bay do not inherit the centering argument.

Only a candidate that can improve the stored validated result is replayed.
Rejected replays leave the previous result intact and search continues. Search
stops on reaching the target margin and centering to 1 micrometre with an aligned
heading to 1e-6 radians; it no longer spends 3,000 expansions optimizing route
cost after reaching the requested finish. The display calls an aligned replay
centered within 1 mm, or adjusted for boundary clearance when it reaches the
conservative constrained target. Other results say best validated finish found,
off-center. "Adjusted" does not mean as centered as physically possible.
The target projection handles outer-domain constraints; if interior solid
obstacles or domain blockers invalidate all targets, it returns a search limit.
It is not a general static-pose optimizer for arbitrary replacement scenes.

Limits are 100,000 expansions, 250,000 generated nodes and a 10-second search
deadline. Improving candidates are replayed during search; a replay or expansion
already in progress can run past that deadline. The client has a 30-second worker
watchdog and a visible cancel button. Exhausting the frontier or a budget yields
the best validated candidate, or `limit` if none exists, never a claim that the
scenario is impossible. Results include the exit reason for verification.

`commandsFor` emits controls with integer `SIM_DT` tick counts, including
rate-limited steering at rest. Moving speed is 1 m/s, with a lower-speed final
tick for fractional segment lengths. The ghost does not depend on the manual
time-scale setting. No route smoothing changes the checked controls.

## Authoritative replay

`validateManeuver` runs in the worker from the preset start for improving
candidates. It uses the
actual `stepVehicle`, `worldOutline` and `polygonDistance`, independently of the
search's conservative separating-axis checker. It checks finite controls,
bounded tick counts, settled steering before movement, collision, driving-area
membership and the final goal. At most 180 seconds of simulation can be returned.

For a fixed step with travel `ds`, curvature `k` and maximum outline radius `r`,
each outline point's travel is bounded by `abs(ds) * (1 + r * abs(k))`.
Every intermediate point is within half this bound of one endpoint in time.
Distance to a fixed obstacle is 1-Lipschitz, so the smaller endpoint clearance
minus that half-bound gives a conservative clearance throughout the step.
The validator uses the post-step steering angle, as the simulator does, and
requires at least 0.01 m against obstacles and planning boundaries. Stationary
steering does not move the collision outline.

The displayed approach clearance is the minimum continuous lower bound against real
obstacles, rounded down to 0.1 cm. Planning-boundary clearance is an acceptance
condition, not part of that displayed metric. Distance sums absolute travel;
direction changes count sign changes between moving controls, ignoring stops.
The separate parked margin includes target edges. Neither metric necessarily
bounds the other, because they measure different sets of obstacles and poses.

## Worker and presentation

Each request owns one module worker. Changing preset, parameters, mirrors or the
scenario hash invalidates the request before terminating its worker. Acceptance
requires the request generation, worker identity, echoed canonical scenario key
and exact preset start to match. The last two are inexpensive consistency checks
against divergence between the request and worker's scene-building code; worker
identity and generation enforce cancellation. Worker errors leave the manual simulator usable.
The worker returns only replay-validated commands, states and metrics.

The overlay and ghost both use those validated states directly. The route traces
the rear axle: cyan/solid forward, pink/dashed reverse. A translucent purple car
plays or steps through the steering/direction instructions. Its state, clock and
controls are separate from the user's car, history, first contact and swept
texture. While the demonstration is visible the user's drive is paused. Closing
it clears held input and resumes that drive. R/reset restarts only the ghost;
Space pauses it outside the demonstration buttons; a focused demonstration
button uses Space for normal button activation. Language switching updates text without changing either pose
or the playback position. Scene fitting reserves space for the playback bar.

The controls and metrics use the existing typed English/Spanish catalogs.
Instructions announce discrete steps when paused, not every animated frame.
No route cache, persistence, current-pose replanning, worker pool or new runtime
package is needed.

## Verification boundary

Tests cover all defaults, representative tight/spacious dimensions, both garage
approaches, mirror/kerb/neighbour options, driveway/interior width orderings,
cancellation/stale results, exact connector endpoints, illegal corner crossings
and rejected control replays. The smallest tested parallel and perpendicular
configurations can return `limit`; the finite search does not establish
infeasibility. Browser coverage includes all three engines, English/Spanish
switching and compact viewports. Emulation does not qualify a physical phone.
The unit matrix allows a 60-second search budget for slow test runners; it
checks route validity and representative success, not the product's latency.
Browser tests use the production worker and its normal budgets. Neither suite
establishes a performance guarantee on slower devices.
