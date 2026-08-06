# Phase 7 · Per-shot Trackman Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Widen the Trackman ingest from one metric to a considered twelve, store the shot-by-shot record where no chart downloads it, and answer on `/progress` whether swing plane is causing the out-to-in path.

**Architecture:** A new `domain/metrics.ts` registry is the single source of truth for metric field names, fixed axes and what "best" means — the counterpart to `domain/clubs.ts`. Session aggregates gain an optional `metrics` map on each club row, each reading carrying **its own shot count**. Per-shot data goes to a separate `SHOTS#<sessionId>` DynamoDB item reachable only from `RemoteRepo`, never from the `Repository` interface components use.

**Tech Stack:** Svelte 5 (runes), Vite, TypeScript 6, Vitest, DynamoDB behind a Lambda Function URL (plain ESM, Node 22), `tsx` for the Node ingest entry point.

**Spec:** `docs/superpowers/specs/2026-08-06-phase-7-per-shot-metrics-design.md`

---

## Global Constraints

Every task's requirements implicitly include this section.

- **British English** throughout (`lang="en-GB"`). Second-person, direct, coach-like. Short declaratives.
- **Club path is signed.** Negative is out-to-in. Never store an absolute value, and **never range-check with `Math.abs`** — that accepts a sign flip, the one error that matters most.
- **The target is a band (`−2°` to `+2°`), not a maximum.** `best` means the reading closest to neutral, **never `Math.max`**.
- **Never blend a metric across clubs.** No code path may compute a mean spanning more than one club (OQ-7, issue #14).
- **Chart domains are fixed constants, never derived from the data at render time.**
- **`n` is absent, never zero**, on hand-typed readings. Never fabricate a default.
- **No component may call `localStorage` directly.** Everything goes through `lib/storage/`.
- **Repository methods are `async`, always.**
- **Use the CSS custom properties.** Never hardcode a colour. `--ball` (yellow) means the goal; `--flag` (red) means the problem. Never invert.
- **Data and labels are Space Mono. Prose is Inter. Headings are Archivo.**
- One breakpoint (`760px`), scoped to the component that needs it. Never split one element's rules across `app.css` and a component.
- Every animation needs a `prefers-reduced-motion` override that leaves content visible. Every interactive element needs a visible focus state and a `44px` minimum hit target.
- **Don't redesign.** Extend the existing system.
- Field names come from `npm run introspect`, **never from memory**.
- Verification commands: `npm test`, `npm run check`. Both gate the deploy.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/domain/metrics.ts` | **Create.** The metric registry: ids, wire field names, labels, units, fixed domains, bands, `better` rules. Plus `readingFor()` and the `best` reducers. |
| `src/lib/domain/metrics.test.ts` | **Create.** Registry invariants and the reducers. |
| `src/lib/domain/types.ts` | **Modify.** Add `MetricReading`; add optional `metrics` to `ClubPath`; add `Shot`. |
| `src/lib/domain/scale.ts` | **Modify.** Generalise `yFor`/`inBand` to take a domain/band so panels can plot any metric. |
| `src/lib/ingest/aggregate.ts` | **Modify.** Per-metric aggregation with per-metric `n`; return `Shot[]` alongside the session. |
| `src/lib/ingest/api.ts` | **Modify.** Build the query selection set from the registry; carry shots through. |
| `src/lib/ingest/source.ts` | **Modify.** `fetchSince` returns sessions **and** shots. |
| `src/lib/domain/relate.ts` | **Create.** Pure Pearson correlation between two metrics for one club, from session aggregates. |
| `src/lib/domain/relate.test.ts` | **Create.** |
| `src/lib/storage/migrations.ts` | **Modify.** `SCHEMA_VERSION` 2 → 3 with an identity migration. |
| `src/lib/storage/transfer.ts` | **Modify.** Validate and preserve `metrics` on import/export. |
| `src/lib/storage/remote.ts` | **Modify.** `saveShots` / `getShots`. **Not** on the `Repository` interface. |
| `infra/function/handler.mjs` | **Modify.** `PUT`/`GET /shots/{id}`, shots validation, `SCHEMA_VERSION` 3. |
| `infra/handler.test.mjs` | **Modify.** Routing and validation for the new endpoints. |
| `scripts/trackman-ingest.ts` | **Modify.** Write shots for sessions the merge actually wrote. |
| `src/lib/components/SlicePanel.svelte` | **Create.** Driver path + face-to-path + curve. |
| `src/lib/components/RelationPanel.svelte` | **Create.** Two metrics against each other, with r and n stated. |
| `src/routes/ProgressView.svelte` | **Modify.** New driver section above the existing small multiples. |

---

## Task 1: The metric registry

**Files:**
- Create: `src/lib/domain/metrics.ts`
- Test: `src/lib/domain/metrics.test.ts`

**Interfaces:**
- Consumes: `Club` from `./clubs`; `DOMAIN`, `BAND` from `./scale`.
- Produces: `MetricId`, `MetricInfo`, `METRICS: MetricInfo[]`, `metricInfo(id): MetricInfo`, `isMetricId(v): v is MetricId`, `bestOf(values: number[], better: Better): number | undefined`, `METRIC_FIELDS: string[]`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/domain/metrics.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { METRICS, METRIC_FIELDS, bestOf, isMetricId, metricInfo } from './metrics'
import { BAND, DOMAIN } from './scale'

describe('the registry', () => {
  it('covers exactly the twelve metrics the spec chose', () => {
    expect(METRICS).toHaveLength(12)
    expect(METRICS.map((m) => m.id)).toEqual([
      'clubPath', 'faceAngle', 'faceToPath', 'swingPlane', 'attackAngle', 'curve',
      'clubSpeed', 'carry', 'lowPointDistance', 'lowPointSide', 'dynamicLoft', 'spinLoft',
    ])
  })

  it('excludes the fields that hold no data at all', () => {
    // 100% null across 5,877 real strokes. Charting them would draw an empty panel.
    for (const dead of ['strokeLength', 'backswingTime', 'forwardswingTime', 'tempo']) {
      expect(METRIC_FIELDS).not.toContain(dead)
    }
  })

  it('excludes swingDirection as near-collinear with the KPI', () => {
    // r = 0.819 with clubPath on the driver — a second panel saying the same thing (OQ-8).
    expect(METRIC_FIELDS).not.toContain('swingDirection')
  })

  it('gives every metric a fixed domain wide enough to hold its band', () => {
    for (const m of METRICS) {
      expect(m.domain.max).toBeGreaterThan(m.domain.min)
      if (m.band) {
        expect(m.band.min).toBeGreaterThanOrEqual(m.domain.min)
        expect(m.band.max).toBeLessThanOrEqual(m.domain.max)
      }
    }
  })

  it('reuses the club-path domain rather than restating it', () => {
    // One value, one home. A second copy would drift from scale.ts silently.
    expect(metricInfo('clubPath').domain).toEqual(DOMAIN)
    expect(metricInfo('clubPath').band).toEqual(BAND)
  })

  it('gives a band only to metrics that have a real target', () => {
    // attackAngle wants positive on a driver and negative on an iron. There is no shared
    // target, and inventing one would be worse than admitting it.
    for (const m of METRICS) {
      if (m.better === 'none') expect(m.band).toBeUndefined()
    }
    expect(metricInfo('attackAngle').better).toBe('none')
    expect(metricInfo('swingPlane').better).toBe('none')
  })
})

describe('bestOf', () => {
  it('prefers the reading closest to neutral, never the largest', () => {
    // +5 is a worse fault than +1: overshooting the band counts against you.
    expect(bestOf([-5, 1, 5], 'neutral')).toBe(1)
    expect(bestOf([-8, -6], 'neutral')).toBe(-6)
  })

  it('keeps the sign when picking the closest to neutral', () => {
    // Never Math.abs on a signed value — that would accept a sign flip.
    expect(bestOf([-1, 3], 'neutral')).toBe(-1)
  })

  it('takes the largest where larger genuinely is better', () => {
    expect(bestOf([120, 155, 140], 'higher')).toBe(155)
  })

  it('has no answer where the metric has no target', () => {
    expect(bestOf([50, 60], 'none')).toBeUndefined()
  })

  it('has no answer with nothing to reduce', () => {
    expect(bestOf([], 'neutral')).toBeUndefined()
  })
})

describe('isMetricId', () => {
  it('rejects a value that is not a metric, including inherited object keys', () => {
    expect(isMetricId('clubPath')).toBe(true)
    expect(isMetricId('toString')).toBe(false)
    expect(isMetricId('swingDirection')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/domain/metrics.test.ts`
Expected: FAIL — `Failed to resolve import "./metrics"`.

- [ ] **Step 3: Write the registry**

Create `src/lib/domain/metrics.ts`:

```ts
/**
 * The metric vocabulary.
 *
 * The counterpart to `domain/clubs.ts`: that file refuses to guess a club's Trackman spelling,
 * and this one refuses to guess an axis. **Every `field` below was read from the live schema
 * via `npm run introspect`, never written from memory.**
 *
 * Twelve of the 75 fields on `Measurement` are here. The test applied was *does this answer a
 * question that is being asked*, not *is it available* — see §3 of the Phase 7 spec for why
 * each one earns its place and why the rest do not.
 */
import { BAND, DOMAIN } from './scale'

export type MetricId =
  | 'clubPath'
  | 'faceAngle'
  | 'faceToPath'
  | 'swingPlane'
  | 'attackAngle'
  | 'curve'
  | 'clubSpeed'
  | 'carry'
  | 'lowPointDistance'
  | 'lowPointSide'
  | 'dynamicLoft'
  | 'spinLoft'

/**
 * What "best" means, per metric. **It cannot be one rule.**
 *
 * `neutral` — closest to zero wins, because the target is a band and `+5°` is worse than `+1°`.
 * `higher`  — the largest reading genuinely is the best one.
 * `none`    — there is no shared target, so no `best` is stored and no band is drawn.
 */
export type Better = 'neutral' | 'higher' | 'none'

export interface MetricInfo {
  id: MetricId
  /** The `Measurement` field name on the wire. Verified by introspection, never guessed. */
  field: string
  /** Monospaced UI label. Short — it sits in a row of numbers. */
  short: string
  /** Prose label. */
  name: string
  unit: '°' | 'm' | 'm/s'
  /**
   * The fixed y-domain. **Authored from real driver session means with headroom, then frozen.**
   *
   * A domain fitted to the data at render time would move between visits and quietly redefine
   * "good" as "better than recent" rather than "inside the band".
   *
   * **These are scoped to the driver**, the only club these are charted for in this phase.
   * Several are strongly club-dependent — swing plane runs ~50° on a driver against ~69° on a
   * 4-iron, and dynamic loft reaches 55° across the bag against 25° on the driver. Charting any
   * of these for a second club means **authoring that club's domain first**. It is not a
   * derivation to be automated.
   */
  domain: { min: number; max: number }
  /** The coaching target, where one genuinely exists. Absent whenever `better` is `none`. */
  band?: { min: number; max: number }
  better: Better
  decimals: 0 | 1 | 2
}

/**
 * Ordered as the panels read: the KPI, then what explains it, then what it cost.
 *
 * Club path reuses `scale.ts`'s domain and band rather than restating them — one value, one
 * home, and a second copy would drift silently.
 */
export const METRICS: MetricInfo[] = [
  { id: 'clubPath', field: 'clubPath', short: 'PATH', name: 'Club path', unit: '°',
    domain: DOMAIN, band: BAND, better: 'neutral', decimals: 2 },
  { id: 'faceAngle', field: 'faceAngle', short: 'FACE', name: 'Face angle', unit: '°',
    domain: { min: -8, max: 6 }, band: { min: -2, max: 2 }, better: 'neutral', decimals: 2 },
  { id: 'faceToPath', field: 'faceToPath', short: 'FACE→PATH', name: 'Face to path', unit: '°',
    domain: { min: -4, max: 12 }, band: { min: -2, max: 2 }, better: 'neutral', decimals: 2 },
  { id: 'swingPlane', field: 'swingPlane', short: 'PLANE', name: 'Swing plane', unit: '°',
    domain: { min: 40, max: 66 }, better: 'none', decimals: 1 },
  { id: 'attackAngle', field: 'attackAngle', short: 'ATTACK', name: 'Attack angle', unit: '°',
    domain: { min: -10, max: 4 }, better: 'none', decimals: 2 },
  { id: 'curve', field: 'curve', short: 'CURVE', name: 'Curve', unit: 'm',
    domain: { min: -8, max: 48 }, band: { min: -5, max: 5 }, better: 'neutral', decimals: 1 },
  { id: 'clubSpeed', field: 'clubSpeed', short: 'SPEED', name: 'Club speed', unit: 'm/s',
    domain: { min: 36, max: 48 }, better: 'higher', decimals: 1 },
  { id: 'carry', field: 'carry', short: 'CARRY', name: 'Carry', unit: 'm',
    domain: { min: 80, max: 200 }, better: 'higher', decimals: 0 },
  { id: 'lowPointDistance', field: 'lowPointDistance', short: 'LOW PT', name: 'Low point', unit: 'm',
    domain: { min: -0.1, max: 0.3 }, better: 'none', decimals: 2 },
  { id: 'lowPointSide', field: 'lowPointSide', short: 'LOW SIDE', name: 'Low point side', unit: 'm',
    domain: { min: -0.08, max: 0.04 }, band: { min: -0.02, max: 0.02 }, better: 'neutral', decimals: 2 },
  { id: 'dynamicLoft', field: 'dynamicLoft', short: 'DYN LOFT', name: 'Dynamic loft', unit: '°',
    domain: { min: 8, max: 28 }, better: 'none', decimals: 1 },
  { id: 'spinLoft', field: 'spinLoft', short: 'SPIN LOFT', name: 'Spin loft', unit: '°',
    domain: { min: 12, max: 34 }, better: 'none', decimals: 1 },
]

/**
 * A `Map`, not an object literal, for the same reason `clubs.ts` uses one: `{}['toString']`
 * returns a function rather than `undefined`, so an object-literal lookup would happily
 * "recognise" `toString` as a metric.
 */
const BY_ID = new Map<MetricId, MetricInfo>(METRICS.map((m) => [m.id, m]))

/** The wire field names, in registry order. The GraphQL selection set is built from this. */
export const METRIC_FIELDS: string[] = METRICS.map((m) => m.field)

export function metricInfo(id: MetricId): MetricInfo {
  const info = BY_ID.get(id)
  if (!info) throw new Error(`Unknown metric: ${id}`)
  return info
}

export function isMetricId(value: unknown): value is MetricId {
  return typeof value === 'string' && BY_ID.has(value as MetricId)
}

/**
 * The single best reading among `values`, or `undefined` where the metric has no target.
 *
 * **Never `Math.max` for a `neutral` metric** — that reports the worst overshoot as the best
 * strike. **Never `Math.abs` on the stored value** either: the comparison uses magnitude, but
 * the value returned keeps its sign, because a sign flip is the one error that matters most.
 */
export function bestOf(values: number[], better: Better): number | undefined {
  if (values.length === 0 || better === 'none') return undefined
  if (better === 'higher') return values.reduce((a, b) => (b > a ? b : a))
  return values.reduce((a, b) => (Math.abs(b) < Math.abs(a) ? b : a))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/domain/metrics.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Typecheck**

Run: `npm run check`
Expected: `0 ERRORS`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/domain/metrics.ts src/lib/domain/metrics.test.ts
git commit -m "Add the metric registry, with axes authored from real data"
```

---

## Task 2: Types for per-metric readings and shots

**Files:**
- Modify: `src/lib/domain/types.ts`
- Test: `src/lib/domain/metrics.test.ts` (append)

**Interfaces:**
- Consumes: `MetricId` from `./metrics`.
- Produces: `MetricReading { typical: number; best?: number; n: number }`, `ExtraMetricId = Exclude<MetricId, 'clubPath'>`, `ClubPath.metrics?: Partial<Record<ExtraMetricId, MetricReading>>`, `Shot { club: Club; time?: string; metrics: Partial<Record<MetricId, number>> }`, `readingFor(row: ClubPath, id: MetricId): MetricReading | undefined`.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/domain/metrics.test.ts`:

```ts
import { readingFor } from './metrics'
import type { ClubPath } from './types'

describe('readingFor', () => {
  const row: ClubPath = {
    club: 'DRIVER',
    typical: -5.4,
    best: -0.19,
    n: 618,
    metrics: { swingPlane: { typical: 49.75, n: 666 } },
  }

  it('reads club path from its own dedicated fields, never from the metrics map', () => {
    // Club path is NOT duplicated into `metrics`. One value, one home.
    expect(readingFor(row, 'clubPath')).toEqual({ typical: -5.4, best: -0.19, n: 618 })
    expect(row.metrics).not.toHaveProperty('clubPath')
  })

  it('reads every other metric from the map', () => {
    expect(readingFor(row, 'swingPlane')).toEqual({ typical: 49.75, n: 666 })
  })

  it('reports an absent metric as absent, never as a zero reading', () => {
    expect(readingFor(row, 'curve')).toBeUndefined()
  })

  it('reports a hand-typed row as having no wider metrics and no club-path count', () => {
    // A hand-typed row has no `metrics` at all and no `n` — the form takes neither.
    const typed: ClubPath = { club: 'DRIVER', typical: -6, best: -4 }
    expect(readingFor(typed, 'swingPlane')).toBeUndefined()
    expect(readingFor(typed, 'clubPath')?.n).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/domain/metrics.test.ts`
Expected: FAIL — `readingFor` is not exported.

- [ ] **Step 3: Add the types**

In `src/lib/domain/types.ts`, add the import at the top (beside the existing `Club` import):

```ts
import type { MetricId } from './metrics'
```

Add these above the existing `ClubPath` interface:

```ts
/** Every metric except club path, which keeps its own dedicated fields on `ClubPath`. */
export type ExtraMetricId = Exclude<MetricId, 'clubPath'>

/**
 * One club's session aggregate for one metric.
 *
 * **`n` is required here, unlike `ClubPath.n`.** Every reading of this shape is computed from
 * strokes, so a count always exists; hand entry never produces one of these at all.
 *
 * **The count is per metric, and it has to be.** Null rates differ by up to 45 points — on the
 * driver, swing plane is present on 666 strokes where club path is present on 618. A count
 * shared across metrics would let `radiusFor()` draw the sparser reading as confidently as the
 * denser one.
 */
export interface MetricReading {
  /** Session mean for this club and metric. */
  typical: number
  /** Present only where the metric has a target — absent whenever `better` is `none`. */
  best?: number
  /** Measured strokes behind `typical`. */
  n: number
}
```

Then extend `ClubPath` — leaving every existing field exactly as it is — by adding this final member:

```ts
  /**
   * The wider measurement set, keyed by metric.
   *
   * **Absent on hand-typed rows and on everything imported before Phase 7.** Club path is
   * deliberately *not* duplicated in here: it keeps the fields above, so no existing reader
   * changes and no migration touches existing data.
   */
  metrics?: Partial<Record<ExtraMetricId, MetricReading>>
```

And add, after `TrackmanSession`:

```ts
/**
 * One measured stroke. Stored under `SHOTS#<sessionId>`, **never** alongside the session.
 *
 * Embedding these would force a multi-megabyte download on every page load to draw charts that
 * do not use them (D24). Every metric is optional: absence is the API's own posture — not one
 * of the 75 fields on `Measurement` is non-nullable — and an absent reading is never a zero.
 */
export interface Shot {
  club: Club
  /** UTC instant from the stroke, kept for ordering within a session. */
  time?: string
  metrics: Partial<Record<MetricId, number>>
}
```

- [ ] **Step 4: Add `readingFor` to the registry**

Add this import to the **top** of `src/lib/domain/metrics.ts`, beside the existing `./scale` import:

```ts
import type { ClubPath, MetricReading } from './types'
```

**This makes `metrics.ts` and `types.ts` import each other, and that is fine** — both directions
are `import type`, which is erased at compile time, so there is no runtime cycle. `verbatimModuleSyntax`
is on in `tsconfig.json`, which is what forces the `type` keyword to be explicit and keeps this
true rather than accidental. Do not "fix" it by moving `MetricId` into `types.ts`: the registry is
the source of truth for what a metric is, and splitting the id from its definition would put the
list of metric names somewhere the axes are not.

Then append the function to the end of the file:

```ts
/**
 * A uniform view of any metric on a club row.
 *
 * Club path lives in `ClubPath`'s own `typical`/`best`/`n` fields and everything else lives in
 * `metrics`. **This function is the one place that knows that**, so no caller has to special-case
 * it and no value has to be stored twice.
 */
export function readingFor(row: ClubPath, id: MetricId): MetricReading | undefined {
  if (id !== 'clubPath') return row.metrics?.[id]
  // `n` is optional on `ClubPath` and required on `MetricReading`, because a hand-typed row has
  // no count. Cast rather than fabricate: a `0` here would weight a guess as though measured.
  return { typical: row.typical, best: row.best, n: row.n as number }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/lib/domain/metrics.test.ts && npm run check`
Expected: PASS, 16 tests; `0 ERRORS`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/domain/types.ts src/lib/domain/metrics.ts src/lib/domain/metrics.test.ts
git commit -m "Carry a per-metric shot count, because null rates differ by 45 points"
```

---

## Task 3: Per-metric aggregation

**Files:**
- Modify: `src/lib/ingest/aggregate.ts`
- Test: `src/lib/ingest/aggregate.test.ts`

**Interfaces:**
- Consumes: `METRICS`, `bestOf` from `../domain/metrics`; `Shot`, `MetricReading` from `../domain/types`.
- Produces: `aggregateActivity(activity, onUnknownClub?): { session: TrackmanSession; shots: Shot[] } | null`, `aggregateActivities(activities, onUnknownClub?): { sessions: TrackmanSession[]; shots: Map<string, Shot[]> }`. `RawStroke.measurement` widens to `Record<string, unknown> | null`.

**Note:** this changes both functions' return types. Every existing call site (`api.ts`, `aggregate.test.ts`) is updated in this task.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/ingest/aggregate.test.ts`:

```ts
const rich = (club: string, m: Record<string, number | null>, time = '2026-07-27T08:00:00Z') =>
  ({ club, time, measurement: m })

describe('aggregateActivity · the wider metric set', () => {
  it('counts each metric separately, because their null rates differ', () => {
    // The finding that forced this: on the driver, swing plane is present on 666 strokes where
    // club path is present on 618. One shared count would overstate the sparser metric.
    const { session } = aggregateActivity(
      activity([
        rich('Driver', { clubPath: -6, swingPlane: 50 }),
        rich('Driver', { clubPath: -4, swingPlane: 52 }),
        rich('Driver', { clubPath: null, swingPlane: 54 }),
      ]),
    )!
    expect(session.clubs[0].n).toBe(2)
    expect(session.clubs[0].metrics?.swingPlane).toEqual({ typical: 52, n: 3 })
  })

  it('keeps a stroke that measured a plane but no path', () => {
    // Filtering the whole stroke on a null clubPath would throw away a good plane reading.
    const { session } = aggregateActivity(
      activity([rich('Driver', { clubPath: -6 }), rich('Driver', { swingPlane: 60 })]),
    )!
    expect(session.clubs[0].metrics?.swingPlane).toEqual({ typical: 60, n: 1 })
  })

  it('stores no best where the metric has no target', () => {
    // swingPlane is `better: 'none'` — a driver and an iron want different numbers, so there is
    // no shared target and inventing one would be worse than admitting it.
    const { session } = aggregateActivity(
      activity([rich('Driver', { clubPath: -6, swingPlane: 50, faceToPath: 4 })]),
    )!
    expect(session.clubs[0].metrics?.swingPlane).not.toHaveProperty('best')
    expect(session.clubs[0].metrics?.faceToPath).toEqual({ typical: 4, best: 4, n: 1 })
  })

  it('picks the face-to-path closest to neutral, never the largest', () => {
    const { session } = aggregateActivity(
      activity([
        rich('Driver', { clubPath: -6, faceToPath: 8 }),
        rich('Driver', { clubPath: -6, faceToPath: 2 }),
      ]),
    )!
    expect(session.clubs[0].metrics?.faceToPath?.best).toBe(2)
  })

  it('takes the largest carry, where larger genuinely is better', () => {
    const { session } = aggregateActivity(
      activity([
        rich('Driver', { clubPath: -6, carry: 150 }),
        rich('Driver', { clubPath: -6, carry: 172 }),
      ]),
    )!
    expect(session.clubs[0].metrics?.carry?.best).toBe(172)
  })

  it('omits a metric entirely when nothing measured it', () => {
    const { session } = aggregateActivity(activity([rich('Driver', { clubPath: -6 })]))!
    expect(session.clubs[0].metrics).toEqual({})
  })

  it('still requires a club path for the club to appear at all', () => {
    // Club path is the KPI and the reason this session type exists. A club row without one
    // would be a row with no KPI in it.
    expect(aggregateActivity(activity([rich('Driver', { swingPlane: 50 })]))).toBeNull()
  })

  it('never blends a metric across clubs', () => {
    const { session } = aggregateActivity(
      activity([
        rich('Driver', { clubPath: -6, swingPlane: 50 }),
        rich('7Iron', { clubPath: -2, swingPlane: 70 }),
      ]),
    )!
    expect(session.clubs.find((c) => c.club === 'DRIVER')!.metrics?.swingPlane?.typical).toBe(50)
    expect(session.clubs.find((c) => c.club === 'IRON7')!.metrics?.swingPlane?.typical).toBe(70)
  })
})

describe('aggregateActivity · shots', () => {
  it('returns one shot per measured stroke, keyed to the session', () => {
    const { shots } = aggregateActivity(
      activity([
        rich('Driver', { clubPath: -6, swingPlane: 50 }),
        rich('7Iron', { clubPath: -2 }),
      ]),
    )!
    expect(shots).toEqual([
      { club: 'DRIVER', time: '2026-07-27T08:00:00Z', metrics: { clubPath: -6, swingPlane: 50 } },
      { club: 'IRON7', time: '2026-07-27T08:00:00Z', metrics: { clubPath: -2 } },
    ])
  })

  it('omits an absent metric rather than writing a zero', () => {
    const { shots } = aggregateActivity(activity([rich('Driver', { clubPath: -6, curve: null })]))!
    expect(shots[0].metrics).not.toHaveProperty('curve')
  })

  it('drops a stroke whose club cannot be mapped, matching the aggregates', () => {
    const { shots } = aggregateActivity(
      activity([rich('Driver', { clubPath: -6 }), rich('3Hybrid', { clubPath: -2 })]),
    )!
    expect(shots).toHaveLength(1)
  })
})
```

Then update the two existing `aggregateActivities` tests and every existing `aggregateActivity(...)!` call in the file to destructure. The existing shape assertions stay identical:

```ts
// was: const s = aggregateActivity(activity([...]))!
const { session: s } = aggregateActivity(activity([...]))!
```

```ts
// was: const sessions = aggregateActivities([...])
const { sessions } = aggregateActivities([...])
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/ingest/aggregate.test.ts`
Expected: FAIL — destructuring a `TrackmanSession` yields `undefined` for `session`.

- [ ] **Step 3: Rewrite the aggregation**

Replace the body of `src/lib/ingest/aggregate.ts` below the `round2` helper with:

```ts
/** Widened to the whole measurement object: the registry decides which keys are read. */
export interface RawStroke {
  club?: string | null
  time?: string | null
  measurement?: Record<string, unknown> | null
}

/** Finite numbers only. `null` is absence, and a `NaN` is not a reading either. */
function reading(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * Turn one activity into one session plus its shots, or `null` if nothing in it was measured.
 *
 * **The per-metric filter is the point of this function.** Each metric aggregates only the
 * strokes where *that* metric is present, and reports its own count. In the real backfill the
 * driver has 666 plane readings against 618 path readings — filtering every stroke on a null
 * club path would have thrown 48 good plane readings away, and sharing one count would have
 * overstated the sparser metric on every chart.
 *
 * A club still needs at least one **club path** reading to appear: it is the KPI and the reason
 * `TrackmanSession` exists, so a club row without one would be a row with no KPI in it.
 */
export function aggregateActivity(
  activity: RawActivity,
  onUnknownClub?: UnknownClubReporter,
): { session: TrackmanSession; shots: Shot[] } | null {
  const byClub = new Map<Club, Map<MetricId, number[]>>()
  const shots: Shot[] = []

  for (const stroke of activity.strokes ?? []) {
    if (!stroke?.club) continue

    const club = normaliseClub(stroke.club)
    if (club === null) {
      // Reported rather than dropped in silence: `normaliseClub` refuses to guess at a spelling
      // it has never seen, so this is the only chance to learn a new club is in the bag.
      onUnknownClub?.(stroke.club)
      continue
    }

    const measured: Partial<Record<MetricId, number>> = {}
    for (const metric of METRICS) {
      const value = reading(stroke.measurement?.[metric.field])
      // Assigned conditionally, always: an absent reading must stay absent, never become 0.
      if (value !== null) measured[metric.id] = value
    }
    if (Object.keys(measured).length === 0) continue

    const shot: Shot = { club, metrics: measured }
    if (stroke.time) shot.time = stroke.time
    shots.push(shot)

    let values = byClub.get(club)
    if (!values) {
      values = new Map()
      byClub.set(club, values)
    }
    for (const [id, value] of Object.entries(measured) as [MetricId, number][]) {
      const list = values.get(id)
      if (list) list.push(value)
      else values.set(id, [value])
    }
  }

  const clubs: ClubPath[] = [...byClub.entries()]
    .flatMap(([club, values]) => {
      const paths = values.get('clubPath')
      if (!paths || paths.length === 0) return []

      const metrics: Partial<Record<ExtraMetricId, MetricReading>> = {}
      for (const metric of METRICS) {
        if (metric.id === 'clubPath') continue
        const list = values.get(metric.id)
        if (!list || list.length === 0) continue
        const entry: MetricReading = {
          typical: round2(list.reduce((a, b) => a + b, 0) / list.length),
          n: list.length,
        }
        const best = bestOf(list, metric.better)
        // Assigned conditionally: `better: 'none'` metrics carry no `best` at all.
        if (best !== undefined) entry.best = round2(best)
        metrics[metric.id as ExtraMetricId] = entry
      }

      return [{
        club,
        typical: round2(paths.reduce((a, b) => a + b, 0) / paths.length),
        // Closest to neutral. The target is a band centred on zero, so overshooting counts
        // against you — `+5` must lose to `+1`. A `Math.max` "best" would reward the fault.
        best: round2(bestOf(paths, 'neutral') as number),
        n: paths.length,
        metrics,
      }]
    })
    .sort((a, b) => compareClubs(a.club, b.club))

  if (clubs.length === 0) return null

  return {
    session: {
      id: activity.id,
      type: 'trackman',
      // The Sydney date, reusing the plan's own rule. 10 of 91 real sessions fall on a different
      // UTC date, so `time.slice(0, 10)` would misfile one session in ten.
      date: resolveISODate(new Date(activity.time)),
      clubs,
      source: 'api',
    },
    // Only the clubs that made it into the aggregates, so the two can never disagree.
    shots: shots.filter((s) => clubs.some((c) => c.club === s.club)),
  }
}

/**
 * Oldest first, tie-broken by id, so a new pull appends rather than reshuffling.
 *
 * Shots come back keyed by session id, which is what the ingest needs to address `SHOTS#<id>`.
 */
export function aggregateActivities(
  activities: RawActivity[],
  onUnknownClub?: UnknownClubReporter,
): { sessions: TrackmanSession[]; shots: Map<string, Shot[]> } {
  const shots = new Map<string, Shot[]>()
  const sessions = activities
    .map((a) => aggregateActivity(a, onUnknownClub))
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .map((r) => {
      shots.set(r.session.id, r.shots)
      return r.session
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
  return { sessions, shots }
}
```

Update the imports at the top of the file to:

```ts
import { compareClubs, normaliseClub, type Club } from '../domain/clubs'
import { METRICS, bestOf, type MetricId } from '../domain/metrics'
import { resolveISODate } from '../domain/today'
import type { ClubPath, ExtraMetricId, MetricReading, Shot, TrackmanSession } from '../domain/types'
```

- [ ] **Step 4: Update `api.ts` and `source.ts` for the new return type**

In `src/lib/ingest/source.ts`, change the `fetchSince` signature and its doc line:

```ts
  /**
   * Inclusive of `date`. Returns sessions already aggregated per club, and the per-shot record
   * keyed by session id — the ingest writes the two to different places (D24).
   */
  fetchSince(date: ISODate): Promise<{ sessions: TrackmanSession[]; shots: Map<string, Shot[]> }>
```

Add `Shot` to that file's type import.

In `src/lib/ingest/api.ts`, change the query's stroke selection to be built from the registry, replacing the hardcoded `measurement { clubPath }`:

```ts
import { METRIC_FIELDS } from '../domain/metrics'

// ...

/**
 * **Every field name comes from the registry**, so the wire format is stated once and reviewed
 * in one place.
 *
 * A field the token cannot read fails the **whole request**, `clubPath` included — there is no
 * partial-field response. No retry logic narrows the selection on failure: a retry that silently
 * dropped the KPI would be worse than a loud failure, and manual entry is the baseline (D6).
 */
const STROKE_FIELDS = METRIC_FIELDS.join(' ')
```

and in the query template, replace `measurement { clubPath }` with `measurement { ${STROKE_FIELDS} }`.

Change `fetchSince`'s return type to match `TrackmanSource`, and return `aggregateActivities(items, onUnknownClub)` unchanged (it already returns the right shape).

- [ ] **Step 5: Run all tests**

Run: `npm test && npm run check`
Expected: PASS; `0 ERRORS`. `merge.test.ts` must be untouched and passing — that is the evidence the merge rules did not drift.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ingest/ src/lib/domain/
git commit -m "Aggregate every metric on its own strokes, with its own count"
```

---

## Task 4: Schema version 3

**Files:**
- Modify: `src/lib/storage/migrations.ts`
- Modify: `src/lib/storage/transfer.ts`
- Test: `src/lib/storage/migrations.test.ts`, `src/lib/storage/transfer.test.ts`

**Interfaces:**
- Consumes: `MetricReading`, `ExtraMetricId` from `../domain/types`; `isMetricId` from `../domain/metrics`.
- Produces: `SCHEMA_VERSION = 3`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/storage/migrations.test.ts`:

```ts
it('migrates a version 2 document to 3 without altering it', () => {
  // Identity, deliberately. Every v2 document is already a valid v3 one: `metrics` is optional
  // and nothing existing changes shape.
  const doc = {
    schemaVersion: 2,
    sessions: [
      { id: 'a', type: 'trackman', date: '2026-07-27', source: 'api',
        clubs: [{ club: 'DRIVER', typical: -5.4, best: -0.19, n: 618 }] },
    ],
    settings: {},
  }
  const out = migrate(doc)
  expect(out.schemaVersion).toBe(3)
  expect(out.sessions).toEqual(doc.sessions)
})

it('refuses a version 4 document rather than guessing at it', () => {
  expect(() => migrate({ schemaVersion: 4, sessions: [], settings: {} })).toThrow(FutureSchemaError)
})
```

Append to `src/lib/storage/transfer.test.ts`:

```ts
it('preserves the wider metrics through an export and import round trip', () => {
  // The reason for the version bump: a build that drops `metrics` on import would lose them
  // silently, and the loss would only show up as charts quietly going empty.
  const doc = {
    schemaVersion: 3,
    sessions: [
      { id: 'a', type: 'trackman', date: '2026-07-27', source: 'api',
        clubs: [{
          club: 'DRIVER', typical: -5.4, best: -0.19, n: 618,
          metrics: { swingPlane: { typical: 49.75, n: 666 }, faceToPath: { typical: 4.36, best: 0.97, n: 556 } },
        }] },
    ],
    settings: {},
  }
  const parsed = parseDocument(doc)
  expect(parsed.sessions[0]).toMatchObject({
    clubs: [{ metrics: { swingPlane: { typical: 49.75, n: 666 } } }],
  })
})

it('rejects a metric reading with a non-finite typical', () => {
  const doc = {
    schemaVersion: 3,
    sessions: [
      { id: 'a', type: 'trackman', date: '2026-07-27', source: 'api',
        clubs: [{ club: 'DRIVER', typical: -5.4, best: -0.19, n: 618,
                  metrics: { swingPlane: { typical: 'steep', n: 4 } } }] },
    ],
    settings: {},
  }
  expect(() => parseDocument(doc)).toThrow()
})

it('drops a metric it does not know, rather than storing a name it cannot chart', () => {
  const doc = {
    schemaVersion: 3,
    sessions: [
      { id: 'a', type: 'trackman', date: '2026-07-27', source: 'api',
        clubs: [{ club: 'DRIVER', typical: -5.4, best: -0.19, n: 618,
                  metrics: { swingDirection: { typical: -8, n: 4 } } }] },
    ],
    settings: {},
  }
  expect(parseDocument(doc).sessions[0]).toMatchObject({ clubs: [{ metrics: {} }] })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/storage/`
Expected: FAIL — `expected 2 to be 3`, and `metrics` missing from the parsed club row.

- [ ] **Step 3: Bump the version and add the migration**

In `src/lib/storage/migrations.ts`, change the constant and add the entry:

```ts
export const SCHEMA_VERSION = 3
```

```ts
  /**
   * v2 → v3: the wider Trackman metric set joins each club row. **Identity, deliberately.**
   * Every v2 document is already a valid v3 one — `metrics` is optional, and club path keeps
   * the fields it has always had.
   *
   * The bump is not for the data. It is so the **build currently deployed** refuses to touch a
   * document containing `metrics`, which its `checkTrackmanSession` would silently drop on any
   * export/import round trip. `FutureSchemaError` then does the right thing: refuse, don't
   * quarantine, and say "update the site". Exactly the v1 → v2 reasoning.
   */
  2: (doc) => doc,
```

- [ ] **Step 4: Validate metrics on import**

In `src/lib/storage/transfer.ts`, add the import:

```ts
import { isMetricId } from '../domain/metrics'
import type { ExtraMetricId, MetricReading } from '../domain/types'
```

Add this helper beside `checkDrillIds`:

```ts
/**
 * **Unknown metrics are dropped, not rejected.** An export written by a newer build may name a
 * metric this one cannot chart, and refusing the whole document over it would turn a forward-
 * compatible addition into a failed restore. An unknown *club* is different and still rejects:
 * a club is the key a reading is filed under, so guessing there loses the reading itself.
 */
function checkMetrics(raw: unknown, where: string): Partial<Record<ExtraMetricId, MetricReading>> | undefined {
  if (raw === undefined) return undefined
  if (!isRecord(raw)) reject(`${where} has a malformed metrics map.`)

  const out: Partial<Record<ExtraMetricId, MetricReading>> = {}
  for (const [id, value] of Object.entries(raw)) {
    if (!isMetricId(id) || id === 'clubPath') continue
    if (!isRecord(value)) reject(`${where} has a malformed "${id}" reading.`)
    if (typeof value.typical !== 'number' || !Number.isFinite(value.typical)) {
      reject(`${where} has a "${id}" reading with no usable value.`)
    }
    if (typeof value.n !== 'number' || !Number.isInteger(value.n) || value.n < 1) {
      reject(`${where} has a "${id}" reading with no usable shot count.`)
    }
    const entry: MetricReading = { typical: value.typical, n: value.n }
    if (value.best !== undefined) {
      if (typeof value.best !== 'number' || !Number.isFinite(value.best)) {
        reject(`${where} has a "${id}" reading with a malformed best.`)
      }
      entry.best = value.best
    }
    out[id as ExtraMetricId] = entry
  }
  return out
}
```

In `checkTrackmanSession`'s club mapping, add `metrics` to the returned row. Locate the object literal it returns for each club and add, as its last member:

```ts
      ...(entry.metrics !== undefined ? { metrics: checkMetrics(entry.metrics, what) } : {}),
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test && npm run check`
Expected: PASS; `0 ERRORS`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/storage/
git commit -m "Bump to schemaVersion 3 so an older build refuses metrics it would drop"
```

---

## Task 5: The `/shots/{id}` endpoints

**Files:**
- Modify: `infra/function/handler.mjs`
- Modify: `infra/handler.test.mjs`

**Interfaces:**
- Produces: `route()` returns `{ kind: 'putShots', id }` and `{ kind: 'getShots', id }`; `validateShots(raw)` throws `BadRequest`.

- [ ] **Step 1: Write the failing tests**

In `infra/handler.test.mjs`, change the existing reserved-route assertion and add new cases:

```js
// was: expect(route('GET', '/shots/a1')).toBeNull() // reserved, not implemented
expect(route('GET', '/shots/a1')).toEqual({ kind: 'getShots', id: 'a1' })
```

```js
import { validateShots } from './function/handler.mjs'

describe('the shots routes', () => {
  it('routes a put and a get, and nothing else', () => {
    expect(route('PUT', '/shots/a1')).toEqual({ kind: 'putShots', id: 'a1' })
    expect(route('GET', '/shots/a1')).toEqual({ kind: 'getShots', id: 'a1' })
    expect(route('DELETE', '/shots/a1')).toBeNull()
    expect(route('PUT', '/shots')).toBeNull()
  })

  it('decodes a real Trackman id the same way the session routes do', () => {
    // 88-character base64 ending in "=". Validating these against an invented charset rejected
    // all 86 real sessions once; the rule is safety, not format.
    const id =
      'VmlydHVhbFJhbmdlU2Vzc2lvbkFjdGl2aXR5CmRjNTlkNzkzMS1kNjQ0LTU1OTQtYTEyMC04ZTIzOTA5MDQ1MmU='
    expect(route('PUT', `/shots/${encodeURIComponent(id)}`)).toEqual({ kind: 'putShots', id })
  })
})

describe('validateShots', () => {
  it('accepts an array of shots with a club and finite readings', () => {
    const shots = [{ club: 'DRIVER', time: '2026-07-27T08:00:00Z', metrics: { clubPath: -6 } }]
    expect(validateShots({ shots })).toEqual(shots)
  })

  it('accepts an empty array — a session where nothing was measured', () => {
    expect(validateShots({ shots: [] })).toEqual([])
  })

  it('rejects a body that is not a shots array', () => {
    expect(() => validateShots({})).toThrow(BadRequest)
    expect(() => validateShots({ shots: 'lots' })).toThrow(BadRequest)
  })

  it('rejects a shot with no club, since a reading with no club is meaningless', () => {
    // Club path without a club tracks nothing: a mixed-club figure follows club selection.
    expect(() => validateShots({ shots: [{ metrics: { clubPath: -6 } }] })).toThrow(BadRequest)
  })

  it('rejects a non-finite reading rather than storing a NaN the client cannot render', () => {
    expect(() => validateShots({ shots: [{ club: 'DRIVER', metrics: { clubPath: 'left' } }] }))
      .toThrow(BadRequest)
  })

  it('refuses a batch far larger than any real session', () => {
    // The largest real session is 225 strokes. This bounds an open endpoint (D19), it is not a
    // statement about the data.
    const shots = Array.from({ length: 2001 }, () => ({ club: 'DRIVER', metrics: {} }))
    expect(() => validateShots({ shots })).toThrow(BadRequest)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run infra/handler.test.mjs`
Expected: FAIL — `validateShots` is not exported; `route('PUT', '/shots/a1')` is `null`.

- [ ] **Step 3: Implement the routes**

In `infra/function/handler.mjs`, bump the version constant:

```js
/** Kept in step with `SCHEMA_VERSION` in `src/lib/storage/migrations.ts`. */
const SCHEMA_VERSION = 3
```

Replace the comment above `route` and extend the function:

```js
/**
 * `/shots/{id}` holds the per-shot record, in its own item so no chart downloads it (D24).
 *
 * `GET` exists because a write nobody can read back is unverifiable, and this project's rule is
 * to verify a deploy before calling the work done. There is no `DELETE`: shots are derived from
 * a session, so removing the session is what retires them.
 */
export function route(method, path) {
  if (path === '/sessions' && method === 'GET') return { kind: 'listSessions' }
  if (path === '/settings' && method === 'GET') return { kind: 'getSettings' }
  if (path === '/settings' && method === 'PUT') return { kind: 'putSettings' }

  // `[^/]+` deliberately: an encoded slash (`%2F`) stays inside one segment and decodes back to
  // a literal slash, which is fine as an identifier because it only ever becomes a sort key.
  const session = /^\/sessions\/([^/]+)$/.exec(path)
  if (session) {
    const id = decodeId(session[1])
    if (id !== null) {
      if (method === 'PUT') return { kind: 'putSession', id }
      if (method === 'DELETE') return { kind: 'deleteSession', id }
    }
  }

  const shots = /^\/shots\/([^/]+)$/.exec(path)
  if (shots) {
    const id = decodeId(shots[1])
    if (id !== null) {
      if (method === 'PUT') return { kind: 'putShots', id }
      if (method === 'GET') return { kind: 'getShots', id }
    }
  }
  return null
}
```

Add the validator beside `validateSession`:

```js
/**
 * Longer than any real session. The largest in thirteen months is 225 strokes; this bounds what
 * an open endpoint (D19) can be made to store, and is not a claim about the data.
 */
const MAX_SHOTS = 2000

/** Structural only — a gate against shapes the client cannot parse, not a second authority. */
export function validateShots(raw) {
  if (!isRecord(raw)) throw new BadRequest('The body must be a JSON object.')
  if (!Array.isArray(raw.shots)) throw new BadRequest('The body must carry a shots array.')
  if (raw.shots.length > MAX_SHOTS) {
    throw new BadRequest(`A session may not carry more than ${MAX_SHOTS} shots.`)
  }
  for (const shot of raw.shots) {
    if (!isRecord(shot)) throw new BadRequest('Every shot must be an object.')
    // A reading with no club tracks club selection rather than swing change (OQ-7). The club
    // name itself is the client's to police; this only insists there is one.
    if (typeof shot.club !== 'string' || shot.club === '') {
      throw new BadRequest('Every shot must name a club.')
    }
    if (shot.time !== undefined && typeof shot.time !== 'string') {
      throw new BadRequest('A shot time must be a string.')
    }
    if (!isRecord(shot.metrics)) throw new BadRequest('Every shot must carry a metrics object.')
    for (const value of Object.values(shot.metrics)) {
      // Absent is fine and expected; a NaN or a string is a shape the client cannot render.
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new BadRequest('Every shot reading must be a finite number.')
      }
    }
  }
  return raw.shots
}
```

Add the two cases to the handler's `switch`, after `deleteSession`:

```js
        case 'putShots': {
          const shots = validateShots(body)
          await client.send(
            new PutItemCommand({
              TableName: tableName,
              Item: item(`SHOTS#${target.id}`, 'v1', shots, 'api'),
            }),
          )
          return json(200, { ok: true, count: shots.length })
        }

        case 'getShots': {
          const out = await client.send(
            new GetItemCommand({
              TableName: tableName,
              Key: { pk: { S: `SHOTS#${target.id}` }, sk: { S: 'v1' } },
            }),
          )
          return json(200, { shots: out.Item ? JSON.parse(out.Item.doc.S) : [] })
        }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run infra/handler.test.mjs && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add infra/
git commit -m "Add the shots endpoints, in their own key space so no chart pays for them"
```

---

## Task 6: Writing shots from the ingest

**Files:**
- Modify: `src/lib/storage/remote.ts`
- Modify: `scripts/trackman-ingest.ts`
- Test: `src/lib/storage/remote.test.ts`

**Interfaces:**
- Consumes: `Shot` from `../domain/types`.
- Produces: `RemoteRepo.saveShots(sessionId: string, shots: Shot[]): Promise<void>`, `RemoteRepo.getShots(sessionId: string): Promise<Shot[]>`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/storage/remote.test.ts`, following that file's existing fake-`fetch` idiom:

```ts
describe('shots', () => {
  it('writes to the shots key space, percent-encoding the id', () => {
    // Trackman ids are 88-character base64 ending in "=", which must survive the URL.
    const calls: string[] = []
    const repo = new RemoteRepo('https://x.test', async (url) => {
      calls.push(String(url))
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    })
    return repo.saveShots('a=b', [{ club: 'DRIVER', metrics: { clubPath: -6 } }]).then(() => {
      expect(calls).toEqual(['https://x.test/shots/a%3Db'])
    })
  })

  it('reads shots back, which is what makes the write verifiable', async () => {
    const shots = [{ club: 'DRIVER' as const, metrics: { clubPath: -6 } }]
    const repo = new RemoteRepo('https://x.test', async () =>
      new Response(JSON.stringify({ shots }), { status: 200 }))
    expect(await repo.getShots('a')).toEqual(shots)
  })

  it('throws when the store refuses the write, never swallowing it', async () => {
    // A silently lost write is the one failure mode localStorage never had.
    const repo = new RemoteRepo('https://x.test', async () =>
      new Response(JSON.stringify({ message: 'no' }), { status: 400 }))
    await expect(repo.saveShots('a', [])).rejects.toThrow(RemoteStoreError)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/storage/remote.test.ts`
Expected: FAIL — `repo.saveShots is not a function`.

- [ ] **Step 3: Add the methods**

In `src/lib/storage/remote.ts`, add `Shot` to the type import and add these methods after `deleteSession`:

```ts
  /**
   * Per-shot metrics for one session, in their own item (D24).
   *
   * **Deliberately not on the `Repository` interface.** Components reach storage through that
   * interface; putting shots on it would invite a component to download thousands of rows to
   * draw charts that do not use them, which is the whole reason the key space is separate. The
   * ingest is the only writer, and `CachedRepo` never sees these.
   */
  async saveShots(sessionId: string, shots: Shot[]): Promise<void> {
    await this.#write(`/shots/${encodeURIComponent(sessionId)}`, { shots })
  }

  async getShots(sessionId: string): Promise<Shot[]> {
    const body = await this.#request<{ shots: Shot[] }>(
      'GET',
      `/shots/${encodeURIComponent(sessionId)}`,
    )
    return body.shots ?? []
  }
```

- [ ] **Step 4: Wire the ingest**

In `scripts/trackman-ingest.ts`, update the fetch to destructure, and write shots for the sessions the merge actually wrote:

```ts
  let fetched
  try {
    fetched = await source.fetchSince(from, (name) => unknownClubs.add(name))
  } catch (error) {
    fail(error instanceof Error ? error.message : 'The pull failed for an unknown reason.')
  }
```

Replace the merge block with:

```ts
  const repo = new RemoteRepo(url)

  let result
  try {
    result = await repo.mergeTrackman(fetched.sessions)
  } catch (error) {
    fail(error instanceof Error ? error.message : 'The store could not be written.')
  }

  // Shots follow the sessions, and only for what the merge actually wrote. A session skipped
  // because it is hand-typed must not have machine shots attached to it — that would put an
  // imported record behind a manual one, which is the guarantee `ifNotManual` exists to keep.
  let shotSessions = 0
  let shotCount = 0
  for (const session of result.sessions) {
    if (session.source !== 'api') continue
    const shots = fetched.shots.get(session.id)
    if (!shots || shots.length === 0) continue
    try {
      await repo.saveShots(session.id, shots)
    } catch (error) {
      // Loud, never swallowed: the session aggregates already landed, so a silent failure here
      // would leave the two halves out of step with nothing to show for it.
      fail(error instanceof Error ? error.message : `Could not write shots for ${session.id}.`)
    }
    shotSessions += 1
    shotCount += shots.length
  }
```

And extend the closing log line:

```ts
  console.log(
    `Pulled from ${from}: ${fetched.sessions.length} session(s) measured · ` +
      `${result.added} new · ${result.updated} updated · ${result.skipped} skipped · ` +
      `${shotCount} shot(s) across ${shotSessions} session(s).`,
  )
```

- [ ] **Step 5: Run everything**

Run: `npm test && npm run check`
Expected: PASS; `0 ERRORS`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/storage/remote.ts src/lib/storage/remote.test.ts scripts/trackman-ingest.ts
git commit -m "Write the per-shot record alongside the aggregates, never inside them"
```

---

## Task 7: Deploy the handler and prove the round trip

**Files:** none changed — this is a manual deployment and verification task.

**This task deploys real infrastructure by hand.** `infra/` is never deployed from CI (D25): doing so would need AWS credentials in a public repo's Actions, the one thing D22 avoids.

- [ ] **Step 1: Package and deploy**

```bash
cd infra
aws cloudformation package \
  --template-file template.yaml \
  --s3-bucket golf-store-artifacts-556684849777 \
  --output-template-file packaged.yaml
aws cloudformation deploy \
  --region ap-southeast-2 \
  --stack-name golf-store \
  --template-file packaged.yaml \
  --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND
```

Expected: `Successfully created/updated stack`. Note that `No changes to deploy` exits non-zero and **is success, not failure**.

- [ ] **Step 2: Prove the write and the read back**

```bash
API=$(gh variable list --json name,value --jq '.[]|select(.name=="API_URL").value')
curl -sS -X PUT "$API/shots/plan-smoke-test" \
  -H 'content-type: application/json' \
  -d '{"shots":[{"club":"DRIVER","metrics":{"clubPath":-6,"swingPlane":50}}]}'
curl -sS "$API/shots/plan-smoke-test"
```

Expected: `{"ok":true,"count":1}` then the shot back verbatim. **The read is the point** — a write nobody can read back proves nothing.

- [ ] **Step 3: Prove the validation gate rejects a bad shape**

```bash
curl -sS -o /dev/null -w '%{http_code}\n' -X PUT "$API/shots/plan-smoke-test" \
  -H 'content-type: application/json' -d '{"shots":[{"metrics":{}}]}'
```

Expected: `400`.

- [ ] **Step 4: Confirm the smoke-test item is harmless**

`plan-smoke-test` is not a real session id, so nothing reads it and no chart sees it. Leave it or remove it with the AWS console; there is deliberately no `DELETE /shots/{id}`.

- [ ] **Step 5: Record the deployment**

No commit — nothing changed in the repo. Note in the PR description that the stack was redeployed and the round trip verified.

---

## Task 8: The backfill

**Files:** none changed.

- [ ] **Step 1: Run a narrow window first**

```bash
gh workflow run trackman.yml -f since=2026-07-01
gh run watch "$(gh run list --workflow=trackman.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
```

Expected: green, with the log's final line reporting a non-zero shot count across a non-zero session count.

- [ ] **Step 2: Verify one real session end to end**

```bash
API=$(gh variable list --json name,value --jq '.[]|select(.name=="API_URL").value')
ID=$(curl -sS "$API/sessions" | jq -r '.sessions[0].id')
curl -sS "$API/sessions" | jq '.sessions[0].clubs[0].metrics'
curl -sS "$API/shots/$(jq -rn --arg v "$ID" '$v|@uri')" | jq '.shots | length'
```

Expected: a `metrics` object with per-metric `typical`/`n`, and a non-zero shot count.

**Check that `n` differs between metrics** on at least one club. If every metric reports an identical `n`, the per-metric filter is not doing its job — that is the single most important thing to confirm here, because the failure is silent.

- [ ] **Step 3: Run the full 13-month backfill**

```bash
gh workflow run trackman.yml -f since=2025-06-01
gh run watch "$(gh run list --workflow=trackman.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
```

Expected: green. 91 sessions, roughly 4,900 shots.

- [ ] **Step 4: Confirm the counts**

```bash
curl -sS "$API/sessions" | jq '[.sessions[]|select(.type=="trackman")] | length'
curl -sS "$API/sessions" | jq '[.sessions[]|select(.clubs[0].metrics|length > 0)] | length'
```

Expected: 91 Trackman sessions, and 91 carrying metrics.

- [ ] **Step 5: Record the numbers**

No commit. Note the observed session and shot counts in the PR description — they are the evidence the backfill landed.

---

## Task 9: Relating two metrics

**Files:**
- Create: `src/lib/domain/relate.ts`
- Test: `src/lib/domain/relate.test.ts`

**Interfaces:**
- Consumes: `Session`, `isTrackman` from `./types`; `Club` from `./clubs`; `MetricId`, `readingFor` from `./metrics`.
- Produces: `RelationPoint { date: ISODate; x: number; y: number; n: number }`, `Relation { club: Club; x: MetricId; y: MetricId; points: RelationPoint[]; r: number | null; skipped: number }`, `relate(sessions, club, x, y): Relation`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/domain/relate.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { relate } from './relate'
import type { TrackmanSession } from './types'

function tm(id: string, date: string, clubs: TrackmanSession['clubs']): TrackmanSession {
  return { id, type: 'trackman', date, clubs, source: 'api' }
}

const driver = (typical: number, plane?: number) => ({
  club: 'DRIVER' as const,
  typical,
  best: typical,
  n: 10,
  ...(plane === undefined ? {} : { metrics: { swingPlane: { typical: plane, n: 10 } } }),
})

describe('relate', () => {
  it('pairs two metrics from the same session', () => {
    const r = relate(
      [tm('a', '2026-07-01', [driver(-6, 50)]), tm('b', '2026-07-08', [driver(-4, 54)])],
      'DRIVER', 'swingPlane', 'clubPath',
    )
    expect(r.points).toEqual([
      { date: '2026-07-01', x: 50, y: -6, n: 10 },
      { date: '2026-07-08', x: 54, y: -4, n: 10 },
    ])
  })

  it('reports a perfect positive relationship as r = 1', () => {
    const r = relate(
      [
        tm('a', '2026-07-01', [driver(-6, 50)]),
        tm('b', '2026-07-08', [driver(-4, 52)]),
        tm('c', '2026-07-15', [driver(-2, 54)]),
      ],
      'DRIVER', 'swingPlane', 'clubPath',
    )
    expect(r.r).toBeCloseTo(1, 10)
  })

  it('counts sessions missing either metric instead of quietly dropping them', () => {
    // A thin relation must not be able to present itself as a strong one.
    const r = relate(
      [
        tm('a', '2026-07-01', [driver(-6, 50)]),
        tm('b', '2026-07-08', [driver(-4)]),
      ],
      'DRIVER', 'swingPlane', 'clubPath',
    )
    expect(r.points).toHaveLength(1)
    expect(r.skipped).toBe(1)
  })

  it('has no correlation to report from a single point', () => {
    const r = relate([tm('a', '2026-07-01', [driver(-6, 50)])], 'DRIVER', 'swingPlane', 'clubPath')
    expect(r.r).toBeNull()
  })

  it('never pairs one club with another', () => {
    // OQ-7: club selection alone moves every one of these numbers.
    const sessions = [
      tm('a', '2026-07-01', [
        driver(-6, 50),
        { club: 'IRON7', typical: -2, best: -2, n: 8, metrics: { swingPlane: { typical: 70, n: 8 } } },
      ]),
    ]
    const r = relate(sessions, 'DRIVER', 'swingPlane', 'clubPath')
    expect(r.points).toEqual([{ date: '2026-07-01', x: 50, y: -6, n: 10 }])
  })

  it('ignores practice sessions, which carry no readings', () => {
    const r = relate(
      [{ id: 'p', type: 'practice', date: '2026-07-01', location: 'home', entries: [] }],
      'DRIVER', 'swingPlane', 'clubPath',
    )
    expect(r.points).toHaveLength(0)
    expect(r.r).toBeNull()
  })

  it('orders points by date so the panel reads as a timeline', () => {
    const r = relate(
      [tm('b', '2026-07-08', [driver(-4, 54)]), tm('a', '2026-07-01', [driver(-6, 50)])],
      'DRIVER', 'swingPlane', 'clubPath',
    )
    expect(r.points.map((p) => p.date)).toEqual(['2026-07-01', '2026-07-08'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/domain/relate.test.ts`
Expected: FAIL — `Failed to resolve import "./relate"`.

- [ ] **Step 3: Write the module**

Create `src/lib/domain/relate.ts`:

```ts
import type { Club } from './clubs'
import { readingFor, type MetricId } from './metrics'
import { isTrackman, type ISODate, type Session } from './types'

/** One session's pair of readings for one club. */
export interface RelationPoint {
  date: ISODate
  x: number
  y: number
  /** The smaller of the two metrics' counts — a pair is only as measured as its thinner half. */
  n: number
}

export interface Relation {
  club: Club
  x: MetricId
  y: MetricId
  /** Date-ascending. */
  points: RelationPoint[]
  /** Pearson r, or `null` with fewer than two points or no variation in either metric. */
  r: number | null
  /** Sessions holding this club but missing one of the metrics. Rendered, never hidden. */
  skipped: number
}

/**
 * Two metrics against each other, for **one club**.
 *
 * **Structurally incapable of blending.** It takes a single `Club` and never looks at another,
 * so there is no code path producing a cross-club pairing (OQ-7, issue #14) — the same guarantee
 * `series.ts` provides by keying on `Club` and never reducing across keys.
 *
 * **Computed from session aggregates, never from per-shot data.** 44 driver session means, not
 * 618 strokes. That is what keeps `/progress` clear of the per-shot download D24 forbids — and
 * it is a genuinely different number: aggregating strips per-shot scatter, so a per-shot r
 * systematically understates these.
 *
 * **The correlation is computed here, never hardcoded anywhere.** A component quoting a figure
 * from the design notes would be quoting a number the page cannot reproduce, and would keep
 * quoting it long after the swing had changed.
 */
export function relate(sessions: Session[], club: Club, x: MetricId, y: MetricId): Relation {
  const points: RelationPoint[] = []
  let skipped = 0

  for (const session of sessions) {
    if (!isTrackman(session)) continue
    const row = session.clubs.find((c) => c.club === club)
    if (!row) continue

    const a = readingFor(row, x)
    const b = readingFor(row, y)
    // Counted rather than dropped in silence: a relation drawn from four of forty sessions must
    // be able to say so, or a thin finding reads as a strong one.
    if (!a || !b) {
      skipped += 1
      continue
    }
    points.push({
      date: session.date,
      x: a.typical,
      y: b.typical,
      // The thinner half. A pair backed by 618 path readings and 12 plane readings is a
      // 12-reading pair, and sizing it by the larger count would overstate it.
      n: Math.min(a.n, b.n),
    })
  }

  points.sort((p, q) => p.date.localeCompare(q.date))
  return { club, x, y, points, r: pearson(points), skipped }
}

/** `null` rather than `0` when there is nothing to measure: no relationship is not "no correlation". */
function pearson(points: RelationPoint[]): number | null {
  const n = points.length
  if (n < 2) return null

  let sx = 0
  let sy = 0
  for (const p of points) {
    sx += p.x
    sy += p.y
  }
  const mx = sx / n
  const my = sy / n

  let sxy = 0
  let sxx = 0
  let syy = 0
  for (const p of points) {
    sxy += (p.x - mx) * (p.y - my)
    sxx += (p.x - mx) ** 2
    syy += (p.y - my) ** 2
  }
  const denom = Math.sqrt(sxx * syy)
  // A metric that never varied has no relationship to anything, which is not r = 0.
  return denom === 0 ? null : sxy / denom
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/domain/relate.test.ts && npm run check`
Expected: PASS, 7 tests; `0 ERRORS`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/relate.ts src/lib/domain/relate.test.ts
git commit -m "Relate two metrics within one club, never across"
```

---

## Task 10: Generalise the chart scale

**Files:**
- Modify: `src/lib/domain/scale.ts`
- Test: `src/lib/domain/scale.test.ts`

**Interfaces:**
- Produces: `yIn(value: number, domain: { min: number; max: number }): number`, `inRange(value: number, band: { min: number; max: number }): boolean`. Existing `yFor` and `inBand` keep their signatures and delegate.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/domain/scale.test.ts`:

```ts
import { inRange, yIn } from './scale'

describe('yIn', () => {
  it('places a value against any authored domain, not just club path', () => {
    const domain = { min: 40, max: 66 }
    expect(yIn(66, domain)).toBeCloseTo(yIn(DOMAIN.max, DOMAIN), 10)
    expect(yIn(40, domain)).toBeCloseTo(yIn(DOMAIN.min, DOMAIN), 10)
  })

  it('clamps rather than drawing off-panel', () => {
    const domain = { min: 40, max: 66 }
    expect(yIn(200, domain)).toBe(yIn(66, domain))
    expect(yIn(0, domain)).toBe(yIn(40, domain))
  })

  it('leaves yFor behaving exactly as it did', () => {
    for (const degrees of [-14, -5.4, 0, 2, 4]) {
      expect(yFor(degrees)).toBe(yIn(degrees, DOMAIN))
    }
  })
})

describe('inRange', () => {
  it('is inclusive of both edges', () => {
    expect(inRange(-2, BAND)).toBe(true)
    expect(inRange(2, BAND)).toBe(true)
    expect(inRange(2.01, BAND)).toBe(false)
  })

  it('treats overshooting as a fault, never as better', () => {
    // The target is a band, not a maximum. +5 is outside it exactly as -5 is.
    expect(inRange(5, BAND)).toBe(false)
    expect(inRange(-5, BAND)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/domain/scale.test.ts`
Expected: FAIL — `yIn` is not exported.

- [ ] **Step 3: Generalise**

In `src/lib/domain/scale.ts`, add the two functions and make the existing pair delegate:

```ts
/**
 * Value → SVG y against **any** authored domain. Clamped, so a wild reading draws at the edge
 * rather than off-panel.
 *
 * The domain is always passed in, never derived from the values: one fitted at render time would
 * move between visits and quietly redefine "good" as "better than recent" rather than "inside
 * the band". Every domain in `domain/metrics.ts` is a frozen constant for exactly this reason.
 */
export function yIn(value: number, domain: { min: number; max: number }): number {
  const clamped = Math.min(domain.max, Math.max(domain.min, value))
  return CHART.padT + ((domain.max - clamped) / (domain.max - domain.min)) * PLOT_H
}

/** Inside a band, inclusive of both edges. **Never `Math.abs` on a signed value** — that would
 *  accept a sign flip, the one error that matters most. */
export function inRange(value: number, band: { min: number; max: number }): boolean {
  return value >= band.min && value <= band.max
}

/** Club path against its own domain. The KPI's shorthand for `yIn`. */
export function yFor(degrees: number): number {
  return yIn(degrees, DOMAIN)
}

/** Club path against its own band. The KPI's shorthand for `inRange`. */
export function inBand(degrees: number): boolean {
  return inRange(degrees, BAND)
}
```

Delete the previous bodies of `yFor` and `inBand`, keeping their doc comments merged into the above.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test && npm run check`
Expected: PASS — including every existing `scale.test.ts` and `ClubPathChart` case unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/scale.ts src/lib/domain/scale.test.ts
git commit -m "Let a panel plot any metric against its own authored domain"
```

---

## Task 11: The driver panels

**Files:**
- Create: `src/lib/components/RelationPanel.svelte`
- Create: `src/lib/components/SlicePanel.svelte`
- Modify: `src/routes/ProgressView.svelte`

**Interfaces:**
- Consumes: `Relation` from `../domain/relate`; `metricInfo` from `../domain/metrics`; `CHART`, `yIn`, `inRange`, `xFor` from `../domain/scale`.
- Produces: two components taking `{ relation: Relation }` and `{ sessions: Session[] }` respectively.

- [ ] **Step 1: Write `RelationPanel.svelte`**

Create `src/lib/components/RelationPanel.svelte`:

```svelte
<script lang="ts">
  import type { Relation } from '../domain/relate'
  import { metricInfo } from '../domain/metrics'
  import { CHART, inRange, yIn } from '../domain/scale'
  import { clubInfo } from '../domain/clubs'

  let { relation }: { relation: Relation } = $props()

  const xInfo = $derived(metricInfo(relation.x))
  const yInfo = $derived(metricInfo(relation.y))
  const club = $derived(clubInfo(relation.club))

  const PLOT_W = CHART.w - CHART.padL - CHART.padR

  /** x maps across its own authored domain, exactly as y maps down its own. */
  function xIn(value: number): number {
    const clamped = Math.min(xInfo.domain.max, Math.max(xInfo.domain.min, value))
    return CHART.padL + ((clamped - xInfo.domain.min) / (xInfo.domain.max - xInfo.domain.min)) * PLOT_W
  }

  const plotted = $derived(
    relation.points.map((p) => ({
      ...p,
      cx: xIn(p.x),
      cy: yIn(p.y, yInfo.domain),
      good: yInfo.band ? inRange(p.y, yInfo.band) : false,
    })),
  )

  /**
   * Stated in words, because the strength of a relationship is exactly what a scatter of dots
   * does not communicate on its own — and screen readers get nothing from the shapes.
   */
  const verdict = $derived.by(() => {
    if (relation.r === null) return 'Not enough readings yet to say.'
    const strength =
      Math.abs(relation.r) < 0.2 ? 'essentially nothing'
      : Math.abs(relation.r) < 0.45 ? 'a weak relationship'
      : Math.abs(relation.r) < 0.7 ? 'a moderate relationship'
      : 'a strong relationship'
    const direction = relation.r > 0 ? 'rises with' : 'falls as'
    return `${strength} — ${yInfo.name.toLowerCase()} ${direction} ${xInfo.name.toLowerCase()}.`
  })
</script>

<figure class="panel">
  <figcaption>
    <span class="club">{club.short}</span>
    <span class="pair">{xInfo.short} → {yInfo.short}</span>
    {#if relation.r !== null}
      <span class="r">r {relation.r.toFixed(2)}</span>
    {/if}
    <span class="count">{plotted.length} {plotted.length === 1 ? 'session' : 'sessions'}</span>
  </figcaption>

  <svg viewBox="0 0 {CHART.w} {CHART.h}" role="img" aria-label={`${club.name}: ${verdict}`}>
    {#if yInfo.band}
      <rect
        class="band"
        x={CHART.padL}
        y={yIn(yInfo.band.max, yInfo.domain)}
        width={PLOT_W}
        height={yIn(yInfo.band.min, yInfo.domain) - yIn(yInfo.band.max, yInfo.domain)}
      />
    {/if}
    {#each plotted as p (p.date + p.cx)}
      <circle class="dot" class:good={p.good} cx={p.cx} cy={p.cy} r="3.5" />
    {/each}
  </svg>

  <p class="verdict">{verdict}</p>
  {#if relation.skipped > 0}
    <p class="skipped">
      {relation.skipped}
      {relation.skipped === 1 ? 'session has' : 'sessions have'} only one of the two, so
      {relation.skipped === 1 ? 'it is' : 'they are'} not plotted.
    </p>
  {/if}
</figure>

<style>
  .panel{
    background:var(--card);border:1px solid var(--line);border-radius:14px;
    padding:16px 18px;margin:0;
  }
  figcaption{
    display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;
    font-family:'Space Mono',monospace;font-size:.72rem;letter-spacing:.1em;
  }
  .club{color:var(--chalk);font-weight:700}
  .pair,.count{color:var(--dim)}
  .r{color:var(--ball)}
  svg{width:100%;height:auto;display:block;margin-top:12px}
  .band{fill:var(--ball);opacity:.1}
  .dot{fill:var(--dim)}
  .dot.good{fill:var(--ball)}
  .verdict{color:var(--chalk);font-size:.9rem;margin:12px 0 0;max-width:60ch}
  .skipped{color:var(--dim);font-size:.82rem;margin:6px 0 0;max-width:60ch}

  @media (max-width:760px){
    .panel{padding:14px}
  }
</style>
```

- [ ] **Step 2: Write `SlicePanel.svelte`**

Create `src/lib/components/SlicePanel.svelte`:

```svelte
<script lang="ts">
  import type { Session } from '../domain/types'
  import { isTrackman } from '../domain/types'
  import { KPI_CLUB } from '../domain/clubs'
  import { metricInfo, readingFor } from '../domain/metrics'

  let { sessions }: { sessions: Session[] } = $props()

  /** The most recent session carrying a driver reading. The headline is "now", not "ever". */
  const latest = $derived.by(() => {
    const rows = sessions
      .filter(isTrackman)
      .slice()
      .sort((a, b) => b.date.localeCompare(a.date))
    for (const s of rows) {
      const row = s.clubs.find((c) => c.club === KPI_CLUB)
      if (row) return { date: s.date, row }
    }
    return null
  })

  const path = $derived(latest ? readingFor(latest.row, 'clubPath') : undefined)
  const face = $derived(latest ? readingFor(latest.row, 'faceAngle') : undefined)
  const faceToPath = $derived(latest ? readingFor(latest.row, 'faceToPath') : undefined)
  const curve = $derived(latest ? readingFor(latest.row, 'curve') : undefined)

  const shown = $derived(
    [
      { info: metricInfo('clubPath'), reading: path },
      { info: metricInfo('faceAngle'), reading: face },
      { info: metricInfo('faceToPath'), reading: faceToPath },
      { info: metricInfo('curve'), reading: curve },
    ].filter((c) => c.reading !== undefined),
  )

  /**
   * The reading, in words. Face-to-path is what makes the ball curve: a face open to the path
   * sends it right for a right-hander, whatever the face is doing relative to the target.
   */
  const story = $derived.by(() => {
    if (!path || !faceToPath) return null
    const open = faceToPath.typical > 0
    return {
      open,
      text: open
        ? 'The face is open to the path, so the ball starts left of the path and curves right.'
        : 'The face is closed to the path, so the ball curves left of the path.',
    }
  })
</script>

{#if latest && shown.length > 0}
  <div class="slice">
    <div class="rows">
      {#each shown as c (c.info.id)}
        <div class="row">
          <span class="lab">{c.info.short}</span>
          <span class="val">
            {c.reading!.typical.toFixed(c.info.decimals)}<span class="unit">{c.info.unit}</span>
          </span>
          <span class="n">{c.reading!.n} shots</span>
        </div>
      {/each}
    </div>
    {#if story}
      <p class="story" class:fault={story.open}>{story.text}</p>
    {/if}
    <p class="when">Driver, {latest.date}.</p>
  </div>
{/if}

<style>
  .slice{
    background:var(--card);border:1px solid var(--line);border-left:3px solid var(--ball);
    border-radius:14px;padding:18px 20px;
  }
  .rows{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:14px}
  .row{display:flex;flex-direction:column;gap:4px}
  .lab{
    font-family:'Space Mono',monospace;font-size:.68rem;letter-spacing:.14em;
    text-transform:uppercase;color:var(--dim);
  }
  .val{font-family:'Space Mono',monospace;font-size:1.35rem;color:var(--chalk);font-weight:700}
  .unit{font-size:.8rem;color:var(--dim);margin-left:2px}
  .n{font-family:'Space Mono',monospace;font-size:.68rem;color:var(--dim)}
  .story{color:var(--chalk);font-size:.92rem;margin:16px 0 0;max-width:62ch}
  .story.fault{color:var(--flag)}
  .when{font-family:'Space Mono',monospace;font-size:.7rem;letter-spacing:.1em;color:var(--dim);margin:10px 0 0}

  @media (max-width:760px){
    .slice{padding:16px}
    .val{font-size:1.2rem}
  }
</style>
```

- [ ] **Step 3: Wire the section into `ProgressView.svelte`**

Add to the imports:

```ts
  import { relate } from '../lib/domain/relate'
  import SlicePanel from '../lib/components/SlicePanel.svelte'
  import RelationPanel from '../lib/components/RelationPanel.svelte'
```

Add to the derived state:

```ts
  const planeVsPath = $derived(relate(sessions.list, KPI_CLUB, 'swingPlane', 'clubPath'))
  const faceVsPath = $derived(relate(sessions.list, KPI_CLUB, 'faceToPath', 'clubPath'))
  const hasMetrics = $derived(planeVsPath.points.length > 0 || faceVsPath.points.length > 0)
```

Insert this section immediately **after** the closing `</section>` of `#path` and before `#coverage`:

```svelte
{#if sessions.ready && hasMetrics}
  <section id="why">
    <SectionHead idx="02" title="Why the ball curves" />
    <p class="note">
      Club path is the KPI, but it is only half of what bends the ball. The other half is where
      the face points <em>relative to that path</em> — and a square face is still open when the
      path is far enough left.
    </p>
    <SlicePanel sessions={sessions.list} />
    <div class="pair-grid">
      <RelationPanel relation={faceVsPath} />
      <RelationPanel relation={planeVsPath} />
    </div>
    <p class="note">
      Both panels read one session as one dot, never one shot. Swing plane is here because it was
      the obvious suspect for the out-to-in path — read what the panel actually says rather than
      what it was expected to say.
    </p>
  </section>
{/if}
```

Renumber the following sections' `idx` values so they still read in order: `#coverage` becomes `03`, `#feel` becomes `04`, `#where` becomes `05`.

Add the grid style to the component's `<style>` block:

```css
  .pair-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-top:18px}
```

- [ ] **Step 4: Verify it builds and typechecks**

Run: `npm run check && npm run build`
Expected: `0 ERRORS`; a successful build.

- [ ] **Step 5: Verify in a browser against the real store**

```bash
npm run dev
```

Open `http://localhost:5173/progress`. **Clear site data first** — a bug that stopped the app reaching the store entirely once shipped and looked perfectly healthy because the cache held the same data. Watch the network panel for the `/sessions` request, and confirm:

- The "Why the ball curves" section renders with real driver numbers.
- The plane panel's `r` is computed, not `0.50` — it is a session-mean figure from your own store and need not match the design note.
- **No request to `/shots/…` is made.** That is D24 holding.
- Tab through the page: every control keeps a visible focus ring.

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/SlicePanel.svelte src/lib/components/RelationPanel.svelte src/routes/ProgressView.svelte
git commit -m "Answer the plane question on /progress, and lead with the face"
```

---

## Task 12: Documentation

**Files:**
- Modify: `CLAUDE.md`, `docs/architecture.md`, `docs/content.md`, `docs/design.md`, `docs/roadmap.md`
- Delete: `.github/workflows/trackman-probe.yml`

- [ ] **Step 1: Update `CLAUDE.md`**

In the **Code** rules section, add:

```markdown
- **`domain/metrics.ts` is the single source of truth for metric field names, axes and bands.**
  Every `field` was read from the live schema via `npm run introspect`, never from memory. The
  GraphQL selection set is built from it, so a wire name exists in exactly one place.
- **`n` is per metric, not per club row.** Null rates differ by up to 45 points — the driver has
  666 swing-plane readings against 618 club-path readings. A shared count would size a sparse
  reading like a dense one.
- **`better: 'none'` is a real answer.** `attackAngle` wants positive on a driver and negative on
  an iron, so there is no shared band. Metrics with no target store no `best` and draw no band.
  Never invent one.
- **Per-shot data is not on the `Repository` interface.** `SHOTS#<sessionId>` is reachable only
  from `RemoteRepo`, and the ingest is its only writer. Putting it on the interface components
  use would invite a page to download thousands of rows to draw charts that do not use them.
```

In **Things to be careful about**, add:

```markdown
- **A widened GraphQL query is all-or-nothing.** One field the token cannot read fails the whole
  request, `clubPath` included — there is no partial-field response. Do not add retry logic that
  narrows the selection: a retry that silently dropped the KPI would be worse than a loud
  failure. Note also that a **bad credential** surfaces as a field-level "not authorized to
  access this resource" inside a `200`, not as a `401`.
- **The Trackman schema is public and needs no credential.** `npm run introspect` runs anywhere.
  That is also why it cannot be read as a statement of permission — it describes the whole
  facility and partner surface. **Four fields it advertises hold no data at all**
  (`strokeLength`, `backswingTime`, `forwardswingTime`, `tempo`), so verify with
  `npm run probe` before designing against a field.
```

- [ ] **Step 2: Update `docs/architecture.md`**

Rewrite §4's "What gets stored" for the twelve metrics and the shots item. Add D27–D30 to the decision table:

```markdown
| D27 | Shot counts | **`n` is per metric, not per club row** | Null rates differ by up to 45 points. A shared count would size a 349-shot reading like a 618-shot one, and the error is silent. |
| D28 | Per-shot reach | **Shots are not on the `Repository` interface** | That interface is what components use. Putting shots on it invites the multi-megabyte download D24 exists to prevent. |
| D29 | Targets | **`better: 'none'` is a first-class answer** | `attackAngle` wants opposite signs for a driver and an iron. Inventing a shared band would be worse than recording that there is not one. |
| D30 | Axes | **Fixed domains authored per metric from driver session means** | Per-shot ranges are far wider and would huddle every point mid-panel. A second club needs its domain authored, never derived. |
```

Mark D24 as in use rather than reserved.

- [ ] **Step 3: Update `docs/content.md`**

Add the coaching finding, in the site's voice:

```markdown
### The face is not the fault

Across thirteen months the driver's face has sat within a degree of square. Face-to-path has
never once been negative — the closest it has come is `+0.97°`, and the ball has curved right in
every session on record.

That is not a face problem. The face is square; the path is so far left that square *is* open
relative to it. Fix the path and the curve goes with it.

### Swing plane was the wrong suspect

A steeper plane was the obvious explanation for an out-to-in path. The numbers say otherwise: on
the driver, steeper plane has gone with a **less** out-to-in path, and on the 4-iron there is no
relationship at all. Keep watching it — but stop treating it as the cause.
```

- [ ] **Step 4: Update `docs/design.md`**

Document the two new panels under components: `SlicePanel` (a reading block, `--ball` left border, Space Mono figures, `--flag` prose only when the face is open to the path) and `RelationPanel` (a scatter on two authored domains, `--ball` band wash, `--ball` dots inside the band). Note that **no new colour token was added**.

- [ ] **Step 5: Update `docs/roadmap.md`**

Add Phase 7 as done, with the findings that changed the design, and record OQ-8. Mark the plane question answered.

- [ ] **Step 6: Delete the probe workflow, keep the scripts**

```bash
git rm .github/workflows/trackman-probe.yml
```

`npm run introspect` and `npm run probe` both stay. The first needs no credential; the second is runnable by whoever holds the token. What goes is the branch-triggered CI job, which has done its work.

- [ ] **Step 7: Verify and commit**

Run: `npm test && npm run check && npm run build`
Expected: PASS; `0 ERRORS`; successful build.

```bash
git add -A
git commit -m "Bring the docs in line with the wider metric set"
```

---

## Task 13: Deploy and verify live

**Files:** none changed.

- [ ] **Step 1: Open the pull request**

```bash
gh pr create --fill
```

Confirm CI is green — `npm run check` and `npm test` both gate the deploy.

- [ ] **Step 2: Merge, and watch the deploy**

```bash
gh run watch "$(gh run list --workflow=deploy.yml --limit 1 --json databaseId --jq '.[0].databaseId')"
```

Expected: green, with the workflow's `dist/CNAME` and `VITE_API_URL` assertions passing.

- [ ] **Step 3: Verify the live site with a cold cache**

Open `https://golf.whitfield.life/progress` in a **private window**, or clear site data first.

**Never verify the store against a browser whose cache is already populated.** A bug that stopped the app reaching the store entirely once shipped and looked perfectly healthy, because cache and store held the same data.

Confirm:

- A network request to the Function URL's `/sessions` actually fires.
- "Why the ball curves" renders with real driver readings.
- **No request to `/shots/…`.**
- The plan page and `/log` are unaffected.
- `https://golf.whitfield.life/progress` deep-links correctly (the `404.html` fallback).

- [ ] **Step 4: Confirm the next scheduled ingest is green**

The daily job runs at 13:00 UTC. Confirm the next run succeeds and reports a shot count.

```bash
gh run list --workflow=trackman.yml --limit 3
```

- [ ] **Step 5: Close the issue**

```bash
gh issue close 25 --comment "Shipped. See docs/superpowers/specs/2026-08-06-phase-7-per-shot-metrics-design.md."
```

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| §3 metric set and exclusions | 1 |
| §4 registry, `better`, authored domains | 1 |
| §5 `MetricReading`, per-metric `n`, `Shot` | 2 |
| §6 widened query, per-metric aggregation | 3 |
| §7 `/shots` endpoints, off the `Repository` interface | 5, 6 |
| §8 manual entry unchanged | — *no task, deliberately: the form is not touched* |
| §9 `/progress` panels, `relate.ts` | 9, 10, 11 |
| §10 migration to v3 | 4 |
| §11 testing | 1, 3, 4, 5, 6, 9, 10 |
| §12 rollout steps 1–6 | 3–4, 7, 8, 11, 12 |
| §13 documentation and D27–D30 | 12 |

**Type consistency:** `readingFor` (Tasks 2, 9, 11), `bestOf` (1, 3), `METRIC_FIELDS` (1, 3), `MetricReading` (2, 3, 4), `ExtraMetricId` (2, 3, 4), `Shot` (2, 3, 5, 6), `relate` (9, 11), `yIn`/`inRange` (10, 11) — all consistent across tasks.

**Behaviour change to watch:** Task 3 changes the return type of both `aggregateActivity` and `aggregateActivities`. Every call site is updated within that task; `merge.ts` is untouched and `merge.test.ts` must stay green, which is the evidence the merge rules did not drift.
