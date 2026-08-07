# Architecture

Target architecture for turning the static plan page into a living practice tracker.

**Status:** partly built. Sections are marked **Built** where the code now matches what follows;
an unmarked section is still the plan being built towards. See `roadmap.md` for sequencing.

---

## 1. Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| D1 | Framework | **Svelte 5 + Vite** | Existing hand-written CSS ports over near-unchanged as scoped component styles. Minimal boilerplate for a solo project. Small bundle for phone use at the range. |
| D2 | Storage | **DynamoDB behind the async repository interface**; `localStorage` demoted to a read cache | Superseded by D18 (Phase 6, OQ-3). The async interface did its job: adding the backend touched `stores/sessions.svelte.ts` and nothing else. |
| D3 | Hosting | **GitHub Pages**, custom domain `golf.whitfield.life` | Already configured (`CNAME`). Free, and adequate for a static bundle. |
| D4 | Build/deploy | **GitHub Actions** builds and publishes `dist/` | A build step is now required; Pages can no longer serve the repo root directly. |
| D5 | Session types | **Two distinct models**, not one | A Trackman session and a home practice session share almost no fields. Forcing one model produces a form that is mostly blank. |
| D6 | Trackman data | **Manual entry is the baseline**; automated ingest is a pluggable source | Unchanged by Phase 3. The API works but is undocumented and assumed breakable, so deleting the workflow must leave the app fully usable. |
| D16 | Club path shape | **Per club, never blended** | OQ-7. A blended average tracks club selection as much as swing change. The KPI club is the driver. |
| D17 | Ingest publication | ~~Per-club aggregates committed to `public/trackman.json`~~ **Superseded by D18** (Phase 6): the ingest writes to the store. | The per-club-aggregates-only rule survives the change — see §4. It was forced by a public repo; it is now a choice, which is what lets the next phase decide what to keep on its merits. |
| D7 | Language | **TypeScript** | The data model is the core of this app and will outlive any UI. Types are the cheapest documentation of it. |
| D8 | Tests | **Vitest** for domain logic and the storage layer | Not for UI. The valuable, breakable logic is data shaping and aggregation. |
| D9 | Navigation | **Client-side views** (Plan, Log, Progress) | The log needs its own screen. The poster page becomes the Plan view, visually unchanged. |
| D10 | URL scheme | **Clean paths** via the History API, with a generated `404.html` | Real URLs. The shim is copied from `dist/index.html` at build time — a hand-written `public/404.html` would reference stale hashed assets. |
| D18 | Backend | **DynamoDB (on-demand) behind a Lambda Function URL** | Phase 6, OQ-3. Per-item storage suits per-shot metrics, which a single JSON blob handles badly once it reaches megabytes. About 3p/month at list price, no free tier assumed. |
| D19 | Access control | **None.** Open reads *and* open writes | Chosen explicitly after the risk was put. A shared write token was offered and declined. Bounded by D20 and D21, not by access control. |
| D20 | Recovery | **Point-in-time recovery on**, 35 days | The consequence of D19: the only thing between a bad write and permanent loss. Mandatory, not optional. The table also carries `DeletionPolicy: Retain`. |
| D21 | Validation | **The Lambda validates bodies but does not authenticate them** | Anyone may write; nobody may write a shape the client cannot parse. Bounds D19 to "a valid session replaced by a different valid session" — recoverable — rather than a store that no longer loads. |
| D22 | Ingest credentials | **None. The workflow `PUT`s to the same public endpoint the browser uses** | A dividend of D19: no OIDC role, no IAM user, no new secret. `TRACKMAN_REFRESH_TOKEN` remains the only secret in the repo. |
| D23 | Local storage role | **Read cache, written through on save** | The page paints instantly on cold start and still renders with the store unreachable. Only the *remote's* fault state gates writes. |
| D24 | Item granularity | **Session aggregates and per-shot data are separate items** | Aggregates are what every current view reads (~125 KB total). Embedding shots would force a multi-megabyte download on every load to render charts that do not use them. `SHOTS#<id>` is **in use** from Phase 7; nothing on `/progress` reads it. |
| D25 | Infrastructure as code | **CloudFormation/SAM templates in `infra/`, deployed by hand** | Deploying from a public repo's CI needs AWS credentials — the one thing D22 otherwise avoids. The SAM CLI is not required; the transform expands server-side. |
| D26 | Sort key | **The session id alone**, never `<date>#<id>` | `saveSession` is upsert-by-id and the date is editable. A mutable key makes an edited date insert a duplicate instead of updating in place. Ordering is done client-side; at ~250 items it is free. |
| D27 | Shot counts | **`n` is per metric, not per club row** | Null rates differ by up to 45 points across the schema, and by 23 among the metrics stored. A shared count would size a 556-shot reading like a 723-shot one, and the error is silent. |
| D28 | Per-shot reach | **Shots are not on the `Repository` interface** | That interface is what components use. Putting shots on it invites the multi-megabyte download D24 exists to prevent. `saveShots`/`getShots` live on `RemoteRepo` alone, and there is no `DELETE` — the ingest is the only writer, nothing reads shots back, and deleting a session leaves its shots orphaned at a cost of a few KB. |
| D29 | Targets | **`better: 'none'` is a first-class answer** | `attackAngle` wants opposite signs for a driver and an iron. Inventing a shared band would be worse than recording that there is not one. |
| D30 | Axes | **Fixed domains authored per metric from driver session means** | Per-shot ranges are far wider and would huddle every point mid-panel. A second club needs its domain authored, never derived. |

