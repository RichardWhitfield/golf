# Phase 3 · Trackman Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture Trackman club path as a **per-club series** — automatically via a scheduled GitHub Actions pull, and by hand as the permanent baseline — so that deleting the automation leaves the app fully usable.

**Architecture:** Four layers, following `docs/architecture.md` §2. A pure domain vocabulary (`lib/domain/clubs.ts`, `lib/domain/trackman.ts`) knows what a club is and what a valid Trackman session looks like. A pure ingest layer (`lib/ingest/`) turns raw strokes into per-club aggregates and merges them safely; **the same modules are imported by the Node script and by the browser**, so the null-filtering and Sydney-date rules cannot drift. The storage seam widens from `PracticeSession[]` to `Session[]` at `schemaVersion` 2. Svelte components read only through `lib/stores/sessions.svelte.ts`.

**Tech Stack:** Svelte 5 (runes), Vite 8, TypeScript 6, Vitest 4. One new **devDependency**: `tsx`, so the Actions workflow can run a `.ts` entry point that imports the app's own modules. Dev-only — nothing reaches the client bundle. No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-08-04-phase-3-trackman-design.md`
**Issue:** [#4](https://github.com/RichardWhitfield/golf/issues/4), also closing [#14](https://github.com/RichardWhitfield/golf/issues/14) (OQ-7)

---

## Global Constraints

Every task's requirements implicitly include this section. These come from `CLAUDE.md`, `docs/design.md` and the spec, and are not negotiable.

**Code**
- **No component may call `localStorage` directly.** Everything goes through `lib/storage/`, reached via `lib/stores/sessions.svelte.ts`.
- **Every repository method is `async`,** even over synchronous `localStorage`.
- **Club path is signed. Negative is out-to-in. Never store, display, or validate an absolute value.** A typed `+6` is a real reading, not a mis-typed `−6`.
- **The target is a band (`−2°` to `+2°`), not a maximum.** `best` is the value with the smallest `|path|`. Never `Math.max`.
- **Never blend club path across clubs.** No code path may compute a mean over more than one club (#14).
- **Drill ids `01`–`07` are stable.** Never renumber.
- **`src/lib/domain/drills.ts` is the single source of truth for drill content.** Never restate drill copy in markup.
- **`SCHEMA_VERSION` is bumped to 2 with a migration** (Task 2). No further bumps in this plan.
- **Never write code that can wipe the store without an explicit user action.**
- **The app must render when `localStorage` is unavailable.** No new top-level `localStorage` reference; no module-scope `await`.
- **Nothing in the ingest may block app load.** Every failure path is caught and degrades to manual entry.

**Design** (`docs/design.md`)
- **Use the CSS custom properties. Never hardcode a colour.** *This plan introduces no new tokens.*
- `--ball` (yellow) means the goal. `--flag` (red) means the problem. Never invert.
- **Data and labels are `'Space Mono', monospace`. Prose is Inter. Headings are Archivo.** Every number, measurement, degree value, shot count and category label is monospaced.
- Three surface levels only: `--bg` → `--panel` → `--card`. Form fields sit on `--card`.
- **One breakpoint: `760px`.** Prefer `clamp()`, `auto-fill`, `minmax()`.
- **Every animation needs a `prefers-reduced-motion` override that leaves content visible**, scoped to the component that owns it.
- **Every interactive control needs a `44px` minimum hit target.**
- Borders are `1px solid var(--line)`. **No shadows.**

**Where a style rule belongs** (`CLAUDE.md`)
- `app.css` holds tokens, the reset, shared typography, the section scaffold, and classes used by more than one component. Everything else is scoped to its component — **including that component's own `760px` media query.**
- **Never split one element's rules across both layers.**

**Content**
- British English (`lang="en-GB"`). Second-person, direct, coach-like. Short declaratives.

**Security**
- **The refresh token is never echoed, never written to a file, never passed through `base64`/`jq`, never included in an error message.**
- **Workflow triggers are `schedule` and `workflow_dispatch` only.** Never `pull_request_target` or `workflow_run`.
- **Actions are pinned to full commit SHAs** with the version in a trailing comment.
- **No secrets in the client bundle.** Anything in `dist/` is public.

**Commits**
- A plain sentence, capitalised, no `feat:`/`fix:` prefix. See `git log`.
- Every commit ends with:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_018KCaZyfUG5SmZjFfsEMVM3
  ```
- **If a change makes one of the four `docs/` files wrong, fix it in the same commit.**

**Verification**
- `npm run check` (svelte-check) and `npm test` (Vitest) both gate the deploy. Run both before every commit.

---

## File Structure

**Create**

| File | Responsibility |
|---|---|
| `src/lib/domain/clubs.ts` | The club vocabulary: authored bag order, display names, and the verified Trackman wire mapping. |
| `src/lib/domain/clubs.test.ts` | Normalisation of all 14 verified strings; unknown returns `null`. |
| `src/lib/domain/trackman.ts` | Trackman form draft: seed, load, convert, validate. |
| `src/lib/domain/trackman.test.ts` | Draft validation in form order. |
| `src/lib/ingest/source.ts` | The `TrackmanSource` interface — the documented seam. |
| `src/lib/ingest/aggregate.ts` | Pure: raw strokes → `ClubPath[]` + Sydney date. Shared by Node and browser. |
| `src/lib/ingest/aggregate.test.ts` | Null filtering, date boundary, `best`, `n`, empty sessions. |
| `src/lib/ingest/merge.ts` | Pure: the merge rules. Manual wins; idempotent; date collisions skipped. |
| `src/lib/ingest/merge.test.ts` | Every rule, plus the no-change case. |
| `src/lib/ingest/published.ts` | Browser: fetch `/trackman.json`, guard the 404 shim, validate. |
| `src/lib/ingest/published.test.ts` | 404 shim rejected as "nothing published"; malformed rejects the file. |
| `src/lib/ingest/api.ts` | `ApiSource`: refresh-token grant, paged GraphQL query. Node-side. |
| `src/lib/components/TrackmanForm.svelte` | The manual Trackman session form. |
| `src/lib/components/ClubPathRow.svelte` | One club's row within that form. |
| `scripts/trackman-ingest.ts` | Node entry point: argument parsing, `ApiSource`, file writing. |
| `.github/workflows/trackman.yml` | Daily scheduled pull; commits and publishes. |

**Modify**

| File | Change |
|---|---|
| `src/lib/domain/types.ts` | Add `Club`, `ClubPath`, `TrackmanSession`, `Session`. |
| `src/lib/storage/migrations.ts` | `SCHEMA_VERSION` → 2; migration `1 → 2`. |
| `src/lib/storage/repository.ts` | `Session[]` throughout; add `mergeTrackman`. |
| `src/lib/storage/local.ts` | Implement the widened interface and `mergeTrackman`. |
| `src/lib/storage/transfer.ts` | Branch validation on `type`; export `checkTrackmanSession`. |
| `src/lib/stores/sessions.svelte.ts` | `Session[]`; `practice`/`trackman` views; `syncPublished()`. |
| `src/App.svelte` | Fire the non-blocking sync on mount. |
| `src/routes/LogView.svelte` | Practice / Trackman mode pills. |
| `src/lib/components/RecentSessions.svelte` | Render both session types. |
| `src/lib/components/DataPanel.svelte` | Report the sync outcome. |
| `src/lib/domain/plan.ts` | `KPI` names the driver. |
| `.github/workflows/deploy.yml` | Add `on: workflow_call:`. |
| `package.json` | `tsx` devDependency; `ingest` script. |
| `docs/*.md` | Architecture, content, roadmap, and `CLAUDE.md` brought in line. |

---

## Task 1: The club vocabulary

**Files:**
- Create: `src/lib/domain/clubs.ts`
- Create: `src/lib/domain/clubs.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type Club`, `CLUBS: ClubInfo[]`, `KPI_CLUB: Club`, `clubInfo(id: Club): ClubInfo`, `isClub(value: unknown): value is Club`, `normaliseClub(display: string): Club | null`, `compareClubs(a: Club, b: Club): number`, `MAX_PATH_DEGREES = 20`.

`MAX_PATH_DEGREES` lives here, not in the two places that check against it. Task 3 (import validation) and Task 8 (form validation) must agree on what counts as an implausible reading, and a bound stated twice is a bound that will drift.

The mapping contains **only strings verified against the live API on 2026-08-04**. Guessing at unobserved spellings would put a silently-wrong entry in the table; an unmapped string is instead reported by the workflow with its exact spelling, making the fix a one-line change.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { CLUBS, clubInfo, compareClubs, normaliseClub } from './clubs'

describe('normaliseClub', () => {
  // Every display string observed across 5,877 strokes on 2026-08-04.
  const VERIFIED: [string, string][] = [
    ['Driver', 'DRIVER'], ['3Wood', 'WOOD3'], ['5Wood', 'WOOD5'],
    ['4Iron', 'IRON4'], ['5Iron', 'IRON5'], ['6Iron', 'IRON6'],
    ['7Iron', 'IRON7'], ['8Iron', 'IRON8'], ['9Iron', 'IRON9'],
    ['PitchingWedge', 'PITCHING_WEDGE'], ['50Wedge', 'WEDGE50'],
    ['SandWedge', 'SAND_WEDGE'], ['58Wedge', 'WEDGE58'], ['60Wedge', 'WEDGE60'],
  ]

  it.each(VERIFIED)('maps %s to %s', (display, id) => {
    expect(normaliseClub(display)).toBe(id)
  })

  it('returns null for an unseen string rather than guessing', () => {
    expect(normaliseClub('3Hybrid')).toBeNull()
    expect(normaliseClub('')).toBeNull()
  })

  it('covers every club in CLUBS', () => {
    const mapped = new Set(VERIFIED.map(([, id]) => id))
    expect(CLUBS.map((c) => c.id).sort()).toEqual([...mapped].sort())
  })
})

describe('CLUBS', () => {
  it('is in bag order, longest first', () => {
    expect(CLUBS[0].id).toBe('DRIVER')
    expect(CLUBS.at(-1)?.id).toBe('WEDGE60')
  })

  it('gives every club a monospace-friendly short label', () => {
    expect(clubInfo('DRIVER').short).toBe('DRIVER')
    expect(clubInfo('IRON7').short).toBe('7I')
    expect(clubInfo('WEDGE58').short).toBe('58°')
  })

  it('orders by the bag, not alphabetically', () => {
    expect(compareClubs('DRIVER', 'IRON4')).toBeLessThan(0)
    expect(compareClubs('WEDGE60', 'IRON4')).toBeGreaterThan(0)
    expect(compareClubs('IRON7', 'IRON7')).toBe(0)
  })
})
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `npx vitest run src/lib/domain/clubs.test.ts`
Expected: FAIL — `Cannot find module './clubs'`.

- [ ] **Step 3: Write `clubs.ts`**

```ts
/**
 * The club vocabulary. Two separate things live here because they answer different questions:
 * `CLUBS` is what the UI offers and how it orders things; `TRACKMAN_CLUB_NAMES` is the wire
 * format. Keeping them apart means a club can be pickable before its Trackman spelling is known.
 */
export interface ClubInfo {
  id: Club
  /** Monospaced UI label. Short, because it sits in a row of numbers. */
  short: string
  /** Prose label. */
  name: string
}

export type Club =
  | 'DRIVER' | 'WOOD3' | 'WOOD5'
  | 'IRON4' | 'IRON5' | 'IRON6' | 'IRON7' | 'IRON8' | 'IRON9'
  | 'PITCHING_WEDGE' | 'WEDGE50' | 'SAND_WEDGE' | 'WEDGE58' | 'WEDGE60'

/** The KPI club. #14: a blended club-path average tracks club selection, not swing change. */
export const KPI_CLUB: Club = 'DRIVER'

/** Bag order, longest first. Drives the picker and every display ordering. */
export const CLUBS: ClubInfo[] = [
  { id: 'DRIVER', short: 'DRIVER', name: 'Driver' },
  { id: 'WOOD3', short: '3W', name: '3-wood' },
  { id: 'WOOD5', short: '5W', name: '5-wood' },
  { id: 'IRON4', short: '4I', name: '4-iron' },
  { id: 'IRON5', short: '5I', name: '5-iron' },
  { id: 'IRON6', short: '6I', name: '6-iron' },
  { id: 'IRON7', short: '7I', name: '7-iron' },
  { id: 'IRON8', short: '8I', name: '8-iron' },
  { id: 'IRON9', short: '9I', name: '9-iron' },
  { id: 'PITCHING_WEDGE', short: 'PW', name: 'Pitching wedge' },
  { id: 'WEDGE50', short: '50°', name: '50° wedge' },
  { id: 'SAND_WEDGE', short: 'SW', name: 'Sand wedge' },
  { id: 'WEDGE58', short: '58°', name: '58° wedge' },
  { id: 'WEDGE60', short: '60°', name: '60° wedge' },
]

const BY_ID = new Map(CLUBS.map((c) => [c.id, c]))
const ORDER = new Map(CLUBS.map((c, i) => [c.id, i]))

export function clubInfo(id: Club): ClubInfo {
  const info = BY_ID.get(id)
  if (!info) throw new Error(`Unknown club: ${id}`)
  return info
}

export function isClub(value: unknown): value is Club {
  return typeof value === 'string' && BY_ID.has(value as Club)
}

export function compareClubs(a: Club, b: Club): number {
  return (ORDER.get(a) ?? 0) - (ORDER.get(b) ?? 0)
}

/**
 * Trackman display string → stored id. **Verified against the live API, never guessed.**
 * An unmapped string returns `null` so the ingest can report the exact spelling; inventing an
 * entry for a club nobody has hit would put a wrong mapping in the table that nothing detects.
 */
const TRACKMAN_CLUB_NAMES: Record<string, Club> = {
  Driver: 'DRIVER',
  '3Wood': 'WOOD3',
  '5Wood': 'WOOD5',
  '4Iron': 'IRON4',
  '5Iron': 'IRON5',
  '6Iron': 'IRON6',
  '7Iron': 'IRON7',
  '8Iron': 'IRON8',
  '9Iron': 'IRON9',
  PitchingWedge: 'PITCHING_WEDGE',
  '50Wedge': 'WEDGE50',
  SandWedge: 'SAND_WEDGE',
  '58Wedge': 'WEDGE58',
  '60Wedge': 'WEDGE60',
}

export function normaliseClub(display: string): Club | null {
  return TRACKMAN_CLUB_NAMES[display] ?? null
}

/** Beyond any real swing. A number this large is a unit error or a typo, not a reading.
 *  Stated once, because import validation and form validation must agree on it. */
export const MAX_PATH_DEGREES = 20
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npx vitest run src/lib/domain/clubs.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/clubs.ts src/lib/domain/clubs.test.ts
git commit   # "Add the club vocabulary, mapped only from verified Trackman strings"
```

---

## Task 2: The session model and schema v2

**Files:**
- Modify: `src/lib/domain/types.ts`
- Modify: `src/lib/storage/migrations.ts`
- Modify: `src/lib/storage/repository.ts`
- Modify: `src/lib/storage/local.ts`
- Modify: `src/lib/storage/migrations.test.ts`
- Modify: `src/lib/storage/local.test.ts`

**Interfaces:**
- Consumes: `Club` from Task 1.
- Produces: `ClubPath`, `TrackmanSession`, `Session`, `SCHEMA_VERSION === 2`. `Repository.listSessions(): Promise<Session[]>`, `Repository.saveSession(session: Session): Promise<void>`, `StoreDocument.sessions: Session[]`.

- [ ] **Step 1: Write the failing tests**

Add to `src/lib/storage/migrations.test.ts`:

```ts
it('migrates a v1 document to v2 unchanged', () => {
  const v1 = {
    schemaVersion: 1,
    sessions: [{ id: 'a', type: 'practice', date: '2026-08-03', location: 'home', entries: [] }],
    settings: { blockStart: '2026-07-20' },
  }
  const doc = migrate(v1)
  expect(doc.schemaVersion).toBe(2)
  expect(doc.sessions).toEqual(v1.sessions)
  expect(doc.settings).toEqual(v1.settings)
})

it('carries a Trackman session through a v2 round trip', () => {
  const v2 = {
    schemaVersion: 2,
    sessions: [{
      id: 't1', type: 'trackman', date: '2026-07-27', source: 'api',
      clubs: [{ club: 'DRIVER', typical: -7.5, best: -1.2, n: 26 }],
    }],
    settings: {},
  }
  expect(migrate(v2).sessions).toEqual(v2.sessions)
})

it('still refuses a document from a newer build', () => {
  expect(() => migrate({ schemaVersion: 3, sessions: [], settings: {} })).toThrow(FutureSchemaError)
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/lib/storage/migrations.test.ts`
Expected: FAIL — `expected 1 to be 2`.

- [ ] **Step 3: Add the types**

Append to `src/lib/domain/types.ts`:

```ts
import type { Club } from './clubs'

/**
 * One club's club path for one session. **Never blend these** — a mean across clubs tracks club
 * selection, not swing change (#14). In 2025-11 the blended figure was the best in the series
 * while the driver was the worst to that point, purely because more seven-irons were hit.
 */
export interface ClubPath {
  club: Club
  /** Signed degrees, the session mean for this club. Negative is out-to-in. */
  typical: number
  /**
   * Signed degrees: the single stroke closest to neutral, i.e. the smallest `|path|`.
   * The target is a band centred on zero, so `+5°` is worse than `+1°`. Never `Math.max`.
   */
  best: number
  /** Measured strokes behind `typical`. Absent on hand-typed entries, which have no count. */
  n?: number
}

/** The Trackman session. The numbers live here. */
export interface TrackmanSession {
  id: string
  type: 'trackman'
  /** The Sydney date. 11% of sessions fall on a different UTC date — see the spec §1. */
  date: ISODate
  /** At least one, in bag order. */
  clubs: ClubPath[]
  drillsWorked?: DrillId[]
  notes?: string
  /** Provenance, always recorded. Editing an imported session flips it to `manual`. */
  source: 'manual' | 'api'
}

export type Session = PracticeSession | TrackmanSession

export function isTrackman(session: Session): session is TrackmanSession {
  return session.type === 'trackman'
}

export function isPractice(session: Session): session is PracticeSession {
  return session.type === 'practice'
}
```

- [ ] **Step 4: Bump the schema**

In `src/lib/storage/migrations.ts`: `SCHEMA_VERSION = 2`, and register the migration:

```ts
const MIGRATIONS: Record<number, Migration> = {
  /**
   * v1 → v2 is an identity function, and deliberately so. Every v1 document is already a valid
   * v2 one: v1 held only `type: 'practice'` sessions, and those are unchanged.
   *
   * The bump is not for the data. It is so the **currently deployed build** refuses to touch a
   * document containing Trackman sessions, which its `checkSession()` would reject as corrupt.
   * `FutureSchemaError` then does the right thing: refuse, don't quarantine, say "update the site".
   */
  1: (doc) => doc,
}
```

Change `PracticeSession[]` to `Session[]` in the return type cast at the bottom of `migrate()`.

- [ ] **Step 5: Widen the storage seam**

In `repository.ts` and `local.ts`, replace `PracticeSession` with `Session` in `StoreDocument.sessions`, `listSessions()`, and `saveSession()`. No logic changes — the id-keyed upsert already works for both types.

- [ ] **Step 6: Run the full suite**

Run: `npm test` then `npm run check`. Both PASS. Fix any call site the widening broke.

- [ ] **Step 7: Commit**

```bash
git add src/lib/domain/types.ts src/lib/storage/
git commit   # "Widen the store to hold Trackman sessions at schema v2"
```

---

## Task 3: Validate Trackman sessions on import

**Files:**
- Modify: `src/lib/storage/transfer.ts`
- Modify: `src/lib/storage/transfer.test.ts`

**Interfaces:**
- Consumes: `Session`, `TrackmanSession`, `ClubPath` (Task 2); `isClub`, `compareClubs` (Task 1).
- Produces: `checkTrackmanSession(raw: unknown, where: string): TrackmanSession` — exported, because `ingest/published.ts` (Task 6) validates the fetched file with the same function. One validator, one voice.

`checkSession()` currently rejects anything where `type !== 'practice'`. The branch must happen **before** that check, not after.

- [ ] **Step 1: Write the failing tests**

```ts
const VALID_TRACKMAN = {
  id: 't1', type: 'trackman', date: '2026-07-27', source: 'api',
  clubs: [{ club: 'DRIVER', typical: -7.5, best: -1.2, n: 26 }],
}
const doc = (sessions: unknown[]) => ({ schemaVersion: 2, sessions, settings: {} })

it('accepts a Trackman session', () => {
  expect(parseDocument(doc([VALID_TRACKMAN])).sessions[0]).toEqual(VALID_TRACKMAN)
})

it('keeps a positive club path as typed', () => {
  // A path of +3 is in-to-out. Real, if unlikely. Never coerce the sign.
  const s = { ...VALID_TRACKMAN, clubs: [{ club: 'IRON7', typical: 3.1, best: 0.4 }] }
  expect((parseDocument(doc([s])).sessions[0] as TrackmanSession).clubs[0].typical).toBe(3.1)
})

it('rejects an unknown club', () => {
  const s = { ...VALID_TRACKMAN, clubs: [{ club: 'SPOON', typical: -1, best: -1 }] }
  expect(() => parseDocument(doc([s]))).toThrow(InvalidImportError)
})

it('rejects a session with no clubs', () => {
  expect(() => parseDocument(doc([{ ...VALID_TRACKMAN, clubs: [] }]))).toThrow(InvalidImportError)
})

it('rejects the same club twice in one session', () => {
  const s = { ...VALID_TRACKMAN, clubs: [
    { club: 'DRIVER', typical: -1, best: -1 }, { club: 'DRIVER', typical: -2, best: -2 },
  ] }
  expect(() => parseDocument(doc([s]))).toThrow(/twice/)
})

it('rejects an unknown source', () => {
  expect(() => parseDocument(doc([{ ...VALID_TRACKMAN, source: 'guess' }]))).toThrow(InvalidImportError)
})

it('rejects a path outside the plausible range', () => {
  const s = { ...VALID_TRACKMAN, clubs: [{ club: 'DRIVER', typical: -400, best: -1 }] }
  expect(() => parseDocument(doc([s]))).toThrow(InvalidImportError)
})

it('rejects a non-integer shot count', () => {
  const s = { ...VALID_TRACKMAN, clubs: [{ club: 'DRIVER', typical: -1, best: -1, n: 2.5 }] }
  expect(() => parseDocument(doc([s]))).toThrow(InvalidImportError)
})

it('rejects an unknown session type by name', () => {
  expect(() => parseDocument(doc([{ ...VALID_TRACKMAN, type: 'round' }]))).toThrow(/round/)
})

it('still merges by id across both types', () => {
  const merged = mergeDocuments(
    { schemaVersion: 2, sessions: [VALID_TRACKMAN as Session], settings: {} },
    { schemaVersion: 2, sessions: [{ ...VALID_TRACKMAN, notes: 'edited' } as Session], settings: {} },
  )
  expect(merged.doc.sessions).toHaveLength(1)
  expect(merged.summary).toEqual({ added: 0, updated: 1 })
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/lib/storage/transfer.test.ts` → FAIL, "is not a practice session".

- [ ] **Step 3: Implement the branch**

Rename the existing `checkSession` to `checkPracticeSession`, then add:

```ts
// MAX_PATH_DEGREES is imported from `domain/clubs.ts` (Task 1), not restated here — the form
// validator in Task 8 checks against the same bound, and a bound stated twice will drift.

/** Exported: `ingest/published.ts` validates the fetched file with this same function, so an
 *  imported file and a published one are held to identical standards and worded identically. */
export function checkTrackmanSession(raw: unknown, where: string): TrackmanSession {
  if (!isRecord(raw)) reject(`${where} is not an object.`)
  if (typeof raw.id !== 'string' || raw.id === '') reject(`${where} has no id.`)
  if (typeof raw.date !== 'string' || parseISODate(raw.date) === null) {
    reject(`${where} has an invalid date.`)
  }
  if (raw.source !== 'manual' && raw.source !== 'api') reject(`${where} has an unknown source.`)
  if (!Array.isArray(raw.clubs) || raw.clubs.length === 0) {
    reject(`${where} has no club-path readings.`)
  }
  if (raw.notes !== undefined && typeof raw.notes !== 'string') reject(`${where} has invalid notes.`)

  const seen = new Set<Club>()
  const clubs: ClubPath[] = raw.clubs.map((entry, i) => {
    const what = `${where}, club ${i + 1}`
    if (!isRecord(entry)) reject(`${what} is not an object.`)
    if (!isClub(entry.club)) reject(`${what} names a club this app does not know.`)
    if (seen.has(entry.club)) reject(`${where} lists ${entry.club} twice.`)
    seen.add(entry.club)

    // Signed, always. A positive path is in-to-out — real, if unlikely. Never coerce it.
    for (const key of ['typical', 'best'] as const) {
      const value = entry[key]
      if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > MAX_PATH_DEGREES) {
        reject(`${what} has an implausible ${key} club path.`)
      }
    }
    if (entry.n !== undefined && (typeof entry.n !== 'number' || !Number.isInteger(entry.n) || entry.n < 1)) {
      reject(`${what} has an invalid shot count.`)
    }

    const path: ClubPath = {
      club: entry.club,
      typical: entry.typical as number,
      best: entry.best as number,
    }
    if (entry.n !== undefined) path.n = entry.n as number
    return path
  })
  clubs.sort((a, b) => compareClubs(a.club, b.club))

  const drillsWorked = checkDrillIds(raw.drillsWorked, where)
  const session: TrackmanSession = {
    id: raw.id,
    type: 'trackman',
    date: raw.date as ISODate,
    clubs,
    source: raw.source,
  }
  if (drillsWorked) session.drillsWorked = drillsWorked
  if (typeof raw.notes === 'string' && raw.notes !== '') session.notes = raw.notes
  return session
}

function checkDrillIds(raw: unknown, where: string): DrillId[] | undefined {
  if (raw === undefined) return undefined
  if (!Array.isArray(raw)) reject(`${where} has an invalid drills-worked list.`)
  return raw.map((id) => {
    if (typeof id !== 'string' || !DRILL_IDS.has(id)) {
      reject(`${where} names a drill that does not exist.`)
    }
    return id as DrillId
  })
}

function checkSession(raw: unknown, index: number): Session {
  const where = `session ${index + 1}`
  if (!isRecord(raw)) reject(`${where} is not an object.`)
  if (raw.type === 'trackman') return checkTrackmanSession(raw, where)
  if (raw.type === 'practice') return checkPracticeSession(raw, where)
  reject(`${where} has an unknown type "${String(raw.type)}".`)
}
```

`checkPracticeSession` takes `where` as a parameter now rather than deriving it from an index. Update its body's first two lines accordingly and drop its own `type !== 'practice'` check, which `checkSession` now owns.

- [ ] **Step 4: Run and confirm PASS**

Run: `npm test && npm run check`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/storage/transfer.ts src/lib/storage/transfer.test.ts
git commit   # "Validate Trackman sessions on import"
```

---

## Task 4: Aggregate strokes into per-club readings

**Files:**
- Create: `src/lib/ingest/aggregate.ts`
- Create: `src/lib/ingest/aggregate.test.ts`
- Create: `src/lib/ingest/source.ts`

**Interfaces:**
- Consumes: `normaliseClub`, `compareClubs` (Task 1); `ClubPath`, `TrackmanSession` (Task 2); `resolveISODate` from `domain/today.ts`.
- Produces: `interface RawStroke { club?: string | null; time?: string | null; measurement?: { clubPath?: number | null } | null }`, `interface RawActivity { id: string; time: string; strokes?: RawStroke[] | null }`, `aggregateActivity(activity: RawActivity, onUnknownClub?: (name: string) => void): TrackmanSession | null`, `aggregateActivities(activities: RawActivity[], onUnknownClub?: (name: string) => void): TrackmanSession[]`, `interface TrackmanSource`.

The `onUnknownClub` callback is how a club nobody has hit before gets noticed. `normaliseClub` returns `null` rather than guessing at a spelling, so without a callback the stroke would vanish silently — Task 11's script turns each one into a `::warning::` naming the exact string.

This module is the one imported by **both** the Node script and the browser. Everything in it is pure.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { aggregateActivities, aggregateActivity, type RawActivity } from './aggregate'

const stroke = (club: string | null, clubPath: number | null, time = '2026-07-27T08:00:00Z') =>
  ({ club, time, measurement: { clubPath } })

const activity = (strokes: unknown[], time = '2026-07-27T08:00:51.581Z'): RawActivity =>
  ({ id: 'act-1', time, strokes } as RawActivity)

describe('aggregateActivity', () => {
  it('averages per club and never across clubs', () => {
    const s = aggregateActivity(activity([
      stroke('Driver', -8), stroke('Driver', -6),
      stroke('7Iron', -2),
    ]))!
    expect(s.clubs).toEqual([
      { club: 'DRIVER', typical: -7, best: -6, n: 2 },
      { club: 'IRON7', typical: -2, best: -2, n: 1 },
    ])
  })

  it('drops strokes with a null clubPath — 976 of 5,877 in the real data', () => {
    const s = aggregateActivity(activity([
      stroke('Driver', -8), stroke('Driver', null), stroke('Driver', -6),
    ]))!
    expect(s.clubs[0]).toEqual({ club: 'DRIVER', typical: -7, best: -6, n: 2 })
  })

  it('drops strokes with a null measurement object, though the live data has none', () => {
    // The guard must not depend on that staying true.
    const s = aggregateActivity(activity([
      stroke('Driver', -8), { club: 'Driver', time: '', measurement: null },
    ]))!
    expect(s.clubs[0].n).toBe(1)
  })

  it('drops strokes with no club', () => {
    const s = aggregateActivity(activity([stroke('Driver', -8), stroke(null, -2)]))!
    expect(s.clubs).toHaveLength(1)
  })

  it('drops strokes whose club it cannot map, rather than guessing', () => {
    const s = aggregateActivity(activity([stroke('Driver', -8), stroke('3Hybrid', -2)]))!
    expect(s.clubs).toHaveLength(1)
  })

  it('reports an unmapped club by its exact spelling instead of losing it silently', () => {
    const seen: string[] = []
    aggregateActivity(activity([stroke('Driver', -8), stroke('3Hybrid', -2)]), (n) => seen.push(n))
    expect(seen).toEqual(['3Hybrid'])
  })

  it('returns null when nothing was measured', () => {
    expect(aggregateActivity(activity([stroke('Driver', null)]))).toBeNull()
    expect(aggregateActivity(activity([]))).toBeNull()
    expect(aggregateActivity(activity(null as never))).toBeNull()
  })

  it('takes the Sydney date, not the UTC one', () => {
    // 2026-07-27T14:30Z is 00:30 on the 28th in Sydney. 10 of 91 real sessions cross this line.
    const s = aggregateActivity(activity([stroke('Driver', -8)], '2026-07-27T14:30:00Z'))!
    expect(s.date).toBe('2026-07-28')
  })

  it('picks best as the value closest to neutral, on both sides of the band', () => {
    const out = aggregateActivity(activity([stroke('Driver', -8), stroke('Driver', -1.2)]))!
    expect(out.clubs[0].best).toBe(-1.2)
    // Overshooting is a fault: +1 beats +5, and a Math.max "best" would get this backwards.
    const over = aggregateActivity(activity([stroke('Driver', 5), stroke('Driver', 1)]))!
    expect(over.clubs[0].best).toBe(1)
    const across = aggregateActivity(activity([stroke('Driver', -3), stroke('Driver', 2)]))!
    expect(across.clubs[0].best).toBe(2)
  })

  it('orders clubs by the bag, not by shot count', () => {
    const s = aggregateActivity(activity([
      stroke('SandWedge', -7), stroke('SandWedge', -7), stroke('Driver', -8),
    ]))!
    expect(s.clubs.map((c) => c.club)).toEqual(['DRIVER', 'SAND_WEDGE'])
  })

  it('rounds to two decimals, so the committed file has no float noise', () => {
    const s = aggregateActivity(activity([stroke('Driver', -7.005), stroke('Driver', -7.004)]))!
    expect(s.clubs[0].typical).toBe(-7.0)
  })

  it('stamps the activity id and api provenance', () => {
    const s = aggregateActivity(activity([stroke('Driver', -8)]))!
    expect(s.id).toBe('act-1')
    expect(s.source).toBe('api')
    expect(s.type).toBe('trackman')
  })
})

describe('aggregateActivities', () => {
  it('drops unmeasured sessions and sorts oldest first', () => {
    const out = aggregateActivities([
      activity([stroke('Driver', -8)], '2026-07-27T08:00:00Z'),
      activity([stroke('Driver', null)], '2026-07-20T08:00:00Z'),
      { ...activity([stroke('Driver', -4)], '2026-07-13T08:00:00Z'), id: 'act-3' },
    ])
    expect(out.map((s) => s.date)).toEqual(['2026-07-13', '2026-07-27'])
  })
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/lib/ingest/aggregate.test.ts` → FAIL, module not found.

- [ ] **Step 3: Write `source.ts`**

```ts
import type { ISODate, TrackmanSession } from '../domain/types'

/**
 * The ingest seam, as specified in `docs/architecture.md` §4. `ApiSource` implements it.
 *
 * Manual entry deliberately does **not** get a `ManualSource`. It is a form in the browser;
 * `ApiSource` runs in Node under Actions. The two are never polymorphically substituted, so an
 * interface spanning them would be indirection that does nothing.
 */
export interface TrackmanSource {
  name: string
  isAvailable(): Promise<boolean>
  fetchSince(date: ISODate): Promise<TrackmanSession[]>
}
```

- [ ] **Step 4: Write `aggregate.ts`**

```ts
import { compareClubs, normaliseClub, type Club } from '../domain/clubs'
import { resolveISODate } from '../domain/today'
import type { ClubPath, TrackmanSession } from '../domain/types'

/** The shape the GraphQL query returns. Every field is optional because the API is undocumented
 *  and we do not control it — treat anything missing as absent, never as zero. */
export interface RawStroke {
  club?: string | null
  time?: string | null
  measurement?: { clubPath?: number | null } | null
}

export interface RawActivity {
  id: string
  time: string
  strokes?: RawStroke[] | null
}

/** Two decimals is the precision Trackman reports at; more is float noise in a committed file. */
function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Turn one activity into one session, or `null` if nothing in it was measured.
 *
 * **The filter is the point of this function.** In the 13-month backfill, 976 of 5,877 strokes
 * carry a `null` clubPath and 3 carry no club — 16.6% unusable. They are not zeros, and letting
 * them through would pull every average toward neutral and fake progress.
 *
 * Note where the `null` actually sits: `measurement` itself was never null in the real data, only
 * `measurement.clubPath`. Both are guarded, because that is an observation about today's data and
 * not a guarantee.
 */
export function aggregateActivity(activity: RawActivity): TrackmanSession | null {
  const byClub = new Map<Club, number[]>()

  for (const stroke of activity.strokes ?? []) {
    const path = stroke?.measurement?.clubPath
    if (path === null || path === undefined || !Number.isFinite(path)) continue
    if (!stroke.club) continue
    const club = normaliseClub(stroke.club)
    if (club === null) continue
    const values = byClub.get(club)
    if (values) values.push(path)
    else byClub.set(club, [path])
  }

  if (byClub.size === 0) return null

  const clubs: ClubPath[] = [...byClub.entries()]
    .map(([club, values]) => ({
      club,
      typical: round2(values.reduce((a, b) => a + b, 0) / values.length),
      // Closest to neutral. The target is a band centred on zero, so overshooting counts against
      // you — `+5` must lose to `+1`. A `Math.max` "best" would reward the fault.
      best: round2(values.reduce((a, b) => (Math.abs(b) < Math.abs(a) ? b : a))),
      n: values.length,
    }))
    .sort((a, b) => compareClubs(a.club, b.club))

  return {
    id: activity.id,
    type: 'trackman',
    // The Sydney date, reusing the plan's own rule. 10 of 91 real sessions fall on a different
    // UTC date — deriving it from `time.slice(0, 10)` misfiles one session in ten.
    date: resolveISODate(new Date(activity.time)),
    clubs,
    source: 'api',
  }
}

/** Oldest first, so the committed file reads as a timeline and diffs append at the end. */
export function aggregateActivities(activities: RawActivity[]): TrackmanSession[] {
  return activities
    .map(aggregateActivity)
    .filter((s): s is TrackmanSession => s !== null)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
}
```

- [ ] **Step 5: Run and confirm PASS**

Run: `npx vitest run src/lib/ingest/aggregate.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/ingest/
git commit   # "Aggregate Trackman strokes per club, filtering the 17% with no reading"
```

---

## Task 5: The merge rules

**Files:**
- Create: `src/lib/ingest/merge.ts`
- Create: `src/lib/ingest/merge.test.ts`

**Interfaces:**
- Consumes: `Session`, `TrackmanSession`, `isTrackman` (Task 2).
- Produces: `interface TrackmanMergeResult { sessions: Session[]; added: number; updated: number; skipped: number; changed: boolean }`, `mergeTrackmanSessions(current: Session[], incoming: TrackmanSession[]): TrackmanMergeResult`.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import type { Session, TrackmanSession } from '../domain/types'
import { mergeTrackmanSessions } from './merge'

const api = (id: string, date: string, typical = -7): TrackmanSession => ({
  id, type: 'trackman', date, source: 'api',
  clubs: [{ club: 'DRIVER', typical, best: -1, n: 10 }],
})
const manual = (id: string, date: string): TrackmanSession => ({
  ...api(id, date), source: 'manual', clubs: [{ club: 'DRIVER', typical: -5, best: -2 }],
})
const practice: Session = {
  id: 'p1', type: 'practice', date: '2026-07-27', location: 'home', entries: [],
}

it('adds new sessions and reports the count', () => {
  const r = mergeTrackmanSessions([], [api('a', '2026-07-27')])
  expect(r.added).toBe(1)
  expect(r.changed).toBe(true)
})

it('is idempotent — re-running changes nothing', () => {
  const first = mergeTrackmanSessions([], [api('a', '2026-07-27')])
  const second = mergeTrackmanSessions(first.sessions, [api('a', '2026-07-27')])
  expect(second).toMatchObject({ added: 0, updated: 0, skipped: 0, changed: false })
  expect(second.sessions).toEqual(first.sessions)
})

it('updates an api session whose numbers changed', () => {
  const first = mergeTrackmanSessions([], [api('a', '2026-07-27', -7)])
  const second = mergeTrackmanSessions(first.sessions, [api('a', '2026-07-27', -6)])
  expect(second).toMatchObject({ updated: 1, changed: true })
  expect((second.sessions[0] as TrackmanSession).clubs[0].typical).toBe(-6)
})

it('never overwrites a session marked manual, even on the same id', () => {
  const stored = [manual('a', '2026-07-27')]
  const r = mergeTrackmanSessions(stored, [api('a', '2026-07-27')])
  expect(r).toMatchObject({ added: 0, updated: 0, skipped: 1, changed: false })
  expect(r.sessions).toEqual(stored)
})

it('skips an import for a date already logged by hand', () => {
  // Otherwise Phase 4 counts the day twice. Reversible: delete the manual record.
  const stored = [manual('typed', '2026-07-27')]
  const r = mergeTrackmanSessions(stored, [api('fetched', '2026-07-27')])
  expect(r).toMatchObject({ added: 0, skipped: 1, changed: false })
  expect(r.sessions).toEqual(stored)
})

it('allows two imported sessions on one date — 23 real dates have more than one', () => {
  const r = mergeTrackmanSessions([], [api('a', '2026-07-22'), api('b', '2026-07-22')])
  expect(r.added).toBe(2)
})

it('leaves practice sessions untouched, including on a colliding date', () => {
  const r = mergeTrackmanSessions([practice], [api('a', '2026-07-27')])
  expect(r.added).toBe(1)
  expect(r.sessions).toContainEqual(practice)
})

it('reports no change when there is nothing to do', () => {
  expect(mergeTrackmanSessions([practice], []).changed).toBe(false)
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/lib/ingest/merge.test.ts`.

- [ ] **Step 3: Write `merge.ts`**

```ts
import { isTrackman, type Session, type TrackmanSession } from '../domain/types'

export interface TrackmanMergeResult {
  sessions: Session[]
  added: number
  updated: number
  /** Left alone because a hand-typed record already covers it. */
  skipped: number
  /** False means nothing needs writing. The caller must not touch storage in that case. */
  changed: boolean
}

/**
 * Merge fetched Trackman sessions into the stored list.
 *
 * Three rules, in order:
 *
 * 1. **Keyed on the activity id**, so re-running is idempotent.
 * 2. **A stored session marked `manual` is never overwritten.** Editing an imported session in
 *    the form flips it to `manual`, which is what gives this rule teeth — without that it would
 *    only protect records nobody had touched.
 * 3. **A date already carrying a manual Trackman session takes no import at all.** Without this,
 *    a day logged by hand and then fetched would be counted twice by every Phase 4 chart. It is
 *    reversible: delete the manual record and the next load brings in the richer one.
 *
 * Never drops anything, in keeping with `mergeDocuments`. `localStorage` is the only copy.
 */
export function mergeTrackmanSessions(
  current: Session[],
  incoming: TrackmanSession[],
): TrackmanMergeResult {
  const byId = new Map(current.map((s) => [s.id, s]))
  const manualDates = new Set(
    current.filter((s) => isTrackman(s) && s.source === 'manual').map((s) => s.date),
  )

  let added = 0
  let updated = 0
  let skipped = 0

  for (const session of incoming) {
    const existing = byId.get(session.id)

    if (existing && isTrackman(existing) && existing.source === 'manual') {
      skipped++
      continue
    }
    if (!existing && manualDates.has(session.date)) {
      skipped++
      continue
    }
    if (!existing) {
      byId.set(session.id, session)
      added++
      continue
    }
    // Only count an update when something actually differs, so a no-op sync writes nothing.
    if (JSON.stringify(existing) !== JSON.stringify(session)) {
      byId.set(session.id, session)
      updated++
    }
  }

  return {
    sessions: [...byId.values()],
    added,
    updated,
    skipped,
    changed: added > 0 || updated > 0,
  }
}
```

- [ ] **Step 4: Run and confirm PASS**

Run: `npx vitest run src/lib/ingest/merge.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ingest/merge.ts src/lib/ingest/merge.test.ts
git commit   # "Merge fetched sessions without ever overwriting a typed one"
```

---

## Task 6: Fetch the published file

**Files:**
- Create: `src/lib/ingest/published.ts`
- Create: `src/lib/ingest/published.test.ts`

**Interfaces:**
- Consumes: `checkTrackmanSession` (Task 3); `TrackmanSession` (Task 2).
- Produces: `PUBLISHED_URL = '/trackman.json'`, `PUBLISHED_FORMAT_VERSION = 1`, `parsePublished(raw: unknown): TrackmanSession[]`, `fetchPublished(fetcher?: typeof fetch): Promise<TrackmanSession[] | null>` — `null` means "nothing published", which is the normal first-run state and never an error.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import { InvalidImportError } from '../storage/transfer'
import { fetchPublished, parsePublished } from './published'

const FILE = {
  version: 1,
  sessions: [{
    id: 'a', type: 'trackman', date: '2026-07-27', source: 'api',
    clubs: [{ club: 'DRIVER', typical: -7.5, best: -1.2, n: 26 }],
  }],
}

const respond = (body: string, init: ResponseInit = {}) =>
  (async () => new Response(body, {
    status: 200, headers: { 'content-type': 'application/json' }, ...init,
  })) as unknown as typeof fetch

it('parses a published file', () => {
  expect(parsePublished(FILE)).toHaveLength(1)
})

it('stamps api provenance regardless of what the file claims', () => {
  const spoofed = { ...FILE, sessions: [{ ...FILE.sessions[0], source: 'manual' }] }
  expect(parsePublished(spoofed)[0].source).toBe('api')
})

it('rejects a file from a newer format', () => {
  expect(() => parsePublished({ ...FILE, version: 2 })).toThrow(InvalidImportError)
})

it('rejects a malformed record rather than importing the rest', () => {
  const bad = { ...FILE, sessions: [FILE.sessions[0], { id: 'b', type: 'trackman' }] }
  expect(() => parsePublished(bad)).toThrow(InvalidImportError)
})

it('treats a missing file as nothing published', async () => {
  expect(await fetchPublished(respond('', { status: 404 }))).toBeNull()
})

it('treats the SPA 404 shim as nothing published, not as corruption', async () => {
  // Pages serves 404.html for an absent path, so this arrives as HTML with a 404 status.
  const shim = respond('<!doctype html><div id="app"></div>', {
    status: 404, headers: { 'content-type': 'text/html' },
  })
  expect(await fetchPublished(shim)).toBeNull()
})

it('treats an HTML body with a 200 status as nothing published too', async () => {
  const html = respond('<!doctype html>', { headers: { 'content-type': 'text/html' } })
  expect(await fetchPublished(html)).toBeNull()
})

it('returns null when the network is unavailable', async () => {
  const offline = (async () => { throw new TypeError('Failed to fetch') }) as unknown as typeof fetch
  expect(await fetchPublished(offline)).toBeNull()
})

it('returns null rather than throwing when the file is corrupt', async () => {
  expect(await fetchPublished(respond('{"version":1,"sessions":[{}]}'))).toBeNull()
})

it('returns the sessions when the file is good', async () => {
  expect(await fetchPublished(respond(JSON.stringify(FILE)))).toHaveLength(1)
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/lib/ingest/published.test.ts`.

- [ ] **Step 3: Write `published.ts`**

```ts
import type { TrackmanSession } from '../domain/types'
import { InvalidImportError, checkTrackmanSession } from '../storage/transfer'

/** Same origin — the file ships in `dist/` from `public/`. No external host is involved. */
export const PUBLISHED_URL = '/trackman.json'

/** The *file format*, versioned independently of the store's `schemaVersion`. */
export const PUBLISHED_FORMAT_VERSION = 1

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Validated with the same function `transfer.ts` uses for hand-picked imports: one validator,
 *  one voice, and a published file held to exactly the standard an imported one is. */
export function parsePublished(raw: unknown): TrackmanSession[] {
  if (!isRecord(raw) || !Array.isArray(raw.sessions)) {
    throw new InvalidImportError('That file is not a Trackman export: it has no sessions.')
  }
  if (raw.version !== PUBLISHED_FORMAT_VERSION) {
    throw new InvalidImportError(
      `That Trackman file is format version ${String(raw.version)}; this build reads ` +
        `${PUBLISHED_FORMAT_VERSION}. Update the site.`,
    )
  }
  return raw.sessions.map((session, i) => ({
    ...checkTrackmanSession(session, `Trackman session ${i + 1}`),
    // Provenance is stamped here, never taken from the file. A published record is by definition
    // fetched, and trusting the file's own claim would let it mark itself hand-typed and so
    // become permanently unoverwritable by the merge rules.
    source: 'api' as const,
  }))
}

/**
 * `null` means "nothing published", which is the normal state before the first workflow run and
 * is never an error.
 *
 * **This must never throw and never block app load.** The plan page needs no Trackman data at all,
 * and the whole integration is built on an undocumented interface that is assumed to break.
 */
export async function fetchPublished(
  fetcher: typeof fetch = globalThis.fetch,
): Promise<TrackmanSession[] | null> {
  try {
    const res = await fetcher(PUBLISHED_URL, { cache: 'no-cache' })
    // Pages serves the SPA 404 shim for an absent path, so a missing file arrives as *HTML with a
    // 404 status*. Checking `res.ok` alone would then hand `JSON.parse` a page of markup and
    // report corruption where the truth is simply "not published yet".
    if (!res.ok) return null
    if (!(res.headers.get('content-type') ?? '').includes('json')) return null
    return parsePublished(await res.json())
  } catch {
    // Offline, blocked, malformed — all the same answer here: carry on without it.
    return null
  }
}
```

- [ ] **Step 4: Run and confirm PASS**

Run: `npx vitest run src/lib/ingest/published.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ingest/published.ts src/lib/ingest/published.test.ts
git commit   # "Read the published Trackman file without ever blocking app load"
```

---

## Task 7: Wire the sync into the store

**Files:**
- Modify: `src/lib/storage/repository.ts`
- Modify: `src/lib/storage/local.ts`
- Modify: `src/lib/storage/local.test.ts`
- Modify: `src/lib/stores/sessions.svelte.ts`
- Modify: `src/App.svelte`
- Modify: `src/lib/components/DataPanel.svelte`

**Interfaces:**
- Consumes: `mergeTrackmanSessions` (Task 5), `fetchPublished` (Task 6).
- Produces: `Repository.mergeTrackman(incoming: TrackmanSession[]): Promise<TrackmanMergeResult>`; on the store, `sessions.practice`, `sessions.trackman`, `sessions.syncMessage`, `sessions.syncPublished(): Promise<void>`.

- [ ] **Step 1: Write the failing test**

Add to `src/lib/storage/local.test.ts`:

```ts
it('merges trackman sessions and does not write when nothing changed', async () => {
  const storage = new FakeStorage()
  const repo = new LocalStorageRepo(storage)
  const incoming = [{
    id: 'a', type: 'trackman' as const, date: '2026-07-27', source: 'api' as const,
    clubs: [{ club: 'DRIVER' as const, typical: -7.5, best: -1.2, n: 26 }],
  }]

  expect(await repo.mergeTrackman(incoming)).toMatchObject({ added: 1, changed: true })
  const afterFirst = storage.getItem(STORAGE_KEY)

  expect(await repo.mergeTrackman(incoming)).toMatchObject({ added: 0, changed: false })
  expect(storage.getItem(STORAGE_KEY)).toBe(afterFirst)
})

it('does not throw when storage is unavailable and there is nothing to merge', async () => {
  const repo = new LocalStorageRepo(null)
  await expect(repo.mergeTrackman([])).resolves.toMatchObject({ changed: false })
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/lib/storage/local.test.ts`.

- [ ] **Step 3: Add `mergeTrackman` to the interface and implementation**

In `repository.ts`:

```ts
  /**
   * Fold fetched Trackman sessions in. Adds and updates; never drops, and never overwrites a
   * session marked `manual`. Writes only when something actually changed.
   */
  mergeTrackman(incoming: TrackmanSession[]): Promise<TrackmanMergeResult>
```

In `local.ts`:

```ts
  async mergeTrackman(incoming: TrackmanSession[]): Promise<TrackmanMergeResult> {
    const doc = this.read()
    const result = mergeTrackmanSessions(doc.sessions, incoming)
    // Writing only on a real change keeps a no-op sync off `localStorage` on every page load, and
    // keeps it from throwing when the store is in a fault state but had nothing to do anyway.
    if (!result.changed) return result
    doc.sessions = result.sessions
    this.write(doc)
    return result
  }
```

- [ ] **Step 4: Extend the store**

In `sessions.svelte.ts`:

```ts
  /** Practice sessions only, newest first. */
  get practice(): PracticeSession[] {
    return this.list.filter(isPractice)
  }

  /** Trackman sessions only, newest first. */
  get trackman(): TrackmanSession[] {
    return this.list.filter(isTrackman)
  }

  /** What the last sync did, in a sentence. Null until one has run and changed something. */
  syncMessage = $state<string | null>(null)

  /**
   * Fold in whatever the scheduled workflow has published.
   *
   * **Never awaited by the caller and never allowed to throw.** The site must render with the
   * integration broken, switched off, or never set up — the plan page needs none of this data.
   */
  async syncPublished(): Promise<void> {
    try {
      const incoming = await fetchPublished()
      if (incoming === null || incoming.length === 0) return
      const result = await this.#repo.mergeTrackman(incoming)
      if (!result.changed && result.skipped === 0) return
      await this.load()
      const parts: string[] = []
      if (result.added) parts.push(`${result.added} new`)
      if (result.updated) parts.push(`${result.updated} updated`)
      if (result.skipped) parts.push(`${result.skipped} skipped, already logged by hand`)
      this.syncMessage = `Trackman: ${parts.join(' · ')}.`
    } catch {
      // Silent by design. Manual entry is the baseline and is unaffected.
    }
  }
```

- [ ] **Step 5: Fire it on mount**

In `App.svelte`, alongside the existing `sessions.load()`, add `void sessions.syncPublished()` **after** the load resolves — deliberately not awaited, so a slow or hanging fetch cannot delay first paint.

- [ ] **Step 6: Surface it**

In `DataPanel.svelte`, render `sessions.syncMessage` when non-null, in the same `.sub`/status treatment the panel already uses — Space Mono, `--dim`. Silence would make the skip rule look like data loss.

- [ ] **Step 7: Run everything**

Run: `npm test && npm run check`.

- [ ] **Step 8: Commit**

```bash
git add src/lib/storage/ src/lib/stores/ src/App.svelte src/lib/components/DataPanel.svelte
git commit   # "Fold published Trackman sessions into the store on load"
```

---

## Task 8: The Trackman draft

**Files:**
- Create: `src/lib/domain/trackman.ts`
- Create: `src/lib/domain/trackman.test.ts`

**Interfaces:**
- Consumes: `CLUBS`, `KPI_CLUB`, `isClub` (Task 1); `TrackmanSession`, `ClubPath` (Task 2); `newSessionId` from `domain/session.ts`; `WEEK` from `domain/plan.ts`.
- Produces:
  ```ts
  interface ClubRowDraft { club: Club; best: string; typical: string; shots: string }
  interface TrackmanDraft { id: string; date: ISODate; rows: ClubRowDraft[]; drills: DrillId[]; notes: string; source: 'manual' | 'api' }
  trackmanDraft(date: ISODate): TrackmanDraft
  draftFromTrackman(session: TrackmanSession): TrackmanDraft
  emptyRow(taken: Club[]): ClubRowDraft
  toTrackmanSession(draft: TrackmanDraft): TrackmanSession
  validateTrackmanDraft(draft: TrackmanDraft): string[]
  ```

Numbers are held as **strings** in the draft, exactly as `SessionDraft` holds what the form binds to. A `<input type="number">` binding to a numeric rune turns a half-typed `-` into `NaN` and clears the box under the user's fingers.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest'
import {
  draftFromTrackman, emptyRow, toTrackmanSession, trackmanDraft, validateTrackmanDraft,
} from './trackman'

const draft = (overrides = {}) => ({
  ...trackmanDraft('2026-07-27'),
  rows: [{ club: 'DRIVER' as const, best: '-1.2', typical: '-7.5', shots: '26' }],
  ...overrides,
})

it('starts on the KPI club with one row', () => {
  const d = trackmanDraft('2026-07-27')
  expect(d.rows).toHaveLength(1)
  expect(d.rows[0].club).toBe('DRIVER')
  expect(d.source).toBe('manual')
})

it('pre-ticks Monday’s scheduled drills', () => {
  expect(trackmanDraft('2026-07-27').drills.length).toBeGreaterThan(0)
})

it('offers the next unused club when a row is added', () => {
  expect(emptyRow(['DRIVER']).club).toBe('WOOD3')
})

it('converts a draft, dropping the optional shot count when blank', () => {
  const s = toTrackmanSession(draft({ rows: [
    { club: 'DRIVER', best: '-1.2', typical: '-7.5', shots: '' },
  ] }))
  expect(s.clubs[0]).toEqual({ club: 'DRIVER', typical: -7.5, best: -1.2 })
  expect(s.type).toBe('trackman')
  expect(s.source).toBe('manual')
})

it('keeps a positive path as typed', () => {
  const s = toTrackmanSession(draft({ rows: [
    { club: 'IRON7', best: '0.4', typical: '3.1', shots: '' },
  ] }))
  expect(s.clubs[0].typical).toBe(3.1)
})

it('orders clubs by the bag', () => {
  const s = toTrackmanSession(draft({ rows: [
    { club: 'SAND_WEDGE', best: '-1', typical: '-2', shots: '' },
    { club: 'DRIVER', best: '-1', typical: '-2', shots: '' },
  ] }))
  expect(s.clubs.map((c) => c.club)).toEqual(['DRIVER', 'SAND_WEDGE'])
})

it('flips an imported session to manual once it is edited', () => {
  const imported = {
    id: 'a', type: 'trackman' as const, date: '2026-07-27', source: 'api' as const,
    clubs: [{ club: 'DRIVER' as const, typical: -7.5, best: -1.2, n: 26 }],
  }
  const edited = toTrackmanSession(draftFromTrackman(imported))
  expect(edited.source).toBe('manual')
  expect(edited.id).toBe('a')
  // The count came off the bay, not off the keyboard — keep it through an edit.
  expect(edited.clubs[0].n).toBe(26)
})

it('reports problems in form order', () => {
  const problems = validateTrackmanDraft(draft({ date: 'nonsense', rows: [] }))
  expect(problems[0]).toMatch(/date/i)
  expect(problems[1]).toMatch(/club/i)
})

it('rejects a duplicate club', () => {
  const problems = validateTrackmanDraft(draft({ rows: [
    { club: 'DRIVER', best: '-1', typical: '-2', shots: '' },
    { club: 'DRIVER', best: '-1', typical: '-2', shots: '' },
  ] }))
  expect(problems.join(' ')).toMatch(/twice/i)
})

it('rejects a blank, non-numeric, or implausible path', () => {
  for (const typical of ['', 'about six', '-400']) {
    const problems = validateTrackmanDraft(draft({ rows: [
      { club: 'DRIVER', best: '-1', typical, shots: '' },
    ] }))
    expect(problems.length).toBeGreaterThan(0)
  }
})

it('accepts a blank shot count but rejects a fractional one', () => {
  expect(validateTrackmanDraft(draft())).toEqual([])
  const problems = validateTrackmanDraft(draft({ rows: [
    { club: 'DRIVER', best: '-1', typical: '-2', shots: '2.5' },
  ] }))
  expect(problems.join(' ')).toMatch(/shot/i)
})
```

- [ ] **Step 2: Run and confirm failure**

Run: `npx vitest run src/lib/domain/trackman.test.ts`.

- [ ] **Step 3: Write `trackman.ts`**

Implement exactly the interface block above. Key points the tests pin down:

- `trackmanDraft(date)` seeds one row on `KPI_CLUB`, `drills` from `WEEK.mon.drills`, `source: 'manual'`, a fresh `newSessionId()`.
- `emptyRow(taken)` returns the first club in `CLUBS` not in `taken`, falling back to the last.
- `draftFromTrackman()` preserves `id` and each row's `n` as `shots`, because a count that came off the bay survives an edit — but sets nothing about `source`.
- `toTrackmanSession()` **always emits `source: 'manual'`** (D21), parses with `Number.parseFloat`, omits `n` when `shots` is blank, and sorts rows with `compareClubs`.
- `validateTrackmanDraft()` returns problems in form order: date, then "add at least one club", then per row — duplicate club, each of `typical`/`best` finite and within `MAX_PATH_DEGREES`, `shots` blank or a positive integer. **Import `MAX_PATH_DEGREES` from `domain/clubs.ts`** (Task 1), the same constant `transfer.ts` checks against.

- [ ] **Step 4: Run and confirm PASS**

Run: `npx vitest run src/lib/domain/trackman.test.ts && npm run check`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/trackman.ts src/lib/domain/trackman.test.ts
git commit   # "Add the Trackman session draft and its validation"
```

---

## Task 9: The Trackman form

**Files:**
- Create: `src/lib/components/ClubPathRow.svelte`
- Create: `src/lib/components/TrackmanForm.svelte`

**Interfaces:**
- Consumes: everything from Task 8; `sessions` store; `DRILLS`.
- Produces: `<TrackmanForm editing={TrackmanSession | null} onDone={() => void} />`.

`TrackmanForm` mirrors `SessionForm.svelte` — same panel treatment, same `.field`/`.lab` structure, same problems list, same `.saved` status line, same `44px`/`52px` targets. **Read `SessionForm.svelte` first and match it**; this is not a place for a new visual idea.

- [ ] **Step 1: Build `ClubPathRow.svelte`**

One row: a club `<select>`, `best`, `typical`, and an optional `shots` box, plus a remove button shown only when the row is removable.

```svelte
<script lang="ts">
  import { CLUBS } from '../domain/clubs'
  import type { ClubRowDraft } from '../domain/trackman'

  let { row = $bindable(), removable, onremove }:
    { row: ClubRowDraft; removable: boolean; onremove: () => void } = $props()
</script>
```

Requirements:
- Every input is `inputmode="decimal"` and `type="text"`, not `type="number"`. A number input strips a lone `-` mid-typing and fights a signed value, which is the one thing this app must never lose.
- Labels are Space Mono, `--dim`, uppercase — `CLUB`, `BEST`, `TYPICAL`, `SHOTS`. `SHOTS` is labelled *optional*.
- Grid: `grid-template-columns: minmax(0, 1.2fr) repeat(3, minmax(0, 1fr)) auto`, collapsing to two columns under `760px` (scoped to this component).
- Every control at least `44px` tall. The remove button carries `aria-label="Remove {clubInfo(row.club).name}"`.

- [ ] **Step 2: Build `TrackmanForm.svelte`**

Fields in order: Date → Clubs (rows + "Add a club") → Drills worked → Notes → actions. A hint line under the Clubs label reads: `Negative is out-to-in. Target is −2° to +2° — overshooting counts against you.` (prose, Inter, `--dim`).

"Add a club" is disabled once every club has a row. Save calls `validateTrackmanDraft`, then `sessions.save(toTrackmanSession(draft))`, catching and surfacing a repository error exactly as `SessionForm` does.

- [ ] **Step 3: Check it compiles and matches the system**

Run: `npm run check`. Then `npm run dev` and confirm by eye: the panel matches the practice form, a lone `-` can be typed, and every target is thumb-sized at `375px` wide.

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/ClubPathRow.svelte src/lib/components/TrackmanForm.svelte
git commit   # "Add the manual Trackman session form"
```

---

## Task 10: Put it in the log view

**Files:**
- Modify: `src/routes/LogView.svelte`
- Modify: `src/lib/components/RecentSessions.svelte`

- [ ] **Step 1: Add the mode switch**

Two pills, `Practice` / `Trackman`, styled with the existing `.pills` treatment, `role="group"`, `aria-pressed`. Default: `resolveDayKey() === 'mon' ? 'trackman' : 'practice'` — the day the bay is booked, mirroring how `defaultLocation()` already defaults Monday to `sim`.

Keep the existing `{#key}` wrapper pattern for each form, so switching mode or switching the session being edited remounts and the `$state` initialisers stay correct by construction.

Editing dispatches by type: a `TrackmanSession` opens the Trackman form **and switches the mode to match**, otherwise the pills would say "Practice" over a Trackman form.

- [ ] **Step 2: Render Trackman sessions in the list**

`RecentSessions` reads one list of both types. For a Trackman session the summary shows the date, a `TRACKMAN` tag, and the club shorts (`DRIVER · 4I · SW`) where the practice row shows drill ids. The body shows one line per club:

```
DRIVER    typical −7.5°   best −1.2°   26 shots
```

All monospaced. `n` absent renders `—`, never `0`. A `MANUAL` or `API` chip records provenance, using the existing `.tag` treatment — no new colour.

- [ ] **Step 3: Verify**

Run: `npm run check && npm test`, then `npm run dev` — log a Trackman session by hand, confirm it appears, edit it, delete it.

- [ ] **Step 4: Commit**

```bash
git add src/routes/LogView.svelte src/lib/components/RecentSessions.svelte
git commit   # "Log and review Trackman sessions alongside practice ones"
```

---

## Task 11: `ApiSource` and the ingest script

**Files:**
- Create: `src/lib/ingest/api.ts`
- Create: `scripts/trackman-ingest.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `TrackmanSource` (Task 4), `aggregateActivities`, `RawActivity`.
- Produces: `class ApiSource implements TrackmanSource`, constructed as `new ApiSource(refreshToken)`.

- [ ] **Step 1: Add the dependency**

```bash
npm install --save-dev tsx
```

Add to `package.json` scripts: `"ingest": "tsx scripts/trackman-ingest.ts"`.

- [ ] **Step 2: Write `api.ts`**

```ts
const TOKEN_URL = 'https://login.trackmangolf.com/connect/token'
const GRAPHQL_URL = 'https://api.trackmangolf.com/graphql'

/** The public mobile client: authorization_code + PKCE, no client secret. The portal's own
 *  client is confidential and BFF-backed, so it cannot be used from CI. */
const CLIENT_ID = 'old-golf-app.c686e909-5102-45ac-9860-8d0b789073ae'

/** The API pages at 50. The backfill needed two pages for 91 sessions. */
const PAGE_SIZE = 50
```

The query is the one from issue #4, minus `aggregatedMeasurement` — per-club averages are computed
from strokes instead, because that is the only way to get `n`, which #14 requires on every point:

```graphql
query Sessions($from: DateTime!, $to: DateTime!, $skip: Int!) {
  me {
    activities(kinds: [VIRTUAL_RANGE], timeFrom: $from, timeTo: $to, take: 50, skip: $skip) {
      totalCount
      pageInfo { hasNextPage }
      items {
        id time
        ... on VirtualRangeSessionActivity {
          strokeCount
          strokes { club time measurement { clubPath faceAngle faceToPath attackAngle } }
        }
      }
    }
  }
}
```

Rules for this file:

- `isAvailable()` attempts the token exchange and returns a boolean. It **never** includes the token, or any part of it, in a thrown message or a log line.
- `fetchSince(date)` pages until `hasNextPage` is false, then returns `aggregateActivities(items)`.
- A GraphQL `errors` array is a failure, even alongside a 200 — surface the messages, not the request.
- The access token is held in a local `const` and never written anywhere.

- [ ] **Step 3: Write `scripts/trackman-ingest.ts`**

Argument parsing, `ApiSource`, and file writing only — no domain logic, which all lives in tested modules.

- Reads `TRACKMAN_REFRESH_TOKEN` from the environment. Missing → exit 1 with `Set TRACKMAN_REFRESH_TOKEN.` and nothing else.
- `--since YYYY-MM-DD` defaults to 14 days ago, so a missed run self-heals. The idempotent merge makes the overlap free.
- `--out` defaults to `public/trackman.json`.
- **Merges with the file already on disk** rather than replacing it, so a short window never truncates history. Reuses `mergeTrackmanSessions` — the same function the browser uses.
- Writes `{ "version": 1, "sessions": [...] }`, two-space indented, trailing newline. **No `generated` timestamp** — it would change every run and force a commit even when no golf happened. Git already records when.
- Prints a `::warning::` line for every club display string `normaliseClub` could not map, naming the exact spelling, so adding it is a one-line change with the real string in hand. Uses the `onUnknownClub` callback defined in Task 4; de-duplicate the names before printing so one new club does not emit forty warnings.
- Prints a one-line summary: sessions in the file, added, updated.

- [ ] **Step 4: Verify against the live API**

```bash
TRACKMAN_REFRESH_TOKEN="$(node -e "process.stdout.write(require(require('os').homedir()+'/.config/trackman-oauth/tokens.json').refresh_token)")" \
  npm run ingest -- --since 2026-06-01 --out /tmp/trackman-check.json
```

Expected: 8 sessions, no warnings, and every date matching the Sydney dates in the spec §1. **Do not
write into `public/` and do not commit the output** — the backfill is created by the workflow after
the secret is set (spec §10).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ingest/api.ts scripts/trackman-ingest.ts package.json package-lock.json
git commit   # "Fetch Trackman sessions from the API"
```

---

## Task 12: The workflow

**Files:**
- Create: `.github/workflows/trackman.yml`
- Modify: `.github/workflows/deploy.yml`

- [ ] **Step 1: Make the deploy callable**

Add `workflow_call:` to `deploy.yml`'s `on:` block, with a comment explaining why:

```yaml
on:
  push:
    branches: [main]
  workflow_dispatch:
  # Called by trackman.yml after it commits new data. A commit made with GITHUB_TOKEN does not
  # trigger another workflow, so without this the data would sit in the repo unpublished.
  # workflow_call is an explicit invocation by a workflow in this repo — unlike workflow_run,
  # which is why the ban on that trigger still stands.
  workflow_call:
```

Nothing else in `deploy.yml` changes. Its existing `permissions:` block still governs its own triggers; a called workflow takes the calling job's permissions.

- [ ] **Step 2: Write `trackman.yml`**

```yaml
name: Pull Trackman sessions

# schedule and workflow_dispatch ONLY. Never pull_request_target or workflow_run: this repo is
# public, and those triggers run with secret access under attacker-influenced conditions.
on:
  schedule:
    # 13:00 UTC daily — after any Sydney evening bay session. Daily, not weekly: only 31 of the
    # 91 sessions in the backfill were Mondays, so a Monday-only job would miss two thirds.
    - cron: '0 13 * * *'
  workflow_dispatch:
    inputs:
      since:
        description: 'Pull from this date (YYYY-MM-DD). Blank means the last 14 days.'
        required: false
        type: string

# Nothing by default. Each job takes only what it needs.
permissions: {}

concurrency:
  group: trackman
  cancel-in-progress: false

jobs:
  ingest:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    outputs:
      changed: ${{ steps.commit.outputs.changed }}
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4
        with:
          node-version: '22'
          cache: npm
      - run: npm ci

      - name: Pull sessions
        # The token reaches the script through the environment only. Never echoed, never written
        # to a file, never passed through base64 or jq.
        env:
          TRACKMAN_REFRESH_TOKEN: ${{ secrets.TRACKMAN_REFRESH_TOKEN }}
        run: npm run ingest -- ${{ inputs.since && format('--since {0}', inputs.since) || '' }}

      - name: Commit if the data changed
        id: commit
        run: |
          if git diff --quiet -- public/trackman.json; then
            echo "changed=false" >> "$GITHUB_OUTPUT"
            echo "No new sessions."
            exit 0
          fi
          git config user.name  'github-actions[bot]'
          git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
          git add public/trackman.json
          git commit -m 'Update the Trackman session data'
          git push
          echo "changed=true" >> "$GITHUB_OUTPUT"

  publish:
    needs: ingest
    if: needs.ingest.outputs.changed == 'true'
    permissions:
      contents: read
      pages: write
      id-token: write
    uses: ./.github/workflows/deploy.yml
```

The `since` input must be validated in the script against `^\d{4}-\d{2}-\d{2}$` before use — it
reaches a URL query, and a dispatch input is user-controlled even on a private trigger.

- [ ] **Step 3: Check the workflow parses**

Run: `gh workflow list` after pushing the branch, or `npx --yes @action-validator/cli@latest .github/workflows/trackman.yml` locally.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/
git commit   # "Pull Trackman sessions daily and publish them"
```

---

## Task 13: Name the KPI club, and bring the docs in line

**Files:**
- Modify: `docs/content.md`
- Modify: `src/lib/domain/plan.ts`
- Modify: `docs/architecture.md`
- Modify: `docs/roadmap.md`
- Modify: `CLAUDE.md`
- Modify: `README.md` if it describes the KPI

- [ ] **Step 1: `content.md`**

Replace *"One number, measured on a Trackman: **club path**"* with **driver club path**, keeping the same table and band. Add a short paragraph recording why, in the coaching voice: the 2025-11 example where the blended figure was the best month in the series while the driver was the worst to that point. State that the `−2°/+2°` band is shared across clubs, and that the driver sits systematically shallower — so an iron inside the band is a stronger result than a driver inside it.

- [ ] **Step 2: `plan.ts`**

Update `KPI.label` to name the driver. Leave `now`, `goal` and the note's coaching content otherwise intact — the copy is liked, and this is one clause.

- [ ] **Step 3: `architecture.md`**

- §3: replace the `TrackmanSession` sketch with the built shape, note `shots[]` was dropped and why (aggregates-only publication), and correct `source` to `'manual' | 'api'`.
- §4: mark it **Built**. Record that `ApiSource` implements `TrackmanSource` and manual entry deliberately does not. Record the publication decision, the `workflow_call` chain, and — as a data note — that the `null` sits on `measurement.clubPath`, not `measurement`.
- §2 layout: add `ingest/` and `scripts/`, and mark them built.

- [ ] **Step 4: `roadmap.md`**

Mark Phase 3 **done**, fold the old Phase 5 into it (it is already merged in the issue), close **OQ-7** with the decision and the warm-up finding, and update "Where things stand".

- [ ] **Step 5: `CLAUDE.md`**

- Current state: `ingest/` is built; the store holds two session types at `schemaVersion` 2.
- Rules: add "**Never blend club path across clubs**", and "`domain/clubs.ts` is the single source of truth for club names and order."
- Things to be careful about: the Trackman entry becomes *built, not just resolved*; add that the published file is aggregates only and the repo is public.

- [ ] **Step 6: Commit**

```bash
git add docs/ CLAUDE.md src/lib/domain/plan.ts README.md
git commit   # "Name the driver as the KPI club and record Phase 3 in the docs"
```

---

## Task 14: Prove the app works without the ingest

This is the issue's actual "done when", and it is the one thing no unit test can show.

- [ ] **Step 1: Full verification**

Run: `npm run check && npm test && npm run build`. Confirm `dist/CNAME` and `dist/404.html` both survived.

- [ ] **Step 2: Remove the automation and confirm the app is unharmed**

```bash
git stash list   # ensure clean
mv .github/workflows/trackman.yml /tmp/
rm -f public/trackman.json
npm run build && npm run preview
```

Confirm, by eye: the plan page renders; `/log` renders; a Trackman session can be logged by hand,
edited and deleted; export and import still work; no console error mentions `trackman.json`.

```bash
mv /tmp/trackman.yml .github/workflows/
```

- [ ] **Step 3: Confirm the site survives blocked site data**

In a browser with all cookies and site data blocked, load the preview. The plan page must render
and the Data panel must show the existing warning — the `syncPublished()` path must not have
reintroduced a module-scope storage read.

- [ ] **Step 4: Open the PR**

Push the branch and open a PR against `main` describing the per-club change, the four probe
findings, and the fact that `public/trackman.json` is created by the first `workflow_dispatch`
after `TRACKMAN_REFRESH_TOKEN` is set. Reference `#4` and `#14`.

---

## Post-merge, by hand

Not part of the PR, and listed so they are not forgotten:

1. Set the `TRACKMAN_REFRESH_TOKEN` repository secret.
2. Run the workflow once with `since: 2025-06-01` to create the backfill — 86 sessions, 369 rows,
   about 30 KiB.
3. Confirm `golf.whitfield.life` shows the imported sessions, and that the plan page is unchanged.
