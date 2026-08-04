# Phase 4 · Progress views Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn 13 months of stored Trackman readings and the practice log into four views on a new `/progress` route — per-club club path against the target band, drill coverage, feel by arc phase, and position in the three-week arc.

**Architecture:** Four pure domain modules (`scale.ts`, `series.ts`, `coverage.ts`, `feel.ts`) under `src/lib/domain/` hold every calculation and are unit-tested with no Svelte involved. Components consume them and do nothing but render. Charts are hand-rolled inline SVG — the project has zero runtime dependencies and adding a charting library would put a vendor's colour choices inside a design system built on eight tokens. Every shape carries a class and takes `fill`/`stroke` from its scoped stylesheet, matching the hero SVG rule.

**Tech Stack:** Svelte 5 (runes), Vite 8, TypeScript 6, Vitest 4. **No new dependencies of any kind.**

**Spec:** `docs/superpowers/specs/2026-08-04-phase-4-progress-design.md`
**Issue:** [#5](https://github.com/RichardWhitfield/golf/issues/5)

---

## Global Constraints

Every task's requirements implicitly include this section. These come from `CLAUDE.md`, `docs/design.md` and the spec, and are not negotiable.

**Code**
- **No component may call `localStorage` directly.** Everything goes through `lib/storage/`, reached via `lib/stores/sessions.svelte.ts`.
- **Every repository method is `async`.** *This plan adds no repository methods.*
- **Club path is signed. Negative is out-to-in.** Never store, display, or validate an absolute value. Never range-check one with `Math.abs`.
- **The target is a band (`−2°` to `+2°`), not a maximum.** Overshooting past `+2°` is a fault. **Fault regions on both sides, never a "higher is better" bar.** `best` means closest to neutral — **never `Math.max`**, and this plan never recomputes it.
- **Never blend club path across clubs.** No code path may compute a mean spanning more than one club (OQ-7, issue #14).
- **`n` (shot count) is absent, never zero, on hand-typed readings.** Never fabricate a default and never render an absent `n` as a sized dot.
- **Drill ids `01`–`07` are stable.** Never renumber.
- **`src/lib/domain/drills.ts` is the single source of truth for drill content.** Never restate drill copy in markup.
- **`domain/clubs.ts` is the single source of truth for club names and order.** Order panels with `compareClubs`, never alphabetically.
- **No `schemaVersion` bump and no migration.** This plan reads the stored shape and never writes to it.
- **The app must render when `localStorage` is unavailable.** No new top-level `localStorage` reference; no module-scope `await`.

**Design** (`docs/design.md`)
- **Use the CSS custom properties. Never hardcode a colour.** This plan introduces **exactly one** new token, `--ball-wash` (Task 6), documented in `design.md`.
- **`--ball` (yellow) means the goal. `--flag` (red) means the problem. Never invert.**
- **Data and labels are `'Space Mono', monospace`. Prose is Inter. Headings are Archivo.** Every degree value, shot count, date, ratio and category label is monospaced.
- Three surface levels only: `--bg` → `--panel` → `--card`.
- **One breakpoint: `760px`.** Prefer `clamp()`, `auto-fill`, `minmax()`. Reuse the existing `.grid` class for the club panels — **no new breakpoint**.
- **Every animation needs a `prefers-reduced-motion` override that leaves content visible**, scoped to the component that owns it.
- **Every interactive control needs a `44px` minimum hit target.**
- Borders are `1px solid var(--line)`. **No shadows.**
- **No colour attributes in SVG markup.** Shapes carry classes; colour comes from the scoped stylesheet.

**Where a style rule belongs** (`CLAUDE.md`)
- `app.css` holds tokens, the reset, shared typography, the section scaffold, and classes used by more than one component. Everything else is scoped to its component — **including that component's own `760px` media query.**
- **Never split one element's rules across both layers.** Svelte compiles `.hero` to `.hero.svelte-xxx`, so a scoped base rule outranks a global override and the override silently loses.

**Content**
- British English (`lang="en-GB"`). Second-person, direct, coach-like. Short declaratives.
- **Never soften the finding.** The driver has gone `−1.83°` → `−8.51°` over 13 months. The page reports that.

**Deployment**
- `CNAME` must end up in `dist/`. Don't touch the deploy workflow's assertion.
- Every phase must leave `golf.whitfield.life` working.

**Commits**
- A plain sentence, capitalised, no `feat:`/`fix:` prefix. See `git log`.
- Every commit ends with:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Pbe7egyMfs2jrdQD2gnVQ2
  ```

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/domain/scale.ts` | Axis domain constants and the maths mapping a degree or date to SVG user units. The single source of the shared axes. |
| `src/lib/domain/series.ts` | Trackman sessions → one date-ascending series per club. Structurally cannot blend. |
| `src/lib/domain/coverage.ts` | Drills done versus drills the plan scheduled, with a status that separates "never asked" from "avoided". |
| `src/lib/domain/feel.ts` | Mean feel per drill per arc phase. |
| `src/lib/components/ClubPathChart.svelte` | One club's panel: band, both fault regions, line, `n`-sized dots, hidden data table. |
| `src/lib/components/CoverageBars.svelte` | The seven drills as done-versus-scheduled rows. |
| `src/lib/components/PhaseFeel.svelte` | Feel per drill across groove / transfer / proof. |
| `src/lib/components/ArcPosition.svelte` | Week, phase and day *n* of 21. |
| `src/routes/ProgressView.svelte` | Composes the four sections, owns the empty states. |
| `src/lib/stores/router.svelte.ts` | *Modify* — add the `progress` route. |
| `src/lib/components/SiteNav.svelte` | *Modify* — the `SOON` span becomes a real link. |
| `src/App.svelte` | *Modify* — render `ProgressView`. |
| `src/app.css` | *Modify* — add the `--ball-wash` token. |

Tasks 1–4 are pure and independent of each other. Task 5 makes the route reachable. Tasks 6–9 fill it in, one section each. Task 10 updates the documentation.

---

## Task 1: The shared axis maths

Every panel must share a domain or the small multiples are not comparable. Putting the maths in one tested module is what guarantees that; a per-component copy would drift.

**Files:**
- Create: `src/lib/domain/scale.ts`
- Test: `src/lib/domain/scale.test.ts`

**Interfaces:**
- Consumes: `parseISODate` from `./block`, `ISODate` from `./types`.
- Produces: `DOMAIN`, `BAND`, `CHART`, `yFor(degrees: number): number`, `xFor(date: ISODate, first: ISODate, last: ISODate): number | null`, `radiusFor(n: number | undefined): number | null`, `inBand(degrees: number): boolean`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/domain/scale.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { BAND, CHART, DOMAIN, inBand, radiusFor, xFor, yFor } from './scale'

describe('DOMAIN', () => {
  it('is fixed, and wide enough to hold every real reading', () => {
    // The backfill spans -13.76 to +0.89. A derived domain would move between
    // visits and quietly redefine "good" as "better than recent".
    expect(DOMAIN.min).toBe(-14)
    expect(DOMAIN.max).toBe(4)
  })

  it('keeps the overshoot fault region on screen', () => {
    // No reading has ever exceeded +2, but overshooting is a fault and must be
    // visible as one. There is real headroom above the band.
    expect(DOMAIN.max).toBeGreaterThan(BAND.max)
    expect(DOMAIN.min).toBeLessThan(BAND.min)
  })

  it('is a band centred on zero, not a maximum', () => {
    expect(BAND.min).toBe(-2)
    expect(BAND.max).toBe(2)
  })
})

describe('yFor', () => {
  it('maps the domain endpoints exactly onto the plot area', () => {
    expect(yFor(DOMAIN.max)).toBeCloseTo(CHART.padT)
    expect(yFor(DOMAIN.min)).toBeCloseTo(CHART.h - CHART.padB)
  })

  it('puts a larger degree value higher up the chart', () => {
    // SVG y grows downward, so "higher" means a smaller number.
    expect(yFor(0)).toBeLessThan(yFor(-8))
    expect(yFor(-2)).toBeLessThan(yFor(-10))
  })

  it('clamps a reading outside the domain rather than drawing off-panel', () => {
    expect(yFor(-40)).toBeCloseTo(yFor(DOMAIN.min))
    expect(yFor(40)).toBeCloseTo(yFor(DOMAIN.max))
  })

  it('places the whole band inside the plot area', () => {
    expect(yFor(BAND.max)).toBeGreaterThan(CHART.padT)
    expect(yFor(BAND.min)).toBeLessThan(CHART.h - CHART.padB)
  })
})

describe('xFor', () => {
  it('maps the first and last dates onto the plot edges', () => {
    expect(xFor('2025-07-03', '2025-07-03', '2026-07-27')).toBeCloseTo(CHART.padL)
    expect(xFor('2026-07-27', '2025-07-03', '2026-07-27')).toBeCloseTo(CHART.w - CHART.padR)
  })

  it('spaces points by real elapsed time, not by session index', () => {
    // Jan 2026 has no sessions at all. A session-index axis would compress that
    // two-month gap into one step.
    const dec = xFor('2025-12-06', '2025-07-03', '2026-07-27')!
    const feb = xFor('2026-02-02', '2025-07-03', '2026-07-27')!
    const feb16 = xFor('2026-02-16', '2025-07-03', '2026-07-27')!
    expect(feb - dec).toBeGreaterThan(feb16 - feb)
  })

  it('centres a single-date series instead of dividing by zero', () => {
    const x = xFor('2025-07-03', '2025-07-03', '2025-07-03')
    expect(Number.isFinite(x!)).toBe(true)
    expect(x).toBeCloseTo(CHART.padL + (CHART.w - CHART.padL - CHART.padR) / 2)
  })

  it('returns null for a malformed date rather than NaN', () => {
    expect(xFor('nope', '2025-07-03', '2026-07-27')).toBeNull()
    expect(xFor('2025-07-03', 'nope', '2026-07-27')).toBeNull()
    expect(xFor('2025-07-03', '2025-07-03', 'nope')).toBeNull()
  })
})

describe('radiusFor', () => {
  it('returns null when there is no shot count', () => {
    // A hand-typed reading has no n. There is nothing to size it by, and
    // inventing one would weight a guess as though it were measured.
    expect(radiusFor(undefined)).toBeNull()
  })

  it('makes a well-measured reading heavier than a thin one', () => {
    // -11.53 on 2026-07-20 is three shots. It must not shout as loudly as a
    // 73-shot reading.
    expect(radiusFor(73)!).toBeGreaterThan(radiusFor(3)!)
  })

  it('compresses the range so 73 shots is not 24x the area of 3', () => {
    expect(radiusFor(73)! / radiusFor(3)!).toBeLessThan(3)
  })

  it('clamps at both ends so no dot vanishes or swamps the panel', () => {
    expect(radiusFor(1)!).toBeGreaterThanOrEqual(2)
    expect(radiusFor(10_000)!).toBeLessThanOrEqual(6.5)
  })

  it('treats a nonsensical count as absent rather than trusting it', () => {
    expect(radiusFor(0)).toBeNull()
    expect(radiusFor(-5)).toBeNull()
    expect(radiusFor(Number.NaN)).toBeNull()
  })
})

describe('inBand', () => {
  it('includes both edges', () => {
    expect(inBand(-2)).toBe(true)
    expect(inBand(2)).toBe(true)
    expect(inBand(0)).toBe(true)
  })

  it('excludes a fault on either side', () => {
    // Overshooting is a fault, not success. Both of these are outside.
    expect(inBand(-2.01)).toBe(false)
    expect(inBand(2.01)).toBe(false)
    expect(inBand(-8.51)).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- scale`
Expected: FAIL — `Failed to resolve import "./scale"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/domain/scale.ts`:

```ts
import type { ISODate } from './types'
import { parseISODate } from './block'

/**
 * The shared y-domain, in signed degrees. **Fixed, never derived from the data.**
 *
 * Covers every reading in the 13-month backfill (`-13.76` min) with headroom, and keeps a
 * visible strip above `BAND.max` so overshooting past `+2°` is always on screen as a fault.
 * A domain fitted to the data would move between visits — two viewings of the same page would
 * not be comparable, and "good" would quietly come to mean "better than recent" rather than
 * "inside the band".
 */
export const DOMAIN = { min: -14, max: 4 } as const

/**
 * The coaching target. **A band, not a maximum** — `+5°` is worse than `+1°`.
 *
 * Shared across every club rather than derived per club: deriving one would turn "where you
 * should be" into "where you have been" (OQ-7).
 */
export const BAND = { min: -2, max: 2 } as const

/** SVG user units. Panels scale via `viewBox`, so these never need a media query. */
export const CHART = { w: 300, h: 140, padL: 30, padR: 8, padT: 8, padB: 18 } as const

const PLOT_W = CHART.w - CHART.padL - CHART.padR
const PLOT_H = CHART.h - CHART.padT - CHART.padB

/** Dot radius bounds. The floor keeps a 3-shot reading visible; the ceiling stops a 73-shot
 *  one swamping the panel. */
const R_MIN = 2
const R_MAX = 6.5
/** Where the radius scale saturates. The largest real `n` in the backfill is 73. */
const N_FULL = 75

/** Degrees → SVG y. Clamped, so a wild reading draws at the edge rather than off-panel. */
export function yFor(degrees: number): number {
  const clamped = Math.min(DOMAIN.max, Math.max(DOMAIN.min, degrees))
  return CHART.padT + ((DOMAIN.max - clamped) / (DOMAIN.max - DOMAIN.min)) * PLOT_H
}

/**
 * Date → SVG x, spaced by **real elapsed time**. `null` if any date is malformed.
 *
 * Session index would be wrong: there are 21 sessions in July 2025 and none at all in January
 * 2026, and an index axis would render that two-month silence as a single step.
 */
export function xFor(date: ISODate, first: ISODate, last: ISODate): number | null {
  const at = parseISODate(date)
  const from = parseISODate(first)
  const to = parseISODate(last)
  if (at === null || from === null || to === null) return null
  // A single-date series has no span to divide by. Centre it.
  if (to <= from) return CHART.padL + PLOT_W / 2
  const ratio = Math.min(1, Math.max(0, (at - from) / (to - from)))
  return CHART.padL + ratio * PLOT_W
}

/**
 * Shot count → dot radius, or `null` when there is no count.
 *
 * `null` is the signal to render a hollow ring instead of a filled dot — a hand-typed reading
 * has no `n`, and sizing it would weight a guess as though it were measured (`CLAUDE.md`).
 * The `sqrt` keeps the range honest: 73 shots reads heavier than 3, not 24 times heavier.
 */
export function radiusFor(n: number | undefined): number | null {
  if (n === undefined || !Number.isFinite(n) || n <= 0) return null
  const t = Math.min(1, Math.sqrt(n) / Math.sqrt(N_FULL))
  return R_MIN + t * (R_MAX - R_MIN)
}

/** Inside the target band, inclusive of both edges. **Never `Math.abs` on a signed path** —
 *  that would accept a sign flip, the one error that matters most. */
export function inBand(degrees: number): boolean {
  return degrees >= BAND.min && degrees <= BAND.max
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- scale`
Expected: PASS, all assertions green.

- [ ] **Step 5: Type-check**

Run: `npm run check`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/domain/scale.ts src/lib/domain/scale.test.ts
git commit -m "$(cat <<'EOF'
Fix the club-path axis so panels stay comparable

The y-domain is a constant, not something derived from the readings. A
fitted domain would shift as data arrives, so two visits to the page
would not be comparable, and it would redefine "good" as "better than
recent" rather than "inside the band".

The domain runs past +2 deliberately. Nothing has ever overshot, but
overshooting is a fault and the region has to be on screen to say so.

radiusFor returns null rather than a number when there is no shot
count, which is what selects the hollow-ring rendering later. A
hand-typed reading has no n and must never be sized as though measured.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Pbe7egyMfs2jrdQD2gnVQ2
EOF
)"
```

---

## Task 2: Club path series

**Files:**
- Create: `src/lib/domain/series.ts`
- Test: `src/lib/domain/series.test.ts`

**Interfaces:**
- Consumes: `Session`, `ISODate`, `isTrackman` from `./types`; `Club`, `compareClubs` from `./clubs`.
- Produces: `PathPoint` (`{ date: ISODate; typical: number; best: number; n?: number; ordinal: number }`), `ClubSeries` (`{ club: Club; points: PathPoint[] }`), `clubSeries(sessions: Session[]): ClubSeries[]`, `dateBounds(series: ClubSeries[]): { first: ISODate; last: ISODate } | null`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/domain/series.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { clubSeries, dateBounds } from './series'
import type { PracticeSession, Session, TrackmanSession } from './types'

function tm(id: string, date: string, clubs: TrackmanSession['clubs']): TrackmanSession {
  return { id, type: 'trackman', date, clubs, source: 'api' }
}

describe('clubSeries', () => {
  it('keeps every club apart and never blends them', () => {
    // OQ-7: a mean spanning clubs tracks club selection, not swing change.
    const series = clubSeries([
      tm('a', '2026-07-13', [
        { club: 'DRIVER', typical: -8.51, best: -5.3, n: 14 },
        { club: 'IRON7', typical: -2.1, best: -0.4, n: 20 },
      ]),
    ])
    expect(series).toHaveLength(2)
    const driver = series.find((s) => s.club === 'DRIVER')!
    const iron = series.find((s) => s.club === 'IRON7')!
    expect(driver.points[0].typical).toBe(-8.51)
    expect(iron.points[0].typical).toBe(-2.1)
  })

  it('orders panels in bag order, never alphabetically', () => {
    const series = clubSeries([
      tm('a', '2026-07-13', [
        { club: 'IRON7', typical: -2, best: -1, n: 5 },
        { club: 'DRIVER', typical: -8, best: -4, n: 5 },
        { club: 'WOOD3', typical: -5, best: -2, n: 5 },
      ]),
    ])
    expect(series.map((s) => s.club)).toEqual(['DRIVER', 'WOOD3', 'IRON7'])
  })

  it('orders each club by date, oldest first', () => {
    const series = clubSeries([
      tm('b', '2026-07-13', [{ club: 'DRIVER', typical: -8.51, best: -5.3, n: 14 }]),
      tm('a', '2025-07-03', [{ club: 'DRIVER', typical: -1.83, best: 0.1, n: 14 }]),
    ])
    expect(series[0].points.map((p) => p.date)).toEqual(['2025-07-03', '2026-07-13'])
  })

  it('gives two sessions on one date distinct, deterministic ordinals', () => {
    // 21 dates in the backfill carry two sessions. Without an ordinal the dots
    // would land on the same x and one would hide under the other.
    const forwards = clubSeries([
      tm('a', '2026-07-22', [{ club: 'DRIVER', typical: -6.3, best: -3.3, n: 4 }]),
      tm('b', '2026-07-22', [{ club: 'DRIVER', typical: -3.18, best: -1.5, n: 5 }]),
    ])
    const backwards = clubSeries([
      tm('b', '2026-07-22', [{ club: 'DRIVER', typical: -3.18, best: -1.5, n: 5 }]),
      tm('a', '2026-07-22', [{ club: 'DRIVER', typical: -6.3, best: -3.3, n: 4 }]),
    ])
    expect(forwards[0].points.map((p) => p.ordinal)).toEqual([0, 1])
    // Same answer regardless of the order they arrived in.
    expect(backwards[0].points).toEqual(forwards[0].points)
  })

  it('passes best through untouched', () => {
    // best is already "closest to neutral" from ingest. Recomputing it with
    // Math.max would report the worst overshoot as the best strike.
    const series = clubSeries([
      tm('a', '2026-07-13', [{ club: 'DRIVER', typical: -8.51, best: -5.3, n: 14 }]),
    ])
    expect(series[0].points[0].best).toBe(-5.3)
  })

  it('omits n entirely when the reading has none', () => {
    const series = clubSeries([
      tm('a', '2026-07-13', [{ club: 'DRIVER', typical: -6, best: -2 }]),
    ])
    expect(series[0].points[0].n).toBeUndefined()
    expect('n' in series[0].points[0]).toBe(false)
  })

  it('ignores practice sessions', () => {
    const practice: PracticeSession = {
      id: 'p',
      type: 'practice',
      date: '2026-07-14',
      location: 'home',
      entries: [{ drillId: '01', swings: 10, feel: 4 }],
    }
    expect(clubSeries([practice])).toEqual([])
  })

  it('produces no series at all for a club with no readings', () => {
    const series = clubSeries([
      tm('a', '2026-07-13', [{ club: 'DRIVER', typical: -8, best: -4, n: 9 }]),
    ])
    expect(series.map((s) => s.club)).toEqual(['DRIVER'])
  })

  it('returns nothing for an empty store', () => {
    expect(clubSeries([])).toEqual([])
  })
})

describe('dateBounds', () => {
  it('spans every club, so all panels share one x axis', () => {
    const sessions: Session[] = [
      tm('a', '2025-07-03', [{ club: 'IRON6', typical: -4.55, best: -1, n: 23 }]),
      tm('b', '2026-07-27', [{ club: 'IRON7', typical: -3, best: -1, n: 8 }]),
    ]
    expect(dateBounds(clubSeries(sessions))).toEqual({
      first: '2025-07-03',
      last: '2026-07-27',
    })
  })

  it('returns null when there is nothing to bound', () => {
    expect(dateBounds([])).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- series`
Expected: FAIL — `Failed to resolve import "./series"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/domain/series.ts`:

```ts
import { isTrackman, type ISODate, type Session } from './types'
import { compareClubs, type Club } from './clubs'

/** One club's reading from one session. */
export interface PathPoint {
  date: ISODate
  /** Signed degrees, the session mean for this club. Negative is out-to-in. */
  typical: number
  /** Signed degrees, the stroke closest to neutral. Passed through from storage, never
   *  recomputed — `Math.max` here would report the worst overshoot as the best strike. */
  best: number
  /** Measured strokes. **Absent, never zero,** on a hand-typed reading. */
  n?: number
  /**
   * Which session this was among those sharing its date, from 0.
   *
   * 21 dates in the backfill carry two sessions. Computed here rather than in the component
   * because "which came first" is a data question and must be identical on every render.
   */
  ordinal: number
}

export interface ClubSeries {
  club: Club
  /** Date-ascending. Never empty — a club with no readings produces no series at all. */
  points: PathPoint[]
}

/**
 * Trackman sessions → one series per club, in bag order.
 *
 * **Structurally incapable of blending.** It keys by `Club` and never reduces across keys, so
 * there is no code path that could produce a cross-club mean (OQ-7, issue #14).
 */
export function clubSeries(sessions: Session[]): ClubSeries[] {
  const ordered = sessions
    .filter(isTrackman)
    .slice()
    // Tie-break on id so two sessions on one date always come out the same way round,
    // whatever order the store handed them over in.
    .sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date < b.date ? -1 : 1))

  const seenOnDate = new Map<ISODate, number>()
  const byClub = new Map<Club, PathPoint[]>()

  for (const session of ordered) {
    const ordinal = seenOnDate.get(session.date) ?? 0
    seenOnDate.set(session.date, ordinal + 1)

    for (const row of session.clubs) {
      const point: PathPoint = {
        date: session.date,
        typical: row.typical,
        best: row.best,
        ordinal,
      }
      // Assigned conditionally: an absent n must stay absent, never become 0.
      if (row.n !== undefined) point.n = row.n

      const points = byClub.get(row.club)
      if (points) points.push(point)
      else byClub.set(row.club, [point])
    }
  }

  return [...byClub]
    .map(([club, points]) => ({ club, points }))
    .sort((a, b) => compareClubs(a.club, b.club))
}

/** The overall date span. Every panel is drawn against this, which is what makes the small
 *  multiples share an x axis and therefore be comparable. */
export function dateBounds(series: ClubSeries[]): { first: ISODate; last: ISODate } | null {
  let first: ISODate | null = null
  let last: ISODate | null = null
  for (const s of series) {
    for (const p of s.points) {
      if (first === null || p.date < first) first = p.date
      if (last === null || p.date > last) last = p.date
    }
  }
  return first !== null && last !== null ? { first, last } : null
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- series`
Expected: PASS.

- [ ] **Step 5: Type-check**

Run: `npm run check`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/domain/series.ts src/lib/domain/series.test.ts
git commit -m "$(cat <<'EOF'
Split Trackman readings into one series per club

Keyed by club and never reduced across keys, so there is no code path
that could produce a cross-club mean. That is the OQ-7 rule expressed
in the shape of the module rather than in a comment.

Points carry an ordinal because 21 dates in the backfill hold two
sessions. Without it both dots land on the same x and one hides under
the other. It is computed here, with an id tie-break, so the answer
does not depend on the order the store returned.

best is passed straight through. It already means "closest to
neutral"; recomputing it would risk reporting the worst overshoot as
the best strike.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Pbe7egyMfs2jrdQD2gnVQ2
EOF
)"
```

---

## Task 3: Drill coverage

The subtle part is D11. Drill `03` (pause-at-the-top) exists in `drills.ts` but appears in **no** day's `drills` in `plan.ts`. A bare count would render it `0 of 0` — visually identical to a drill asked for six times and skipped — and name it the most avoided drill in the plan. That is a false finding manufactured by the chart, so `status` separates the two cases.

**Files:**
- Create: `src/lib/domain/coverage.ts`
- Test: `src/lib/domain/coverage.test.ts`

**Interfaces:**
- Consumes: `Session`, `ISODate`, `DrillId`, `isPractice`, `isTrackman` from `./types`; `DRILLS` from `./drills`; `WEEK` from `./plan`; `dayKeyFor`, `daysBetween`, `parseISODate` from `./block`.
- Produces: `CoverageStatus` (`'covered' | 'partial' | 'avoided' | 'unscheduled'`), `DrillCoverage` (`{ drillId: DrillId; scheduled: number; done: number; swings: number; status: CoverageStatus }`), `drillCoverage(sessions: Session[], from: ISODate, to: ISODate): DrillCoverage[]`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/domain/coverage.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { drillCoverage } from './coverage'
import type { PracticeSession, Session, TrackmanSession } from './types'

function practice(id: string, date: string, entries: PracticeSession['entries']): PracticeSession {
  return { id, type: 'practice', date, location: 'home', entries }
}

function find(rows: ReturnType<typeof drillCoverage>, drillId: string) {
  return rows.find((r) => r.drillId === drillId)!
}

describe('drillCoverage', () => {
  it('takes the denominator from the plan, not from the log', () => {
    // Wed schedules 01 and 04. Nothing was logged, so 01 was asked for once
    // and skipped — which is only visible because the plan supplied the 1.
    const rows = drillCoverage([], '2026-08-05', '2026-08-05')
    expect(find(rows, '01').scheduled).toBe(1)
    expect(find(rows, '01').done).toBe(0)
  })

  it('separates "never asked for" from "asked and skipped"', () => {
    // THE POINT OF THIS MODULE. Drill 03 appears in no day's schedule, so it
    // computes to 0 of 0 — exactly like a drill asked for and avoided. Render
    // them alike and 03 becomes the most-avoided drill in the plan, which is
    // false and produced entirely by the chart.
    const rows = drillCoverage([], '2026-08-05', '2026-08-05')
    expect(find(rows, '03').status).toBe('unscheduled')
    expect(find(rows, '03').scheduled).toBe(0)
    expect(find(rows, '01').status).toBe('avoided')
    expect(find(rows, '01').scheduled).toBeGreaterThan(0)
  })

  it('counts a drill as done when it was logged', () => {
    const rows = drillCoverage(
      [practice('p', '2026-08-05', [{ drillId: '01', swings: 12, feel: 4 }])],
      '2026-08-05',
      '2026-08-05',
    )
    expect(find(rows, '01')).toMatchObject({ scheduled: 1, done: 1, swings: 12, status: 'covered' })
  })

  it("counts Monday's bay work, so scheduled bay drills are not reported as avoided", () => {
    // WEEK.mon schedules 04, 06 and 02, and those are worked on the Trackman.
    // Ignoring drillsWorked would mark them permanently avoided.
    const bay: TrackmanSession = {
      id: 't',
      type: 'trackman',
      date: '2026-08-03',
      clubs: [{ club: 'DRIVER', typical: -8, best: -4, n: 12 }],
      drillsWorked: ['04', '06'],
      source: 'manual',
    }
    const rows = drillCoverage([bay], '2026-08-03', '2026-08-03')
    expect(find(rows, '04').done).toBe(1)
    expect(find(rows, '06').done).toBe(1)
    expect(find(rows, '02').status).toBe('avoided')
  })

  it('reports both counts honestly when a drill is done more often than asked', () => {
    // Diligence, not an error. The bar must not overflow, but the numbers stay true.
    const rows = drillCoverage(
      [
        practice('a', '2026-08-05', [{ drillId: '01', swings: 10, feel: 4 }]),
        practice('b', '2026-08-06', [{ drillId: '01', swings: 8, feel: 3 }]),
      ],
      '2026-08-05',
      '2026-08-06',
    )
    // Wed schedules 01; Thu does not.
    expect(find(rows, '01')).toMatchObject({ scheduled: 1, done: 2, swings: 18, status: 'covered' })
  })

  it('marks a partly-done drill as partial', () => {
    const rows = drillCoverage(
      [practice('a', '2026-08-05', [{ drillId: '04', swings: 10, feel: 4 }])],
      '2026-08-05',
      '2026-08-07',
    )
    // Wed and Fri both schedule 04; only Wednesday was logged.
    expect(find(rows, '04').scheduled).toBe(2)
    expect(find(rows, '04').done).toBe(1)
    expect(find(rows, '04').status).toBe('partial')
  })

  it('returns all seven drills in drill order, so rows never reorder', () => {
    const rows = drillCoverage([], '2026-08-05', '2026-08-11')
    expect(rows.map((r) => r.drillId)).toEqual(['01', '02', '03', '04', '05', '06', '07'])
  })

  it('excludes sessions outside the window', () => {
    const rows = drillCoverage(
      [practice('old', '2026-07-01', [{ drillId: '01', swings: 10, feel: 5 }])],
      '2026-08-05',
      '2026-08-05',
    )
    expect(find(rows, '01').done).toBe(0)
    expect(find(rows, '01').swings).toBe(0)
  })

  it('returns nothing for an inverted or malformed window rather than throwing', () => {
    expect(drillCoverage([], '2026-08-11', '2026-08-05')).toEqual([])
    expect(drillCoverage([], 'nope', '2026-08-05')).toEqual([])
    expect(drillCoverage([], '2026-08-05', 'nope')).toEqual([])
  })

  it('still counts swings for a drill the plan never asked for', () => {
    // Doing 03 off-plan is a real thing you did. It must not vanish.
    const rows = drillCoverage(
      [practice('a', '2026-08-05', [{ drillId: '03', swings: 10, feel: 4 }])],
      '2026-08-05',
      '2026-08-05',
    )
    expect(find(rows, '03')).toMatchObject({ scheduled: 0, done: 1, swings: 10, status: 'unscheduled' })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- coverage`
Expected: FAIL — `Failed to resolve import "./coverage"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/domain/coverage.ts`:

```ts
import { isPractice, isTrackman, type DrillId, type ISODate, type Session } from './types'
import { DRILLS } from './drills'
import { WEEK } from './plan'
import { dayKeyFor, daysBetween, parseISODate } from './block'

/**
 * `avoided` and `unscheduled` are **not** the same thing and must never render alike.
 *
 * Drill `03` appears in `drills.ts` but in no day's schedule, so it computes to `0 of 0` —
 * identical to a drill asked for six times and skipped. Conflating them would name
 * pause-at-the-top the most avoided drill in the plan: a false finding produced by the chart
 * rather than by the practice.
 */
export type CoverageStatus = 'covered' | 'partial' | 'avoided' | 'unscheduled'

export interface DrillCoverage {
  drillId: DrillId
  /** Times the plan asked for this drill in the window. Zero means never asked. */
  scheduled: number
  /** Times it was actually logged. May exceed `scheduled` — that is diligence, not an error. */
  done: number
  /** Total swings logged. Counted even when the drill was never scheduled. */
  swings: number
  status: CoverageStatus
}

const DAY_MS = 86_400_000

function statusFor(scheduled: number, done: number): CoverageStatus {
  if (scheduled === 0) return 'unscheduled'
  if (done === 0) return 'avoided'
  return done >= scheduled ? 'covered' : 'partial'
}

/**
 * What the plan asked for against what was logged, over `[from, to]` inclusive.
 *
 * Avoidance is only visible against the schedule: a raw count cannot tell a drill asked for
 * twice from one asked for six times. An inverted or malformed window returns empty rather
 * than throwing — the caller is a render path.
 */
export function drillCoverage(sessions: Session[], from: ISODate, to: ISODate): DrillCoverage[] {
  const span = daysBetween(from, to)
  const start = parseISODate(from)
  if (span === null || span < 0 || start === null) return []

  const scheduled = new Map<DrillId, number>()
  for (let offset = 0; offset <= span; offset++) {
    const date = new Date(start + offset * DAY_MS).toISOString().slice(0, 10)
    const day = dayKeyFor(date)
    if (day === null) continue
    for (const drillId of WEEK[day].drills) {
      scheduled.set(drillId, (scheduled.get(drillId) ?? 0) + 1)
    }
  }

  const done = new Map<DrillId, number>()
  const swings = new Map<DrillId, number>()
  const bump = (id: DrillId, count: number) => {
    done.set(id, (done.get(id) ?? 0) + 1)
    swings.set(id, (swings.get(id) ?? 0) + count)
  }

  for (const session of sessions) {
    if (session.date < from || session.date > to) continue
    if (isPractice(session)) {
      for (const entry of session.entries) bump(entry.drillId, entry.swings)
    } else if (isTrackman(session)) {
      // Monday's bay work is scheduled drill work too. Ignoring it would report
      // WEEK.mon's drills as permanently avoided. A Trackman session records no
      // swing count, so it adds to `done` without adding to `swings`.
      for (const drillId of session.drillsWorked ?? []) bump(drillId, 0)
    }
  }

  return DRILLS.map((drill) => {
    const s = scheduled.get(drill.id) ?? 0
    const d = done.get(drill.id) ?? 0
    return {
      drillId: drill.id,
      scheduled: s,
      done: d,
      swings: swings.get(drill.id) ?? 0,
      status: statusFor(s, d),
    }
  })
}
```

**Note on the date walk:** `parseISODate` returns UTC midnight and the loop adds whole UTC days, so `toISOString().slice(0, 10)` round-trips exactly. This is the same UTC-midnight discipline `block.ts` already uses — local-midnight arithmetic is 23 or 25 hours across a daylight-saving change and would skip or repeat a day.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- coverage`
Expected: PASS.

- [ ] **Step 5: Type-check**

Run: `npm run check`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/domain/coverage.ts src/lib/domain/coverage.test.ts
git commit -m "$(cat <<'EOF'
Measure drill coverage against what the plan asked for

Avoidance is only visible against the schedule. A raw count cannot
tell a drill asked for twice from one asked for six times, so the
denominator comes from WEEK rather than from the log.

Coverage carries a status, not just counts, because drill 03 appears
in no day's schedule and so computes to 0 of 0 — indistinguishable
from a drill asked for six times and skipped. Rendering those alike
would name pause-at-the-top the most avoided drill in the plan, a
finding produced by the chart rather than by the practice. Its swings
are still counted, so doing it off-plan stays visible.

Monday's drillsWorked counts as done. WEEK.mon schedules 04, 06 and
02 and those are worked in the bay; ignoring them would report the
Monday drills as permanently avoided.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Pbe7egyMfs2jrdQD2gnVQ2
EOF
)"
```

---

## Task 4: Feel by arc phase

**Files:**
- Create: `src/lib/domain/feel.ts`
- Test: `src/lib/domain/feel.test.ts`

**Interfaces:**
- Consumes: `Session`, `ISODate`, `DrillId`, `ArcPhase`, `isPractice` from `./types`; `DRILLS` from `./drills`; `ARC` from `./plan`; `blockPosition` from `./block`.
- Produces: `PhaseFeel` (`{ week: 1 | 2 | 3; phase: ArcPhase; mean: number | null; n: number }`), `DrillPhaseFeel` (`{ drillId: DrillId; phases: PhaseFeel[] }`), `feelByPhase(sessions: Session[], blockStart: ISODate): DrillPhaseFeel[]`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/domain/feel.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { feelByPhase } from './feel'
import type { DrillId, Feel, PracticeSession, TrackmanSession } from './types'

const START = '2026-08-03' // a Monday

function practice(id: string, date: string, drillId: DrillId, feel: Feel): PracticeSession {
  return {
    id,
    type: 'practice',
    date,
    location: 'home',
    entries: [{ drillId, swings: 10, feel }],
  }
}

function find(rows: ReturnType<typeof feelByPhase>, drillId: DrillId) {
  return rows.find((r) => r.drillId === drillId)!
}

describe('feelByPhase', () => {
  it('averages feel per drill within each phase', () => {
    const rows = feelByPhase(
      [
        practice('a', '2026-08-04', '01', 3), // week 1
        practice('b', '2026-08-05', '01', 5), // week 1
        practice('c', '2026-08-12', '01', 4), // week 2
      ],
      START,
    )
    const groove = find(rows, '01').phases[0]
    const transfer = find(rows, '01').phases[1]
    expect(groove).toMatchObject({ week: 1, mean: 4, n: 2 })
    expect(transfer).toMatchObject({ week: 2, mean: 4, n: 1 })
  })

  it('reports an unlogged phase as null, never as zero', () => {
    // Zero would read as "felt terrible" in the drill's own 1-5 units. It has
    // to be absent, and rendered in words.
    const rows = feelByPhase([practice('a', '2026-08-04', '01', 4)], START)
    const [groove, transfer, proof] = find(rows, '01').phases
    expect(groove.mean).toBe(4)
    expect(transfer.mean).toBeNull()
    expect(transfer.n).toBe(0)
    expect(proof.mean).toBeNull()
  })

  it('excludes sessions outside the three-week block entirely', () => {
    const rows = feelByPhase(
      [
        practice('before', '2026-08-02', '01', 5), // the day before the block
        practice('after', '2026-08-24', '01', 5), // day 22
      ],
      START,
    )
    expect(find(rows, '01').phases.every((p) => p.mean === null)).toBe(true)
  })

  it('always returns all seven drills and all three phases, in order', () => {
    const rows = feelByPhase([], START)
    expect(rows.map((r) => r.drillId)).toEqual(['01', '02', '03', '04', '05', '06', '07'])
    expect(rows[0].phases.map((p) => p.week)).toEqual([1, 2, 3])
  })

  it('carries the arc phase so the label is never restated in markup', () => {
    const rows = feelByPhase([], START)
    expect(rows[0].phases[0].phase.title).toBe('Groove the feel')
    expect(rows[0].phases[2].phase.title).toBe('Proof it')
  })

  it('ignores Trackman sessions, which carry no feel', () => {
    const bay: TrackmanSession = {
      id: 't',
      type: 'trackman',
      date: '2026-08-03',
      clubs: [{ club: 'DRIVER', typical: -8, best: -4, n: 12 }],
      drillsWorked: ['04'],
      source: 'api',
    }
    const rows = feelByPhase([bay], START)
    expect(find(rows, '04').phases.every((p) => p.n === 0)).toBe(true)
  })

  it('rounds a mean to one decimal so a label never runs to six figures', () => {
    const rows = feelByPhase(
      [
        practice('a', '2026-08-04', '01', 3),
        practice('b', '2026-08-05', '01', 4),
        practice('c', '2026-08-06', '01', 4),
      ],
      START,
    )
    expect(find(rows, '01').phases[0].mean).toBe(3.7)
  })

  it('returns nothing for a malformed block start', () => {
    expect(feelByPhase([practice('a', '2026-08-04', '01', 4)], 'nope')).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- feel`
Expected: FAIL — `Failed to resolve import "./feel"`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/domain/feel.ts`:

```ts
import { isPractice, type ArcPhase, type DrillId, type ISODate, type Session } from './types'
import { DRILLS } from './drills'
import { ARC } from './plan'
import { blockPosition, parseISODate } from './block'

export interface PhaseFeel {
  week: 1 | 2 | 3
  /** Carried through from `ARC` so no component restates the phase title. */
  phase: ArcPhase
  /** **Null when nothing was logged — never 0**, which would read as "felt terrible" in the
   *  drill's own 1–5 units. */
  mean: number | null
  /** Entries behind `mean`. Zero exactly when `mean` is null. */
  n: number
}

export interface DrillPhaseFeel {
  drillId: DrillId
  /** Always all three phases, in arc order, so rows never reorder as data arrives. */
  phases: PhaseFeel[]
}

const WEEKS: (1 | 2 | 3)[] = [1, 2, 3]

/**
 * Mean feel per drill per arc phase.
 *
 * Grouped by phase rather than plotted over time because a drill means something different in
 * week 1 (groove) than week 3 (proof) — issue #5. Three buckets are also legible with far less
 * data than a time series needs, which matters when the log holds a handful of sessions.
 */
export function feelByPhase(sessions: Session[], blockStart: ISODate): DrillPhaseFeel[] {
  if (parseISODate(blockStart) === null) return []

  const sums = new Map<string, { total: number; n: number }>()
  const key = (drillId: DrillId, week: number) => `${drillId}:${week}`

  for (const session of sessions) {
    if (!isPractice(session)) continue
    // Outside the block there is no phase. A session from before the start belongs to
    // nothing, and inventing a bucket for it would be a fabricated finding.
    const position = blockPosition(blockStart, session.date)
    if (position === null) continue

    for (const entry of session.entries) {
      const k = key(entry.drillId, position.week)
      const acc = sums.get(k) ?? { total: 0, n: 0 }
      acc.total += entry.feel
      acc.n += 1
      sums.set(k, acc)
    }
  }

  return DRILLS.map((drill) => ({
    drillId: drill.id,
    phases: WEEKS.map((week) => {
      const acc = sums.get(key(drill.id, week))
      return {
        week,
        phase: ARC[week - 1],
        mean: acc && acc.n > 0 ? Math.round((acc.total / acc.n) * 10) / 10 : null,
        n: acc?.n ?? 0,
      }
    }),
  }))
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- feel`
Expected: PASS.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: PASS — Tasks 1–4 plus the existing suite.

- [ ] **Step 6: Commit**

```bash
git add src/lib/domain/feel.ts src/lib/domain/feel.test.ts
git commit -m "$(cat <<'EOF'
Group feel by arc phase rather than by date

A drill means something different in week one than in week three, so a
flat time series across the block answers the wrong question. Three
buckets are also readable with a handful of sessions, which is what
the log will actually hold for a while.

A phase with nothing logged reports null, not zero. Zero is a real
value in the drill's own 1-5 units and would read as "felt terrible"
rather than "not done yet".

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Pbe7egyMfs2jrdQD2gnVQ2
EOF
)"
```

---

## Task 5: The `/progress` route

Makes the page reachable with its empty states before any chart exists. This deploys safely on its own — the site keeps working and the nav stops promising something that isn't there.

**Files:**
- Modify: `src/lib/stores/router.svelte.ts`
- Modify: `src/lib/components/SiteNav.svelte`
- Modify: `src/App.svelte`
- Create: `src/routes/ProgressView.svelte`

**Interfaces:**
- Consumes: `sessions` from `../lib/stores/sessions.svelte`; `SectionHead` from `../lib/components/SectionHead.svelte`; `SiteFooter` from `../lib/components/SiteFooter.svelte`.
- Produces: `Route` widened to `'plan' | 'log' | 'progress'`; `ProgressView.svelte` as the default export mounted at `/progress`.

- [ ] **Step 1: Widen the router**

In `src/lib/stores/router.svelte.ts`, change the `Route` type, the `PATHS` map and `routeFor`:

```ts
export type Route = 'plan' | 'log' | 'progress'

const PATHS: Record<Route, string> = { plan: '/', log: '/log', progress: '/progress' }

/** `null` for anything unrecognised — the caller normalises it back to the plan. */
function routeFor(pathname: string): Route | null {
  const path = pathname.replace(/\/+$/, '') || '/'
  if (path === '/' || path === '/index.html') return 'plan'
  if (path === '/log') return 'log'
  if (path === '/progress') return 'progress'
  return null
}
```

- [ ] **Step 2: Turn the nav's `SOON` span into a real link**

In `src/lib/components/SiteNav.svelte`, replace the `ITEMS` array and delete the `<span class="soon">` element entirely:

```svelte
  const ITEMS: { route: Route; label: string }[] = [
    { route: 'plan', label: 'Plan' },
    { route: 'log', label: 'Log' },
    { route: 'progress', label: 'Progress' },
  ]
```

The markup becomes just the `{#each}` block — remove the comment above the span along with it:

```svelte
<nav class="sitenav" aria-label="Sections">
  {#each ITEMS as item (item.route)}
    <a
      href={router.href(item.route)}
      aria-current={router.current === item.route ? 'page' : undefined}
      onclick={(event) => router.onNavClick(event, item.route)}
    >{item.label}</a>
  {/each}
</nav>
```

In the `<style>` block, delete the now-dead `.soon` and `.badge` rules and drop `.soon` from the shared selector:

```css
  .sitenav a{
    font-family:'Space Mono',monospace;font-size:.72rem;letter-spacing:.16em;
    text-transform:uppercase;text-decoration:none;
    display:flex;align-items:center;gap:8px;
    padding:12px 16px;min-height:44px;border-radius:100px;
    border:1px solid transparent;color:var(--dim);
    transition:color .18s ease,border-color .18s ease;
  }
```

Delete these three rules and the comment above them:

```css
  .sitenav .soon{opacity:.5;cursor:default}
  .sitenav .badge{ ... }
```

- [ ] **Step 3: Create the view with its empty states**

Create `src/routes/ProgressView.svelte`:

```svelte
<script lang="ts">
  import { sessions } from '../lib/stores/sessions.svelte'
  import { router } from '../lib/stores/router.svelte'
  import SectionHead from '../lib/components/SectionHead.svelte'
  import SiteFooter from '../lib/components/SiteFooter.svelte'

  const hasTrackman = $derived(sessions.trackman.length > 0)
  const blockStart = $derived(sessions.settings.blockStart)
</script>

<section class="progress reveal" aria-labelledby="progress-title">
  <span class="eyebrow">Progress</span>
  <h1 id="progress-title">What the numbers say</h1>
  <p class="sub">
    Club path per club against the target band, which drills are actually getting done, and
    where you are in the three weeks.
  </p>
</section>

<section id="path">
  <SectionHead idx="01" title="Club path" />
  {#if !sessions.ready}
    <p class="empty">Loading your sessions…</p>
  {:else if !hasTrackman}
    <p class="empty">
      No Trackman readings yet. Log a bay session on the
      <a href={router.href('log')} onclick={(e) => router.onNavClick(e, 'log')}>Log</a> page and
      the charts appear here.
    </p>
  {:else}
    <p class="empty">Charts arrive in the next step.</p>
  {/if}
</section>

<section id="coverage">
  <SectionHead idx="02" title="Drill coverage" />
  <p class="empty">Coverage arrives in the next step.</p>
</section>

<section id="feel">
  <SectionHead idx="03" title="Feel by phase" />
  {#if sessions.ready && !blockStart}
    <p class="empty">
      No block start date is set, so there are no phases yet. Set one on the
      <a href={router.href('plan')} onclick={(e) => router.onNavClick(e, 'plan')}>Plan</a> page.
    </p>
  {:else}
    <p class="empty">Feel arrives in the next step.</p>
  {/if}
</section>

<section id="where">
  <SectionHead idx="04" title="Where you are" />
  <p class="empty">The arc position arrives in the next step.</p>
</section>
<SiteFooter />

<style>
  .progress{margin-top:40px}
  /* The hero h1 belongs to the plan page. This takes the section h2 scale —
     see docs/design.md section 2. */
  .progress h1{font-size:clamp(1.5rem,3.6vw,2.15rem);font-weight:800;margin:10px 0 6px}
  .progress .sub{color:var(--dim);font-size:.95rem;max-width:60ch}
  .empty{color:var(--dim);font-size:.94rem;max-width:60ch}
  .empty a{color:var(--ball)}
</style>
```

- [ ] **Step 4: Mount it**

In `src/App.svelte`, extend the route branch:

```svelte
<div class="wrap">
  <SiteNav />
  {#if router.current === 'log'}
    <LogView />
  {:else if router.current === 'progress'}
    <ProgressView />
  {:else}
    <PlanView />
  {/if}
</div>
```

And add the import beside the others:

```ts
  import ProgressView from './routes/ProgressView.svelte'
```

- [ ] **Step 5: Type-check and build**

Run: `npm run check && npm run build`
Expected: no errors; `dist/404.html`, `dist/CNAME` and `dist/index.html` all present.

Verify the SPA fallback exists, since the deep link depends on it:

```bash
test -f dist/404.html && test -f dist/CNAME && echo OK
```

Expected: `OK`.

- [ ] **Step 6: Check it in the browser**

Run: `npm run dev`
Visit `http://localhost:5173/progress` directly (not via the nav) to prove the deep link resolves, then click between Plan, Log and Progress and press Back. Expected: Progress renders its four numbered sections and its empty states, the nav shows `PROGRESS` in `--ball` when active, and there is no `SOON` badge anywhere.

- [ ] **Step 7: Commit**

```bash
git add src/lib/stores/router.svelte.ts src/lib/components/SiteNav.svelte src/App.svelte src/routes/ProgressView.svelte
git commit -m "$(cat <<'EOF'
Give Progress a route of its own

The nav has carried a SOON badge since Phase 1. It becomes a real
link here, with the page's empty states written first — those are what
will actually be seen, since the practice log is empty and the block
start may not be set.

Deep links work through the generated 404.html the pages-spa-fallback
plugin already produces. No deploy change needed.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Pbe7egyMfs2jrdQD2gnVQ2
EOF
)"
```

---

## Task 6: The club path chart

**Files:**
- Create: `src/lib/components/ClubPathChart.svelte`
- Modify: `src/app.css` (add the `--ball-wash` token)
- Modify: `src/routes/ProgressView.svelte` (section 01)

**Interfaces:**
- Consumes: `ClubSeries` from `../domain/series` (the chart); `clubSeries`, `dateBounds` from `../domain/series` and `KPI_CLUB` from `../domain/clubs` (the view); `BAND`, `CHART`, `DOMAIN`, `inBand`, `radiusFor`, `xFor`, `yFor` from `../domain/scale`; `clubInfo` from `../domain/clubs`.
- Produces: `ClubPathChart.svelte` with props `{ series: ClubSeries; first: ISODate; last: ISODate; blockStart?: ISODate; headline?: boolean }`.

- [ ] **Step 1: Add the token**

In `src/app.css`, add to the supporting-shades block, immediately after `--flag-wash`:

```css
  --ball-wash:rgba(239,198,75,.10);  /* --ball at 10%; the target band's fill */
```

- [ ] **Step 2: Write the chart component**

Create `src/lib/components/ClubPathChart.svelte`:

```svelte
<script lang="ts">
  import type { ISODate } from '../domain/types'
  import type { ClubSeries } from '../domain/series'
  import { BAND, CHART, DOMAIN, inBand, radiusFor, xFor, yFor } from '../domain/scale'
  import { clubInfo } from '../domain/clubs'

  let {
    series,
    first,
    last,
    blockStart,
    headline = false,
  }: {
    series: ClubSeries
    first: ISODate
    last: ISODate
    blockStart?: ISODate
    headline?: boolean
  } = $props()

  const info = $derived(clubInfo(series.club))

  /** Same-date sessions share an x. Nudge by ordinal so neither hides under the other. */
  const NUDGE = 2.5

  const plotted = $derived(
    series.points
      .map((p) => {
        const x = xFor(p.date, first, last)
        return x === null ? null : { ...p, x: x + p.ordinal * NUDGE, y: yFor(p.typical), r: radiusFor(p.n) }
      })
      // A type predicate, not a bare `!== null` — without it TypeScript keeps `null` in the
      // element type and every use below needs an assertion.
      .filter((p): p is NonNullable<typeof p> => p !== null),
  )

  /** A single reading gets no line — there is nothing to join it to. */
  const path = $derived(
    plotted.length > 1 ? plotted.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ') : '',
  )

  const latest = $derived(plotted.at(-1))
  const earliest = $derived(plotted[0])

  /** The block shading, only when a start date falls inside the plotted span. */
  const block = $derived.by(() => {
    if (!blockStart) return null
    const x = xFor(blockStart, first, last)
    if (x === null) return null
    const right = CHART.w - CHART.padR
    return x >= right ? null : { x, width: right - x }
  })

  /** Stated in words for screen readers, which get no benefit from the shapes. */
  const summary = $derived.by(() => {
    if (plotted.length === 0) return `${info.name}: no readings.`
    if (plotted.length === 1) {
      return `${info.name}: one reading, ${earliest!.typical.toFixed(2)} degrees on ${earliest!.date}.`
    }
    const change = latest!.typical - earliest!.typical
    const direction = Math.abs(change) < 0.05 ? 'unchanged' : change > 0 ? 'toward neutral' : 'further out-to-in'
    return `${info.name}: ${plotted.length} readings from ${earliest!.date} to ${latest!.date}. Club path moved from ${earliest!.typical.toFixed(2)} to ${latest!.typical.toFixed(2)} degrees, ${direction}. The target band is minus 2 to plus 2 degrees.`
  })
</script>

<figure class="panel" class:headline>
  <figcaption>
    <span class="club">{info.short}</span>
    {#if latest}
      <span class="now" class:good={inBand(latest.typical)}>{latest.typical.toFixed(1)}°</span>
    {/if}
    <span class="count">{plotted.length} {plotted.length === 1 ? 'reading' : 'readings'}</span>
  </figcaption>

  <!-- No `preserveAspectRatio="none"`. Stretching the viewBox non-uniformly would turn every
       <circle> into an ellipse, distorting the dots by a different factor on the headline than
       on the small panels — so the shot-count encoding would stop being comparable between
       them. The headline is made larger by capping its width, never by stretching. -->
  <svg viewBox="0 0 {CHART.w} {CHART.h}" role="img" aria-label={summary}>
    <!-- Fault regions FIRST, both sides. Overshooting past +2 is a fault, not success. -->
    <rect
      class="fault"
      x={CHART.padL}
      y={CHART.padT}
      width={CHART.w - CHART.padL - CHART.padR}
      height={yFor(BAND.max) - CHART.padT}
    />
    <rect
      class="fault"
      x={CHART.padL}
      y={yFor(BAND.min)}
      width={CHART.w - CHART.padL - CHART.padR}
      height={CHART.h - CHART.padB - yFor(BAND.min)}
    />
    <!-- The target band. Yellow means the goal. -->
    <rect
      class="band"
      x={CHART.padL}
      y={yFor(BAND.max)}
      width={CHART.w - CHART.padL - CHART.padR}
      height={yFor(BAND.min) - yFor(BAND.max)}
    />
    {#if block}
      <rect class="block" x={block.x} y={CHART.padT} width={block.width} height={CHART.h - CHART.padT - CHART.padB} />
    {/if}

    <line class="zero" x1={CHART.padL} y1={yFor(0)} x2={CHART.w - CHART.padR} y2={yFor(0)} />
    <line class="axis" x1={CHART.padL} y1={CHART.padT} x2={CHART.padL} y2={CHART.h - CHART.padB} />

    <text class="tick" x={CHART.padL - 4} y={yFor(DOMAIN.max) + 4}>+{DOMAIN.max}</text>
    <text class="tick" x={CHART.padL - 4} y={yFor(0) + 4}>0</text>
    <text class="tick" x={CHART.padL - 4} y={yFor(DOMAIN.min)}>{DOMAIN.min}</text>

    {#if path}
      <path class="line" d={path} />
    {/if}

    {#each plotted as point (point.date + point.ordinal)}
      {#if point.r === null}
        <!-- No shot count, so no size to draw. A hollow ring says "typed, not measured". -->
        <circle class="dot typed" cx={point.x} cy={point.y} r="3.5" />
      {:else}
        <circle class="dot" class:good={inBand(point.typical)} cx={point.x} cy={point.y} r={point.r} />
      {/if}
    {/each}
  </svg>

  <table class="visually-hidden">
    <caption>{info.name} club path readings</caption>
    <thead>
      <tr><th scope="col">Date</th><th scope="col">Typical</th><th scope="col">Best</th><th scope="col">Shots</th></tr>
    </thead>
    <tbody>
      {#each plotted as point (point.date + point.ordinal)}
        <tr>
          <td>{point.date}</td>
          <td>{point.typical.toFixed(2)}°</td>
          <td>{point.best.toFixed(2)}°</td>
          <td>{point.n ?? 'typed by hand, not counted'}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</figure>

<style>
  .panel{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 14px 10px}
  .panel.headline{background:var(--panel)}

  figcaption{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:8px}
  .club{font-family:'Space Mono',monospace;font-size:.72rem;letter-spacing:.12em;color:var(--chalk)}
  .now{font-family:'Space Mono',monospace;font-size:.9rem;font-weight:700;color:var(--flag)}
  /* Inside the band is the goal, so it turns yellow. */
  .now.good{color:var(--ball)}
  .count{font-family:'Space Mono',monospace;font-size:.62rem;letter-spacing:.08em;color:var(--dim);margin-left:auto}

  svg{display:block;width:100%;height:auto}
  /* The headline reads bigger because the panel is wider and sits on --panel, not because the
     chart is stretched. 620px at the 300x140 viewBox is about 290px tall. */
  .panel.headline{max-width:620px}

  /* No colour attributes in the markup — every shape takes its colour here. */
  .fault{fill:var(--flag-wash)}
  .band{fill:var(--ball-wash)}
  .block{fill:var(--ball-wash)}
  .zero{stroke:var(--line);stroke-width:1}
  .axis{stroke:var(--line);stroke-width:1}
  .line{fill:none;stroke:var(--dim);stroke-width:1.2;stroke-linejoin:round}
  .dot{fill:var(--chalk)}
  .dot.good{fill:var(--ball)}
  .typed{fill:none;stroke:var(--chalk);stroke-width:1.2;stroke-dasharray:2 2}
  .tick{
    font-family:'Space Mono',monospace;font-size:7px;fill:var(--dim);text-anchor:end;
  }

  caption{text-align:left}

  .visually-hidden{
    position:absolute;width:1px;height:1px;overflow:hidden;
    clip-path:inset(50%);white-space:nowrap;
  }
</style>
```

- [ ] **Step 3: Render section 01**

In `src/routes/ProgressView.svelte`, add to the `<script>`:

```ts
  import { clubSeries, dateBounds } from '../lib/domain/series'
  import { KPI_CLUB } from '../lib/domain/clubs'
  import ClubPathChart from '../lib/components/ClubPathChart.svelte'

  const series = $derived(clubSeries(sessions.list))
  const bounds = $derived(dateBounds(series))
  const kpi = $derived(series.find((s) => s.club === KPI_CLUB))
  const rest = $derived(series.filter((s) => s.club !== KPI_CLUB))
```

Replace the `{:else}` branch of the `#path` section:

```svelte
  {:else if bounds}
    {#if kpi}
      <ClubPathChart series={kpi} first={bounds.first} last={bounds.last} blockStart={blockStart} headline />
    {/if}
    <p class="note">
      The band is <span class="mono">−2°</span> to <span class="mono">+2°</span>. Red on
      <em>both</em> sides — too far in-to-out is a fault too. Dot size is the shot count, so a
      three-shot reading does not shout as loudly as a seventy-shot one. A hollow dot was typed
      by hand and has no count.
    </p>
    <div class="grid">
      {#each rest as s (s.club)}
        <ClubPathChart series={s} first={bounds.first} last={bounds.last} blockStart={blockStart} />
      {/each}
    </div>
  {/if}
```

Add to the `<style>` block:

```css
  .note{color:var(--dim);font-size:.88rem;max-width:70ch;margin:14px 0 18px}
  .note .mono{font-family:'Space Mono',monospace;color:var(--chalk)}
```

- [ ] **Step 4: Type-check**

Run: `npm run check`
Expected: no errors.

- [ ] **Step 5: Verify against the real backfill**

The store is seeded from `public/trackman.json`, which the dev server serves. Fetch the committed backfill first so there is real data to render:

```bash
git show origin/main:public/trackman.json > public/trackman.json
npm run dev
```

Visit `http://localhost:5173/progress`. Expected, and each of these is a real check against known values:

- The **driver** headline panel shows a series falling from about `−1.8°` to about `−8.5°`. If it trends upward, the y-axis is inverted.
- Fourteen panels in total, driver first, then bag order — `3W`, `5W`, `4I` … `60°`.
- The `60°` panel holds **one** dot and no line.
- Two dots are visible near the right edge of the driver panel for 2026-07-22, not one.
- The band is yellow, and there is red **above** it as well as below.
- The headline value reads red, because no club is currently inside the band.

- [ ] **Step 6: Undo the local data fetch**

`public/trackman.json` is generated by the workflow on `main` and must not be committed from this branch.

```bash
rm public/trackman.json
git status --porcelain public/
```

Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add src/lib/components/ClubPathChart.svelte src/app.css src/routes/ProgressView.svelte
git commit -m "$(cat <<'EOF'
Chart club path against the band, per club

Small multiples on a shared fixed domain, driver first because it is
the KPI. Fault regions are drawn on both sides of the band: nothing
has ever overshot +2, but overshooting is a fault and the chart must
be able to say so rather than rewarding a bigger number.

Dot area carries the shot count. The worst reading in the backfill,
-11.53, is three shots; drawn at the same weight as a 73-shot reading
it would read as a collapse rather than as thin evidence. A reading
with no count is a hollow ring, never a sized dot.

Same-date points are nudged apart by their ordinal. 21 dates in the
backfill hold two sessions and one would otherwise be invisible.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Pbe7egyMfs2jrdQD2gnVQ2
EOF
)"
```

---

## Task 7: Drill coverage bars

**Files:**
- Create: `src/lib/components/CoverageBars.svelte`
- Modify: `src/routes/ProgressView.svelte` (section 02)

**Interfaces:**
- Consumes: `DrillCoverage`, `drillCoverage` from `../domain/coverage`; `DRILLS` from `../domain/drills`; `blockPosition` from `../domain/block`; `resolveISODate` from `../domain/today`.
- Produces: `CoverageBars.svelte` with props `{ rows: DrillCoverage[]; from: ISODate; to: ISODate }`.

- [ ] **Step 1: Write the component**

Create `src/lib/components/CoverageBars.svelte`:

```svelte
<script lang="ts">
  import type { ISODate } from '../domain/types'
  import type { DrillCoverage } from '../domain/coverage'
  import { DRILLS } from '../domain/drills'

  let { rows, from, to }: { rows: DrillCoverage[]; from: ISODate; to: ISODate } = $props()

  // Names come from drills.ts, never restated here — CLAUDE.md.
  const NAMES = new Map(DRILLS.map((d) => [d.id, d.name]))

  /** Fill is capped at 100% so an over-done drill doesn't overflow the track. The counts
   *  beside it stay uncapped, so diligence is still reported truthfully. */
  function fill(row: DrillCoverage): number {
    if (row.scheduled === 0) return 0
    return Math.min(100, (row.done / row.scheduled) * 100)
  }
</script>

<p class="window">
  <span class="mono">{from}</span> to <span class="mono">{to}</span>
</p>

<ul class="rows">
  {#each rows as row (row.drillId)}
    <li class="row" class:unscheduled={row.status === 'unscheduled'}>
      <span class="num">{row.drillId}</span>
      <span class="name">{NAMES.get(row.drillId)}</span>

      {#if row.status === 'unscheduled'}
        <!-- Never an empty bar. 0 of 0 looks exactly like "asked six times and
             skipped", which would name this the most avoided drill in the plan. -->
        <span class="track"><span class="none">Not in the current schedule</span></span>
        <span class="count">{row.done > 0 ? `${row.done} done off-plan` : '—'}</span>
      {:else}
        <span class="track" aria-hidden="true">
          <span class="fill" class:avoided={row.status === 'avoided'} style="width:{fill(row)}%"></span>
        </span>
        <span class="count" class:avoided={row.status === 'avoided'}>
          {row.done} of {row.scheduled}
        </span>
      {/if}
    </li>
  {/each}
</ul>

<style>
  .window{font-size:.8rem;color:var(--dim);margin-bottom:14px}
  .window .mono{font-family:'Space Mono',monospace;color:var(--chalk)}

  .rows{list-style:none;display:grid;gap:8px}
  .row{
    display:grid;grid-template-columns:34px 1fr 120px 84px;align-items:center;gap:12px;
    background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;
  }
  .row.unscheduled{opacity:.72}

  .num{font-family:'Space Mono',monospace;font-size:.8rem;color:var(--ball)}
  .name{font-size:.94rem}

  .track{display:block;height:8px;background:var(--line);border-radius:100px;overflow:hidden}
  .fill{display:block;height:100%;background:var(--ball);border-radius:100px}
  /* Nothing done against a real schedule is the finding, so it reads as a fault. */
  .fill.avoided{background:var(--flag)}
  .none{
    font-family:'Space Mono',monospace;font-size:.58rem;letter-spacing:.06em;
    text-transform:uppercase;color:var(--dim);white-space:nowrap;
  }
  .row.unscheduled .track{background:none;height:auto}

  .count{font-family:'Space Mono',monospace;font-size:.76rem;color:var(--dim);text-align:right}
  .count.avoided{color:var(--flag)}

  @media (max-width:760px){
    .row{grid-template-columns:34px 1fr;grid-template-areas:'num name' 'track count'}
    .num{grid-area:num}
    .name{grid-area:name}
    .track{grid-area:track}
    .count{grid-area:count}
  }
</style>
```

- [ ] **Step 2: Render section 02**

In `src/routes/ProgressView.svelte`, add to the `<script>`. Note the name `coverageWindow` — **never `window`**, which would shadow the global and is a trap in a component that may later need it:

```ts
  import { drillCoverage } from '../lib/domain/coverage'
  import { resolveISODate } from '../lib/domain/today'
  import { parseISODate } from '../lib/domain/block'
  import CoverageBars from '../lib/components/CoverageBars.svelte'

  const today = resolveISODate()
  const BLOCK_DAYS = 21

  /** The current block when one is set, otherwise the last 21 days — the same length, so the
   *  counts mean the same thing either way. */
  const coverageWindow = $derived.by(() => {
    if (blockStart) return { from: blockStart, to: today }
    const end = parseISODate(today)
    if (end === null) return { from: today, to: today }
    const from = new Date(end - (BLOCK_DAYS - 1) * 86_400_000).toISOString().slice(0, 10)
    return { from, to: today }
  })

  const coverage = $derived(drillCoverage(sessions.list, coverageWindow.from, coverageWindow.to))
```

Replace the `#coverage` section body:

```svelte
<section id="coverage">
  <SectionHead idx="02" title="Drill coverage" />
  <p class="note">
    What the plan asked for against what you logged. A drill sitting at zero against a real
    schedule is the finding.
  </p>
  <CoverageBars rows={coverage} from={coverageWindow.from} to={coverageWindow.to} />
</section>
```

- [ ] **Step 3: Type-check**

Run: `npm run check`
Expected: no errors.

- [ ] **Step 4: Verify in the browser**

Run: `npm run dev`, visit `/progress`.

Expected with an **empty practice log** — this is the state you will actually see:

- Six drills show full-length **red** bars with counts like `0 of 3`. That is correct and is the finding, not an error.
- **Drill 03 shows "NOT IN THE CURRENT SCHEDULE"** and a dash — *not* a zero bar. If it renders as a red `0 of 0` bar, D11 has been lost.
- The window line reads two ISO dates 21 days apart.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/CoverageBars.svelte src/routes/ProgressView.svelte
git commit -m "$(cat <<'EOF'
Show which drills are getting done and which are not

Bars run done against scheduled, so a drill sitting at zero against a
real schedule reads as a fault in flag red. Fill is capped at the
track width but the counts are not, so doing a drill more often than
asked reports honestly instead of overflowing.

Drill 03 renders as "not in the current schedule" rather than an empty
bar. It appears in no day's plan, so a zero bar would name it the most
avoided drill in the plan when nothing has been avoided at all.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Pbe7egyMfs2jrdQD2gnVQ2
EOF
)"
```

---

## Task 8: Feel by phase

**Files:**
- Create: `src/lib/components/PhaseFeel.svelte`
- Modify: `src/routes/ProgressView.svelte` (section 03)

**Interfaces:**
- Consumes: `DrillPhaseFeel`, `feelByPhase` from `../domain/feel`; `DRILLS` from `../domain/drills`.
- Produces: `PhaseFeel.svelte` with props `{ rows: DrillPhaseFeel[] }`.

- [ ] **Step 1: Write the component**

Create `src/lib/components/PhaseFeel.svelte`:

```svelte
<script lang="ts">
  import type { DrillPhaseFeel } from '../domain/feel'
  import { DRILLS } from '../domain/drills'

  let { rows }: { rows: DrillPhaseFeel[] } = $props()

  const NAMES = new Map(DRILLS.map((d) => [d.id, d.name]))

  /** Five pips, filled to the rounded mean. Decorative — the number sits beside it. */
  const PIPS = [1, 2, 3, 4, 5]
</script>

<ul class="drills">
  {#each rows as row (row.drillId)}
    <li class="drill">
      <h3><span class="num">{row.drillId}</span> {NAMES.get(row.drillId)}</h3>
      <ul class="phases">
        {#each row.phases as p (p.week)}
          <!-- Bound to a const so TypeScript narrows it. Narrowing on `p.mean` directly across
               an {#if} does not survive into the {:else} for a loop variable's property. -->
          {@const mean = p.mean}
          <li class="phase">
            <span class="label">{p.phase.title}</span>
            {#if mean === null}
              <span class="unlogged">Not logged yet</span>
            {:else}
              <span class="pips" aria-hidden="true">
                {#each PIPS as pip (pip)}
                  <span class="pip" class:on={pip <= Math.round(mean)}></span>
                {/each}
              </span>
              <span class="mean">{mean.toFixed(1)}</span>
              <span class="n">n={p.n}</span>
            {/if}
          </li>
        {/each}
      </ul>
    </li>
  {/each}
</ul>

<style>
  .drills{list-style:none;display:grid;grid-template-columns:repeat(auto-fill,minmax(258px,1fr));gap:16px}
  .drill{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px 18px}
  .drill h3{font-size:1.05rem;font-weight:700;margin-bottom:10px}
  .num{font-family:'Space Mono',monospace;font-size:.78rem;color:var(--ball)}

  .phases{list-style:none;display:grid;gap:8px}
  .phase{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .label{
    font-family:'Space Mono',monospace;font-size:.62rem;letter-spacing:.08em;
    text-transform:uppercase;color:var(--dim);flex:1;
  }
  .pips{display:flex;gap:3px}
  .pip{width:8px;height:8px;border-radius:100px;border:1px solid var(--line)}
  .pip.on{background:var(--ball);border-color:var(--ball)}
  .mean{font-family:'Space Mono',monospace;font-size:.8rem;color:var(--chalk)}
  .n{font-family:'Space Mono',monospace;font-size:.62rem;color:var(--dim)}
  /* Said in words, never as a 0 — zero is a real feel value and would read as "terrible". */
  .unlogged{font-family:'Space Mono',monospace;font-size:.62rem;letter-spacing:.06em;text-transform:uppercase;color:var(--dim)}
</style>
```

- [ ] **Step 2: Render section 03**

In `src/routes/ProgressView.svelte`, add to the `<script>`:

```ts
  import { feelByPhase } from '../lib/domain/feel'
  import PhaseFeelPanel from '../lib/components/PhaseFeel.svelte'

  const feel = $derived(blockStart ? feelByPhase(sessions.list, blockStart) : [])
```

Replace the `#feel` section body:

```svelte
<section id="feel">
  <SectionHead idx="03" title="Feel by phase" />
  {#if sessions.ready && !blockStart}
    <p class="empty">
      No block start date is set, so there are no phases yet. Set one on the
      <a href={router.href('plan')} onclick={(e) => router.onNavClick(e, 'plan')}>Plan</a> page.
    </p>
  {:else}
    <p class="note">
      How close each drill came to its cue. Read within a phase — grooving a feel in week one
      is not the same job as proving it in week three.
    </p>
    <PhaseFeelPanel rows={feel} />
  {/if}
</section>
```

- [ ] **Step 3: Type-check**

Run: `npm run check`
Expected: no errors.

- [ ] **Step 4: Verify in the browser**

Run: `npm run dev`, visit `/progress`.

Expected: with no `blockStart` stored, section 03 states that and links to the Plan page. Set a block start on the Plan page, then return — seven drill cards appear, each with three phases reading `NOT LOGGED YET`. **No phase shows a `0.0`.**

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/PhaseFeel.svelte src/routes/ProgressView.svelte
git commit -m "$(cat <<'EOF'
Report feel per drill within each phase

Grooving a feel in week one and proving it in week three are different
jobs, so a flat average across the block answers the wrong question.

An unlogged phase says so in words. Zero is a real value on a 1-5 feel
scale and would read as "felt terrible" rather than "not done".

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Pbe7egyMfs2jrdQD2gnVQ2
EOF
)"
```

---

## Task 9: Where you are in the arc

**Files:**
- Create: `src/lib/components/ArcPosition.svelte`
- Modify: `src/routes/ProgressView.svelte` (section 04)

**Interfaces:**
- Consumes: `BlockPosition`, `blockPosition` from `../domain/block`; `ARC` from `../domain/plan`.
- Produces: `ArcPosition.svelte` with props `{ position: BlockPosition | null }`.

- [ ] **Step 1: Write the component**

Create `src/lib/components/ArcPosition.svelte`:

```svelte
<script lang="ts">
  import type { BlockPosition } from '../domain/block'
  import { ARC } from '../domain/plan'

  let { position }: { position: BlockPosition | null } = $props()

  const BLOCK_DAYS = 21
</script>

{#if position === null}
  <!-- Outside the three weeks says nothing rather than claiming "week 7" — the same rule the
       Today panel follows. -->
  <p class="outside">
    You are outside the three-week block. Set a new start date on the Plan page when you begin
    the next one.
  </p>
{:else}
  <div class="arc">
    {#each ARC as phase, i (phase.n)}
      {@const week = i + 1}
      <div class="phase" class:now={week === position.week} class:done={week < position.week}>
        <div class="n">{phase.n}</div>
        <span class="wk">{phase.week}</span>
        <h3>{phase.title}</h3>
        {#if week === position.week}
          <span class="badge">Day {position.dayOfBlock} of {BLOCK_DAYS}</span>
        {/if}
      </div>
    {/each}
  </div>
{/if}

<style>
  .outside{color:var(--dim);font-size:.94rem;max-width:60ch}

  .arc{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
  .phase{
    background:var(--card);border:1px solid var(--line);border-radius:14px;
    padding:22px 22px 24px;position:relative;overflow:hidden;
  }
  /* The active phase is the one you're aiming at, so it takes the accent border. */
  .phase.now{border-color:var(--ball)}
  .phase.done{opacity:.6}
  .phase .n{
    font-family:'Archivo',sans-serif;font-weight:800;font-size:3.4rem;color:var(--line);
    line-height:.8;letter-spacing:-.04em;
  }
  .phase.now .n{color:var(--ball-dim)}
  .phase h3{font-size:1.12rem;font-weight:700;margin:10px 0 8px}
  .phase .wk{
    font-family:'Space Mono',monospace;font-size:.7rem;letter-spacing:.12em;
    text-transform:uppercase;color:var(--ball);
  }
  .badge{
    font-family:'Space Mono',monospace;font-size:.62rem;letter-spacing:.08em;
    text-transform:uppercase;background:var(--ball);color:var(--bg);
    border-radius:100px;padding:3px 10px;display:inline-block;
  }

  @media (max-width:760px){
    .arc{grid-template-columns:1fr}
  }
</style>
```

- [ ] **Step 2: Render section 04**

In `src/routes/ProgressView.svelte`, add to the `<script>`:

```ts
  import { blockPosition } from '../lib/domain/block'
  import ArcPosition from '../lib/components/ArcPosition.svelte'

  const position = $derived(blockStart ? blockPosition(blockStart, today) : null)
```

Note `parseISODate` is already imported from `../lib/domain/block` in Task 7 — extend that import rather than adding a second one:

```ts
  import { blockPosition, parseISODate } from '../lib/domain/block'
```

Replace the `#where` section body:

```svelte
<section id="where">
  <SectionHead idx="04" title="Where you are" />
  {#if sessions.ready && !blockStart}
    <p class="empty">
      No block start date is set. Set one on the
      <a href={router.href('plan')} onclick={(e) => router.onNavClick(e, 'plan')}>Plan</a> page.
    </p>
  {:else}
    <ArcPosition {position} />
  {/if}
</section>
```

- [ ] **Step 3: Type-check and run the full suite**

Run: `npm run check && npm test`
Expected: no errors, all tests pass.

- [ ] **Step 4: Verify in the browser**

Run: `npm run dev`, visit `/progress`. With a block start set to today, expect week one bordered in `--ball` carrying a `DAY 1 OF 21` badge, weeks two and three dimmed but readable. Set a block start more than 21 days ago and expect the "outside the block" sentence rather than a week number.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/ArcPosition.svelte src/routes/ProgressView.svelte
git commit -m "$(cat <<'EOF'
Mark which phase of the arc is live

The active phase takes the accent border and the day count; finished
weeks dim but stay readable. Outside the three weeks it says so rather
than reporting "week 7", which is the rule the Today panel already
follows.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Pbe7egyMfs2jrdQD2gnVQ2
EOF
)"
```

---

## Task 10: Documentation

Documentation is part of the change, not a follow-up. `CLAUDE.md` requires that a change making one of these wrong is fixed in the same commit.

**Files:**
- Modify: `docs/design.md`
- Modify: `docs/roadmap.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Document the token and the chart components in `docs/design.md`**

In §1, add a row to the **Supporting shades** table after `--flag-wash`:

```markdown
| `--ball-wash` | `rgba(239,198,75,.10)` | Target-band fill on the progress charts, and the block shading. `--ball` at 10%. |
```

In §4 **Components**, add after the Data panel entry:

```markdown
### Club path chart
`ClubPathChart.svelte` — one club's readings as inline SVG on a **fixed shared domain**
(`−14°` … `+4°`, from `domain/scale.ts`). Draw order back to front: fault region above `+2°`,
fault region below `−2°`, the target band, block shading, zero rule, the connected line, then
the dots.

**Both fault regions are `--flag-wash` and the band is `--ball-wash`.** Overshooting past `+2°`
is a fault, not success — this is the one component where getting the yellow/red semantic wrong
would invert the coaching message.

Dot radius encodes the shot count on a `sqrt` scale. **A reading with no `n` is a hollow dashed
ring**, never a sized dot — there is no count to size it by. Same-date readings are nudged
apart by their ordinal, because 21 dates in the backfill carry two sessions.

The driver panel takes `--panel` and a taller SVG as the KPI headline; the rest sit on `--card`
in the shared `.grid`. Each chart is a `<figure>` with `role="img"`, a worded `aria-label`, and
a visually-hidden data table.

### Coverage row
`CoverageBars.svelte` — done against scheduled, one row per drill. Fill is `--ball`, or `--flag`
when nothing was done against a real schedule. **A drill the plan never schedules renders as
"not in the current schedule", never as an empty bar** — a `0 of 0` bar is indistinguishable
from avoidance and would name drill `03` the most avoided drill in the plan.

### Phase feel card
`PhaseFeel.svelte` — one card per drill, three rows for groove / transfer / proof. Five pips
plus the mean and `n`. **An unlogged phase says "not logged yet" in words**; `0.0` is a real
value on a 1–5 feel scale.

### Arc position
`ArcPosition.svelte` — the three phase cards with the live one bordered in `--ball` and carrying
a `DAY n OF 21` badge. Outside the block it says so rather than reporting a week number.
```

In §4 **Site nav**, replace the paragraph describing the `SOON` badge with:

```markdown
`.sitenav` — a mono pill row at the top of the page, above everything, with a hairline beneath.
Active view carries `aria-current="page"` and renders in `--ball` with a `--ball-dim` border.
Three views: Plan, Log and Progress. `44px` minimum, and `order:-2` below the breakpoint so the
Today panel's `order:-1` cannot float above it.
```

- [ ] **Step 2: Update `docs/roadmap.md`**

Change **Last updated** to `2026-08-04`. Replace the Phase 4 section heading and body:

```markdown
## Phase 4 · Progress — **done (2026-08-04)**

[#5](https://github.com/RichardWhitfield/golf/issues/5)

Shipped: a `/progress` route holding four views — per-club club-path small multiples on a fixed
shared domain with the band and **both** fault regions, drill coverage against the plan's own
schedule, feel per drill per arc phase, and the live arc position. The calculations live in four
pure modules (`domain/scale.ts`, `series.ts`, `coverage.ts`, `feel.ts`); components only render.

**Two findings from the real backfill changed the design** — see
`docs/superpowers/specs/2026-08-04-phase-4-progress-design.md`:

- **The worst readings carry the smallest `n`.** `−11.53°` on 2026-07-20 is three shots. Dot
  area encodes the count, so a thin reading cannot shout as loudly as a measured one.
- **Drill `03` is scheduled by no day in `plan.ts`.** It computes to `0 of 0`, which is
  indistinguishable from a drill asked for six times and skipped. Coverage carries a `status`
  so "never asked" and "avoided" can never render alike — otherwise the chart would invent a
  finding.

**The headline is not flattering:** the driver moved from `−1.83°` (2025-07-03) to `−8.51°`
(2026-07-13). The page reports it.
```

In the **Where things stand** list, add:

```markdown
- Three views behind the router: `/` (the plan), `/log` (the practice log) and `/progress`
  (the charts). Deep links depend on a generated `dist/404.html`.
```

and delete the older two-view line it replaces.

Under **OQ-2**, append:

```markdown
**Partly answered by Phase 4 (2026-08-04):** for *charting scope* the decision is **all-time,
with the current block shaded on the axis** — the question worth answering is whether the block
is bending a 13-month trend, and scoping to three weeks leaves the club-path chart with about
three points. This needed no `Block` entity. The wider question — what happens after week three,
and whether sessions get grouped per block — **remains open.**
```

- [ ] **Step 3: Update `CLAUDE.md`**

In **Current state**, replace the two-view sentence:

```markdown
The site has three views behind a History-API router: `/` (the plan page), `/log` and
`/progress`. Deep links depend on `dist/404.html`, generated from the built `index.html` by the
`pages-spa-fallback` plugin in `vite.config.ts` and asserted by the deploy workflow alongside
`CNAME`.

Progress charts are built (Phase 4, issue #5). Every calculation lives in `lib/domain/` —
`scale.ts` (the shared fixed axis), `series.ts` (per-club series), `coverage.ts` (done vs
scheduled) and `feel.ts` (feel per arc phase). **Components render; they never calculate.**
```

In **Rules → Code**, add after the "Never blend club path across clubs" bullet:

```markdown
- **`domain/series.ts` is where the never-blend rule is enforced structurally.** It keys by
  `Club` and never reduces across keys, so no cross-club mean is expressible. Keep it that way.
- **The chart y-domain is a fixed constant, never derived from the data.** A fitted domain moves
  between visits and silently redefines "good" as "better than recent" rather than "in the band".
- **"Never scheduled" and "avoided" are different findings.** Drill `03` appears in no day's
  `plan.ts` schedule, so it computes to `0 of 0` — identical to a drill asked for six times and
  skipped. `coverage.ts` carries a `status` to keep them apart. Never render them alike.
```

- [ ] **Step 4: Verify nothing else went stale**

Run: `rg -n 'SOON|Soon' src/ docs/ CLAUDE.md`
Expected: no hits describing the nav badge. Any remaining hit is stale copy and must be fixed here.

- [ ] **Step 5: Commit**

```bash
git add docs/design.md docs/roadmap.md CLAUDE.md
git commit -m "$(cat <<'EOF'
Document the progress views

Records the two rules that are easy to undo by accident: the chart
y-domain is fixed rather than fitted, and "never scheduled" is not the
same finding as "avoided".

Answers OQ-2 for charting scope only. Whether sessions get grouped
into blocks is still open.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Pbe7egyMfs2jrdQD2gnVQ2
EOF
)"
```

---

## Final verification

- [ ] **Full gate**

Run: `npm run check && npm test && npm run build`
Expected: no type errors, all tests pass, build succeeds.

- [ ] **Deploy assertions**

```bash
test -f dist/CNAME && cat dist/CNAME && test -f dist/404.html && echo OK
```

Expected: `golf.whitfield.life` then `OK`. **Losing `dist/CNAME` drops the custom domain.**

- [ ] **No stray data file**

```bash
git status --porcelain
```

Expected: clean. `public/trackman.json` must **not** be committed from this branch — it is generated by the workflow on `main`.

- [ ] **The phase's own rule**

Confirm the app still works with the integration deleted: temporarily remove `public/trackman.json` if present and reload. The plan page, the log form and manual Trackman entry must all still work, and `/progress` must show its empty states rather than erroring.

- [ ] **Verify the live deploy**

After merge, load `https://golf.whitfield.life/progress` **directly** — not via the nav — to prove the 404 fallback works in production, and confirm the driver panel renders. `CLAUDE.md`: this is a live site on a real domain; verify a deploy before considering the work done.
