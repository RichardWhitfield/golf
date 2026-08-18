# Phase 8 — Carry every metric Trackman actually populates

**Status:** design, awaiting review
**Supersedes:** the twelve-metric selection in `2026-08-06-phase-7-per-shot-metrics-design.md` §3

---

## 1. Summary

Phase 7 carried twelve metrics. The test it applied was *does this answer a question that is
being asked*, not *is it available* — and that test was right for charting and wrong for storage.
A question arrived that the stored data could not answer, and the fields that would have answered
it had been **probed and then dropped without a recorded reason**.

This phase separates the two decisions:

- **Carrying** a metric becomes the default. Every field Trackman populates — 43 of them — is
  stored per shot, in the `SHOTS#<sessionId>` item nothing downloads on load.
- **Charting** a metric stays deliberate. It needs a hand-authored, driver-scoped axis, and
  nothing about that changes.
- **Aggregating** a metric follows carrying. Every carried metric gets a session reading with its
  own `n`. The document grows ~18× and that is accepted on purpose — §4.5 records the measurement
  and the decision.

The cost of carrying a field is a wire name in a registry. The cost of *not* carrying it is a
question that cannot be answered until the next session, and never retrospectively.

---

## 2. What prompted it

A comparison against a playing partner: comparable club speed, ~50 m less total distance. The
store held `carry` and eleven delivery metrics. It did not hold `ballSpeed`, `smashFactor`,
`spinRate`, `launchAngle` or `total`, so the strike could be *inferred* from `spinLoft` and the
roll could not be examined at all.

All five were probed in Phase 7 (`scripts/trackman-probe.ts`, the 31-field shortlist). None appears
in that spec's "deliberately excluded" table. They were measured once and dropped silently.

---

## 3. What the probe says

Run 32100696638, `2025-06-01` onward: **93 sessions, 5,954 strokes.**

**P1 · Every field is readable. 68 of 68**, floats and extras alike, with no denial. The
all-or-nothing failure mode — one unreadable field failing the whole request, `clubPath`
included — is not currently reachable. It remains guarded, not assumed: `authorized()` still
establishes the readable set one field at a time before the sweep, and `clubPath` is asserted
present before anything is counted.

**P2 · 21 of the 64 floats hold no data at all.** F2 found four; there are seventeen more.

```
backswingTime  forwardswingTime  strokeLength  tempo         gyroSpinAngle
landingHeight  skidDistance      side          speedDrop     entrySpeedDistance
rollSpeed      rollPercentage    rollDeceleration            bounces
break          totalBreak        effectiveStimp              flatStimp
elevation      slopePercentageSide            slopePercentageRise
```

Every putting-green field is among them, which is the finding that lets them be excluded on
evidence rather than on the assumption that a range session has no putts. **The carried set is
the remaining 43.**

**P3 · The ball-flight fields are the best-populated in the dataset.** On the driver,
`ballSpeed`, `launchAngle`, `launchDirection`, `spinRate`, `carry`, `total`, `carrySide`,
`totalSide`, `landingAngle`, `hangTime` and `maxHeight` are **0% null over 730 strokes**.
`clubPath` is 14.5% null and `faceToPath` 23%. Phase 7 stored the sparse fields and dropped the
dense ones.

**P4 · The motivating question, answered.** Across 45 driver session means:

| Metric | p50 | p05 | p95 | Reference |
|---|---:|---:|---:|---|
| `clubSpeed` | 43.24 m/s (96.7 mph) | 40.24 | 45.56 | — |
| `ballSpeed` | 55.47 m/s (124.1 mph) | 48.80 | 59.77 | ~143 mph at this club speed |
| `smashFactor` | **1.30** | 1.16 | 1.37 | 1.48–1.50 |
| `spinRate` | **5,715 rpm** | 4,381 | 7,239 | 2,200–2,700 |
| `launchAngle` | 13.75° | 8.62 | 18.20 | 13–15° |
| `carry` | 154.11 m | 111.42 | 174.39 | — |
| `total` | 166.14 m | 127.58 | 191.84 | — |
| `landingAngle` | 37.79° | 27.27 | 47.54 | — |