### Deliberately excluded (YAGNI)

No accounts, no state-management library (Svelte stores suffice), no CSS framework, no component
library, no analytics, no PWA/offline shell until there's evidence it's needed.

**"No server database" was reversed in Phase 6**, on the evidence OQ-3 asked for: two devices
holding different histories, and per-shot metrics with nowhere private to land. **"No auth" was
not reversed** — it was chosen again, explicitly, after the risk was put (D19). Reads and writes
are both open; the bounds are recovery and validation, not access control.

---

## 2. Shape

```
┌─────────────────────────────────────────────┐
│  UI  (Svelte components)                    │
│  Plan view · Log session · Progress          │
└──────────────────┬──────────────────────────┘
                   │  reads/writes via stores
┌──────────────────▼──────────────────────────┐
│  Domain  (plain TypeScript, no framework)   │
│  types · plan content · aggregation · stats │
└──────────────────┬──────────────────────────┘
                   │  async repository interface
┌──────────────────▼──────────────────────────┐
│  Storage  (swappable)                        │
│  CachedRepo( RemoteRepo, LocalStorageRepo )  │
└─────────────────────────────────────────────┘
```

**The rule that makes D2 work:** no component ever calls `localStorage` directly. Everything goes
through the repository, and **every repository method is `async` from day one** — even though
`localStorage` is synchronous. If the methods are sync now, adding a network call later changes
every call site. Paying the `await` cost up front is the entire point.

### Layout

```
src/
  lib/
    domain/
      types.ts            # PracticeSession, TrackmanSession, Drill, …
      plan.ts             # the 3-week plan as data (from content.md)
      drills.ts           # the 7 drills as data
      block.ts            # OQ-5: block start → arc week + phase
      session.ts          # practice session drafts, swing defaults
      clubs.ts            # OQ-7: club vocabulary, bag order, Trackman name mapping
      metrics.ts          # the metric registry: wire names, axes, bands, what "best" means
      trackman.ts         # Trackman session drafts and validation
      scale.ts            # fixed chart axes: values/dates → SVG units, against any domain
      series.ts           # Trackman sessions → one club-path series per club
      relate.ts           # two metrics against each other, for one club. Pearson r
      latest.ts           # the newest reading for a club, and the face-to-path verdict
      coverage.ts         # drills done vs what the plan scheduled
      feel.ts             # mean feel per drill per arc phase
    storage/
      repository.ts       # the interface — the seam
      local.ts            # LocalStorageRepo implementation
      migrations.ts       # schemaVersion upgrades
      transfer.ts         # JSON export/import, merge by id
      remote.ts           # RemoteRepo — thin HTTP over the Lambda Function URL
      cached.ts           # CachedRepo — read cache, write-through, seed-on-empty
    ingest/
      source.ts           # TrackmanSource interface
      aggregate.ts        # strokes → per-club readings. Shared with scripts/
      api.ts              # ApiSource — Node-side, runs under Actions
      merge.ts            # idempotent merge; manual always wins
    stores/
      router.svelte.ts    # History-API router
      sessions.svelte.ts  # the rune store wrapping the repository
    components/
      PlanView.svelte     # the poster page
      LogView.svelte      # the practice log
      …
  app.css                 # tokens + resets (from design.md)
  env.d.ts                # types VITE_API_URL

infra/                    # deployed by hand, never from CI
  template.yaml           # table, function, Function URL
  budget.yaml             # $1 monthly spend alert (AWS Budgets — no SNS, nothing to confirm)
  function/handler.mjs    # the Lambda. Plain ESM, no build step
  handler.test.mjs        # outside function/, so it is never packaged
```

