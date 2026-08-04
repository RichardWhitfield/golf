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
| D6 | Trackman data | **Manual entry is the baseline**; automated ingest is a pluggable source | No confirmed programmatic access exists yet. The app must be fully usable without it. |
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
      session.ts          # session drafts, swing defaults
      stats.ts            # aggregation: streaks, path trend, drill coverage  # Phase 4
    storage/
      repository.ts       # the interface — the seam
      local.ts            # LocalStorageRepo implementation
      migrations.ts       # schemaVersion upgrades
      transfer.ts         # JSON export/import, merge by id
    ingest/                                                                  # Phase 5
      source.ts           # TrackmanSource interface
      manual.ts           # manual entry (always available)
    stores/
      router.svelte.ts    # History-API router
      sessions.svelte.ts  # the rune store wrapping the repository
    components/
      PlanView.svelte     # the poster page
      LogView.svelte      # the practice log
      …
  app.css                 # tokens + resets (from design.md)
```

`domain/`, `storage/` and `stores/` are built (Phase 2, issue #3). `ingest/` and `domain/stats.ts`
are not — they arrive with the phases marked above. There is no separate `routes/`: `PlanView` and
`LogView` live alongside the other components, switched by `router.svelte.ts`.

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

/** Monday: the Trackman session. Numbers live here. */
interface TrackmanSession {
  id: string
  type: 'trackman'
  date: ISODate
  clubPath: {
    best: number          // degrees; negative = out-to-in
    typical: number
  }
  shots?: Shot[]          // populated only if automated ingest lands
  drillsWorked?: DrillId[]
  notes?: string
  source: 'manual' | 'import' | 'auto'   // provenance always recorded
}
```

### Notes on the model

- **`feel` is per drill entry, not per session.** Two drills in one session can go very
  differently, and the whole plan is built on feel cues. Averaging them away loses the signal.
- **`clubPath` is required on a Trackman session** — it's the KPI and the reason the session
  type exists. `shots[]` is optional because it only exists if automated ingest works.
- **`source` is recorded on every Trackman session.** When a number looks wrong six weeks later,
  the first question is whether it was typed or imported.
- **Negative degrees mean out-to-in.** Preserve the sign; never store an absolute value.
- **The target is a band (`−2°` to `+2°`), not a maximum.** Overshooting past `+2°` is a fault
  (see the "don't overcook it" watch-out). Any progress visual must render a target band with
  regions on *both* sides, not a progress bar toward a bigger number.

### Persistence

One `localStorage` key, `golf:store`, holding one JSON document with `schemaVersion: 1`. At a few
sessions a week that is simpler and safer than key-per-record, and it makes export trivial.
Migrations live in `storage/migrations.ts`, keyed by the version being migrated *from*. The table
is empty at v1; the tests around it are not.

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

**Requirement:** automatic pull, ideally triggered by new data appearing, falling back to a
weekly (Monday) scheduled pull.

**Reality:** TrackMan's *documented* API is a facility/partner product (bay control, tournaments) and
is not usable by an individual golfer. However, an **undocumented GraphQL API at
`https://api.trackmangolf.com/graphql` is reachable with the player's own credentials**, and OQ-1
confirmed it end to end on 2026-07-31. Schema introspection is enabled, so the surface is
verifiable rather than guessed.

Ingest remains an interface with swappable implementations — the API path works today but is
undocumented and must be assumed breakable:

```ts
interface TrackmanSource {
  name: string
  isAvailable(): Promise<boolean>
  fetchSince(date: ISODate): Promise<TrackmanSession[]>
}
```

Candidate implementations, in order of confidence:

| Source | Confidence | Notes |
|---|---|---|
| `ManualSource` | Certain | A form. Always present. The app is fully functional with only this. |
| `ApiSource` | **Confirmed** | GraphQL, `me.activities(kinds: [VIRTUAL_RANGE], timeFrom:, timeTo:)`. Undocumented; assume it breaks. |
| `FileImportSource` | Unnecessary | No player-accessible export exists. Superseded by `ApiSource`. |

`activities(timeFrom:, timeTo:)` maps directly onto `fetchSince()` — the interface above was
specified before the API was known and needs no change.

**Data notes for any implementation:** units are SI (m/s, metres, degrees). Roughly 17% of strokes
carry no club data and return `null` measurements — filter them, they are not zeros. `club` is
returned as a display string (`7Iron`) but filtered by enum (`IRON7`). `aggregatedMeasurement(clubs:)`
computes per-club averages server-side; **store club path per club, never blended** (see OQ-7).

### Automated pull

A browser cannot poll on a schedule — it only runs while a tab is open. Automated pull therefore
requires something running without the user:

**Proposed:** a **GitHub Actions scheduled workflow** (Monday evening) that fetches new sessions
and commits them to a data file in this repo. The site reads that file on load and merges it with
local entries. This keeps hosting static, costs nothing, needs no server, and gives version
history of the data for free.

**Credentials must be GitHub Actions secrets — never committed, never shipped to the client
bundle.** Anything in `dist/` is public on `golf.whitfield.life`.

**Auth design (confirmed):** refresh-token grant against the **public** mobile OAuth client
`old-golf-app.c686e909-5102-45ac-9860-8d0b789073ae` (authorization_code + PKCE, no client secret).
The refresh token is **non-rotating and reusable**, so a single static `TRACKMAN_REFRESH_TOKEN`
secret is set once and never written back — there is no rotation failure mode. Access tokens last
14 days. The portal's own client is confidential and BFF-backed, so it is *not* usable from CI.

**Workflow triggers must be `schedule` and `workflow_dispatch` only.** Never `pull_request_target`
or `workflow_run`: this repo is public, and those triggers run with secret access under
attacker-influenced conditions.

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
