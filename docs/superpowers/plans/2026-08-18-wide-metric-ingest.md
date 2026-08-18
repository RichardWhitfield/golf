# Wide Metric Ingest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Carry all 43 populated Trackman `Measurement` fields per shot and per session, while keeping charting a deliberate, hand-authored decision.

**Architecture:** `domain/metrics.ts` stays the single registry of wire field names. Its entry type splits into `CarriedMetric` (stored) and `ChartedMetric` (stored *and* plotted, with a hand-authored driver-scoped axis), so "has an axis" is enforced by the compiler rather than by a comment. `ingest/aggregate.ts` and `ingest/api.ts` are already registry-driven and iterate `METRICS` — widening the registry widens both with no change to their logic.

**Tech Stack:** Svelte 5, TypeScript (pinned v6), Vite, Vitest, Node 22 + `tsx` for scripts, DynamoDB behind a Lambda Function URL.

**Spec:** `docs/superpowers/specs/2026-08-18-wide-metric-ingest-design.md`

## Global Constraints

- **British English** (`lang="en-GB"`) in all copy.
- **Every `field` value must match `introspection.json`.** Never typed from memory. Task 3 adds a test that enforces this.
- **Club path is signed.** Never `Math.abs`, never `Math.max`. Negative is out-to-in.
- **`n` is absent, never zero.** `MetricReading.n` is required; `ClubPath.n` stays optional.
- **The chart y-domain is a fixed authored constant**, never derived from data. Domains are **driver-scoped**.
- **`better: 'none'` stores no `best` and draws no band.** Never invent a band.
- **Never blend a metric across clubs.** `series.ts` and `relate.ts` enforce this structurally; do not weaken either.
- **No retry logic that narrows the GraphQL selection.** A widened query is all-or-nothing by design.
- **Bump `schemaVersion` and the Lambda's `SCHEMA_VERSION` in the same commit.**
- Run `npm run check` and `npm test` before every commit. Both run in CI and block deploys.

---

### Task 1: Generalise `bestOf` to the band midpoint

`neutral` currently means "closest to zero". `spinRate` (target 2,200–2,700 rpm) and `launchAngle` (13–15°) have targets that are not zero. Generalise rather than add a fourth mode: **best = closest to the midpoint of the band**. Club path's band is `−2 … 2`, midpoint `0`, so every existing metric is unchanged.

**Files:**
- Modify: `src/lib/domain/metrics.ts` (the `bestOf` function)
- Modify: `src/lib/ingest/aggregate.ts:108` and `:119` (call sites)
- Test: `src/lib/domain/metrics.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `bestOf(values: number[], better: Better, band?: { min: number; max: number }): number | undefined`

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/domain/metrics.test.ts`. **The file already imports `bestOf` from `./metrics` and
`BAND` from `./scale` on lines 2-3 — extend those existing import statements rather than adding
new ones, which would be a duplicate-identifier error.**

```ts
describe('bestOf with a band midpoint', () => {
  // The no-op guarantee: every existing `neutral` metric has a band centred on zero,
  // so generalising the rule must not move a single existing reading.
  it('is unchanged for a band centred on zero', () => {
    expect(bestOf([-5, 1, 3], 'neutral', BAND)).toBe(1)
    expect(bestOf([5, -1, 3], 'neutral', BAND)).toBe(-1)
  })

  it('keeps the sign of the winning reading', () => {
    expect(bestOf([-0.5, 2], 'neutral', BAND)).toBe(-0.5)
  })

  it('picks the reading closest to a midpoint that is not zero', () => {
    // spinRate: band 2200-2700, midpoint 2450. 2600 is closer than 4000 or 1000.
    const band = { min: 2200, max: 2700 }
    expect(bestOf([4000, 2600, 1000], 'neutral', band)).toBe(2600)
  })

  it('prefers an overshoot that is nearer the midpoint than an undershoot', () => {
    const band = { min: 2200, max: 2700 }
    expect(bestOf([2800, 1500], 'neutral', band)).toBe(2800)
  })

  it('still returns the maximum for `higher`, band or no band', () => {
    expect(bestOf([1.2, 1.44, 1.31], 'higher', { min: 1.45, max: 1.5 })).toBe(1.44)
    expect(bestOf([40, 45, 43], 'higher')).toBe(45)
  })

  it('still returns undefined for `none` and for an empty list', () => {
    expect(bestOf([1, 2], 'none')).toBeUndefined()
    expect(bestOf([], 'neutral', BAND)).toBeUndefined()
  })

  it('throws for `neutral` with no band, because the midpoint is undefined', () => {
    expect(() => bestOf([1, 2], 'neutral')).toThrow(/band/i)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- src/lib/domain/metrics.test.ts`
Expected: FAIL — the midpoint cases return the wrong value, and the no-band case does not throw.

- [ ] **Step 3: Implement**

Replace `bestOf` in `src/lib/domain/metrics.ts`:

