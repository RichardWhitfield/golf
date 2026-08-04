# Phase 3 · Monday's Trackman session — design

**Date:** 2026-08-04
**Issue:** [#4](https://github.com/RichardWhitfield/golf/issues/4) · also resolves
[#14](https://github.com/RichardWhitfield/golf/issues/14) (OQ-7, per-club club path)
**Status:** approved

Capture the Trackman numbers automatically, with a manual form as the permanent baseline. The KPI
becomes a **per-club series**, because against 13 months of real data a blended average is not
measurable.

---

## 1. What the data actually says

The API was probed against the live account on 2026-08-04, over the full 13-month window
(91 sessions, 5,877 strokes). Four findings changed the design, and each one contradicts or
resolves something the issues left open.

| Finding | Evidence | Consequence |
|---|---|---|
| **The null is on `measurement.clubPath`, not on `measurement`** | `null measurement` = 0; `null clubPath` = 976; `null club` = 3 | Issue #4 says "filter `null` measurements". Code written to that wording filters nothing and lets 976 nulls into the averages. The guard is `s.measurement?.clubPath != null && s.club != null`. |
| **UTC date ≠ Sydney date for 11% of sessions** | 10 of 91 | The date must come from `Australia/Sydney`, reusing `today.ts`'s rule. `time.slice(0, 10)` would misfile a session in ten. |
| **A date is not a key** | 23 dates carry more than one session | Merge on the activity `id`. The app must render two Trackman sessions on one date without complaint. |
| **The warm-up effect is negligible** | Dropping the first 5 or 10 strokes per session moves driver monthly means by ≤0.1° in every month with a meaningful `n`, and reverses no trend | #14's last open checkbox closes with evidence. **No warm-up rule is needed** — nothing to build. |

Two more facts inform the shape:

- **Only 31 of 91 sessions are Mondays** (Thu 22, Sat 14, Wed 12, Sun 6, Tue 4, Fri 2). "Monday's
  Trackman session" is a coaching convention, not a data rule. Nothing filters on weekday, and the
  scheduled pull runs **daily**, not weekly — a Monday-only job would miss two thirds of the data.
- **Fourteen club display strings appear**, all of them mappable: `Driver`, `3Wood`, `5Wood`,
  `4Iron`–`9Iron`, `PitchingWedge`, `SandWedge`, `50Wedge`, `58Wedge`, `60Wedge`.
- The refresh token did **not** rotate on exchange, and returned `expires_in` 1 209 600 s (14 days).
  Confirms the no-write-back auth design.

The aggregate file this produces is **369 rows across 86 sessions, 29.6 KiB**. Five sessions carry
no measured club path at all and are dropped.

---

## 2. Scope

In scope:

- Per-club club-path model, `schemaVersion` 2, and a migration.
- Manual Trackman session form — the permanent baseline (D6).
- `ApiSource`: refresh → GraphQL → per-club aggregates.
- A scheduled GitHub Actions workflow that commits `public/trackman.json` and publishes it.
- Browser-side merge of that file, idempotent, non-blocking, manual entries winning.
- Backfill, as the first run of the same script over a wider window.
- Naming the KPI club in `content.md` (#14).

Out of scope:

- **Per-club small multiples and any chart** — those are [#5](https://github.com/RichardWhitfield/golf/issues/5)
  (Phase 4). #14's job here is to make the *stored shape* capable of them; drawing them is Phase 4's.
- A warm-up rule — §1 shows there is nothing to correct for.
- Course rounds (OQ-6), block scoping (OQ-2).

---

## 3. Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| D16 | Club path shape | **`clubs: ClubPath[]`, never a blended pair** | #14. A single blended series showed 2025-11 as the best month while the driver was the worst to that point. |
| D17 | KPI club | **Driver**, one shared `−2°/+2°` band | Where the slice costs most, 618 measured shots, and the club trending backwards. One band keeps the coaching message intact rather than deriving targets from past averages. |
| D18 | Publication | **Per-club aggregates committed to `public/trackman.json`** | The repo is public, so a committed file is world-readable. Aggregates carry no stroke data, no location, no identifiers. Matches `architecture.md` §4. |
| D19 | `shots[]` | **Dropped from the model** | D18 means it would be permanently empty. An always-empty field is a promise the model cannot keep. |
| D20 | Provenance values | **`'manual'` and `'api'`** | Follows #4 over the older `'manual' / 'import' / 'auto'` sketch. Two values, one distinction that matters: typed or fetched. |
| D21 | Editing an imported session | **Flips `source` to `'manual'`** | This is what makes "never overwrite something typed by hand" actually hold. A number you corrected *is* hand-typed. |
| D22 | Schedule | **Daily, not weekly** | Only 31 of 91 sessions are Mondays. |
| D23 | Shared ingest logic | **One TypeScript module, imported by both the Node script and the browser** | The alternative is a hand-maintained `.mjs` copy of the null-filtering and Sydney-date rules that will drift. Costs one dev-only dependency (`tsx`). |
| D24 | Publishing the data | **`deploy.yml` gains `on: workflow_call`** | A commit made with `GITHUB_TOKEN` does not trigger another workflow, so the data would sit in the repo unpublished. `workflow_call` is an explicit invocation, unlike the `workflow_run` trigger #4 rightly forbids. |

---

## 4. Data model

`schemaVersion` **2**.

```ts
/** Normalised club id. Trackman returns display strings (`7Iron`); the store holds these. */
export type Club =
  | 'DRIVER' | 'WOOD3' | 'WOOD5'
  | 'IRON4' | 'IRON5' | 'IRON6' | 'IRON7' | 'IRON8' | 'IRON9'
  | 'PITCHING_WEDGE' | 'WEDGE50' | 'SAND_WEDGE' | 'WEDGE58' | 'WEDGE60'

export interface ClubPath {
  club: Club
  /** Signed degrees, session mean for this club. Negative is out-to-in. */
  typical: number
  /** Signed degrees. The single stroke closest to neutral. */
  best: number
  /** Measured strokes behind `typical`. Absent on hand-typed entries. */
  n?: number
}

export interface TrackmanSession {
  id: string
  type: 'trackman'
  /** The Sydney date — see §1. */
  date: ISODate
  /** At least one. Ordered by the authored bag order, not by shot count. */
  clubs: ClubPath[]
  drillsWorked?: DrillId[]
  notes?: string
  source: 'manual' | 'api'
}

export type Session = PracticeSession | TrackmanSession
```

### Why `best` is the smallest `|path|`

The target is a **band centred on zero**, not a maximum. `best` is therefore the stroke closest to
neutral, which makes `+5°` worse than `+1°` — overshooting is a fault, as the "don't overcook it"
watch-out says. A `Math.max`-style "best" would quietly reward the thing the plan warns against.

### Why `n` is optional

#14 asks for `n` on every data point so a ten-shot average is not over-read. That is achievable for
imported sessions and dishonest for typed ones — the user eyeballs a typical figure off the bay
screen and has no count to give. Rather than fabricate a default, `n` is absent on manual entries
and the UI shows `—`. **Phase 4 must render a countless point differently rather than assume a
weight.**

### The club list

`domain/clubs.ts` holds two separate things, because they answer different questions:

- **`CLUBS`** — an authored, ordered list (`id`, `short`, `name`) driving the picker and the display
  order. `short` is what appears in monospaced UI: `DRIVER`, `3W`, `4I`, `PW`, `SW`, `58°`.
- **`TRACKMAN_CLUB_NAMES`** — the wire mapping, containing **only strings verified against the live
  API**. `normaliseClub()` returns `Club | null`.

A club not in the mapping is skipped by the ingest and reported as a `::warning::` naming the exact
string, so adding it is a one-line change *with the real spelling in hand*. Guessing at unobserved
spellings (`3Hybrid` or `Hybrid3`?) would put a silently-wrong mapping in the table instead.

### Migration 1 → 2

**Identity.** Every v1 document is already a structurally valid v2 one — v1 held only
`type: 'practice'` sessions, which are unchanged.

The bump is not for the data. It is so the **currently deployed build** refuses to touch a document
containing Trackman sessions, which its `checkSession()` would reject as corrupt. `FutureSchemaError`
already does exactly the right thing: refuse, don't quarantine, tell the user to update the site.

---

## 5. Where the numbers come from

```
scripts/trackman-ingest.ts ── Actions, daily ──▶ public/trackman.json ──▶ dist/ ──▶ browser
   refresh → GraphQL → aggregate                  {version, sessions}       merge into golf:store
```

### Layout

```
src/lib/ingest/
  source.ts       # the TrackmanSource interface — the documented seam
  aggregate.ts    # strokes → ClubPath[] + Sydney date. Pure. Tested. Shared.
  api.ts          # ApiSource: refresh-token grant, paged GraphQL query
  published.ts    # browser side: fetch /trackman.json, validate, hand to the store
  merge.ts        # the merge rules of §5.3. Pure. Tested.
scripts/
  trackman-ingest.ts   # the Node entry point. Argument parsing and file writing only.
```

`ApiSource` implements `TrackmanSource` as `architecture.md` §4 specifies. **Manual entry does not
get a `ManualSource` class.** It is a form in the browser; `ApiSource` runs in Node under Actions.
The two are never polymorphically substituted, so a shared interface between them would be
indirection that does nothing. `architecture.md` is updated to say so.

### 5.1 The published file

```json
{ "version": 1, "sessions": [ { "id": "…", "date": "2026-07-27", "clubs": [ … ] } ] }
```

`version` describes the *file format*, independently of the store's `schemaVersion`. There is
deliberately **no `generated` timestamp** — it would change on every run and force a commit even
when no golf happened. Git already records when.

`source` is not in the file. The browser stamps `source: 'api'` on write, so provenance can never be
spoofed by the file's contents.

### 5.2 Fetching it

`published.ts` is called once on mount, **not awaited**, and swallows every failure. The rules:

- Check `res.ok` **and** the content type. Pages serves the SPA 404 shim for a missing file, so a
  renamed or absent `trackman.json` returns *HTML with a 404 status* — `JSON.parse` on that
  produces a confusing error rather than "nothing published yet".
- A missing file is the normal first-run state, not a fault. It is silent.
- Every record is validated by the same function `transfer.ts` uses for imports. One validator, one
  voice.
- If the merge produces no changes, **nothing is written.** This avoids a pointless `localStorage`
  write on every page load, and avoids throwing when the store is in a fault state but had nothing
  to do anyway.

### 5.3 Merge rules

On top of the existing merge-by-id:

1. **Keyed on the Trackman activity `id`.** Re-running is idempotent.
2. **A stored session with `source: 'manual'` is never overwritten.** Skipped, and counted.
3. **Editing an API session in the form sets `source: 'manual'`** (D21), which is what gives rule 2
   teeth — otherwise it would only protect records nobody had touched.
4. **An incoming session whose date already has a *manual* Trackman session is skipped**, and
   counted separately. This keeps Phase 4 from double-counting a day logged both ways. It is
   reversible: delete the manual record and the next load imports the richer one.

The Data panel reports the outcome in a sentence — `86 sessions imported from Trackman · 2 skipped,
already logged by hand.` Silence would make rule 4 look like data loss.

---

## 6. Manual entry — the baseline, not a placeholder

`LogView` gains a two-pill mode switch, **Practice / Trackman**, styled exactly like the existing
`Where` pills. It defaults to Trackman on Mondays, the same way `defaultLocation()` already defaults
to `sim` — the day the bay is booked.

The form:

| Field | Behaviour |
|---|---|
| Date | Defaults to today's Sydney date. |
| Club rows | One row per club: club `<select>`, `best`, `typical`, optional `n`. The first row is pre-set to **Driver** — the KPI club. "Add a club" appends; each row past the first can be removed. |
| Drills worked | The seven drills as toggles, with Monday's scheduled drills pre-ticked from `plan.ts`. |
| Notes | Optional. |

Validation, in form order: a valid date; at least one club row; no duplicate club; every `best` and
`typical` a finite number within `±20°`; `n`, if given, a positive integer. **The sign is preserved
and never coerced** — a typed `6` means six degrees in-to-out, which is a real (if unlikely) reading,
not a mis-typed `−6`. The form labels the sign rather than guessing at it.

It writes through the same store and the same repository as the practice form. `RecentSessions`
renders both types from one list, with a `TRACKMAN` tag and a `MANUAL`/`API` provenance chip.

**Deleting `trackman.yml` and `public/trackman.json` leaves all of this working.** That is the
issue's real "done when", and the plan has an explicit task to verify it.

---

## 7. Workflow

`.github/workflows/trackman.yml`

- **Triggers: `schedule` (daily, `0 13 * * *`) and `workflow_dispatch` only.** Never
  `pull_request_target` or `workflow_run` — this repo is public and those run with secret access
  under attacker-influenced conditions.
- Actions pinned to full commit SHAs, with the version in a trailing comment, matching `deploy.yml`.
- Top-level `permissions: {}`. The ingest job takes `contents: write`; the publish job takes
  `contents: read`, `pages: write`, `id-token: write`.
- `workflow_dispatch` accepts a `since` input. **The backfill is the first run of the same script**
  over a wider window, not a separate code path — `since: 2025-06-01` produces the 91-session file.
- Default window is the last 14 days, so a missed run self-heals. The idempotent merge makes the
  overlap free.
- The token is never echoed, never passed through `base64`/`jq`, and never written to a file.
- Commits only when `git diff --quiet` says the file changed, then calls `deploy.yml` (D24).
- **Failure is silent and non-blocking**: the job fails, the existing `trackman.json` is untouched,
  the site keeps serving, and manual entry is unaffected.

`TRACKMAN_REFRESH_TOKEN` is set once as an Actions secret. It does not rotate, so there is no
write-back step and no rotation failure mode.

---

## 8. Content

`content.md` currently says *"One number, measured on a Trackman: **club path**"* and never names a
club. It becomes **driver club path**, with the `−2°/+2°` band unchanged and shared, and a short
paragraph recording *why* — the 2025-11 example from #14, where the blended figure looked like the
best month in the series while the driver was the worst to that point.

`plan.ts`'s `KPI` object and `KpiBand.svelte` follow. The label gains the club; the coaching voice
does not change.

---

## 9. Tests

Vitest, domain and storage logic only — no UI, per D8.

| Module | What it must prove |
|---|---|
| `domain/clubs` | All 14 verified strings normalise. An unknown string returns `null`, not a guess. |
| `ingest/aggregate` | `null clubPath` filtered; `null club` filtered; a `null measurement` filtered too, even though the live data has none — the guard must not depend on that staying true. Sydney date derived across the UTC boundary. `best` is the smallest `\|path\|`, including when every stroke is positive. `n` counts measured strokes only. A session with no measured stroke is dropped entirely. |
| `ingest/merge` | Idempotent on re-run. Manual never overwritten. Date collision with a manual session skipped and counted. No-change merges report no change. |
| `ingest/published` | A 404 shim body is rejected as "nothing published", not as corruption. A malformed record rejects the file, not the store. |
| `storage/migrations` | v1 → v2 is identity. A v2 document with a Trackman session survives a round trip. |
| `storage/transfer` | Trackman sessions validate on import; a bad club id, an unsigned-but-absurd path, and a duplicate id are each rejected with a readable reason. |
| `domain/trackman` | Draft validation in form order; duplicate club rejected; a positive path is accepted, not flipped. |

---

## 10. Risks

- **The interface is undocumented.** It broke nothing today, but assume it breaks without notice.
  Every failure path degrades to manual entry, and none of them blocks app load.
- **The refresh token's absolute lifetime is unknown.** It does not rotate; a cap may still exist.
  On expiry the workflow fails, manual entry takes over, and the one-time browser login is repeated.
- **`localStorage` is still the only copy of anything typed.** The published file is a copy of the
  *imported* half only. Export/import remains the backup story.
- **Merging the two phases means manual entry is not proven in production first.** Mitigated by
  shipping it in the same PR and by the explicit "remove the workflow and confirm the app still
  works" verification task.
- **The backfill file is deliberately not in this PR.** The first `workflow_dispatch` after the
  secret is set creates it, so the data's provenance is the workflow rather than a laptop, and the
  moment those 13 months become public is a deliberate act.
