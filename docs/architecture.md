# Architecture

Target architecture for turning the static plan page into a living practice tracker.

**Status:** partly built. Sections are marked **Built** where the code now matches what follows;
an unmarked section is still the plan being built towards. See `roadmap.md` for sequencing.

---

## 1. Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| D1 | Framework | **Svelte 5 + Vite** | Existing hand-written CSS ports over near-unchanged as scoped component styles. Minimal boilerplate for a solo project. Small bundle for phone use at the range. |
| D2 | Storage | **`localStorage` now, behind an async repository interface** | Zero infrastructure, zero cost, works offline. The async interface means adding sync later is a contained change. |
| D3 | Hosting | **GitHub Pages**, custom domain `golf.whitfield.life` | Already configured (`CNAME`). Free, and adequate for a static bundle. |
| D4 | Build/deploy | **GitHub Actions** builds and publishes `dist/` | A build step is now required; Pages can no longer serve the repo root directly. |
| D5 | Session types | **Two distinct models**, not one | A Trackman session and a home practice session share almost no fields. Forcing one model produces a form that is mostly blank. |
| D6 | Trackman data | **Manual entry is the baseline**; automated ingest is a pluggable source | Unchanged by Phase 3. The API works but is undocumented and assumed breakable, so deleting the workflow must leave the app fully usable. |
| D16 | Club path shape | **Per club, never blended** | OQ-7. A blended average tracks club selection as much as swing change. The KPI club is the driver. |
| D17 | Ingest publication | **Per-club aggregates committed to `public/trackman.json`** | The repo is public, so a committed file is world-readable. Aggregates carry no stroke data, no location, no identifiers. |
| D7 | Language | **TypeScript** | The data model is the core of this app and will outlive any UI. Types are the cheapest documentation of it. |
| D8 | Tests | **Vitest** for domain logic and the storage layer | Not for UI. The valuable, breakable logic is data shaping and aggregation. |
| D9 | Navigation | **Client-side views** (Plan, Log; Progress in Phase 4) | The log needs its own screen. The poster page becomes the Plan view, visually unchanged. |
| D10 | URL scheme | **Clean paths** via the History API, with a generated `404.html` | Real URLs. The shim is copied from `dist/index.html` at build time — a hand-written `public/404.html` would reference stale hashed assets. |

### Deliberately excluded (YAGNI)

No accounts, no auth, no server database, no state-management library (Svelte stores suffice),
no CSS framework, no component library, no analytics, no PWA/offline shell until there's evidence
it's needed.

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
│  LocalStorageRepo  →  future: RemoteRepo     │
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
      stats.ts            # aggregation: streaks, path trend, drill coverage  # Phase 4
    storage/
      repository.ts       # the interface — the seam
      local.ts            # LocalStorageRepo implementation
      migrations.ts       # schemaVersion upgrades
      transfer.ts         # JSON export/import, merge by id
    ingest/
      source.ts           # TrackmanSource interface
      aggregate.ts        # strokes → per-club readings. Shared with scripts/
      api.ts              # ApiSource — Node-side, runs under Actions
      merge.ts            # idempotent merge; manual always wins
      published.ts        # browser-side read of public/trackman.json
    stores/
      router.svelte.ts    # History-API router
      sessions.svelte.ts  # the rune store wrapping the repository
    components/
      PlanView.svelte     # the poster page
      LogView.svelte      # the practice log
      …
  app.css                 # tokens + resets (from design.md)
```

`domain/`, `storage/` and `stores/` are built (Phase 2, issue #3); `ingest/` is built (Phase 3,
issue #4). `domain/stats.ts` is not — it arrives with Phase 4. There is one file outside `src/`:
`scripts/trackman-ingest.ts`, the Node entry point the workflow runs, which imports from
`lib/ingest/` so the rules exist in one place. `PlanView` and `LogView` live in `src/routes/`,
switched by `router.svelte.ts`.

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

Because `localStorage` is the only copy, three guards exist:

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
scripts/trackman-ingest.ts ── Actions, daily ──▶ public/trackman.json ──▶ dist/ ──▶ browser
   refresh → GraphQL → aggregate                  {version, sessions}       merge into golf:store
```

```
src/lib/ingest/
  source.ts       # the TrackmanSource interface — the seam
  aggregate.ts    # strokes → ClubPath[] + Sydney date. Pure, tested, SHARED with the script
  api.ts          # ApiSource: refresh-token grant, paged GraphQL query. Node-side only
  merge.ts        # the merge rules below. Pure, tested
  published.ts    # browser side: fetch /trackman.json, guard the 404 shim, validate
```

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

### What gets published, and why only that

The repo is public, so a committed file is world-readable — as are Actions artifacts. The workflow
therefore commits **per-club aggregates only**: date, club, typical, best, shot count. No
stroke-level data, no location, no identifiers. Thirteen months is 369 rows and about 30 KiB.

The file is `{ "version": 1, "sessions": [...] }`, where `version` describes the *file format*
independently of the store's `schemaVersion`. There is deliberately **no `generated` timestamp** —
it would change on every run and force a commit even when no golf happened. Git records when.
`source` is not in the file: the browser stamps `source: 'api'` on read, so a file cannot claim to
be hand-typed and thereby make itself unoverwritable.

### Merge rules

1. **Keyed on the activity `id`**, so re-running is idempotent.
2. **A stored session marked `manual` is never overwritten.**
3. **A date already carrying a *manual* Trackman session takes no import**, so no chart counts a
   day logged both ways twice. Reversible: delete the manual record.

The browser-side sync is fired on mount and **never awaited**, swallows every failure, and writes
nothing when the merge produces no change.

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
attacker-influenced conditions. `deploy.yml` also carries `workflow_call`, which is a different
thing — an explicit invocation by a workflow already in this repo. It exists because **a commit
pushed with `GITHUB_TOKEN` does not trigger another workflow**, so without it the committed data
would sit unpublished. The `ingest` job holds `contents: write` only; the `publish` job that calls
`deploy.yml` is separate and holds `pages: write`.

**Never interpolate the `since` input into a `run:` command.** It reaches the script through
`env:`, and the script validates its shape again before it goes near a URL.

**The change check stages the file before comparing it** (`git add`, then
`git diff --cached --quiet`). `git diff` alone only reports changes to *tracked* files and ignores
untracked ones, so on the first run — the one that creates `public/trackman.json` — it read as "no
change". The backfill was discarded, `publish` was skipped, and the job still reported success.
The step also asserts the file exists, so a pull that silently wrote nothing can never again look
like a quiet day.

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