```ts
/**
 * The single best reading among `values`, or `undefined` where the metric has no target.
 *
 * `neutral` — closest to the **midpoint of the band**. For `clubPath`, `faceAngle`,
 * `faceToPath`, `curve` and `lowPointSide` that midpoint is `0`, so this is exactly the
 * "closest to neutral" rule those metrics have always had. `spinRate` and `launchAngle` are
 * why it is expressed as a midpoint rather than as zero: their targets are 2,200–2,700 rpm and
 * 13–15°, and neither centres on zero.
 *
 * **Never `Math.max` for a `neutral` metric** — that reports the worst overshoot as the best
 * strike. **Never `Math.abs` on the stored value** either: the comparison uses distance, but
 * the value returned keeps its sign, because a sign flip is the one error that matters most.
 *
 * A `neutral` metric with no band is a programming error, not a defaulted-to-zero case: the
 * registry test asserts every `neutral` entry carries one.
 */
export function bestOf(
  values: number[],
  better: Better,
  band?: { min: number; max: number },
): number | undefined {
  if (values.length === 0 || better === 'none') return undefined
  if (better === 'higher') return values.reduce((a, b) => (b > a ? b : a))
  if (!band) throw new Error('A `neutral` metric needs a band: its midpoint is the target.')
  const target = (band.min + band.max) / 2
  return values.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a))
}
```

- [ ] **Step 4: Update the two call sites in `src/lib/ingest/aggregate.ts`**

Line ~108, inside the `for (const metric of METRICS)` loop:

```ts
        const best = bestOf(list, metric.better, metric.band)
```

Line ~119, for club path itself:

```ts
        best: round2(bestOf(paths, 'neutral', BAND) as number),
```

Add the import at the top of `src/lib/ingest/aggregate.ts`:

```ts
import { BAND } from '../domain/scale'
```

- [ ] **Step 5: Run the full suite**

Run: `npm test && npm run check`
Expected: PASS. Existing aggregate tests must be untouched — that is the no-op guarantee.

- [ ] **Step 6: Commit**

```bash
git add src/lib/domain/metrics.ts src/lib/domain/metrics.test.ts src/lib/ingest/aggregate.ts
git commit -m "Make best mean closest to the band, not closest to zero"
```

---

### Task 2: Split `MetricInfo` into carried and charted

**Files:**
- Modify: `src/lib/domain/metrics.ts`
- Modify: `src/lib/components/RelationPanel.svelte:9-10`
- Modify: `src/lib/components/SlicePanel.svelte:19-22`
- Test: `src/lib/domain/metrics.test.ts`

**Interfaces:**
- Consumes: `bestOf(values, better, band?)` from Task 1.
- Produces:
  - `interface CarriedMetric { id: MetricId; field: string; short: string; name: string; unit: Unit; decimals: 0 | 1 | 2 }`
  - `interface ChartedMetric extends CarriedMetric { domain: { min: number; max: number }; band?: { min: number; max: number }; better: Better }`
  - `type MetricInfo = CarriedMetric | ChartedMetric`
  - `type Unit = '°' | 'm' | 'm/s' | 'rpm' | 's' | ''`
  - `function isCharted(m: MetricInfo): m is ChartedMetric`
  - `function chartedInfo(id: MetricId): ChartedMetric` — throws for a carried-only metric
  - `const CHARTED: ChartedMetric[]`

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/domain/metrics.test.ts`. **Extend the existing `./metrics` import on line 2 with
`CHARTED`, `chartedInfo` and `isCharted`** — do not add a second import statement.

```ts
describe('the carried / charted split', () => {
  it('treats every metric with a domain as charted', () => {
    for (const m of METRICS) {
      expect(isCharted(m)).toBe('domain' in m)
    }
  })

  it('exposes the charted subset in registry order', () => {
    expect(CHARTED).toEqual(METRICS.filter(isCharted))
    expect(CHARTED.length).toBeGreaterThan(0)
  })

  it('returns a charted metric from chartedInfo', () => {
    expect(chartedInfo('clubPath').domain).toEqual({ min: -14, max: 4 })
  })

  it('still resolves every metric through metricInfo', () => {
    expect(metricInfo('clubPath').field).toBe('clubPath')
  })

  it('requires a band on every neutral metric, since best is the midpoint', () => {
    for (const m of CHARTED) {
      if (m.better === 'neutral') expect(m.band).toBeDefined()
    }
  })

  it('stores no band on a metric with no target', () => {
    for (const m of CHARTED) {
      if (m.better === 'none') expect(m.band).toBeUndefined()
    }
  })
})
```

Every metric is charted at this point, so there is nothing yet for `chartedInfo` to reject. The
throw case is tested in Task 3, once carried-only metrics exist.

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/lib/domain/metrics.test.ts`
Expected: FAIL — `isCharted`, `chartedInfo` and `CHARTED` are not exported from `./metrics`.

- [ ] **Step 3: Implement the split in `src/lib/domain/metrics.ts`**

