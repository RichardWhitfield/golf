# Architecture

Target architecture for turning the static plan page into a living practice tracker.

**Status:** proposed. Nothing here is built yet — the repo currently contains a single
`index.html`. See `roadmap.md` for sequencing.

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

### Proposed layout

```
src/
  lib/
    domain/
      types.ts            # PracticeSession, TrackmanSession, Drill, …
      plan.ts             # the 3-week plan as data (from content.md)
      drills.ts           # the 7 drills as data
      stats.ts            # aggregation: streaks, path trend, drill coverage
    storage/
      repository.ts       # the interface — the seam
      local.ts            # LocalStorageRepo implementation
      migrations.ts       # schemaVersion upgrades
    ingest/
      source.ts           # TrackmanSource interface
      manual.ts           # manual entry (always available)
    stores/               # Svelte stores wrapping the repository
    components/
  routes/                 # or views/ — Plan, Log, Progress
  app.css                 # tokens + resets (from design.md)
```

The plan and drill *content* becomes data (`plan.ts`, `drills.ts`) rather than hand-written
markup. This is the single biggest structural change: the current page repeats the same card
shape seven times by hand. As data, the same content drives the plan view, the log form's drill
picker, and progress-by-drill — one source, three consumers.

---

## 3. Data model

Sketch, not final. TypeScript definitions in `domain/types.ts` are the source of truth once built.

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

Single `localStorage` key holding one JSON document with a `schemaVersion`. At this data volume
(a few sessions a week) that's simpler and safer than key-per-record, and it makes export
trivial.

**Because `localStorage` is the only copy, manual JSON export/import is a required feature, not a
nice-to-have.** Clearing site data would otherwise destroy months of logs.

Every schema change ships a migration in `migrations.ts`. Never mutate the shape without bumping
the version.

---

## 4. Trackman ingest

**Requirement:** automatic pull, ideally triggered by new data appearing, falling back to a
weekly (Monday) scheduled pull.

**Reality:** TrackMan publishes no public API for individual golfers — their documented API is a
facility/partner product. Data currently reaches the player only through the phone app. Whether a
programmatic path exists is **unresolved and requires investigation** (see `roadmap.md`).

Because of that uncertainty, ingest is defined as an interface with swappable implementations:

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
| `FileImportSource` | Likely | If any CSV/report export exists, drop the file in and parse it. |
| `ApiSource` | Unknown | Depends entirely on what the investigation finds. |

### If automated pull becomes possible

A browser cannot poll on a schedule — it only runs while a tab is open. Automated pull therefore
requires something running without the user:

**Proposed:** a **GitHub Actions scheduled workflow** (Monday evening) that fetches new sessions
and commits them to a data file in this repo. The site reads that file on load and merges it with
local entries. This keeps hosting static, costs nothing, needs no server, and gives version
history of the data for free.

**Credentials must be GitHub Actions secrets — never committed, never shipped to the client
bundle.** Anything in `dist/` is public on `golf.whitfield.life`.

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