Median roll is **12.0 m**. The best spin rate in thirteen months is 4,235 rpm — still well above
optimal, so this is a delivery pattern rather than shot-to-shot variance. Reference figures are
external coaching values and are recorded here as context, **not** stored in the registry.

**P5 · `reducedAccuracy` now has something to act on.** 1,273 strokes carry a flag: `SpinRate`
(824) and `SpinAxis` (495), and nothing else — unchanged in character from F5. Phase 7 excluded
both metrics rather than store them with a caveat nothing enforced. Since `spinRate` is now the
headline metric, the flag is stored **per shot, alongside the readings it qualifies**.

**P6 · F4 still holds.** `normalizedMeasurement` is identical to `measurement` on all 4,968
strokes where both are present. `detectedClubCategory` remains 100% null; `kind` remains the
constant `"Measurement"`. None is stored.

---

## 4. The design

### 4.1 One registry, two kinds of metric

`metrics.ts` stays the single source of truth for wire field names — a wire name exists in
exactly one place, and that does not change. What changes is that having an axis becomes
optional, and the type says so:

```ts
interface CarriedMetric {
  id: MetricId
  field: string          // verified against introspection.json, never typed from memory
  short: string
  name: string
  unit: '°' | 'm' | 'm/s' | 'rpm' | 's' | ''
  decimals: 0 | 1 | 2
}

interface ChartedMetric extends CarriedMetric {
  domain: { min: number; max: number }   // authored, frozen, driver-scoped
  band?: { min: number; max: number }
  better: Better
}

type MetricInfo = CarriedMetric | ChartedMetric

function isCharted(m: MetricInfo): m is ChartedMetric   // the only way to reach an axis
```

**"Charted" becomes "has an authored domain", enforced by the compiler.** A component cannot
reach `domain` on a carried-only metric without narrowing first, so the rule that axes are
authored rather than derived is carried by the type instead of by a comment.

`METRIC_FIELDS` is built from the whole list. `/progress` iterates `METRICS.filter(isCharted)`.

### 4.2 `Better` gains a target that is not zero

The existing `neutral` means *closest to zero*, which is correct for `clubPath`, `faceAngle`,
`faceToPath`, `curve` and `lowPointSide`. It cannot express `spinRate`, whose target is
2,200–2,700 rpm, or `launchAngle`, or `smashFactor`.

`neutral` is therefore **generalised, not supplemented**: best becomes *closest to the midpoint
of the metric's band*. For `clubPath` the band is `−2 … 2`, whose midpoint is `0`, so every
existing reading is unchanged and the rule CLAUDE.md states — closest to neutral, never
`Math.max`, never `Math.abs` on a signed value — holds exactly as before. A `neutral` metric
without a band is a compile error, because the midpoint would be undefined.

This is the only behavioural change to existing metrics, and it is a no-op for all five of them.
A test asserts that explicitly.

### 4.3 The charted set grows by six

Twelve existing, unchanged. Six added, with domains authored from the driver session-mean ranges
in P4 with headroom, and frozen:

| Metric | Unit | Observed (driver means) | Domain | Band | `better` |
|---|---|---|---|---|---|
| `ballSpeed` | m/s | 39.59 … 61.53 | 38 … 64 | — | `higher` |
| `smashFactor` | — | 1.11 … 1.44 | 1.05 … 1.55 | 1.45 … 1.50 | `higher` |
| `spinRate` | rpm | 4,235 … 7,731 | 2,000 … 8,000 | 2,200 … 2,700 | `neutral` |
| `launchAngle` | ° | 7.50 … 19.20 | 6 … 22 | 13 … 15 | `neutral` |
| `total` | m | 100.60 … 194.42 | 90 … 210 | — | `higher` |
| `spinAxis` | ° | −6.04 … 29.25 | −10 … 32 | −5 … 5 | `neutral` |