```ts
export type Unit = '°' | 'm' | 'm/s' | 'rpm' | 's' | ''

/**
 * A metric that is **stored** — per shot and as a session reading — but not plotted.
 *
 * Carrying is the default. It costs a wire name in this registry and nothing else, and the cost
 * of *not* carrying a field is a question that cannot be answered until the next session and
 * never retrospectively. That is the mistake Phase 7 made with `ballSpeed` and `spinRate`.
 */
export interface CarriedMetric {
  id: MetricId
  /** The `Measurement` field name on the wire. Verified by introspection, never guessed. */
  field: string
  /** Monospaced UI label. Short — it sits in a row of numbers. */
  short: string
  /** Prose label. */
  name: string
  unit: Unit
  decimals: 0 | 1 | 2
}

/**
 * A metric that is stored **and plotted**, so it needs a fixed axis.
 *
 * **The axis is authored, driver-scoped, and frozen** — never fitted to the data at render
 * time, which would move between visits and redefine "good" as "better than recent" rather
 * than "inside the band". Several metrics are strongly club-dependent (swing plane runs ~50° on
 * a driver against ~69° on a 4-iron), so charting one for a second club means authoring that
 * club's domain first. It is not a derivation to be automated.
 */
export interface ChartedMetric extends CarriedMetric {
  domain: { min: number; max: number }
  /** The coaching target, where one genuinely exists. Absent whenever `better` is `none`. */
  band?: { min: number; max: number }
  better: Better
}

export type MetricInfo = CarriedMetric | ChartedMetric

/** The only route to an axis. A carried-only metric has none, and the compiler enforces it. */
export function isCharted(metric: MetricInfo): metric is ChartedMetric {
  return 'domain' in metric
}

/** Registry order, charted only. What `/progress` iterates. */
export const CHARTED: ChartedMetric[] = METRICS.filter(isCharted)

/**
 * A charted metric by id, or a throw.
 *
 * Panels reach axes through this rather than through `metricInfo`, so asking to plot a
 * carried-only metric fails loudly at the call rather than rendering an undefined domain.
 */
export function chartedInfo(id: MetricId): ChartedMetric {
  const info = metricInfo(id)
  if (!isCharted(info)) {
    throw new Error(`Metric ${id} is not charted: it has no authored domain.`)
  }
  return info
}
```

**Placement matters.** `CarriedMetric`, `ChartedMetric`, `MetricInfo` and `Unit` replace the old
`MetricInfo` interface **above** `METRICS` (currently line 72). `isCharted`, `CHARTED` and
`chartedInfo` go **below** it — `CHARTED` reads `METRICS` at module scope, so declaring it first
is a temporal-dead-zone crash on import, not a type error.

Declare `METRICS` as `MetricInfo[]`, and keep every existing entry exactly as it is — all twelve
already carry a `domain`, so all twelve remain charted with no edit.

- [ ] **Step 4: Point the panels at `chartedInfo`**

`src/lib/components/RelationPanel.svelte`, lines 9-10:

```svelte
  const xInfo = $derived(chartedInfo(relation.x))
  const yInfo = $derived(chartedInfo(relation.y))
```

and its import on line 3:

```svelte
  import { chartedInfo } from '../domain/metrics'
```

`src/lib/components/SlicePanel.svelte`, line 4 and lines 19-22 — swap `metricInfo` for `chartedInfo` in all four calls:

```svelte
  import { chartedInfo, readingFor } from '../domain/metrics'
```

```svelte
      { info: chartedInfo('clubPath'), reading: path },
      { info: chartedInfo('faceAngle'), reading: face },
      { info: chartedInfo('faceToPath'), reading: faceToPath },
      { info: chartedInfo('curve'), reading: curve },
```

- [ ] **Step 5: Run the suite**

Run: `npm test && npm run check`
Expected: PASS, 0 errors. If `svelte-check` reports `Property 'domain' does not exist on type 'MetricInfo'`, a panel still calls `metricInfo` where it needs `chartedInfo` — that error is the guard working.

- [ ] **Step 6: Commit**

```bash
git add src/lib/domain/metrics.ts src/lib/domain/metrics.test.ts src/lib/components/RelationPanel.svelte src/lib/components/SlicePanel.svelte
git commit -m "Let the type say which metrics have an authored axis"
```

---

### Task 3: Add the 31 new metrics to the registry

Six charted, twenty-five carried. Brings the registry to **43**.

**Files:**
- Modify: `src/lib/domain/metrics.ts`
- Test: `src/lib/domain/metrics.test.ts`

**Interfaces:**
- Consumes: `CarriedMetric`, `ChartedMetric`, `isCharted` from Task 2.
- Produces: `MetricId` widened to 43 ids; `METRIC_FIELDS` to 43 wire names.

- [ ] **Step 1: Write the failing test that pins every field to the schema**

Add to `src/lib/domain/metrics.test.ts`. This is the test that makes "authored from introspection, never memory" enforceable rather than aspirational:

**Add `readFileSync` as a new import; `METRICS`, `METRIC_FIELDS` and `chartedInfo` are already
imported from `./metrics` by now — do not import them again.**