`domain/`, `storage/` and `stores/` are built (Phase 2, issue #3); `ingest/` is built (Phase 3,
issue #4). The progress calculations are built (Phase 4, issue #5) as four pure modules —
`scale.ts`, `series.ts`, `coverage.ts` and `feel.ts` — rather than the single `stats.ts` first
sketched here: they answer four unrelated questions and share no state, so one module would only
have coupled them. `relate.ts` joined them in Phase 7 as a fifth, for the same reason: it answers
a question none of the other four asks. It takes a single `Club` and never looks at another, so a
cross-club pairing is not expressible — the structural guarantee `series.ts` gives, for the same
reason (OQ-7). **Its correlation is computed at render time from stored session aggregates, never
hardcoded and never from per-shot data**: a component quoting a figure from the design notes
would be quoting a number the page cannot reproduce, and would keep quoting it after the swing
had changed. `scripts/` holds three Node entry points: `trackman-ingest.ts`, which the workflow
runs and which imports from `lib/ingest/` so the rules exist in one place, plus
`trackman-introspect.ts` and `trackman-probe.ts`, the two verification scripts described in §4.
`PlanView`, `LogView` and `ProgressView` live in `src/routes/`, switched by `router.svelte.ts`.

The plan and drill *content* becomes data (`plan.ts`, `drills.ts`) rather than hand-written
markup. This is the single biggest structural change: the current page repeats the same card
shape seven times by hand. As data, the same content drives the plan view, the log form's drill
picker, and progress-by-drill — one source, three consumers.

---

## 3. Data model

**Built.** `domain/types.ts` is the source of truth; the sketch below is kept because it explains
*why* the shapes are what they are. `PracticeSession` is implemented exactly as written, with one
omission: **`durationMin` was deliberately not built.** Issue #3 doesn't ask for it and every
Tue–Sun session is the same 5–10 minutes. Adding it later is a field on a new schema version, not
a rework.

```ts
type ISODate = string          // 'YYYY-MM-DD'
type DrillId  = '01'|'02'|'03'|'04'|'05'|'06'|'07'
type Location = 'sim' | 'home' | 'course'

/** Tue–Sun: short outdoor sessions. Manually logged. */
interface PracticeSession {
  id: string
  type: 'practice'
  date: ISODate
  location: Location
  entries: {
    drillId: DrillId
    swings: number
    feel: 1|2|3|4|5      // how close to the drill's "feels like" cue
  }[]
  notes?: string
  durationMin?: number
}

/** Monday: the Trackman session. Numbers live here. Built in Phase 3. */
interface ClubPath {
  club: Club            // normalised: 'DRIVER', 'IRON7', 'SAND_WEDGE'
  typical: number       // degrees, signed; negative = out-to-in
  best: number          // the stroke closest to neutral — smallest |path|
  n?: number            // measured strokes; absent on hand-typed entries
  // Phase 7. The wider set, keyed by every metric except club path.
  metrics?: Partial<Record<ExtraMetricId, MetricReading>>
}

/** Phase 7: one club's session aggregate for one metric. */
interface MetricReading {
  typical: number       // session mean for this club and metric
  best?: number         // present only where the metric has a target
  n: number             // measured strokes — **per metric**, and required
}

interface TrackmanSession {
  id: string
  type: 'trackman'
  date: ISODate         // the Sydney date
  clubs: ClubPath[]     // at least one, in bag order
  drillsWorked?: DrillId[]
  notes?: string
  source: 'manual' | 'api'   // provenance always recorded
}

type Session = PracticeSession | TrackmanSession

/** Phase 7: one measured stroke. Stored under `SHOTS#<sessionId>`, never on the session. */
interface Shot {
  club: Club
  time?: string         // UTC instant, kept for ordering within a session
  metrics: Partial<Record<MetricId, number>>   // every metric optional; absent, never zero
}
```

**Three changes from the original sketch, all made when Phase 3 met real data:**

- **`clubPath: {best, typical}` became `clubs: ClubPath[]`.** OQ-7 (issue #14) showed a blended
  club-path average is not measurable — it tracks club selection as much as swing change. No code
  path may compute a mean across clubs.
- **`shots?: Shot[]` was dropped from the session**, because the repo is public and the ingest
  published per-club aggregates only. **Phase 6 removed the reason and Phase 7 restored the
  data** — but as a *separate item* under `SHOTS#<sessionId>` (D24), never as a field on the
  session. The original objection stands in a new form: a field every reader downloads to render
  charts that do not use it is as much a broken promise as an always-empty one.
- **`source` is `'manual' | 'api'`**, not the three-value sketch. Two values, one distinction that
  matters: typed or fetched. **Editing an imported session in the form flips it to `'manual'`** —
  that is what makes "never overwrite something typed by hand" hold, rather than being a rule
  about ids nobody edits.

### Notes on the model

- **`feel` is per drill entry, not per session.** Two drills in one session can go very
  differently, and the whole plan is built on feel cues. Averaging them away loses the signal.
- **At least one `ClubPath` is required on a Trackman session** — it's the KPI and the reason the
  session type exists. The KPI club is the **driver** (OQ-7); other clubs are stored, never blended.
- **`n` is optional, and that is deliberate.** An imported session knows how many strokes it
  measured; a hand-typed one does not, because you read a typical figure off the bay screen.
  A missing `n` renders as a dash. **Never fabricate a default** — a chart would then weight a
  guess as though it were measured.
- **`n` on a `MetricReading` is per metric, and required (D27).** The twelve metrics that ship
  differ by about 23 points of null rate on the driver alone: 723 carry readings, 666 for swing
  plane, 618 for club path, 556 for face to path. (The 45-point figure in §4 spans the whole
  75-field surface, including metrics deliberately not stored.) One count per club row would let
  the chart draw the sparse reading as confidently as the dense one. `ClubPath.n` stays *optional*
  because hand entry produces a club-path row and never a `MetricReading`.
- **Club path is not duplicated into `metrics`.** It keeps its own `typical`/`best`/`n`, so no
  existing reader changes and the migration touches no data. `readingFor()` in `domain/metrics.ts`
  is the one place that knows this, and returns a uniform `MetricReading` view for any id.
- **Three metrics store no `best` at all (D29).** Where `better` is `'none'` there is no target
  to be closest to, so `best` is omitted and no band is drawn. `attackAngle` is why: a driver
  wants a positive one and an iron a negative one.
- **`source` is recorded on every Trackman session.** When a number looks wrong six weeks later,
  the first question is whether it was typed or imported.
- **Negative degrees mean out-to-in.** Preserve the sign; never store an absolute value.
- **The target is a band (`−2°` to `+2°`), not a maximum.** Overshooting past `+2°` is a fault
  (see the "don't overcook it" watch-out). Any progress visual must render a target band with
  regions on *both* sides, not a progress bar toward a bigger number.

### Persistence

One `localStorage` key, `golf:store`, holding one JSON document with `schemaVersion: 3`. At a few
sessions a week that is simpler and safer than key-per-record, and it makes export trivial.
Migrations live in `storage/migrations.ts`, keyed by the version being migrated *from*.

**The `1 → 2` migration is an identity function, deliberately.** Every v1 document is already a
valid v2 one — v1 held only `type: 'practice'` sessions, and those are unchanged. The bump exists
so the **build already deployed** refuses to touch a document containing Trackman sessions, which
its validator would reject as corrupt. Guard 2 below then does exactly the right thing.

**`2 → 3` is an identity function for exactly the same reason.** `metrics` is optional and
nothing existing changes shape, so every v2 document is already a valid v3 one. The bump is not
for the data: it is so the currently deployed build refuses to *touch* a document carrying
`metrics`, because its `checkTrackmanSession` builds club rows from known keys and would silently
**drop** them on an export/import round trip. `FutureSchemaError` then says "update the site"
rather than quarantining data that is perfectly good.

`infra/function/handler.mjs` carries its own `SCHEMA_VERSION` constant, stamped on every item it
writes. **It is bumped in the same commit as `migrations.ts`** — the two are kept in step by
discipline, since the Lambda has no build step and shares no code with the client.

**Phase 6 moved the record to DynamoDB.** `RemoteRepo` assembles the fetched items into this
same `StoreDocument` — taking the document version as the *lowest* `schemaVersion` among them, so
a part-migrated table cannot claim to be current — and runs the identical migration chain.
Migrations still operate on whole documents, which is the shape they are written and tested
against.

`localStorage` keeps the same key and the same document, now as a cache. The three guards below
were written for when it was the only copy; the first two still apply to the store, and
`CachedRepo` deliberately neutralises the first in the *cache* role, where refusing to write
would block a save the store would have accepted.

Three guards exist:

1. **Unreadable JSON** is copied to `golf:store.unreadable` before anything is written, and all
   further writes are refused. The Data panel surfaces the warning and offers the copy as a
   download.
2. **A document from a newer build** is refused but *not* moved — the data is fine, this build is
   behind, and relocating it would strand the newer build.
3. **Import merges by session id.** It adds and updates; it never drops. One malformed record
   rejects the whole file rather than leaving a partial state nobody chose.

Manual JSON export/import is a required feature, not a nice-to-have.

---

## 4. Trackman ingest

**Built** (Phase 3, issue #4) and **widened to twelve metrics plus a per-shot record** (Phase 7,
issue #25). TrackMan's *documented* API is a facility/partner product and is not usable by an
individual golfer. The path that works is an **undocumented GraphQL API at
`https://api.trackmangolf.com/graphql`**, reachable with the player's own credentials. Schema
introspection is enabled — and needs no credential at all — so the surface is verifiable rather
than guessed.

### The shape

```
scripts/trackman-ingest.ts ── Actions, daily ──▶ Lambda Function URL ──▶ DynamoDB
   refresh → GraphQL → aggregate → merge          PUT ?ifNotManual=1        ▲
                                                                            │
                              browser ── CachedRepo(RemoteRepo, LocalStorageRepo)
```

Both writers go through **one** path. That is what made retiring `public/trackman.json` safe
rather than creating the two-sources-of-truth problem the merge rules exist to prevent.

```
src/lib/ingest/
  source.ts       # the TrackmanSource interface — the seam
  aggregate.ts    # strokes → ClubPath[] + Shot[] + Sydney date. Pure, tested, SHARED with the script
  api.ts          # ApiSource: refresh-token grant, paged GraphQL query. Node-side only.
                  #   The selection set is generated from domain/metrics.ts
  merge.ts        # the merge rules below, including shotsToWrite(). Pure, tested
```

`published.ts` was deleted in Phase 6 along with `public/trackman.json`. The script now
constructs a `RemoteRepo` and calls the same `mergeTrackman()` the browser does.

`ApiSource` implements `TrackmanSource`, whose `fetchSince()` maps directly onto
`activities(timeFrom:, timeTo:)`. **Manual entry deliberately does *not* get a `ManualSource`.**
It is a form in the browser; `ApiSource` runs in Node under Actions. The two are never
polymorphically substituted, so an interface spanning them would be indirection that does nothing.
`FileImportSource` remains unnecessary — no player-accessible export exists.

**`aggregate.ts` and `merge.ts` are imported by both the Node script and the browser.** That is
the point: the null-filtering, Sydney-date and merge rules exist once, are covered by Vitest, and
cannot drift between the two consumers. It costs one dev-only dependency, `tsx`, so the workflow
can run a `.ts` entry point.

### Two scripts, and why both stay

Phase 7 widened the query from one field to twelve, and did it in the order the issue asked for:
read the schema, then probe the readings, then design.

| Script | Needs a credential? | Answers |
|---|---|---|
| `npm run introspect` | **No** | Which fields exist, and their types |
| `npm run probe` | Yes | Which are populated, over what range, and whether they carry signal |

**Introspection needs no credential** — verified against the live endpoint with an anonymous
request. That makes the schema readable by anyone at any time, and it is exactly why the schema
**cannot be read as a statement of permission**: it describes the whole facility and partner
surface, not this player's.

`npm run probe` prints **aggregates only** — null rates, ranges, correlations, the same class of
figure this document already publishes. No individual reading reaches its output, and the
refresh token reaches it through the environment, never the command line.

A branch-triggered workflow ran the probe during Phase 7 and was deleted once it had. Neither
script runs in CI now: introspection needs nothing, and the probe is run by whoever holds the
token.

**The query widened is all-or-nothing.** One field the token cannot read fails the entire
request, `clubPath` included; there is no partial-field response. No retry narrows the selection
on failure, because a retry that silently dropped the KPI would be worse than a loud failure —
the ingest already fails on `errors`, and manual entry is the baseline (D6). A **bad credential**
surfaces the same way: a field-level "not authorized to access this resource" inside a `200`,
never a `401`.

### Data notes, verified against 5,877 real strokes on 2026-08-04

- Units are SI (m/s, metres, degrees).
- **The `null` is on `measurement.clubPath`, not on `measurement`.** Across the whole backfill:
  `null measurement` = 0, `null clubPath` = 976, `null club` = 3 — 16.6% unusable. They are not
  zeros; filter them or every average drifts toward neutral and fakes progress.
- **The UTC date differs from the Sydney date for 10 of 91 sessions.** Derive the date from
  `Australia/Sydney`, reusing `domain/today.ts`. `time.slice(0, 10)` misfiles one session in ten.
- **A date is not a key: 23 dates carry more than one session.** Merge on the activity `id`.
- **Only 31 of 91 sessions are Mondays.** "Monday's Trackman session" is a coaching convention,
  not a data rule. Nothing filters on weekday, and the schedule is daily.
- `club` comes back as a display string (`7Iron`, `SandWedge`). `domain/clubs.ts` maps **only
  spellings seen in real responses** and returns `null` for anything else, which the workflow
  reports as a `::warning::` naming the exact string.
- `aggregatedMeasurement(clubs:)` would compute per-club averages server-side, but **it is not
  used**: it cannot report `n`, and OQ-7 requires a shot count on every point.
- **Store club path per club, never blended** (OQ-7).

**What Phase 7's introspection and probe added, on the same 5,877 strokes:**

- **`Measurement` carries 75 fields, and every numeric one is a nullable `Float`.** Not one is
  `Float!`. Absence is the schema's own posture, so "`n` is absent, never zero" stops being a
  hand-entry special case and becomes the general rule.
- **Four advertised fields hold no data whatsoever.** `strokeLength`, `backswingTime`,
  `forwardswingTime` and `tempo` are null on all 5,877 strokes, as is `detectedClubCategory`;
  `kind` is the constant `"Measurement"`. This is what justifies the probe step at all — a design
  written from the schema alone would have shipped a tempo chart with nothing in it.
- **Null rates differ per metric by up to 45 points.** On the driver, `swingPlane` is present on
  666 strokes, `clubPath` on 618, and `dynamicLie`/`impactOffset`/`impactHeight` on 349 (51.7%
  null). That is a finding about the **whole measurement surface**, and it is what forced a
  per-metric `n` (D27) — but the three sparsest are excluded from storage for exactly that
  sparsity, so it is not the spread a reader meets on a card. Among the twelve metrics that ship
  the spread is about 23 points: 723 driver `carry` readings down to 556 for `faceToPath`.
- **`normalizedMeasurement` is a dead end** — identical to `measurement` on all 4,901 readings
  where both are present, 0 differing. Not stored.
- **`reducedAccuracy` is real but narrow.** 1,251 strokes carry a flag, and only ever `SpinRate`
  or `SpinAxis`. It never flags club delivery, and no spin metric is stored, so it has nothing to
  act on and is not stored either.
- **Per-shot and session-mean statistics are different, and mixing them misdraws charts.**
  Per-shot club path spans `−18…10.9`; session means span `−13.76…0.89`. `scale.ts`'s existing
  `−14…4` domain was authored from the latter, and every domain in `metrics.ts` is authored the
  same way, because a session mean is the level a panel plots. The probe reproducing that
  `−13.76` minimum exactly is the evidence its aggregation matches the shipped `aggregate.ts`.

### What gets stored

Two items per session, in two key spaces, for two different readers.

**`SESSION#<id>` — per-club aggregates, twelve metrics.** Date, club, and for each metric a
session mean, a `best` where the metric has a target, and **its own shot count**. Club path keeps
its dedicated `typical`/`best`/`n`; the other eleven live in `metrics`. This is what every view on
the site reads, and it stays small: thirteen months is 369 club rows.

**`SHOTS#<id>` — the shot-by-shot record.** One item per session, `sk = v1`, holding a `Shot[]`.
The largest real session is 225 strokes, roughly 27 KB against DynamoDB's 400 KB item limit;
thirteen months is 5,877 shots across 91 items. **Nothing on the site downloads it.** It is
captured so that a future question has data to answer it, not because a chart needs it today.

**Twelve metrics, and the test applied was *does this answer a question being asked*, not *is it
available*:**

| Metric | Why it earns its place |
|---|---|
| `clubPath` | The KPI. Unchanged in every respect. |
| `faceAngle` | Half of the start-direction and curve equation. Establishes that the face is square. |
| `faceToPath` | **What makes the ball curve.** Strongest non-collinear correlate of path (r = −0.612). |
| `swingPlane` | The question Phase 7 was raised to answer. Kept so the answer stays checkable as the swing changes. |
| `attackAngle` | Driver delivery context; hitting down with a driver is a fault in its own right. |
| `curve` | The cost, in metres. `+21 m` is legible in a way `−5.4°` is not. |
| `clubSpeed` | Guards against "improved by swinging easier" — a path that neutralises while speed drops is not progress. |
| `carry` | The other half of that guard, and the number actually felt on a course. |
| `lowPointDistance` | Where the arc bottoms out, fore and aft. The strike side of a path change. |
| `lowPointSide` | Lateral low point; r = 0.386 with driver path per shot. |
| `dynamicLoft` | Loft delivery. Interacts with `attackAngle` to explain distance loss. |
| `spinLoft` | With `dynamicLoft`, separates a strike problem from a delivery problem. |

**Deliberately excluded:** `swingDirection` (r = 0.819 with `clubPath` on the driver —
near-collinear, a second panel saying the same thing; see OQ-8); `strokeLength`, `backswingTime`,
`forwardswingTime`, `tempo`, `detectedClubCategory` (100% null); `spinRate` and `spinAxis` (the
only metrics `reducedAccuracy` ever flags — excluded rather than stored with a caveat nothing
enforces); `dynamicLie`, `impactOffset`, `impactHeight` (51.7% null on the driver, too sparse to
chart honestly); `ballTrajectory` and `clubTrajectory` (per-shot arrays that would dwarf every
other stored value); the putting-green metrics; `normalizedMeasurement`; and
`aggregatedMeasurement`, unchanged from Phase 3.

Per-club aggregates were originally the *only* thing stored, forced by the publication channel —
a file committed to a public repo. Phase 6 removed that constraint, which is **why storage moved
before the metrics widened**: per-shot data then had somewhere private to land.

Until Phase 6 this went to `public/trackman.json` as `{ "version": 1, "sessions": [...] }`. That
file is gone. It was also the seed for the migration — 86 sessions, no refresh token, no call to
the undocumented API — which is why it was deleted last, after the new path was proven.

### The shots endpoints

| Method | Path | Maps to |
|---|---|---|
| `PUT` | `/shots/{id}` | `PutItem` on `SHOTS#<id>` / `v1` |
| `GET` | `/shots/{id}` | `GetItem` |

`GET` exists because **a write nobody can read back is unverifiable**, and this repo's standing
rule is to verify a deploy before calling the work done. **There is no `DELETE`:** the ingest is
the only writer and nothing reads shots back, so an orphaned item costs a few KB and nothing else.
**Deleting a session leaves its shots behind** — `deleteSession` removes the `SESSION` item alone,
so the `SHOTS#<id>` item is orphaned rather than retired.

**Shots are deliberately not on the `Repository` interface (D28).** Components reach storage
through `Repository`; putting shots there would invite a component to download 5,877 rows to draw
a chart that does not use them, which is exactly what D24 exists to prevent. `saveShots` and
`getShots` live on `RemoteRepo` alone, the ingest is their only writer, `CachedRepo` does not
cache them and `LocalStorageRepo` never sees them.

The handler's structural validation (D21) extends to the shots body: an array, bounded in length,
of objects with a known club and finite numbers. A gate against shapes the client cannot parse,
not a second authority. **Writes stay unauthenticated (D19)** — per-shot data raises the value of
what an attacker could overwrite, not the difficulty, and PITR (D20) remains the recovery path.

### Aggregation is per metric

`aggregate.ts`'s existing rule generalised rather than changed: a metric aggregates **only the
strokes where that metric is present**, and produces its own `n`. A stroke carrying `swingPlane`
but no `clubPath` still contributes its plane reading. `best` is computed from the metric's own
`better` rule and **omitted entirely** where that rule is `none`.

**A club row still requires at least one `clubPath` reading**, because club path is the KPI and
the reason `TrackmanSession` exists. A club whose every stroke in a session lacked a path reading
therefore loses that session's other metrics too. That is accepted rather than measured away: it
preserves the pre-Phase-7 behaviour exactly, and the alternative is a club row with no KPI in it.

`aggregateActivity` returns the session **and** its `Shot[]`, so the raw strokes are walked once.

### Merge rules

1. **Keyed on the activity `id`**, so re-running is idempotent.
2. **A stored session marked `manual` is never overwritten.**
3. **A date already carrying a *manual* Trackman session takes no import**, so no chart counts a
   day logged both ways twice. Reversible: delete the manual record.
4. **A manual session is never given machine shots.** `shotsToWrite()` in `merge.ts` enforces
   this, and it has to: the database's `ifNotManual` condition guards the `SESSION` partition
   alone, so the `SHOTS#` key space inherits nothing from it. If the rule is not enforced there,
   it is not enforced anywhere.

Rules 1 and 2 are enforced twice by design: by the pure merge (fast, tested) and by the database.
The ingest's writes carry `?ifNotManual=1`, which becomes the condition
`attribute_not_exists(pk) OR #source <> :manual` — so a hand-typed record survives even if a save
from the phone lands between the merge's read and its write. A blocked write reports `skipped`,
not an error: it is the expected outcome, not a failure.

The browser-side refresh is fired on mount and **never awaited**, swallows every failure, and
writes nothing when nothing changed. The cost of that silence is a site that looks healthy while
showing stale numbers, which is why `CachedRepo` carries `stale` and `StaleNotice` renders it.

### Automated pull

A browser cannot poll on a schedule, so the pull runs in `.github/workflows/trackman.yml` —
**daily** at 13:00 UTC, plus `workflow_dispatch` with a `since` input. The backfill is simply the
first run over a wider window, not a separate code path.

**Credentials are GitHub Actions secrets — never committed, never shipped to the client bundle.**
Anything in `dist/` is public on `golf.whitfield.life`.

**Auth:** refresh-token grant against the **public** mobile OAuth client
`old-golf-app.c686e909-5102-45ac-9860-8d0b789073ae` (authorization_code + PKCE, no client secret).
The refresh token is **non-rotating and reusable**, so a single static `TRACKMAN_REFRESH_TOKEN`
secret is set once and never written back — there is no rotation failure mode. Access tokens last
14 days. The portal's own client is confidential and BFF-backed, so it is *not* usable from CI.

**Workflow triggers are `schedule` and `workflow_dispatch` only.** Never `pull_request_target` or
`workflow_run`: this repo is public, and those triggers run with secret access under
attacker-influenced conditions.

**The job holds no permissions at all**, and carries **no AWS credentials**. It commits nothing —
sessions go straight to the store — so `contents: write` went with the commit step, and the
`publish` job went with it. `deploy.yml`'s `workflow_call` trigger was removed at the same time:
it existed only because a commit pushed with `GITHUB_TOKEN` does not trigger another workflow, and
with nothing being committed it had no caller. That job holds `pages: write`; an entry point with
no caller is surface for nothing.

`API_URL` is a repository **variable**, not a secret — writes are open (D19), and the URL ships in
the client bundle regardless. The step asserts it is set, because an empty value would send the
pull nowhere.

**Never interpolate the `since` input into a `run:` command.** It reaches the script through
`env:`, and the script validates its shape again before it goes near a URL.

**A missed or lost session self-heals.** The default 14-day window overlaps and the merge is
keyed on the activity id, so the next run re-adds anything absent and writes nothing otherwise.
Verified by deleting a real session and watching the following run restore it byte-identically.

**Fragility warning:** any integration built on an undocumented, non-public interface can break
without notice. It must degrade to manual entry, and never block the app from loading.

---

## 5. Deployment

Current: Pages serves the repo root, so pushing `index.html` publishes it.

Target: Pages serves an Actions-built artifact.

```
push to main → actions: npm ci → npm run build → upload dist/ → deploy Pages
```

`CNAME` must survive the build — place it in `public/` so Vite copies it into `dist/`. Losing it
drops the custom domain.

Set Vite's `base` to `'/'` (custom apex-style domain, not a project subpath).

`dist/404.html` must survive the build alongside `CNAME`. It is generated by the
`pages-spa-fallback` plugin in `vite.config.ts`, copying the built `index.html` so it carries
the correct hashed asset names. The deploy workflow asserts both. Losing the shim 404s every
deep link and fails silently — the site still builds and still deploys.

That plugin imports `node:fs` and `node:path`, which is the one new dependency Phase 2 added:
`@types/node` as a devDependency, with `"node"` added to `tsconfig.json`'s `types` array so
`svelte-check` can resolve them. Types only — nothing reaches the client bundle.

---

## 6. Constraints

- **Phone-first for logging.** Tue–Sun entries happen outdoors, one-handed, possibly gloved,
  possibly in sunlight. Logging a session must take well under a minute: big targets, minimal
  typing, sensible defaults (today's date, the day's scheduled drills pre-selected).
- **Desktop-first for reading.** Reviewing the plan and progress happens on a laptop.
- **Must work offline.** No network dependency for core logging.
- **Single user.** No multi-user concerns, but also no server-side validation — the client is the
  only guard.
- **Preserve the design.** See `design.md`. New UI inherits the existing system.