`smashFactor` is `higher`, not `neutral`, and it is the exception that proves the band rule.
Its band is a real target, but ~1.50 is a physical ceiling rather than the centre of a range:
`neutral` would rank a 1.475 strike above a 1.50 one, which is wrong. A band and a `better` answer
different questions — *where is the goal* and *which reading is the best one* — and this is the
first metric where they come apart. `band` on a `higher` metric is therefore legal and means
"target region", drawn but not used to pick `best`.

The three `neutral` bands that are not `−2 … 2` are **coaching targets for a driver**, and are recorded in
`docs/content.md` with that scoping stated, exactly as the domains are. They are not derived from
the player's own data — a band fitted to these readings would define "good" as "better than
recent", which is the mistake the fixed-axis rule exists to prevent.

`landingAngle`, `carrySide`, `totalSide`, `hangTime` and `maxHeight` are **carried, not charted**.
They are readable in the per-shot record and answer questions when asked; none has a target that
survives being stated for one club, and inventing one would repeat the `0 of 0` mistake.

### 4.4 The remaining 25 are carried only

`swingDirection`, `swingRadius`, `dPlaneTilt`, `dynamicLie`, `impactOffset`, `impactHeight`,
`lowPointHeight`, `ballSpeedDifference`, `smashIndex`, `launchDirection`, `spinRateDifference`,
`spinIndex`, `carrySide`, `totalSide`, `landingAngle`, `hangTime`, `maxHeight`, `lastData`, and
the seven `*Actual` variants.

`swingDirection` is the clearest case for why the split is worth making. Phase 7 excluded it
outright as near-collinear with `clubPath` (r = 0.819; this probe measures **0.866** on the
driver), and for a *panel* that reasoning still holds — a second chart saying the same thing.
It is no reason to discard the reading. Carried, never charted.

The `*Actual` variants earn their place on evidence rather than intuition: they are only 2.1%
null on the driver against 14.2% for `curve`, and they differ from the normalised readings
(`curveActual` p50 18.51 against `curve` 22.05), so they are a second, denser view of the same
shot rather than a duplicate.

### 4.5 Storage

**Per shot** — `Shot.metrics` is keyed by the wider `MetricId` union, so all 43 are expressible.
The Lambda needs **no change**: `validateShots` whitelists no metric keys and accepts any finite
number under any key. `reducedAccuracy` joins `Shot` as an optional `string[]`, which the handler's
existing per-shot validation must be extended to accept — it currently rejects a non-numeric value
anywhere in `metrics`, and the flag deliberately does not live in `metrics`.

**Session aggregates** — the `metrics` map on each club row gains a `MetricReading` for **every
carried metric**, each with its own required `n`. Per-metric counts already exist and already
differ by up to 45 points; widening the set widens the spread rather than changing the rule.

**One rule, not two.** There is no charted-versus-carried distinction in the storage layer: if a
metric is carried, it is aggregated. The registry's split (§4.1) governs axes alone.

**The payload cost, measured and accepted (D31).** A `MetricReading` serialises to 43.4 bytes, and
the store holds 379 club rows across 88 sessions. The document the browser downloads on refresh
goes from **40 KB to roughly 731 KB**:

| Aggregated set | Added | Document |
|---|---:|---:|
| 12 (today) | — | 40 KB |
| 43 (this phase) | +691 KB | **~731 KB** |

Recorded because it is real, accepted because the site is used on a 5G connection where ~731 KB is
not a constraint, and because the alternative — aggregating a subset — buys a second rule in
`aggregate.ts` and a class of question that needs a per-shot fetch to answer. `CachedRepo` paints
from `localStorage` first, so the cost falls on refresh rather than on every paint, and
`better: 'none'` metrics store no `best`, so the real figure lands under the estimate.