```ts
import { readFileSync } from 'node:fs'

describe('the registry against the live schema', () => {
  // `introspection.json` is gitignored and regenerated by `npm run introspect`, which needs no
  // credential. Skip rather than fail when it is absent, so a fresh clone can still run tests.
  const raw = (() => {
    try {
      return JSON.parse(readFileSync('introspection.json', 'utf8')) as {
        name: string
        fields: { name: string; type: unknown }[] | null
      }[]
    } catch {
      return null
    }
  })()

  it.runIf(raw)('names only fields that exist on Measurement', () => {
    const measurement = raw!.find((t) => t.name === 'Measurement')!
    const known = new Set(measurement.fields!.map((f) => f.name))
    const unknown = METRIC_FIELDS.filter((f) => !known.has(f))
    expect(unknown).toEqual([])
  })

  it('carries 43 metrics', () => {
    expect(METRICS).toHaveLength(43)
  })

  it('has no duplicate id and no duplicate wire field', () => {
    expect(new Set(METRICS.map((m) => m.id)).size).toBe(METRICS.length)
    expect(new Set(METRIC_FIELDS).size).toBe(METRIC_FIELDS.length)
  })

  it('charts eighteen of them', () => {
    expect(METRICS.filter((m) => 'domain' in m)).toHaveLength(18)
  })

  it('throws rather than guess an axis for a carried-only metric', () => {
    expect(() => chartedInfo('swingDirection')).toThrow(/not charted/i)
  })

  it('gives every carried-only metric a unit and a decimals, and no axis', () => {
    for (const m of METRICS.filter((x) => !('domain' in x))) {
      expect(m).not.toHaveProperty('band')
      expect(m).not.toHaveProperty('better')
      expect(typeof m.decimals).toBe('number')
    }
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- src/lib/domain/metrics.test.ts`
Expected: FAIL — `expected 12 to be 43`.

- [ ] **Step 3: Widen `MetricId`**

```ts
export type MetricId =
  // Charted — club delivery
  | 'clubPath' | 'faceAngle' | 'faceToPath' | 'swingPlane' | 'attackAngle' | 'curve'
  | 'clubSpeed' | 'carry' | 'lowPointDistance' | 'lowPointSide' | 'dynamicLoft' | 'spinLoft'
  // Charted — ball flight, added in Phase 8
  | 'ballSpeed' | 'smashFactor' | 'spinRate' | 'launchAngle' | 'total' | 'spinAxis'
  // Carried only
  | 'swingDirection' | 'swingRadius' | 'dPlaneTilt' | 'dynamicLie' | 'impactOffset'
  | 'impactHeight' | 'lowPointHeight' | 'ballSpeedDifference' | 'smashIndex' | 'launchDirection'
  | 'spinRateDifference' | 'spinIndex' | 'carrySide' | 'totalSide' | 'landingAngle'
  | 'hangTime' | 'maxHeight' | 'lastData'
  | 'spinAxisActual' | 'curveActual' | 'carryActual' | 'totalActual'
  | 'carrySideActual' | 'totalSideActual' | 'landingAngleActual'
```

- [ ] **Step 4: Append the six charted entries**

Domains are authored from the driver session-mean ranges in spec §3 P4 with headroom, then frozen. Bands are driver coaching targets, recorded in `docs/content.md` by Task 6.

```ts
  // Ball flight. Added in Phase 8: these are 0% null on the driver, better populated than
  // `clubPath` itself at 14.5%, and they are what answers a question about distance.
  { id: 'ballSpeed', field: 'ballSpeed', short: 'BALL', name: 'Ball speed', unit: 'm/s',
    domain: { min: 38, max: 64 }, better: 'higher', decimals: 1 },
  // `higher`, not `neutral`, and the exception that proves the band rule: ~1.50 is a physical
  // ceiling rather than the centre of a range, so "closest to the midpoint" would rank a 1.475
  // strike above a 1.50 one. The band is drawn as a target region and never used to pick `best`.
  { id: 'smashFactor', field: 'smashFactor', short: 'SMASH', name: 'Smash factor', unit: '',
    domain: { min: 1.05, max: 1.55 }, band: { min: 1.45, max: 1.5 }, better: 'higher', decimals: 2 },
  { id: 'spinRate', field: 'spinRate', short: 'SPIN', name: 'Spin rate', unit: 'rpm',
    domain: { min: 2000, max: 8000 }, band: { min: 2200, max: 2700 }, better: 'neutral', decimals: 0 },
  { id: 'launchAngle', field: 'launchAngle', short: 'LAUNCH', name: 'Launch angle', unit: '°',
    domain: { min: 6, max: 22 }, band: { min: 13, max: 15 }, better: 'neutral', decimals: 1 },
  { id: 'total', field: 'total', short: 'TOTAL', name: 'Total distance', unit: 'm',
    domain: { min: 90, max: 210 }, better: 'higher', decimals: 0 },
  { id: 'spinAxis', field: 'spinAxis', short: 'AXIS', name: 'Spin axis', unit: '°',
    domain: { min: -10, max: 32 }, band: { min: -5, max: 5 }, better: 'neutral', decimals: 1 },
```

- [ ] **Step 5: Append the twenty-five carried entries**

No `domain`, no `band`, no `better`. That is what makes them carried-only, and the compiler enforces it.

