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
| D24 | Item granularity | **Session aggregates and per-shot data are separate items** | Aggregates are what every current view reads (~125 KB total). Embedding shots would force a multi-megabyte download on every load to render charts that do not use them. `SHOTS#<id>` is reserved. |
| D25 | Infrastructure as code | **CloudFormation/SAM templates in `infra/`, deployed by hand** | Deploying from a public repo's CI needs AWS credentials — the one thing D22 otherwise avoids. The SAM CLI is not required; the transform expands server-side. |
| D26 | Sort key | **The session id alone**, never `<date>#<id>` | `saveSession` is upsert-by-id and the date is editable. A mutable key makes an edited date insert a duplicate instead of updating in place. Ordering is done client-side; at ~250 items it is free. |

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
      trackman.ts         # Trackman session drafts and validation
      scale.ts            # the shared fixed chart axis: degrees/dates → SVG units
      series.ts           # Trackman sessions → one club-path series per club
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
  template.yaml           # table, function, Function URL  (ap-southeast-2)
  billing-alarm.yaml      # $1 estimated-charges alarm      (us-east-1 — see below)
  function/handler.mjs    # the Lambda. Plain ESM, no build step
  handler.test.mjs        # outside function/, so it is never packaged
```

`domain/`, `storage/` and `stores/` are built (Phase 2, issue #3); `ingest/` is built (Phase 3,
issue #4). The progress calculations are built (Phase 4, issue #5) as four pure modules —
`scale.ts`, `series.ts`, `coverage.ts` and `feel.ts` — rather than the single `stats.ts` first
sketched here: they answer four unrelated questions and share no state, so one module would only
have coupled them. There is one file outside `src/`: `scripts/trackman-ingest.ts`, the Node entry
point the workflow runs, which imports from `lib/ingest/` so the rules exist in one place.
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
```

**Three changes from the original sketch, all made when Phase 3 met real data:**

- **`clubPath: {best, typical}` became `clubs: ClubPath[]`.** OQ-7 (issue #14) showed a blended
  club-path average is not measurable — it tracks club selection as much as swing change. No code
  path may compute a mean across clubs.
- **`shots?: Shot[]` was dropped.** The repo is public, so the ingest publishes *per-club
  aggregates only* and never stroke-level data. `shots[]` would therefore be permanently empty,
  and an always-empty field is a promise the model cannot keep.
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
- **`source` is recorded on every Trackman session.** When a number looks wrong six weeks later,
  the first question is whether it was typed or imported.
- **Negative degrees mean out-to-in.** Preserve the sign; never store an absolute value.
- **The target is a band (`−2°` to `+2°`), not a maximum.** Overshooting past `+2°` is a fault
  (see the "don't overcook it" watch-out). Any progress visual must render a target band with
  regions on *both* sides, not a progress bar toward a bigger number.

### Persistence

One `localStorage` key, `golf:store`, holding one JSON document with `schemaVersion: 2`. At a few
sessions a week that is simpler and safer than key-per-record, and it makes export trivial.
Migrations live in `storage/migrations.ts`, keyed by the version being migrated *from*.

**The `1 → 2` migration is an identity function, deliberately.** Every v1 document is already a
valid v2 one — v1 held only `type: 'practice'` sessions, and those are unchanged. The bump exists
so the **build already deployed** refuses to touch a document containing Trackman sessions, which
its validator would reject as corrupt. Guard 2 below then does exactly the right thing.

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

**Built** (Phase 3, issue #4). TrackMan's *documented* API is a facility/partner product and is not
usable by an individual golfer. The path that works is an **undocumented GraphQL API at
`https://api.trackmangolf.com/graphql`**, reachable with the player's own credentials. Schema
introspection is enabled, so the surface is verifiable rather than guessed.

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
  aggregate.ts    # strokes → ClubPath[] + Sydney date. Pure, tested, SHARED with the script
  api.ts          # ApiSource: refresh-token grant, paged GraphQL query. Node-side only
  merge.ts        # the merge rules below. Pure, tested
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

### What gets stored

**Per-club aggregates only**: date, club, typical, best, shot count. No stroke-level data, no
location, no identifiers. Thirteen months is 369 rows, about 30 KiB.

That was originally forced by the publication channel — a file committed to a public repo. It is
now a deliberate choice rather than a constraint, and **the reason storage moved before the
metrics widened**: per-shot data has somewhere private to land, and the next phase can choose what
to keep on its merits.

Until Phase 6 this went to `public/trackman.json` as `{ "version": 1, "sessions": [...] }`. That
file is gone. It was also the seed for the migration — 86 sessions, no refresh token, no call to
the undocumented API — which is why it was deleted last, after the new path was proven.

### Merge rules

1. **Keyed on the activity `id`**, so re-running is idempotent.
2. **A stored session marked `manual` is never overwritten.**
3. **A date already carrying a *manual* Trackman session takes no import**, so no chart counts a
   day logged both ways twice. Reversible: delete the manual record.

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
