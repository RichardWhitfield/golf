# Phase 7 · Per-shot Trackman metrics

**Issue:** [#25](https://github.com/RichardWhitfield/golf/issues/25) · **Date:** 2026-08-06 ·
**Status:** design, awaiting approval

Widens the Trackman ingest beyond `measurement { clubPath }` to a considered set of twelve
metrics, stores the shot-by-shot record where it can land privately, and answers the question the
phase was raised to answer.

---

## 1. Summary

The GraphQL query names one field. Everything else Trackman measures is discarded at the query.
Phase 6 gave per-shot data somewhere private to land, so it can now be kept.

Three things are built:

1. **A metric registry** (`domain/metrics.ts`) — the single source of truth for which metrics
   exist, what they are called on the wire, their fixed axes, and what "best" means for each.
2. **Per-metric aggregates** on each club row, each carrying **its own shot count**, plus a
   per-shot record under `SHOTS#<sessionId>` that no chart downloads.
3. **A driver panel on `/progress`** that decomposes the slice into path and face, and states
   what the plane data actually says.

**The KPI does not move.** It stays driver club path (OQ-7, [#14](https://github.com/RichardWhitfield/golf/issues/14)).
This phase adds context for *why* the path is what it is.

---

## 2. What the live API says

Introspection first, as its own step — the issue's sequencing, and twice now real data has
changed a design here.

Two scripts were built, and both stay in the repo:

| Script | Needs a credential? | Answers |
|---|---|---|
| `npm run introspect` | **No** | Which fields exist, and their types |
| `npm run probe` | Yes | Which are populated, over what range, and whether they carry signal |

**Introspection needs no credential.** Verified against the live endpoint with an anonymous
request. That makes the schema script runnable by anyone at any time, with no secret and no
workflow — and it is why the schema cannot be read as a statement of permission. It describes the
whole facility and partner surface, not this player's.

### Findings that changed the design

**F1 · `Measurement` carries 75 fields, and `swingPlane` is among them.** Every numeric field is a
**nullable `Float`**; not one is `Float!`. Absence is the schema's own posture for all 75, so
"`n` is absent, never zero" stops being a hand-entry special case and becomes the general rule.

**F2 · Four advertised fields hold no data whatsoever.** `strokeLength`, `backswingTime`,
`forwardswingTime` and `tempo` are null on **all 5,877 strokes**, as is `detectedClubCategory`.
`kind` is the constant `"Measurement"`. This is the finding that justifies the whole probe step:
a design written from the schema would have shipped a tempo chart with nothing in it.

**F3 · Null rates differ per metric, by up to 45 points.** On the driver, `swingPlane` is present
on 666 strokes, `clubPath` on 618, and `dynamicLie` / `impactOffset` / `impactHeight` on 349
(51.7% null). **This breaks the current model**, where one `n` describes a club's whole session.
A shared count would let `radiusFor()` in `scale.ts` draw a 349-shot reading as heavily as a
618-shot one. Each metric therefore carries its own `n`.

**F4 · `normalizedMeasurement` is a dead end.** Identical to `measurement` on all 4,901 readings
where both are present — 0 differing, max delta 0°. Not stored.

**F5 · `reducedAccuracy` is real but narrow.** 1,251 strokes carry a flag, and only ever
`SpinRate` (822) or `SpinAxis` (475). It never flags club delivery. Since no spin metric is
stored, it has nothing to act on and is not stored either.

**F6 · Per-shot and session-mean statistics are different, and mixing them misdraws charts.**
Per-shot club path spans `-18…10.9`; session means span `-13.76…0.89`. `scale.ts`'s existing
domain of `-14…4` was authored from the latter. Every fixed axis below is authored from
**session means**, because that is the level a panel plots.

The probe reproducing the existing `-13.76` minimum exactly is the evidence its aggregation
matches the shipped `aggregate.ts`.

### The motivating question, answered

> *Swing plane is probably too steep, and that may be causing the out-to-in path.*

**The data does not support it, and the sign runs the other way.**

| Driver, `swingPlane` vs `clubPath` | r | n |
|---|---|---|
| Per shot | +0.362 | 618 shots |
| **Per session mean** — the level `/progress` plots | **+0.503** | 44 sessions |
| 4-iron, per shot | −0.053 | 1,014 shots |

A *positive* r means a steeper plane goes with a **less** out-to-in path. The relationship is
moderate (R² ≈ 0.25) and club-dependent — at the 4-iron it vanishes. Steepness is not what is
sending the path left.

**What the path does travel with**, driver, at session-mean level:

```
swingDirection   r =  0.819    near-collinear with path — a second chart saying the same thing
faceToPath       r = -0.612    what actually makes the ball curve
faceAngle        r =  0.549
swingPlane       r =  0.503    moderate, and signed against the hypothesis
attackAngle      r = -0.124    essentially unrelated
```

**F7 · The face is not the fault; the path is.** Driver `faceAngle` sits at a p50 of `-0.86°` —
square to target — while `faceToPath` sits at `+4.8°`. The face is only open *relative to the
path*, because the path is so far left. And `faceToPath` has **never once been negative**: its
minimum across all 44 driver sessions is `+0.97°`, with `curve` never below `+3.61 m`. There is
no session in thirteen months where the driver did not slice on average.

That independently vindicates the KPI. Fixing the path fixes the curve; the face needs nothing.

---

## 3. What gets stored, and why each earns its place

Twelve metrics. The test applied was *does this answer a question that is being asked*, not *is it
available*.

| Metric | Why it earns its place |
|---|---|
| `clubPath` | The KPI. Unchanged in every respect. |
| `faceAngle` | Half of the start-direction and curve equation. Establishes the face is square (F7). |
| `faceToPath` | **What makes the ball curve.** Strongest non-collinear correlate of path (r = −0.612). |
| `swingPlane` | The question the phase was raised to answer. Kept so the answer stays checkable as the swing changes. |
| `attackAngle` | Driver delivery context; hitting down with a driver is a fault in its own right. |
| `curve` | The cost, in metres. `+21 m` is legible in a way `−5.4°` is not. |
| `clubSpeed` | Guards against "improved by swinging easier" — a path that neutralises while speed drops is not progress. |
| `carry` | The other half of that guard, and the number actually felt on a course. |
| `lowPointDistance` | Where the arc bottoms out, fore and aft. The strike side of a path change. |
| `lowPointSide` | Lateral low point; r = 0.386 with driver path per shot. |
| `dynamicLoft` | Loft delivery. Interacts with `attackAngle` to explain distance loss. |
| `spinLoft` | With `dynamicLoft`, separates a strike problem from a delivery problem. |

### Deliberately excluded

| Excluded | Why |
|---|---|
| `swingDirection` | r = 0.819 with `clubPath` on the driver. Near-collinear — a second panel saying the same thing. |
| `strokeLength`, `backswingTime`, `forwardswingTime`, `tempo` | **100% null across 5,877 strokes** (F2). |
| `detectedClubCategory`, `kind` | 100% null, and a constant, respectively (F2). |
| `spinRate`, `spinAxis` | The only metrics `reducedAccuracy` ever flags (F5). Excluded rather than stored with a caveat nothing enforces. |
| `dynamicLie`, `impactOffset`, `impactHeight` | 51.7% null on the driver. Too sparse to chart honestly. |
| `ballTrajectory`, `clubTrajectory` | Per-shot arrays that would dwarf every other stored value. |
| `break`, `totalBreak`, `effectiveStimp`, `flatStimp`, `bounces`, `rollSpeed`, `skidDistance` | Putting-green metrics. A range session has no use for them. |
| `normalizedMeasurement` | Identical to `measurement` (F4). |
| `aggregatedMeasurement` | Unchanged from Phase 3: it cannot report `n`, and #14 requires a shot count on every point. |

---

## 4. The metric registry — `src/lib/domain/metrics.ts`

New, and the counterpart to `domain/clubs.ts`. That file refuses to guess a club spelling; this
one refuses to guess an axis.

```ts
export type MetricId =
  | 'clubPath' | 'faceAngle' | 'faceToPath' | 'swingPlane' | 'attackAngle' | 'curve'
  | 'clubSpeed' | 'carry' | 'lowPointDistance' | 'lowPointSide' | 'dynamicLoft' | 'spinLoft'

export interface MetricInfo {
  id: MetricId
  /** The `Measurement` field name. Verified by `npm run introspect`, never typed from memory. */
  field: string
  /** Monospaced UI label. */
  short: string
  /** Prose label. */
  name: string
  unit: '°' | 'm' | 'm/s'
  /** Fixed y-domain — authored, frozen, never fitted to the data at render time. */
  domain: { min: number; max: number }
  /** The coaching target, where one genuinely exists. */
  band?: { min: number; max: number }
  /** What "best" means for this metric. */
  better: 'neutral' | 'higher' | 'none'
  decimals: 0 | 1 | 2
}
```

### `better` is per metric, and three metrics have no "best" at all

`best` cannot be one rule. For `clubPath` it means the reading closest to neutral, because the
target is a band and `+5°` is worse than `+1°`. For `carry` the largest reading genuinely is the
best one.

- **`neutral`** — `clubPath`, `faceAngle`, `faceToPath`, `curve`, `lowPointSide`. Closest to zero
  wins. **Never `Math.max`**, and never `Math.abs` on a signed value.
- **`higher`** — `clubSpeed`, `carry`.
- **`none`** — `swingPlane`, `attackAngle`, `dynamicLoft`, `spinLoft`, `lowPointDistance`.
  **These store no `best` and render no band.**

`attackAngle` is why `none` has to exist. A driver wants a positive attack angle and an iron wants
a negative one, so a single shared band would be actively wrong for one of them. Recording "there
is no shared target" is the honest answer; inventing `±2°` would be the `0 of 0` mistake from
Phase 4 in a new place.

### Fixed axes, authored from real session means

Every domain below is authored from the observed **driver** session-mean range with headroom, and
frozen as a constant. A domain fitted at render time would move between visits and quietly
redefine "good" as "better than recent" rather than "inside the band".

| Metric | Observed (driver session means) | Authored domain | Band |
|---|---|---|---|
| `clubPath` | −11.53 … −0.19 | **−14 … 4** *(unchanged)* | −2 … 2 |
| `faceAngle` | −6.42 … 3.66 | −8 … 6 | −2 … 2 |
| `faceToPath` | 0.97 … 10.07 | −4 … 12 | −2 … 2 |
| `swingPlane` | 43.31 … 62.15 | 40 … 66 | — |
| `attackAngle` | −7.73 … 1.22 | −10 … 4 | — |
| `curve` | 3.61 … 42.20 | −8 … 48 | −5 … 5 |
| `clubSpeed` | 39.80 … 45.96 | 36 … 48 | — |
| `carry` | 90.82 … 188.58 | 80 … 200 | — |
| `lowPointDistance` | −0.05 … 0.21 | −0.1 … 0.3 | — |
| `lowPointSide` | −0.05 … 0.00 | −0.08 … 0.04 | −0.02 … 0.02 |
| `dynamicLoft` | 10.22 … 24.81 | 8 … 28 | — |
| `spinLoft` | 14.52 … 31.20 | 12 … 34 | — |

**These domains are scoped to the driver**, which is the only club these metrics are charted for
in this phase. That is recorded in the registry as a comment, because several are strongly
club-dependent — `swingPlane` runs ~50° on a driver against ~69° on a 4-iron, and `dynamicLoft`
reaches 55° across the bag against 25° on the driver. **Charting any of these for a second club
requires authoring that club's domain first.** It is not a derivation to be automated.

`clubPath` keeps the domain it already has, in `scale.ts`. The registry references it rather than
restating it — one value, one home.

---

## 5. Data model

### Session aggregates — additive, so v2 documents are already valid v3

```ts
export interface MetricReading {
  /** Session mean for this club and metric. */
  typical: number
  /** Present only where `better` is not `none`. */
  best?: number
  /** Measured strokes behind `typical`. **Per metric** — null rates differ by up to 45 points. */
  n: number
}

export interface ClubPath {
  club: Club
  typical: number          // unchanged — club path keeps its own fields
  best: number             // unchanged
  n?: number               // unchanged
  /** The wider set. Absent on hand-typed rows and on anything imported before this phase. */
  metrics?: Partial<Record<Exclude<MetricId, 'clubPath'>, MetricReading>>
}
```

**Club path is not duplicated into `metrics`.** It keeps the fields it has today, so no existing
reader changes and no migration touches existing data. A single helper in `domain/metrics.ts`
returns a uniform `MetricReading` view for any id, handling club path's dedicated fields in one
documented place rather than storing the value twice.

`MetricReading.n` is **required**, unlike `ClubPath.n`. Every reading here is computed from
strokes, so the count always exists. Hand entry never produces one of these at all (§8).

### Per-shot — `SHOTS#<sessionId>`

The key space reserved by D24, now used.

```ts
export interface Shot {
  club: Club
  /** UTC instant from the stroke, kept for ordering within a session. */
  time?: string
  /** Every metric optional and absent-not-zero — the schema's own posture (F1). */
  metrics: Partial<Record<MetricId, number>>
}
```

One item per session: `pk = SHOTS#<sessionId>`, `sk = v1`. The largest real session is 225
strokes, which is roughly **27 KB** against DynamoDB's 400 KB item limit. Thirteen months is
5,877 shots across 91 items.

---

## 6. Ingest — `src/lib/ingest/`

### `api.ts`

The query widens to the twelve fields, generated from the registry so a field name exists in
exactly one place.

**One unreadable field fails the entire request**, including `clubPath` — verified accidentally
during design, when a bad credential surfaced as a field-level "not authorized" inside a 200
rather than a 401. The daily ingest must therefore not be made to interpret that error: it
already fails loudly on `errors`, and manual entry is the baseline (D6). No partial-field retry
logic is built, because a retry that silently dropped `clubPath` would be worse than a failure.

### `aggregate.ts` — per-metric null filtering

The existing rule holds and generalises: a metric aggregates **only the strokes where that metric
is present**, and produces its own `n`.

- A stroke with `swingPlane` but no `clubPath` still contributes its `swingPlane`.
- A club row still requires at least one `clubPath` reading, because club path is the KPI and the
  reason `TrackmanSession` exists. A club whose every stroke in a session lacked a path reading
  would therefore lose that session's other metrics. This is accepted rather than measured away:
  it preserves today's behaviour exactly, and the alternative is a club row with no KPI in it.
  The backfill will say how often it actually bites — the thin case is the 60° wedge, with 14
  strokes in thirteen months.
- `best` is computed per metric from its `better` rule, and **omitted entirely** where that rule
  is `none`.

`aggregateActivity` also returns the `Shot[]` for the session, so the raw strokes are walked once.

---

## 7. Storage and API

| Method | Path | Maps to |
|---|---|---|
| `PUT` | `/shots/{id}` | `PutItem` on `SHOTS#<id>` / `v1` |
| `GET` | `/shots/{id}` | `GetItem` |

`GET` exists because **a write nobody can read back is unverifiable**, and this repo's standing
rule is to verify a deploy before calling the work done.

**Shots are deliberately not on the `Repository` interface.** Components reach storage through
`Repository`; putting shots there would invite a component to download 5,877 rows to draw a chart
that does not use them, which is exactly what D24 exists to prevent. `saveShots` / `getShots` live
on `RemoteRepo` only, and the ingest script is their sole writer. `CachedRepo` does not cache
them and `LocalStorageRepo` never sees them.

The handler's structural validation (D21) extends to the shots body: an array, bounded in length,
of objects with a known club and finite numbers. A gate against shapes the client cannot parse,
not a second authority.

**Writes stay unauthenticated (D19)**, unchanged. Per-shot data raises the value of what an
attacker could overwrite, not the difficulty; PITR (D20) remains the recovery path.

---

## 8. Manual entry stays the baseline (D6)

**The Trackman form does not change at all.** It takes club, typical and best club path, exactly
as it does now. The eleven new metrics are import-only: `metrics` is simply absent on a hand-typed
row, and every reader already has to handle absence because 86 existing sessions have none.

Nobody types fifteen numbers standing in a bay. Deleting `.github/workflows/trackman.yml` must
still leave the app fully usable, and it does.

---

## 9. `/progress`

### A new driver section, above the existing per-club small multiples

**Why the ball curves.** Driver path and face-to-path on one panel, with the resulting curve in
metres. This is the headline because it is what the data supports (F7) and because it is
actionable: the face is square, the path is not.

**Plane against path.** A second, smaller panel that states the answer rather than implying one:
the correlation, the sample size, and the plain-language finding that a steeper plane has gone
with a *less* out-to-in path.

### Every calculation is pure, and none of it blends

New module `domain/relate.ts`:

```ts
export function relate(sessions: Session[], club: Club, x: MetricId, y: MetricId): Relation
```

Keyed on a single `Club` and never reducing across clubs — the same structural guarantee
`series.ts` provides, for the same reason (OQ-7).

**The correlation is computed at render time from stored session aggregates, never hardcoded.**
The figures in §2 are design-time findings for this document and for `content.md`. A component
that hardcoded `+0.503` would be quoting a number the page cannot reproduce, and would keep
quoting it after the swing changed.

**It is computed from aggregates, not from shots** — 44 driver session means, not 618 strokes.
That is what keeps `/progress` free of the per-shot download D24 forbids.

A relation is rendered only where both metrics have readings from the same session. Sessions
missing either are excluded from the pair and counted, so a thin relation cannot present itself
as a strong one.

### Design rules

No new colour tokens. `--ball` stays the goal, `--flag` stays the problem. Data and labels in
Space Mono, prose in Inter. The `760px` breakpoint for the new components is scoped to those
components. Every new animation gets a `prefers-reduced-motion` override; every interactive
element keeps a 44px target and a visible focus state.

---

## 10. Migration

`schemaVersion` **2 → 3**, with an **identity migration** — every v2 document is already a valid
v3 one, since `metrics` is optional and nothing existing changes shape.

The bump is not for the data. It is so the **currently deployed build refuses to touch** a
document containing `metrics`: its `checkTrackmanSession` builds club rows from known keys and
would silently **drop** `metrics` on any export/import round trip. `FutureSchemaError` then does
the right thing — refuse, don't quarantine, say "update the site". Exactly the v1 → v2 reasoning.

`handler.mjs`'s `SCHEMA_VERSION` is bumped in the same commit; it is documented as kept in step.

---

## 11. Testing

Vitest, domain and storage only, consistent with D8. No test touches real AWS or the real API.

- **`metrics.test.ts`** — every registry entry has a domain; every `better: 'none'` metric has no
  band; `best` is never computed for them. The `neutral` reducer prefers `+1` over `+5` and
  **never** `Math.max` or `Math.abs`.
- **`aggregate.test.ts`** — extended, and the existing cases stay untouched and passing. New:
  per-metric `n` from strokes with different null patterns; a stroke with `swingPlane` and no
  `clubPath` contributing to one and not the other; `best` omitted where `better` is `none`.
- **`relate.test.ts`** — Pearson r against known values; sessions missing either metric excluded
  and counted; no code path spanning two clubs.
- **`migrations.test.ts`** — a v2 document migrates to v3 unchanged; a v3 document is refused by a
  build at v2.
- **The handler**, as a pure function with a faked client — the `/shots/{id}` routes, the
  percent-encoded id path that broke Phase 6, and shots-body validation.

`merge.test.ts` stays untouched and passing — evidence the merge rules did not drift.

---

## 12. Rollout

Each step leaves `golf.whitfield.life` working (roadmap principle 1).

| # | Step | Verification |
|---|---|---|
| 1 | Registry, types, `aggregate.ts`, migration. No behaviour change | `npm test`, `npm run check` |
| 2 | Deploy the handler's `/shots` routes by hand from `infra/` | `curl` a `PUT` then a `GET` back |
| 3 | Ingest writes metrics and shots. Run over a **narrow** window first | One session's aggregates and shots present and correct |
| 4 | Backfill 13 months — `workflow_dispatch` with `since: 2025-06-01` | 91 sessions carry `metrics`; 91 `SHOTS#` items exist |
| 5 | `/progress` panels. Deploy | **Clear site data first**, then confirm the panels render from the store |
| 6 | Delete the probe workflow; keep both scripts | The daily ingest still runs green |

**Step 5's verification is stated the long way on purpose.** A bug that stopped the app reaching
the store entirely once shipped and looked perfectly healthy, because the cache held the same
data. Never verify the store against a browser whose cache is already populated.

---

## 13. Documentation to update in the same commit

| File | Change |
|---|---|
| `CLAUDE.md` | The per-metric `n` rule; `domain/metrics.ts` as the source of truth for field names and axes; the `better: 'none'` rule; shots deliberately off the `Repository` interface |
| `docs/architecture.md` | §4 rewritten for the widened query; D24 marked in use; **D27–D30** added |
| `docs/content.md` | F7 — the face is square and the path is the fault — in coaching voice. The plane answer. |
| `docs/design.md` | The new driver panels; no new tokens |
| `docs/roadmap.md` | Phase 7 recorded with its findings; the plane question marked answered |

### New decisions

| # | Decision | Why |
|---|---|---|
| **D27** | **`n` is per metric, not per club row** | Null rates differ by up to 45 points (F3). A shared count would size a 349-shot reading like a 618-shot one. |
| **D28** | **Shots are not on the `Repository` interface** | The interface is what components use. Putting shots there invites the multi-megabyte download D24 exists to prevent. |
| **D29** | **`better: 'none'` is a first-class answer** | `attackAngle` wants opposite signs for driver and iron. Inventing a shared band would be worse than admitting there isn't one. |
| **D30** | **Fixed axes are authored per metric from driver session means** | Per-shot ranges are far wider and would huddle every point mid-panel (F6). Club-dependent metrics need a new domain authored per club, never derived. |

---

## 14. Risks

| Risk | Mitigation |
|---|---|
| **A widened query breaks the whole ingest** — one unreadable field fails everything, including `clubPath` | The query is generated from the registry, so the field set is reviewable in one place. The ingest already fails loudly rather than silently. Manual entry is the baseline (D6). |
| **Twelve metrics invite twelve charts nobody reads** | Only two panels ship, both driver-only, both answering a stated question. The other ten are captured, not charted. |
| **A per-metric `n` is easy to get subtly wrong** | It is the single most-tested behaviour in §11, and the failure mode — an overstated dot — is silent. |
| **Fixed domains go stale as the swing changes** | They are authored constants with headroom, reviewed when a reading clips the edge. Staleness is visible; a fitted domain's drift is not. |
| **Storage cost** | 91 shot items totalling well under 2 MB. The `$1` spend alert from Phase 6 is unchanged and still the real control. |
| **The API breaks, as it is assumed to** | Unchanged posture. Nothing blocks app load, `sync()` is fired without `await`, and the site renders from the store regardless. |

---

## 15. Out of scope

- **Changing the KPI.** It stays driver club path (OQ-7). This phase explains the path; it does
  not move the goalposts.
- **Per-club panels for the new metrics.** Requires authoring a domain per club per metric (D30).
- **Acting on the plane finding.** The answer is "not the cause". What *is* the cause is a
  coaching question, not a software one.
- **Course rounds** (OQ-6, [#11](https://github.com/RichardWhitfield/golf/issues/11)) and a
  `Block` entity (OQ-2, [#7](https://github.com/RichardWhitfield/golf/issues/7)).

### Open question raised by this phase

**OQ-8 · Does `swingDirection` deserve a place after all?** It correlates at r = 0.819 with club
path on the driver and was excluded as near-collinear. If the path neutralises and the two
diverge, that divergence is itself the interesting signal. Revisit when driver path first sits
inside the band for three consecutive sessions.