```ts
  // Carried, never charted. Stored per shot and as a session reading; no authored axis.
  //
  // `swingDirection` is the clearest case for the split: Phase 7 excluded it as near-collinear
  // with `clubPath` (r = 0.866 on the driver), which is a reason not to draw a second panel
  // saying the same thing — and no reason at all to discard the reading.
  { id: 'swingDirection', field: 'swingDirection', short: 'SWING DIR', name: 'Swing direction', unit: '°', decimals: 2 },
  { id: 'swingRadius', field: 'swingRadius', short: 'RADIUS', name: 'Swing radius', unit: 'm', decimals: 2 },
  { id: 'dPlaneTilt', field: 'dPlaneTilt', short: 'D-PLANE', name: 'D-plane tilt', unit: '°', decimals: 1 },
  { id: 'dynamicLie', field: 'dynamicLie', short: 'LIE', name: 'Dynamic lie', unit: '°', decimals: 1 },
  { id: 'impactOffset', field: 'impactOffset', short: 'OFFSET', name: 'Impact offset', unit: 'm', decimals: 2 },
  { id: 'impactHeight', field: 'impactHeight', short: 'IMP HT', name: 'Impact height', unit: 'm', decimals: 2 },
  { id: 'lowPointHeight', field: 'lowPointHeight', short: 'LOW HT', name: 'Low point height', unit: 'm', decimals: 2 },
  { id: 'ballSpeedDifference', field: 'ballSpeedDifference', short: 'BALL Δ', name: 'Ball speed difference', unit: 'm/s', decimals: 2 },
  { id: 'smashIndex', field: 'smashIndex', short: 'SMASH IX', name: 'Smash index', unit: '', decimals: 2 },
  { id: 'launchDirection', field: 'launchDirection', short: 'LAUNCH DIR', name: 'Launch direction', unit: '°', decimals: 2 },
  { id: 'spinRateDifference', field: 'spinRateDifference', short: 'SPIN Δ', name: 'Spin rate difference', unit: 'rpm', decimals: 0 },
  { id: 'spinIndex', field: 'spinIndex', short: 'SPIN IX', name: 'Spin index', unit: '', decimals: 2 },
  { id: 'carrySide', field: 'carrySide', short: 'CARRY SIDE', name: 'Carry side', unit: 'm', decimals: 1 },
  { id: 'totalSide', field: 'totalSide', short: 'TOTAL SIDE', name: 'Total side', unit: 'm', decimals: 1 },
  { id: 'landingAngle', field: 'landingAngle', short: 'LANDING', name: 'Landing angle', unit: '°', decimals: 1 },
  { id: 'hangTime', field: 'hangTime', short: 'HANG', name: 'Hang time', unit: 's', decimals: 2 },
  { id: 'maxHeight', field: 'maxHeight', short: 'APEX', name: 'Max height', unit: 'm', decimals: 1 },
  { id: 'lastData', field: 'lastData', short: 'LAST', name: 'Last data', unit: '', decimals: 2 },
  // The `*Actual` variants are the unnormalised readings. They earn their place on evidence:
  // 2.1% null on the driver against 14.2% for `curve`, and they differ from the normalised
  // values (`curveActual` p50 18.51 against `curve` 22.05), so they are a second, denser view
  // of the same shot rather than a duplicate.
  { id: 'spinAxisActual', field: 'spinAxisActual', short: 'AXIS ACT', name: 'Spin axis, actual', unit: '°', decimals: 1 },
  { id: 'curveActual', field: 'curveActual', short: 'CURVE ACT', name: 'Curve, actual', unit: 'm', decimals: 1 },
  { id: 'carryActual', field: 'carryActual', short: 'CARRY ACT', name: 'Carry, actual', unit: 'm', decimals: 0 },
  { id: 'totalActual', field: 'totalActual', short: 'TOTAL ACT', name: 'Total, actual', unit: 'm', decimals: 0 },
  { id: 'carrySideActual', field: 'carrySideActual', short: 'C SIDE ACT', name: 'Carry side, actual', unit: 'm', decimals: 1 },
  { id: 'totalSideActual', field: 'totalSideActual', short: 'T SIDE ACT', name: 'Total side, actual', unit: 'm', decimals: 1 },
  { id: 'landingAngleActual', field: 'landingAngleActual', short: 'LAND ACT', name: 'Landing angle, actual', unit: '°', decimals: 1 },
```

- [ ] **Step 6: Regenerate the schema file and run the suite**

```bash
npm run introspect   # writes introspection.json; needs no credential
npm test && npm run check
```

Expected: PASS. `unknown` must be `[]` — a failure there means a field name was typed rather than read.

- [ ] **Step 7: Verify the widened query builds correctly**

```bash
node -e "process.exit(0)" && npx tsx -e "import('./src/lib/domain/metrics.ts').then(m => console.log(m.METRIC_FIELDS.length, m.METRIC_FIELDS.join(' ')))"
```

Expected: `43` followed by the space-separated selection set. `ingest/api.ts` builds `STROKE_FIELDS` from exactly this, so no edit is needed there.

- [ ] **Step 8: Commit**

```bash
git add src/lib/domain/metrics.ts src/lib/domain/metrics.test.ts
git commit -m "Carry all 43 populated fields; chart six of the new ones"
```

---

### Task 4: Store `reducedAccuracy` alongside the readings it qualifies

Trackman flags 1,273 of 5,954 strokes, only ever `SpinRate` (824) or `SpinAxis` (495). Phase 7 excluded both metrics rather than store a caveat nothing enforced. `spinRate` is now charted, so the flag has to come with it.

