# Phase 4 · Progress views — design

**Date:** 2026-08-04
**Issue:** [#5](https://github.com/RichardWhitfield/golf/issues/5) · also answers
[#7](https://github.com/RichardWhitfield/golf/issues/7) (OQ-2) narrowly, for charting scope only
**Status:** approved

Make the accumulated data answer questions. Four views on one new `/progress` route: club path
over time against the target band, drill coverage, feel by arc phase, and where you are in the
three-week arc.

---

## 1. What the data actually says

Designed against the real backfill committed by the Phase 3 workflow
(`public/trackman.json` on `main`, 62 KiB, 86 sessions, 369 club rows, 2025-07-03 → 2026-07-27).
Six findings shape the design.

| Finding | Evidence | Consequence |
|---|---|---|
| **The driver has essentially never been in the band** | 44 driver readings span `−11.53°` to `−0.19°`. Across all 369 rows only 26 sit inside `−2…+2`, and **only 2 readings in 13 months are positive** | The overshoot fault region above `+2°` is a coaching truth with no supporting data. It must still be drawn — but an axis scaled to the data would leave it off screen entirely. Hence a **fixed** domain, not a derived one. |
| **The KPI is trending the wrong way** | Driver `−1.83°` (2025-07-03) → `−8.51°` (2026-07-13) | The page reports this plainly. No flattering window, no smoothing that hides it. |
| **The worst readings carry the smallest `n`** | `−11.53°` on 2026-07-20 is **3 shots**; `−10.4°` is 4 shots. Driver `n` ranges 3–73 | `n` is not decoration. Without it the tail of every series over-reads. Dot area encodes `n`. |
| **Cadence is wildly irregular** | 21 sessions in 2025-07, 2 in 2025-12, **no sessions at all in 2026-01** | The x-axis must be a real date axis. A session-index axis would compress a two-month gap into one step. |
| **A date carries more than one session** | 21 dates have two; 2026-07-22 holds `−6.3°` (n=4) and `−3.18°` (n=5) | Two points can share an x position and would otherwise hide each other. |
| **Club coverage is very uneven** | 4I 48 readings, DRIVER 44, 6I 43 … 50° 9, **60° 1** (a single day, 2025-07-03) | Some panels will be nearly empty. That is shown rather than hidden — see §4. |
| **Drill `03` is never scheduled** | `WEEK` references `01, 02, 04, 05, 06, 07` across all seven days. Pause-at-the-top appears in `drills.ts` but in no day's `drills` | Coverage needs a **third state**. A drill that was never asked for must not render as `0 of 0`, which is visually identical to one asked for six times and skipped — it would name drill 03 the most-avoided drill in the plan, a false finding manufactured by the chart. See D11. |

Two more facts inform the shape:

- **The practice store is empty.** Phase 2 shipped 2026-08-04, the same day as this design. Drill
  coverage and feel-by-phase have **zero** data behind them. Their empty states are not an
  afterthought; they are the first thing that will be seen, and are specified in §7.
- **Every stored reading is `source: 'api'` and carries an `n`.** No hand-typed reading exists yet,
  so the no-`n` rendering path has no live example and must be covered by tests instead.

---

## 2. Scope

In scope — all four bullets of issue #5:

- Club path over time, per club, against the `−2°`/`+2°` band with fault regions **on both sides**.
- Drill coverage — done versus scheduled.
- Feel trend per drill, grouped by arc phase.
- Current position in the three-week arc.

Plus the route and navigation needed to reach them.

Out of scope:

- A `Block` entity (OQ-2, issue #7). This design answers OQ-2 **only** for charting scope — see
  §3 — and deliberately does not introduce block grouping to the data model.
- Course rounds (OQ-6, issue #11), still gated behind Phase 4 shipping.
- Any change to ingest, storage or the plan page.

---

## 3. Decisions

| # | Decision | Why |
|---|---|---|
| **D1** | **Charts are all-time, with the current block shaded on the axis.** | The question worth answering is whether the block is bending a 13-month trend. Scoping to the block alone gives a club-path chart roughly three points. This answers OQ-2 for charting **without** needing a `Block` entity. |
| **D2** | **A fixed shared y-domain of `−14° … +4°`.** | Covers every real reading (`−13.76°` min) with headroom, and keeps a visible strip of the overshoot fault region on screen. A derived domain would move between visits, so two viewings would not be comparable — and would quietly redefine "good" as "better than recent", the exact failure the issue is written to prevent. |
| **D3** | **Connected line through the points, with dots sized by `n`.** | Chosen by the user over dots-only, having been shown that a line crosses the empty January. Dot sizing is kept so shot count is still encoded, as issue #5 requires. |
| **D4** | **Every club with any data gets a panel.** | Chosen over a `≥5` threshold. The 60° wedge's single dot is itself a finding — it says the club has been hit once in 13 months. |
| **D5** | **Driver is a full-width headline panel.** | It is the KPI (OQ-7). The remaining 13 fill the existing `auto-fill`/`minmax()` grid — **no new breakpoint**. |
| **D6** | **Coverage is measured against what the plan scheduled**, not as a raw count. | "Quietly avoided" is only visible against what was asked for. A raw count cannot distinguish a drill scheduled twice from one scheduled six times. |
| **D7** | **Feel is grouped by arc phase, not plotted over time.** | Issue #5: a drill means something different in week 1 than week 3. Three buckets are legible with far less data than a time series needs. |
| **D8** | **Coverage and feel are scoped to the current block; club path is all-time.** Both windows are labelled on screen. | Coverage over 13 months against a plan that started this week would be meaningless. Different windows on one page is acceptable **only** because each states its own. |
| **D9** | **No charting library.** Inline SVG, hand-rolled. | The project has zero runtime dependencies. A library would put a vendor's colour choices inside a design system built on eight tokens. Follows the hero SVG's rule: shapes carry classes, never colour attributes. |
| **D10** | **A reading with no `n` renders as a hollow dashed ring, never a sized dot.** | There is no count to size it by. Faking one would weight a guess as though it were measured — `CLAUDE.md`'s "`n` is absent, never zero" rule, expressed visually. |
| **D11** | **A drill the plan never schedules is reported as "not scheduled", not as `0 of 0`.** | Drill 03 is in `drills.ts` but in no day's `drills`. Rendering it as an empty bar would name it the most-avoided drill in the plan — a false finding produced by the chart. Its logged swings are still counted and shown, so doing it off-plan is visible rather than discarded. |

---

## 4. Domain layer

Four new pure modules under `src/lib/domain/`. No Svelte, no storage, fully unit-tested — the same
seam Phases 2 and 3 used.

### `series.ts`

```ts
export interface PathPoint {
  date: ISODate
  typical: number
  best: number
  n?: number
  /** Index of this session among those sharing its date. Drives the collision nudge. */
  ordinal: number
}

export interface ClubSeries {
  club: Club
  /** Date-ascending. Never empty — a club with no readings produces no series at all. */
  points: PathPoint[]
}

export function clubSeries(sessions: Session[]): ClubSeries[]
```

**Structurally incapable of blending.** It keys by `Club` and never reduces across keys — there is
no code path that could produce a cross-club mean, which is what `CLAUDE.md` requires (OQ-7).
Output is ordered by `compareClubs`, so panels read in bag order.

`ordinal` is computed here rather than in the component: which of two same-date sessions comes
first is a data question, and it must be deterministic across renders.

### `coverage.ts`

```ts
export interface DrillCoverage {
  drillId: DrillId
  /** Times the plan asked for this drill in the window. Zero means never asked (D11). */
  scheduled: number
  /** Times it was actually logged. */
  done: number
  swings: number
  /**
   * `avoided` and `unscheduled` are NOT the same thing and must not render the same way.
   * `unscheduled` means the plan never asked — drill 03 today.
   */
  status: 'covered' | 'partial' | 'avoided' | 'unscheduled'
}

export function drillCoverage(sessions: Session[], from: ISODate, to: ISODate): DrillCoverage[]
```

Walks every date in `[from, to]`, resolves `dayKeyFor(date)` and asks `WEEK[day].drills` what was
scheduled. Counts as done anything appearing in a practice session's `entries` **or** a Trackman
session's `drillsWorked` — Monday's bay work is scheduled drills too (`WEEK.mon.drills` is
`['04','06','02']`), and ignoring it would report Monday's drills as permanently avoided.

`done` is capped at `scheduled` for the bar's *fill*, but the raw counts are both reported, so
doing a drill more often than asked reads as diligence rather than overflowing the bar.

Returns all seven drills in drill order, including those with `scheduled: 0` — the list must never
reorder as data arrives. A drill with `scheduled: 0` is `status: 'unscheduled'` and renders as a
stated "not in the current schedule" rather than an empty bar (D11). Its `swings` are still
counted, so doing drill 03 off-plan shows up rather than vanishing.

### `feel.ts`

```ts
export interface PhaseFeel {
  week: 1 | 2 | 3
  phase: ArcPhase
  /** Null when nothing was logged — never 0, which would read as "felt terrible". */
  mean: number | null
  /** Entries behind `mean`. Zero exactly when `mean` is null. */
  n: number
}

export interface DrillPhaseFeel {
  drillId: DrillId
  /** Always all three phases, in arc order, so rows never reorder as data arrives. */
  phases: PhaseFeel[]
}

export function feelByPhase(sessions: Session[], blockStart: ISODate): DrillPhaseFeel[]
```

Uses `blockPosition()` from `block.ts` to place each session in a week, then averages `feel` per
drill per phase. A phase with nothing logged returns `mean: null`, rendered as "not logged yet" in
words. Returning `0` would be a lie in the drill's own units.

Requires `blockStart`. Without one there are no phases — see §7.

### `scale.ts`

```ts
export const DOMAIN = { min: -14, max: 4 } as const
export const BAND = { min: -2, max: 2 } as const

export function yFor(degrees: number): number
export function xFor(date: ISODate, first: ISODate, last: ISODate): number
export function radiusFor(n: number | undefined): number | null
```

The axis maths, extracted so **every panel is guaranteed the same domain** — shared axes are what
make small multiples comparable, and a per-component copy would drift. `radiusFor` returns `null`
for absent `n`, which is what selects the hollow-ring rendering (D10).

Radius is on a `sqrt` scale, clamped: a 73-shot reading must read heavier than a 3-shot one without
being 24× its area.

`block.ts` is reused as-is for parsing, weekday resolution and phase lookup. **No new date
handling is written** — its UTC-midnight rule already exists precisely so week boundaries survive
daylight saving.

---

## 5. Rendering

### `ClubPathChart.svelte`

One panel, inline SVG with a `viewBox` so it scales without a media query. Draw order, back to
front:

1. **Fault region below `−2°`** and **fault region above `+2°`**, both `--flag-wash`.
2. **The target band** between them, a new `--ball-wash` token.
3. **Zero rule**, hairline `--line`.
4. **Block shading** on the x-axis when `blockStart` falls inside the data range.
5. **The connected line**, `--chalk`.
6. **Dots**, radius from `radiusFor(n)`. A point inside the band fills `--ball`; outside, `--chalk`.
   Absent `n` renders as a hollow dashed ring at a fixed radius.

Colour semantics follow `design.md` §1 exactly: **`--ball` is the goal, `--flag` is the fault.**
Both fault regions are red because overshooting past `+2°` is a fault, not success — the
"don't overcook it" watch-out in `content.md`.

Same-date points are nudged horizontally by `ordinal` so both are visible. The nudge is a few
pixels and is stated in the caption; without it, one of the two readings on 2026-07-22 would be
invisible under the other.

**No colour attributes in the markup.** Every shape carries a class and takes `fill`/`stroke` from
the scoped stylesheet, matching the hero SVG rule in `design.md` §1.

### New token

| Token | Value | Purpose |
|---|---|---|
| `--ball-wash` | `rgba(239,198,75,.10)` | Target-band fill. `--ball` at 10%, the counterpart to the existing `--flag-wash`. |

Not a fourth surface level — a tint of an existing token used for one job, exactly as the other
supporting shades are. Documented in `design.md` §1.

### Other components

- `CoverageBars.svelte` — one row per drill: mono drill number, name, a bar showing `done` filled
  in `--ball` against `scheduled` in `--line`, and the counts in mono.
- `PhaseFeel.svelte` — per drill, three rows (groove / transfer / proof) with mean feel and `n`.
- `ArcPosition.svelte` — week, phase, and day *n* of 21.
- `ProgressView.svelte` under `src/routes/`, composing the four sections with the standard
  `.sec-head` numbering (`01`–`04`).

---

## 6. Route and navigation

`Route` gains `'progress'`; `PATHS` gains `/progress`; `routeFor` recognises it. `SiteNav`'s
`SOON` `<span>` becomes a real `<a>`, and the `.soon`/`.badge` styles are deleted with it.

The `pages-spa-fallback` plugin already generates `dist/404.html` from the built `index.html`, so
the deep link works with **no deploy-workflow change**. The `CNAME` assertion is untouched.

---

## 7. Empty states

The practice store is empty, so these are the states that will actually be seen first. Each is a
stated sentence in the coaching voice, never a blank axis.

| Condition | Behaviour |
|---|---|
| No Trackman sessions | Section 01 states that no readings exist yet and links to the Log view. No empty axes are drawn. |
| No practice sessions | Coverage renders **the full scheduled bars at zero done**. This is a correct and useful reading, not an error — it says the plan asked for these and none were logged. |
| No `blockStart` stored | Sections 03 and 04 say so and offer to set a start date, mirroring what the Today panel already does. Phases do not exist without a block, and inventing one would be a fabricated finding. |
| A club with one reading | Its panel draws that single dot with no line. The caption names how many readings the panel holds. |
| A drill the plan never schedules | Stated as "not in the current schedule" with any logged swings beside it — never an empty bar (D11). |

---

## 8. Accessibility

- Each chart is a `<figure>` with `role="img"` and an `aria-label` stating the trend **in words**,
  plus a visually-hidden table of the underlying numbers. A screen reader gets the data, not the
  word "chart".
- Colour is never the only carrier: band membership is stated in the hidden table, and coverage
  bars carry their counts as text beside them.
- No new interactive controls, so no new hit-target surface. The one new link (nav) inherits the
  existing `44px` rule.
- Any entrance animation reuses the existing `.reveal` class, whose reduced-motion override already
  lives in `app.css` and leaves content fully visible.

---

## 9. Testing

Vitest, domain logic only, matching the existing suite's scope.

**`series.test.ts`** — groups by club and never blends; date-ascending; `ordinal` increments for
same-date sessions and is deterministic; a club with no readings produces no series; bag ordering;
`best` is passed through untouched (it is already "closest to neutral" from ingest, and must never
be recomputed with `Math.max`).

**`coverage.test.ts`** — the denominator comes from the plan, not from the log; Monday's
`drillsWorked` counts as done; a drill done more often than scheduled reports both counts honestly;
all seven drills returned in drill order including `scheduled: 0`; an inverted or malformed date
range returns empty rather than throwing. **Drill 03 is `status: 'unscheduled'`, never `'avoided'`,
and a drill scheduled but never done is `'avoided'`, never `'unscheduled'`** — the two must be
asserted against each other, since conflating them is the failure D11 exists to prevent.

**`feel.test.ts`** — means are per drill **per phase**; a phase with no entries returns `mean: null`
not `0`; sessions outside the block are excluded entirely.

**`scale.test.ts`** — `yFor` is monotonic and maps the domain endpoints exactly; the band maps
inside the domain; `radiusFor(undefined)` returns `null`; radius is clamped at both ends; `xFor`
handles `first === last` without dividing by zero.

`npm run check` and `npm test` both gate the deploy, so a failure here blocks publication.

---

## 10. Done when

- `/progress` renders all four views, deep-links correctly, and the nav badge is gone.
- The driver panel shows the real 13-month series with the band and **both** fault regions.
- Every point's `n` is encoded, and a reading without `n` is visibly distinct.
- With an empty practice store the page is still informative rather than blank.
- `golf.whitfield.life` is verified working after deploy.

---

## 11. Documentation to update in the same commits

- `docs/design.md` — chart components, the `--ball-wash` token, the progress route in Site nav.
- `docs/roadmap.md` — Phase 4 status; OQ-2 answered for charting scope, still open for the data
  model.
- `CLAUDE.md` — the progress route, where the progress domain lives, and the never-blend rule
  restated at the series layer.