**If it ever does bite**, the lever is scoping aggregates to the KPI club — **not** dropping
metrics back out, which would recreate this phase's problem.

**`schemaVersion` 3 → 4**, in `migrations.ts` and `infra/function/handler.mjs` in the same commit.
The migration is additive: a v3 document is a valid v4 document with a thinner `metrics` map, so
`3 → 4` adds nothing and exists to record the shape change. The store currently reports
`schemaVersion: 2` because the handler returns the **minimum** across items and 85 pre-Phase-7
sessions still carry `2`; that stays correct and keeps the migration firing on read.

### 4.6 Ingest

`api.ts` builds its selection set from `METRIC_FIELDS`, so widening the registry widens the query
with no second edit. `aggregate.ts` filters nulls per metric and computes `n` per metric; the loop
is already per-metric and needs only the wider list.

**No retry narrowing, unchanged.** A field this token cannot read fails the whole request, and
that must stay a loud failure — a retry that dropped `clubPath` to rescue a request would be worse
than no data. P1 says the failure is not currently reachable; the probe workflow is how that is
re-established, not an assumption to bake in.

---

## 5. Testing

| Area | Test |
|---|---|
| Registry | Every `field` matches `introspection.json`; no duplicates; every id is unique |
| Registry | Every `neutral` metric has a band (else the midpoint is undefined) |
| `bestOf` | Band-midpoint generalisation is a **no-op** for all five existing `neutral` metrics |
| `bestOf` | `higher` still returns the max — including `smashFactor`, which has a band |
| `bestOf` | `none` still returns `undefined`, and stores no `best` |
| Type split | A carried-only metric cannot reach `.domain` without `isCharted` — compile-time |
| `aggregate.ts` | Aggregates cover all 43 carried metrics — the same set as the per-shot record |
| `aggregate.ts` | Per-metric null filtering; `n` differs per metric within one club row |
| `aggregate.ts` | A metric null on every stroke produces no reading, never `n: 0` |
| Migration | v3 → v4 additive; v2 → v4 through the existing chain; v4 refused by a v3 build |
| Handler | `reducedAccuracy` accepted as `string[]`; a non-numeric inside `metrics` still rejected |

---

## 6. Documentation to update in the same commit

- `CLAUDE.md` — "The ingest carries **twelve metrics**" becomes wrong the moment this lands, as
  does the `n`-per-metric paragraph's field list.
- `docs/architecture.md` — the stored shape and `schemaVersion`.
- `docs/content.md` — the three new driver bands, with their scoping stated.
- `docs/roadmap.md` — Phase 8.

---

## 7. Risks

**The session document grows ~18×, to ~731 KB.** Measured, not estimated, and accepted (D31) on
a 5G connection. Bounded by the cache painting first and by `none` metrics storing no `best`. The
escape hatch is per-club scoping, and it is deliberately not "carry fewer metrics".

**The registry doubles in size.** 43 entries is a long file. Mitigated by the carried/charted
split: a carried entry is six fields with no judgement in it, and the judgement is concentrated in
the eighteen charted ones.

**Six new bands are six new opportunities to be wrong.** They are driver-scoped coaching targets,
stated as such, and reviewable in one table.

**Widening the query widens the blast radius of a revoked field.** P1 shows all 68 readable today.
The mitigation is the probe workflow, re-runnable on demand — not retry logic.

**`spinRate` and `spinAxis` carry a reduced-accuracy flag on ~14% of strokes.** Storing the flag
alongside is what makes that visible rather than silent; a panel that ignores it is a follow-up
concern, not a reason to discard the metric.

---

## 8. Out of scope

- Charting any new metric for a **second club**. Every domain here is driver-scoped, and
  authoring another club's axes is a separate piece of work, not a derivation.
- Any UI beyond making the six new charted metrics available to the existing panels.
- `ballTrajectory`, `clubTrajectory`, `data` — per-shot arrays and an untyped bag. Excluded on
  size, which is the one respect in which "storage is minimal" does not hold.