**Files:**
- Modify: `src/lib/domain/types.ts:159-164` (`Shot`)
- Modify: `src/lib/ingest/api.ts:26` (selection set)
- Modify: `src/lib/ingest/aggregate.ts` (`RawStroke`, and the shot construction)
- Modify: `infra/function/handler.mjs` (`validateShots`)
- Test: `src/lib/ingest/aggregate.test.ts`, `infra/handler.test.mjs`

**Interfaces:**
- Consumes: the widened `MetricId` from Task 3.
- Produces: `Shot.reducedAccuracy?: string[]`

- [ ] **Step 1: Write the failing tests**

`src/lib/ingest/aggregate.test.ts`:

`aggregateActivities` returns `{ sessions: TrackmanSession[]; shots: Map<string, Shot[]> }` —
shots are keyed by session id, **not** nested inside the session. That separation is what keeps
per-shot data off the `Repository` interface (D24).

```ts
it('carries the reduced-accuracy flag onto the shot', () => {
  const { shots } = aggregateActivities([{
    id: 'a1',
    time: '2026-08-17T08:00:00Z',
    strokes: [{
      club: 'Driver',
      time: '2026-08-17T08:00:01Z',
      measurement: { clubPath: -6, spinRate: 5500 },
      reducedAccuracy: ['SpinRate'],
    }],
  }])
  expect(shots.get('a1')![0].reducedAccuracy).toEqual(['SpinRate'])
})

it('leaves the flag absent rather than empty when nothing is flagged', () => {
  const { shots } = aggregateActivities([{
    id: 'a2',
    time: '2026-08-17T08:00:00Z',
    strokes: [{ club: 'Driver', measurement: { clubPath: -6 } }],
  }])
  expect(shots.get('a2')![0]).not.toHaveProperty('reducedAccuracy')
})
```

`infra/handler.test.mjs`:

```js
it('accepts a shot carrying a reduced-accuracy flag', () => {
  const shots = [{ club: 'DRIVER', metrics: { spinRate: 5500 }, reducedAccuracy: ['SpinRate'] }]
  expect(validateShots({ shots })).toEqual(shots)
})

it('rejects a reduced-accuracy value that is not an array of strings', () => {
  expect(() => validateShots({ shots: [{ club: 'DRIVER', metrics: {}, reducedAccuracy: 'SpinRate' }] }))
    .toThrow(BadRequest)
  expect(() => validateShots({ shots: [{ club: 'DRIVER', metrics: {}, reducedAccuracy: [7] }] }))
    .toThrow(BadRequest)
})

it('still rejects a non-numeric reading inside metrics', () => {
  expect(() => validateShots({ shots: [{ club: 'DRIVER', metrics: { spinRate: 'lots' } }] }))
    .toThrow(BadRequest)
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- src/lib/ingest/aggregate.test.ts` and `npx vitest run infra/handler.test.mjs`
Expected: FAIL — `reducedAccuracy` is undefined on the shot, and the handler strips it.

- [ ] **Step 3: Widen `Shot` in `src/lib/domain/types.ts`**

```ts
export interface Shot {
  club: Club
  /** UTC instant from the stroke, kept for ordering within a session. */
  time?: string
  metrics: Partial<Record<MetricId, number>>
  /**
   * Trackman's own quality flag, verbatim. Only ever `SpinRate` or `SpinAxis` across 5,954
   * strokes, and present on 1,273 of them.
   *
   * **Deliberately not inside `metrics`**, which holds numbers only. Stored rather than used to
   * filter: Phase 7 excluded both flagged metrics instead, and `spinRate` turned out to be the
   * metric that answers a question about distance. A caveat that travels with the reading is
   * better than a reading that was never taken.
   */
  reducedAccuracy?: string[]
}
```

- [ ] **Step 4: Read the flag in `src/lib/ingest/aggregate.ts`**

Widen `RawStroke`:

```ts
export interface RawStroke {
  club?: string | null
  time?: string | null
  measurement?: Record<string, unknown> | null
  reducedAccuracy?: (string | null)[] | null
}
```

And after `if (stroke.time) shot.time = stroke.time`, add:

```ts
    // Absent, never empty: an empty array would read as "checked and clean" on a stroke the
    // API said nothing about.
    const flags = (stroke.reducedAccuracy ?? []).filter((f): f is string => typeof f === 'string')
    if (flags.length > 0) shot.reducedAccuracy = flags
```

- [ ] **Step 5: Add the field to the selection set in `src/lib/ingest/api.ts`**

`reducedAccuracy` sits on the stroke, not on `measurement`. Change line ~48:

```
          strokes { club time reducedAccuracy measurement { ${STROKE_FIELDS} } }
```

- [ ] **Step 6: Accept it in `infra/function/handler.mjs`**

Inside `validateShots`, after the `metrics` loop:

```js
    // Trackman's own quality flag, stored verbatim beside the readings it qualifies. Not inside
    // `metrics`, which is numbers only — hence its own check rather than the loop above.
    if (shot.reducedAccuracy !== undefined) {
      if (
        !Array.isArray(shot.reducedAccuracy) ||
        shot.reducedAccuracy.some((f) => typeof f !== 'string')
      ) {
        throw new BadRequest('A reduced-accuracy flag must be an array of strings.')
      }
    }
```

- [ ] **Step 7: Run both suites**

Run: `npm test && npm run check`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/domain/types.ts src/lib/ingest/api.ts src/lib/ingest/aggregate.ts src/lib/ingest/aggregate.test.ts infra/function/handler.mjs infra/handler.test.mjs
git commit -m "Store the accuracy flag beside the readings it qualifies"
```

---

### Task 5: Bump the schema to 4

Additive: every v3 document is a valid v4 document with a thinner `metrics` map. The bump exists so the **currently deployed build** refuses a document it would silently narrow.

**Files:**
- Modify: `src/lib/storage/migrations.ts:5` and the `MIGRATIONS` map
- Modify: `infra/function/handler.mjs:60`
- Test: `src/lib/storage/migrations.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `SCHEMA_VERSION = 4`

- [ ] **Step 1: Write the failing tests**

```ts
it('is at version 4', () => {
  expect(SCHEMA_VERSION).toBe(4)
})

it('migrates v3 to v4 without touching the data', () => {
  const doc = {
    schemaVersion: 3,
    sessions: [{
      id: 's1', type: 'trackman', date: '2026-08-17', source: 'api',
      clubs: [{ club: 'DRIVER', typical: -6, best: -1, n: 5, metrics: { carry: { typical: 180, n: 5 } } }],
    }],
    settings: {},
  }
  const out = migrate(structuredClone(doc))
  expect(out.schemaVersion).toBe(4)
  expect(out.sessions).toEqual(doc.sessions)
})

it('still carries a v2 document all the way to v4', () => {
  const out = migrate({ schemaVersion: 2, sessions: [], settings: {} })
  expect(out.schemaVersion).toBe(4)
})

it('refuses a v5 document', () => {
  expect(() => migrate({ schemaVersion: 5, sessions: [], settings: {} })).toThrow(FutureSchemaError)
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- src/lib/storage/migrations.test.ts`
Expected: FAIL — `expected 3 to be 4`.

- [ ] **Step 3: Implement**

`src/lib/storage/migrations.ts` line 5:

```ts
export const SCHEMA_VERSION = 4
```

Add to `MIGRATIONS`:

```ts
  /**
   * v3 → v4: the metric set widens from twelve to forty-three. **Identity, deliberately.**
   * Every v3 document is already a valid v4 one — `metrics` is a partial map, so a v3 row is a
   * v4 row with fewer keys, and club path keeps the fields it has always had.
   *
   * The bump is for the **build currently deployed**, whose `MetricId` union does not contain
   * `spinRate` and which would drop every new reading on an export/import round trip.
   * `FutureSchemaError` then refuses rather than quarantines, and says "update the site".
   *
   * As at v2 → v3, this protection is real for the cache and weak for the remote store, which
   * reports `Math.min(...)` across items and will keep reporting `2` while any untouched
   * pre-Phase-7 session exists.
   */
  3: (doc) => doc,
```

`infra/function/handler.mjs` line 60:

```js
const SCHEMA_VERSION = 4
```

- [ ] **Step 4: Run the suites**

Run: `npm test && npm run check`
Expected: PASS.

- [ ] **Step 5: Commit — both constants together, never one alone**

```bash
git add src/lib/storage/migrations.ts src/lib/storage/migrations.test.ts infra/function/handler.mjs
git commit -m "Bump to schemaVersion 4 so an older build refuses the wider set"
```

---

### Task 6: Bring the documentation in line

Four documents state the twelve-metric shape and become wrong the moment Task 3 lands. The repo rule is that they are fixed in the same change, not later.

**Files:**
- Modify: `CLAUDE.md` — the "twelve metrics" paragraph and the `n`-per-metric rule
- Modify: `docs/architecture.md` — stored shape and `schemaVersion`
- Modify: `docs/content.md` — the three new driver bands
- Modify: `docs/roadmap.md` — Phase 8

- [ ] **Step 1: Find every claim that Task 3 falsified**

```bash
rg -n "twelve metrics|twelve of|schemaVersion 3|12 metrics" CLAUDE.md docs/
```

- [ ] **Step 2: Rewrite the `CLAUDE.md` ingest paragraph**

Replace "The ingest carries **twelve metrics**, not one (Phase 7, issue #25)" with:

```markdown
The ingest carries **forty-three metrics** — every `Measurement` field Trackman actually
populates (Phase 8). `lib/domain/metrics.ts` is the registry, and its entries come in two kinds:
**carried** metrics are stored per shot and as a session reading, and **charted** metrics add a
hand-authored, driver-scoped axis. Eighteen are charted. `isCharted()` and `chartedInfo()` are
the only routes to a domain, so asking to plot a metric that has no authored axis fails at the
call rather than rendering an undefined one.

**Carrying is the default; charting is the deliberate decision.** Phase 7 applied one test to
both and dropped `ballSpeed`, `smashFactor`, `spinRate`, `launchAngle` and `total` — the
best-populated fields in the dataset, `0%` null on the driver where `clubPath` is 14.5% null.
```

- [ ] **Step 3: Add the band rule to `CLAUDE.md`**

```markdown
- **`best` means closest to the band's midpoint, not closest to zero.** For club path the band
  is `−2…+2` and the midpoint is `0`, so nothing about the KPI changes. `spinRate` (2,200–2,700
  rpm) and `launchAngle` (13–15°) are why it is expressed as a midpoint. A `neutral` metric with
  no band throws — the midpoint would be undefined. `smashFactor` is `higher` despite having a
  band, because ~1.50 is a physical ceiling and "closest to the midpoint" would rank 1.475 above
  1.50.
```

- [ ] **Step 4: Record the new bands in `docs/content.md`**

```markdown
### Driver targets beyond club path

Scoped to the driver, like every domain in `metrics.ts`. Authored from coaching reference, not
fitted to the player's own readings — a band fitted to these would define "good" as "better than
recent", which is the mistake fixed axes exist to prevent.

| Metric | Target | Measured p50 (45 driver sessions) |
|---|---|---|
| Spin rate | 2,200–2,700 rpm | 5,715 rpm |
| Launch angle | 13–15° | 13.75° |
| Smash factor | 1.45–1.50 | 1.30 |
| Spin axis | −5° to +5° | +15.29° |
```

- [ ] **Step 5: Update `docs/architecture.md` and `docs/roadmap.md`**

In `architecture.md`, update the stored-shape section: `schemaVersion` is `4`, `ClubPath.metrics` holds up to 42 readings (all but club path), and `Shot` gains `reducedAccuracy?: string[]`. Note that the session document is ~731 KB with the full set and that this is accepted (D25).

In `roadmap.md`, add Phase 8 as delivered, with a link to the spec.

- [ ] **Step 6: Verify nothing stale remains**

```bash
rg -n "twelve metrics|schemaVersion 3" CLAUDE.md docs/ || echo "clean"
npm test && npm run check
```

- [ ] **Step 7: Commit**

```bash
git add CLAUDE.md docs/
git commit -m "Bring the docs in line with a registry of forty-three"
```

---

### Task 7: Verify against the live store

The phase is not done when tests pass. This is a live site on a real domain, and a swallowed read failure looks exactly like a healthy site.

- [ ] **Step 1: Run the ingest against a narrow window**

```bash
export VITE_API_URL=$(grep VITE_API_URL .env | cut -d= -f2)
API_URL=$VITE_API_URL npm run ingest -- --since 2026-08-17
```

Expected: the 2026-08-17 session is rewritten with 43-metric readings. An unchanged pull writes nothing, so re-running is safe.

- [ ] **Step 2: Confirm the wide data landed**

```bash
curl -s "$VITE_API_URL/sessions" | python3 -c "
import json,sys
d=json.load(sys.stdin)
s=max(d['sessions'], key=lambda x: x['date'])
print('schemaVersion', d['schemaVersion'], '(min across items — 2 is correct while pre-Phase-7 sessions exist)')
for c in s['clubs']:
    print(c['club'], len(c.get('metrics') or {}), 'metrics')
"
```

Expected: 42 metrics per club row (43 minus club path, which keeps its own fields).

- [ ] **Step 3: Verify a per-shot record carries the new fields**

```bash
curl -s "$VITE_API_URL/shots/$(python3 -c "
import json,urllib.request,urllib.parse
d=json.load(urllib.request.urlopen('$VITE_API_URL/sessions'))
print(urllib.parse.quote(max(d['sessions'],key=lambda x:x['date'])['id'],safe=''))
")" | python3 -c "
import json,sys
sh=json.load(sys.stdin)['shots']
print(len(sh),'shots; first shot metrics:',len(sh[0]['metrics']))
print('has ballSpeed:', 'ballSpeed' in sh[0]['metrics'])
print('flagged shots:', sum(1 for s in sh if s.get('reducedAccuracy')))
"
```

- [ ] **Step 4: Verify the deployed site with a cold cache**

**Never verify against a browser whose cache is already populated.** Clear site data for `golf.whitfield.life` first, then load `/progress` and watch for the network request to the Function URL. A populated cache would render identically whether or not the store was reached at all.

- [ ] **Step 5: Commit nothing — this task changes no files**

If anything failed, stop and diagnose rather than patching forward. A failed **write** must throw; a failed **read** degrades to cache and must never blank the site.

---

## Notes for the executor

- `ingest/aggregate.ts` and `ingest/api.ts` are **already registry-driven**. They iterate `METRICS` and join `METRIC_FIELDS`. Task 3 widens both with no edit to their logic — if you find yourself editing an aggregation loop to add a metric, stop and re-read `aggregate.ts:71` and `:100`.
- `npm run introspect` needs **no credential** and can be run any time. `npm run probe` needs `TRACKMAN_REFRESH_TOKEN`, which is not in `.env` — it lives in GitHub Actions, and `.github/workflows/probe.yml` is dispatch-only and kept for exactly this.
- **TypeScript is pinned to v6.** `svelte-check` does not accept v7. Do not upgrade it.
- The store reporting `schemaVersion: 2` is **correct, not a bug**: `handler.mjs` returns `Math.min(...)` across items, and 85 pre-Phase-7 sessions still carry `2`.
