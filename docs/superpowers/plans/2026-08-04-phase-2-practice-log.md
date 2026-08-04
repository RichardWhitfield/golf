# Phase 2 · Practice Log Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a practice session be logged on a phone in under a minute, stored behind an async repository seam, with edit, delete and JSON export/import.

**Architecture:** Three layers, already sketched in `docs/architecture.md` §2. Pure TypeScript domain modules (`lib/domain/`) know the plan and the session shape. A storage layer (`lib/storage/`) owns one versioned JSON document in one `localStorage` key behind an `async` `Repository` interface. Svelte 5 rune stores (`lib/stores/`) hold the single repository instance; **no component ever touches `localStorage`.** A tiny History-API router splits the existing poster page (Plan) from the new Log view.

**Tech Stack:** Svelte 5 (runes), Vite 8, TypeScript 6, Vitest 4. One new **devDependency**: `@types/node`, required because Task 8's Vite plugin imports `node:fs`/`node:path` and `svelte-check` cannot resolve those without it (`tsconfig.json` also gains `"node"` to its `types` array). Types only — nothing reaches the client bundle. No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-08-04-phase-2-practice-log-design.md`
**Issue:** [#3](https://github.com/RichardWhitfield/golf/issues/3), also closing [#10](https://github.com/RichardWhitfield/golf/issues/10) (OQ-5)

---

## Global Constraints

Every task's requirements implicitly include this section. These come from `CLAUDE.md` and `docs/design.md` and are not negotiable.

**Code**
- **No component may call `localStorage` directly.** Everything goes through `lib/storage/`.
- **Every repository method is `async`,** even over synchronous `localStorage`. This is the entire reason the seam exists.
- **Club path is signed;** negative is out-to-in. Not stored in this phase, but never store an absolute value.
- **Drill ids `01`–`07` are stable.** Never renumber.
- **`src/lib/domain/drills.ts` is the single source of truth for drill content.** Never restate drill copy in markup.
- **Bump `schemaVersion` and write a migration for any stored-shape change.**
- Plan and drill content lives in `lib/domain/` as data, not in markup.
- **Never write code that can wipe the store without an explicit user action.**

**Design** (`docs/design.md`)
- **Use the CSS custom properties. Never hardcode a colour.** A new colour needs a new token, documented in `docs/design.md`. *This plan introduces no new tokens — if you think you need one, stop and re-read §10 of the spec.*
- `--ball` (yellow) means the goal. `--flag` (red) means the problem. Never invert.
- **Data and labels are `'Space Mono', monospace`. Prose is Inter. Headings are Archivo.** Every number, measurement, rep count and category label is monospaced.
- Three surface levels only: `--bg` → `--panel` → `--card`. Form fields sit on `--card`.
- **One breakpoint: `760px`.** Prefer `clamp()`, `auto-fill`, `minmax()` over new media queries.
- **Every animation needs a `prefers-reduced-motion` override that leaves content visible**, scoped to the component that owns it.
- Every interactive element needs a visible focus state. Never suppress the global `:focus-visible` rule.
- **Every interactive control needs a `44px` minimum hit target.** Used outdoors, one-handed, possibly gloved.
- Borders are `1px solid var(--line)`. **No shadows** — depth comes from surface colour and hairlines.

**Where a style rule belongs** (`CLAUDE.md`)
- `app.css` holds tokens, the reset, shared typography, the section scaffold, and classes used by more than one component (`.grid`, `.sec-head`, `.aid-note`). Everything else is scoped to its component — **including that component's own `760px` media query.**
- **Never split one element's rules across both layers.** Svelte compiles `.hero` to `.hero.svelte-xxx`, so a scoped base rule outranks a global override and the override silently loses.

**Content**
- British English (`lang="en-GB"`). Second-person, direct, coach-like. Short declaratives.

**Commits**
- Match the repo's existing style: a plain sentence, capitalised, no `feat:`/`fix:` prefix. See `git log`.
- Every commit ends with:
  ```
  Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01UDMck26QppQA5Rbic9coEL
  ```
- **If a change makes one of the four `docs/` files wrong, fix it in the same commit.**

**Verification**
- `npm run check` (svelte-check) and `npm test` (Vitest) both run in CI and both block deploy. Run both before every commit.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `src/lib/domain/types.ts` | *Modify.* Add `ISODate`, `Location`, `Feel`, `DrillEntry`, `PracticeSession`; add `defaultSwings` to `Drill`. | 1 |
| `src/lib/domain/drills.ts` | *Modify.* Authored `defaultSwings` per drill. | 1 |
| `src/lib/domain/today.ts` | *Modify.* Add `resolveISODate()`. | 1 |
| `src/lib/domain/block.ts` | *Create.* Pure date arithmetic → arc week and phase. | 2 |
| `src/lib/domain/session.ts` | *Create.* Draft shape, seeding from the plan, validation, id generation. | 3 |
| `src/lib/storage/repository.ts` | *Create.* The seam: `Repository`, `StoreDocument`, `Settings`. | 4 |
| `src/lib/storage/migrations.ts` | *Create.* `SCHEMA_VERSION`, `migrate()`, version guards. | 4 |
| `src/lib/storage/local.ts` | *Create.* `LocalStorageRepo`, with `Storage` injected. | 5 |
| `src/lib/storage/transfer.ts` | *Create.* Import validation, merge-by-id, export serialisation. | 6 |
| `src/lib/stores/sessions.svelte.ts` | *Create.* The one `Repository` instance; rune state for the UI. | 7 |
| `src/lib/stores/router.svelte.ts` | *Create.* History-API route state. | 8 |
| `vite.config.ts` | *Modify.* `pagesSpaFallback()` plugin writing `dist/404.html`. | 8 |
| `.github/workflows/deploy.yml` | *Modify.* Assert `dist/404.html` exists. | 8 |
| `src/routes/PlanView.svelte` | *Create.* The existing sections, moved verbatim. | 8 |
| `src/routes/LogView.svelte` | *Create.* Composes the log page. | 9, 10, 11 |
| `src/App.svelte` | *Modify.* Nav plus route switch. | 8 |
| `src/lib/components/SiteNav.svelte` | *Create.* PLAN · LOG · PROGRESS. | 8 |
| `src/lib/components/SwingStepper.svelte` | *Create.* `[−] n [+]`. | 9 |
| `src/lib/components/FeelPicker.svelte` | *Create.* 1–5 native radios. | 9 |
| `src/lib/components/DrillEntryRow.svelte` | *Create.* One drill's tick, swings and feel. | 9 |
| `src/lib/components/SessionForm.svelte` | *Create.* The form. Handles both insert and edit. | 9 |
| `src/lib/components/RecentSessions.svelte` | *Create.* List, edit, delete. | 10 |
| `src/lib/components/DataPanel.svelte` | *Create.* Export, import, fault warning. | 11 |
| `src/lib/components/TodayPanel.svelte` | *Modify.* Block start control and arc position. | 12 |

Tests are colocated (`src/**/*.test.ts`), matching `src/lib/domain/today.test.ts`. `vite.config.ts` already globs them.

---

### Task 1: Domain types and drill swing defaults

**Files:**
- Modify: `src/lib/domain/types.ts`
- Modify: `src/lib/domain/drills.ts`
- Modify: `src/lib/domain/today.ts`
- Modify: `src/lib/domain/today.test.ts`
- Modify: `docs/content.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `ISODate`, `Location`, `Feel`, `DrillEntry`, `PracticeSession`, `Drill.defaultSwings`, `resolveISODate(now?: Date): ISODate`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/domain/today.test.ts`. Add `resolveISODate` to the existing import from `./today`.

```ts
describe('resolveISODate', () => {
  it('returns the Sydney date when UTC is still on the previous day', () => {
    // 2026-08-02 23:00 UTC is 3 August, 09:00 in Sydney (AEST, +10).
    expect(resolveISODate(new Date('2026-08-02T23:00:00Z'))).toBe('2026-08-03')
  })

  it('honours Sydney daylight saving', () => {
    // 2026-01-04 13:30 UTC is 5 January, 00:30 in Sydney (AEDT, +11).
    expect(resolveISODate(new Date('2026-01-04T13:30:00Z'))).toBe('2026-01-05')
  })

  it('zero-pads single-digit months and days', () => {
    expect(resolveISODate(new Date('2026-03-05T05:00:00Z'))).toBe('2026-03-05')
  })
})

describe('drill swing defaults', () => {
  it('gives every drill a positive whole-number default', () => {
    for (const d of DRILLS) {
      expect(Number.isInteger(d.defaultSwings)).toBe(true)
      expect(d.defaultSwings).toBeGreaterThan(0)
    }
  })

  it('keeps the prose reps field intact alongside it', () => {
    for (const d of DRILLS) expect(d.reps).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `resolveISODate is not a function`, and `defaultSwings` is `undefined`.

- [ ] **Step 3: Add the new types**

Append to `src/lib/domain/types.ts`:

```ts
/** Calendar date, `YYYY-MM-DD`. Always the Sydney date — see `today.ts`. */
export type ISODate = string

/** `sim` is the Trackman bay, `home` is outdoors with airflow balls, `course` is on the course. */
export type Location = 'sim' | 'home' | 'course'

/** How close the swing came to the drill's "feels like" cue. */
export type Feel = 1 | 2 | 3 | 4 | 5

export interface DrillEntry {
  drillId: DrillId
  swings: number
  /** Per entry, never per session — two drills in one session can go very differently. */
  feel: Feel
}

/** Tue–Sun: short outdoor sessions, manually logged. Monday's Trackman session is Phase 3. */
export interface PracticeSession {
  id: string
  type: 'practice'
  date: ISODate
  location: Location
  entries: DrillEntry[]
  notes?: string
}
```

And add one field to the existing `Drill` interface, directly below `reps`:

```ts
  /** A number the log form can pre-fill. `reps` stays prose — "10 rehearsals + 5 hits" has no
   *  single number in it, and parsing it would be guesswork. Authored, not derived. */
  defaultSwings: number
```

- [ ] **Step 4: Add `defaultSwings` to all seven drills**

In `src/lib/domain/drills.ts`, add `defaultSwings` immediately after each `reps` line. Values sit at the middle of each stated range:

| Drill | `reps` | `defaultSwings` |
|---|---|---|
| `01` Step-change | `10–15` | `12` |
| `02` Pump-and-go | `8–10` | `9` |
| `03` Pause-at-the-top | `10` | `10` |
| `04` Outside gate | `15–20 balls` | `18` |
| `05` Trail-arm only | `15–20` | `18` |
| `06` Angled-stick shallow | `10 rehearsals + 5 hits` | `15` |
| `07` Slow-motion & swishes | `20–30 / 2–3 min` | `25` |

- [ ] **Step 5: Add `resolveISODate`**

Append to `src/lib/domain/today.ts`:

```ts
/** The Sydney date as `YYYY-MM-DD`. `en-CA` formats ISO-style natively, so no re-assembly. */
export function resolveISODate(now: Date = new Date()): ISODate {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now)
  } catch {
    /* fall through to the visitor's clock */
  }
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}
```

Add `import type { DayKey, ISODate } from './types'` — the file currently imports only `DayKey`.

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test && npm run check`
Expected: PASS, no type errors.

- [ ] **Step 7: Document the new field**

In `docs/content.md`, wherever the drill fields are described, add a row/line for `defaultSwings`:

> `defaultSwings` — a whole number the log form pre-fills. Separate from `reps`, which stays prose because ranges and mixed counts ("10 rehearsals + 5 hits") carry intent that a single number would lose. Change both together when a drill's volume changes.

- [ ] **Step 8: Commit**

```bash
git add src/lib/domain docs/content.md
git commit -m "$(cat <<'EOF'
Add the practice-session types and per-drill swing defaults

Introduces ISODate, Location, Feel, DrillEntry and PracticeSession from
architecture.md section 3, plus resolveISODate() for the Sydney calendar date.

Each drill gains an authored defaultSwings so the log form can pre-fill a
count. The prose `reps` field stays as-is: "10 rehearsals + 5 hits" has no
single number in it and parsing it would be guesswork.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UDMck26QppQA5Rbic9coEL
EOF
)"
```

---

### Task 2: Block position (OQ-5 arithmetic)

**Files:**
- Create: `src/lib/domain/block.ts`
- Create: `src/lib/domain/block.test.ts`

**Interfaces:**
- Consumes: `ISODate` (Task 1), `ARC` and `ArcPhase` from `plan.ts`/`types.ts`.
- Produces: `parseISODate(iso: ISODate): number | null`, `daysBetween(from: ISODate, to: ISODate): number | null`, `dayKeyFor(iso: ISODate): DayKey | null`, `blockPosition(start: ISODate, on: ISODate): BlockPosition | null`, `interface BlockPosition { week: 1 | 2 | 3; dayOfBlock: number; phase: ArcPhase }`.

**Why dates are parsed as UTC midnight:** `new Date('2026-10-04')` is UTC midnight, but `new Date(2026, 9, 4)` is *local* midnight. Subtracting two local midnights across a daylight-saving boundary gives 23 or 25 hours, and `/ 86400000` then rounds a week to the wrong day. Sydney changes clocks on the first Sunday in October — mid-block, if a block starts in late September. Fixing the parse to UTC removes the problem entirely.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/domain/block.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { blockPosition, dayKeyFor, daysBetween, parseISODate } from './block'
import { ARC } from './plan'

describe('parseISODate', () => {
  it('parses a valid date to UTC midnight', () => {
    expect(parseISODate('2026-08-03')).toBe(Date.UTC(2026, 7, 3))
  })

  it('rejects malformed input', () => {
    expect(parseISODate('3 August 2026')).toBeNull()
    expect(parseISODate('2026-8-3')).toBeNull()
    expect(parseISODate('')).toBeNull()
  })

  it('rejects dates that do not exist rather than rolling them over', () => {
    // Date.UTC(2026, 1, 30) silently becomes 2 March. That must not pass.
    expect(parseISODate('2026-02-30')).toBeNull()
    expect(parseISODate('2026-13-01')).toBeNull()
  })
})

describe('daysBetween', () => {
  it('counts whole days forward', () => {
    expect(daysBetween('2026-08-03', '2026-08-10')).toBe(7)
  })

  it('counts backward as a negative', () => {
    expect(daysBetween('2026-08-10', '2026-08-03')).toBe(-7)
  })

  it('is unaffected by a Sydney daylight-saving change', () => {
    // NSW moves to AEDT on Sunday 4 October 2026. Local-midnight arithmetic
    // would return 6.958… days here and floor to 6.
    expect(daysBetween('2026-09-28', '2026-10-05')).toBe(7)
  })

  it('returns null when either date is malformed', () => {
    expect(daysBetween('nope', '2026-08-03')).toBeNull()
    expect(daysBetween('2026-08-03', 'nope')).toBeNull()
  })
})

describe('dayKeyFor', () => {
  it('names the weekday a date falls on', () => {
    expect(dayKeyFor('2026-08-03')).toBe('mon') // a Monday
    expect(dayKeyFor('2026-08-09')).toBe('sun')
  })

  it('covers a whole week', () => {
    const keys = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
    keys.forEach((key, i) => {
      expect(dayKeyFor(`2026-08-${String(3 + i).padStart(2, '0')}`)).toBe(key)
    })
  })

  it('returns null for a malformed date', () => {
    expect(dayKeyFor('3 August')).toBeNull()
  })
})

describe('blockPosition', () => {
  const START = '2026-08-03' // a Monday

  it('puts the first day in week one', () => {
    expect(blockPosition(START, START)).toEqual({ week: 1, dayOfBlock: 1, phase: ARC[0] })
  })

  it('keeps day seven in week one', () => {
    expect(blockPosition(START, '2026-08-09')?.week).toBe(1)
  })

  it('starts week two on day eight', () => {
    expect(blockPosition(START, '2026-08-10')).toEqual({ week: 2, dayOfBlock: 8, phase: ARC[1] })
  })

  it('starts week three on day fifteen', () => {
    expect(blockPosition(START, '2026-08-17')).toEqual({ week: 3, dayOfBlock: 15, phase: ARC[2] })
  })

  it('includes the final day of week three', () => {
    expect(blockPosition(START, '2026-08-23')?.week).toBe(3)
  })

  it('returns null the day after the block ends', () => {
    expect(blockPosition(START, '2026-08-24')).toBeNull()
  })

  it('returns null before the block starts', () => {
    expect(blockPosition(START, '2026-08-02')).toBeNull()
  })

  it('returns null when either date is malformed', () => {
    expect(blockPosition('nope', START)).toBeNull()
    expect(blockPosition(START, 'nope')).toBeNull()
  })

  it('spans a daylight-saving change without losing a day', () => {
    // Block starting Monday 28 September 2026 crosses the AEDT switch on 4 October.
    expect(blockPosition('2026-09-28', '2026-10-05')?.week).toBe(2)
    expect(blockPosition('2026-09-28', '2026-10-18')?.week).toBe(3)
    expect(blockPosition('2026-09-28', '2026-10-19')).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot resolve `./block`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/domain/block.ts`:

```ts
import type { ArcPhase, DayKey, ISODate } from './types'
import { ARC, DAY_ORDER } from './plan'

/** The plan is three weeks. Day 0 is the start date; day 20 is the last day. */
const BLOCK_DAYS = 21
const DAY_MS = 86_400_000
const ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export interface BlockPosition {
  week: 1 | 2 | 3
  /** 1-based day within the block, so the first day reads as day 1. */
  dayOfBlock: number
  phase: ArcPhase
}

/** Parsed as **UTC** midnight, deliberately. Local midnights are 23 or 25 hours apart across a
 *  daylight-saving change, which silently shifts a week boundary by a day. UTC has no such thing. */
export function parseISODate(iso: ISODate): number | null {
  const match = ISO_PATTERN.exec(iso)
  if (!match) return null
  const [, year, month, day] = match.map(Number)
  const ms = Date.UTC(year, month - 1, day)
  // `Date.UTC(2026, 1, 30)` quietly becomes 2 March. Round-trip to reject dates that don't exist.
  const back = new Date(ms)
  if (back.getUTCFullYear() !== year || back.getUTCMonth() !== month - 1 || back.getUTCDate() !== day) {
    return null
  }
  return ms
}

/**
 * Which weekday a date falls on.
 *
 * Read off the **UTC** timestamp with `getUTCDay()`, never `getDay()`. The value parsed above is
 * UTC midnight, so reading a *local* weekday from it lands on the previous day for anyone east
 * of UTC+12. `getUTCDay()` is Sunday-first, hence the shift onto the Monday-first `DAY_ORDER`.
 */
export function dayKeyFor(iso: ISODate): DayKey | null {
  const ms = parseISODate(iso)
  if (ms === null) return null
  return DAY_ORDER[(new Date(ms).getUTCDay() + 6) % 7]
}

/** Whole days from `from` to `to`. Negative if `to` is earlier. `null` if either is malformed. */
export function daysBetween(from: ISODate, to: ISODate): number | null {
  const a = parseISODate(from)
  const b = parseISODate(to)
  if (a === null || b === null) return null
  return Math.round((b - a) / DAY_MS)
}

/** Where `on` sits in the three-week arc, or `null` if it falls outside the block entirely.
 *  Outside is a real answer, not an error — a plan that has ended should say nothing rather
 *  than claim "week 7". */
export function blockPosition(start: ISODate, on: ISODate): BlockPosition | null {
  const offset = daysBetween(start, on)
  if (offset === null || offset < 0 || offset >= BLOCK_DAYS) return null
  const week = (Math.floor(offset / 7) + 1) as 1 | 2 | 3
  return { week, dayOfBlock: offset + 1, phase: ARC[week - 1] }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test && npm run check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/block.ts src/lib/domain/block.test.ts
git commit -m "$(cat <<'EOF'
Resolve a date to its week and phase in the 3-week arc

blockPosition() answers the question the Today panel cannot currently ask:
which week of the arc you are in, and therefore whether a drill means groove,
transfer or proof.

Dates are parsed as UTC midnight rather than local. Two local midnights are 23
or 25 hours apart across a daylight-saving change, which shifts a week boundary
by a day for any block spanning the first Sunday in October.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UDMck26QppQA5Rbic9coEL
EOF
)"
```

---

### Task 3: Session drafts

**Files:**
- Create: `src/lib/domain/session.ts`
- Create: `src/lib/domain/session.test.ts`

**Interfaces:**
- Consumes: `DrillId`, `DayKey`, `Feel`, `ISODate`, `Location`, `PracticeSession`, `DrillEntry` (Task 1); `WEEK` from `plan.ts`; `DRILLS` from `drills.ts`.
- Produces:
  - `interface DraftEntry { drillId: DrillId; selected: boolean; swings: number; feel: Feel; feelTouched: boolean }`
  - `interface SessionDraft { id: string; date: ISODate; location: Location; entries: DraftEntry[]; notes: string }`
  - `newSessionId(): string`
  - `defaultLocation(day: DayKey): Location`
  - `seedEntries(day: DayKey): DraftEntry[]`
  - `draftForDay(day: DayKey, date: ISODate, id?: string): SessionDraft`
  - `draftFromSession(session: PracticeSession): SessionDraft`
  - `toSession(draft: SessionDraft): PracticeSession`
  - `validateDraft(draft: SessionDraft): string[]`

**Why a draft type separate from `PracticeSession`:** the form needs to hold state the stored session must never carry — all seven drills whether ticked or not, and whether the feel value was actually tapped (`feelTouched`, which drives the dimmed-until-judged rendering from spec §6). Keeping that in a `SessionDraft` means `PracticeSession` stays exactly the shape `architecture.md` §3 specifies.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/domain/session.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  defaultLocation,
  draftForDay,
  draftFromSession,
  newSessionId,
  seedEntries,
  toSession,
  validateDraft,
} from './session'
import type { PracticeSession } from './types'
import { DRILLS, drill } from './drills'
import { WEEK } from './plan'

describe('newSessionId', () => {
  it('produces distinct non-empty ids', () => {
    const ids = new Set(Array.from({ length: 50 }, newSessionId))
    expect(ids.size).toBe(50)
    for (const id of ids) expect(id.length).toBeGreaterThan(0)
  })
})

describe('defaultLocation', () => {
  it('sends Monday to the simulator', () => {
    expect(defaultLocation('mon')).toBe('sim')
  })

  it('sends every other day outdoors', () => {
    for (const day of ['tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const) {
      expect(defaultLocation(day)).toBe('home')
    }
  })
})

describe('seedEntries', () => {
  it('offers all seven drills in drill order', () => {
    expect(seedEntries('wed').map((e) => e.drillId)).toEqual(DRILLS.map((d) => d.id))
  })

  it("pre-selects exactly the day's scheduled drills", () => {
    const selected = seedEntries('wed').filter((e) => e.selected).map((e) => e.drillId)
    expect(selected).toEqual(['01', '04'])
  })

  it('pre-selects the right drills for every day of the week', () => {
    // Compared as sets, deliberately. `WEEK[day].drills` is authored in the order the drills
    // are *worked* — Monday is ['04','06','02'] — while the form lists all seven in stable
    // 01-07 order so the rows never reshuffle as you tick them. The selection must match; the
    // sequence must not be asserted, or the form would be forced to reorder itself.
    for (const [day, plan] of Object.entries(WEEK)) {
      const selected = seedEntries(day as keyof typeof WEEK)
        .filter((e) => e.selected)
        .map((e) => e.drillId)
      expect(new Set(selected)).toEqual(new Set(plan.drills))
      expect(selected).toHaveLength(plan.drills.length)
    }
  })

  it('lists the selected drills in stable drill order, not the plan\'s working order', () => {
    // Monday's plan order is ['04','06','02']; the form must still read 02, 04, 06.
    const selected = seedEntries('mon').filter((e) => e.selected).map((e) => e.drillId)
    expect(selected).toEqual(['02', '04', '06'])
  })

  it("seeds each entry's swings from the drill's authored default", () => {
    for (const entry of seedEntries('wed')) {
      expect(entry.swings).toBe(drill(entry.drillId).defaultSwings)
    }
  })

  it('starts feel at a neutral, untouched 3', () => {
    for (const entry of seedEntries('wed')) {
      expect(entry.feel).toBe(3)
      expect(entry.feelTouched).toBe(false)
    }
  })
})

describe('draftForDay', () => {
  it('carries the date and the day-appropriate location', () => {
    const draft = draftForDay('mon', '2026-08-03')
    expect(draft.date).toBe('2026-08-03')
    expect(draft.location).toBe('sim')
    expect(draft.notes).toBe('')
  })
})

describe('toSession', () => {
  const draft = draftForDay('wed', '2026-08-05', 'fixed-id')

  it('keeps only the selected drills', () => {
    expect(toSession(draft).entries.map((e) => e.drillId)).toEqual(['01', '04'])
  })

  it('drops the draft-only fields from each entry', () => {
    const [entry] = toSession(draft).entries
    expect(entry).toEqual({ drillId: '01', swings: drill('01').defaultSwings, feel: 3 })
  })

  it('preserves the id so a save is an update rather than an insert', () => {
    expect(toSession(draft).id).toBe('fixed-id')
  })

  it('stamps the session type', () => {
    expect(toSession(draft).type).toBe('practice')
  })

  it('omits empty notes entirely rather than storing a blank string', () => {
    expect(toSession(draft).notes).toBeUndefined()
  })

  it('trims notes that were written', () => {
    expect(toSession({ ...draft, notes: '  felt rushed  ' }).notes).toBe('felt rushed')
  })
})

describe('draftFromSession', () => {
  const session: PracticeSession = {
    id: 'abc',
    type: 'practice',
    date: '2026-08-05',
    location: 'course',
    entries: [{ drillId: '04', swings: 30, feel: 5 }],
    notes: 'good one',
  }

  it('round-trips through toSession unchanged', () => {
    expect(toSession(draftFromSession(session))).toEqual(session)
  })

  it('offers all seven drills so others can be added while editing', () => {
    expect(draftFromSession(session).entries).toHaveLength(DRILLS.length)
  })

  it('marks stored feel values as already judged', () => {
    const entry = draftFromSession(session).entries.find((e) => e.drillId === '04')
    expect(entry?.feelTouched).toBe(true)
    expect(entry?.selected).toBe(true)
  })

  it('leaves unselected drills at their authored default', () => {
    const entry = draftFromSession(session).entries.find((e) => e.drillId === '01')
    expect(entry?.selected).toBe(false)
    expect(entry?.swings).toBe(drill('01').defaultSwings)
  })
})

describe('validateDraft', () => {
  const valid = draftForDay('wed', '2026-08-05')

  it('accepts a seeded draft as-is', () => {
    expect(validateDraft(valid)).toEqual([])
  })

  it('rejects a malformed date', () => {
    expect(validateDraft({ ...valid, date: '5 August' })).toContain('Pick a valid date.')
  })

  it('rejects a session with nothing ticked', () => {
    const empty = { ...valid, entries: valid.entries.map((e) => ({ ...e, selected: false })) }
    expect(validateDraft(empty)).toContain('Tick at least one drill.')
  })

  it('rejects a non-positive swing count on a ticked drill', () => {
    const entries = valid.entries.map((e) => (e.selected ? { ...e, swings: 0 } : e))
    expect(validateDraft({ ...valid, entries })).toContain('Drill 01 needs at least one swing.')
  })

  it('rejects a fractional swing count', () => {
    const entries = valid.entries.map((e) => (e.selected ? { ...e, swings: 7.5 } : e))
    expect(validateDraft({ ...valid, entries }).length).toBeGreaterThan(0)
  })

  it('ignores swing counts on drills that are not ticked', () => {
    const entries = valid.entries.map((e) => (e.selected ? e : { ...e, swings: 0 }))
    expect(validateDraft({ ...valid, entries })).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot resolve `./session`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/domain/session.ts`:

```ts
import type { DayKey, DrillId, Feel, ISODate, Location, PracticeSession } from './types'
// Only `DRILLS` is needed here — every function walks all seven in order rather than looking up
// one by id. The `drill()` accessor is used by the components and by this module's tests.
import { DRILLS } from './drills'
import { WEEK } from './plan'
import { parseISODate } from './block'

/** Neutral. The form renders an untouched 3 dimmed, so a value you never judged is visible
 *  as such without changing what gets stored. */
const NEUTRAL_FEEL: Feel = 3

/** Form state. Deliberately not `PracticeSession`: it holds all seven drills whether ticked or
 *  not, and whether feel was actually tapped. Neither belongs in the stored record. */
export interface DraftEntry {
  drillId: DrillId
  selected: boolean
  swings: number
  feel: Feel
  feelTouched: boolean
}

export interface SessionDraft {
  id: string
  date: ISODate
  location: Location
  /** All seven, in drill order, so the list never reorders as you tick things. */
  entries: DraftEntry[]
  notes: string
}

export function newSessionId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  // `crypto.randomUUID` needs a secure context. Uniqueness for one user's own log is all
  // that's required here — this is not a security boundary.
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Monday is the Trackman bay; every other day is outdoors with airflow balls. */
export function defaultLocation(day: DayKey): Location {
  return day === 'mon' ? 'sim' : 'home'
}

/** All seven drills, with the day's scheduled ones pre-ticked. This is what makes a normal
 *  session two taps and save. */
export function seedEntries(day: DayKey): DraftEntry[] {
  const scheduled = new Set<DrillId>(WEEK[day].drills)
  return DRILLS.map((d) => ({
    drillId: d.id,
    selected: scheduled.has(d.id),
    swings: d.defaultSwings,
    feel: NEUTRAL_FEEL,
    feelTouched: false,
  }))
}

export function draftForDay(day: DayKey, date: ISODate, id: string = newSessionId()): SessionDraft {
  return { id, date, location: defaultLocation(day), entries: seedEntries(day), notes: '' }
}

/** Load a stored session back into the form. Unticked drills keep their authored defaults so
 *  adding one mid-edit behaves exactly as it does on a new session. */
export function draftFromSession(session: PracticeSession): SessionDraft {
  const stored = new Map(session.entries.map((e) => [e.drillId, e]))
  return {
    id: session.id,
    date: session.date,
    location: session.location,
    notes: session.notes ?? '',
    entries: DRILLS.map((d) => {
      const entry = stored.get(d.id)
      return {
        drillId: d.id,
        selected: entry !== undefined,
        swings: entry?.swings ?? d.defaultSwings,
        feel: entry?.feel ?? NEUTRAL_FEEL,
        // A stored value was judged by definition — it came off a real session.
        feelTouched: entry !== undefined,
      }
    }),
  }
}

export function toSession(draft: SessionDraft): PracticeSession {
  const notes = draft.notes.trim()
  const session: PracticeSession = {
    id: draft.id,
    type: 'practice',
    date: draft.date,
    location: draft.location,
    entries: draft.entries
      .filter((e) => e.selected)
      .map((e) => ({ drillId: e.drillId, swings: e.swings, feel: e.feel })),
  }
  if (notes) session.notes = notes
  return session
}

/** Returns the problems, in the order they appear in the form. Empty means it can be saved.
 *  The client is the only guard — there is no server-side validation. */
export function validateDraft(draft: SessionDraft): string[] {
  const problems: string[] = []
  if (parseISODate(draft.date) === null) problems.push('Pick a valid date.')

  const selected = draft.entries.filter((e) => e.selected)
  if (selected.length === 0) problems.push('Tick at least one drill.')

  for (const entry of selected) {
    if (!Number.isInteger(entry.swings) || entry.swings < 1) {
      problems.push(`Drill ${entry.drillId} needs at least one swing.`)
    }
  }
  return problems
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test && npm run check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/session.ts src/lib/domain/session.test.ts
git commit -m "$(cat <<'EOF'
Seed a session draft from the day's plan

seedEntries() reads the day's scheduled drills straight out of plan.ts, so
Wednesday arrives with 01 and 04 already ticked and their authored swing counts
filled in. That is what makes a normal session two taps and save.

SessionDraft is kept separate from PracticeSession: the form needs all seven
drills and a feelTouched flag, neither of which belongs in the stored record.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UDMck26QppQA5Rbic9coEL
EOF
)"
```

---

### Task 4: The repository seam and migrations

**Files:**
- Create: `src/lib/storage/repository.ts`
- Create: `src/lib/storage/migrations.ts`
- Create: `src/lib/storage/migrations.test.ts`

**Interfaces:**
- Consumes: `ISODate`, `PracticeSession` (Task 1).
- Produces:
  - `interface Settings { blockStart?: ISODate }`
  - `interface StoreDocument { schemaVersion: number; sessions: PracticeSession[]; settings: Settings }`
  - `interface ImportSummary { added: number; updated: number }`
  - `interface Repository` (all methods `async`, plus `readonly faultMessage: string | null`)
  - `emptyDocument(): StoreDocument`
  - `SCHEMA_VERSION`, `STORAGE_KEY`, `QUARANTINE_KEY`
  - `migrate(raw: unknown): StoreDocument`
  - `class UnreadableStoreError extends Error`, `class FutureSchemaError extends Error`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/storage/migrations.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { FutureSchemaError, SCHEMA_VERSION, UnreadableStoreError, migrate } from './migrations'
import { emptyDocument } from './repository'
import type { PracticeSession } from '../domain/types'

const session: PracticeSession = {
  id: 'a',
  type: 'practice',
  date: '2026-08-05',
  location: 'home',
  entries: [{ drillId: '01', swings: 12, feel: 3 }],
}

describe('migrate', () => {
  it('passes a current-version document through', () => {
    const doc = { schemaVersion: SCHEMA_VERSION, sessions: [session], settings: { blockStart: '2026-08-03' } }
    expect(migrate(doc)).toEqual(doc)
  })

  it('fills in missing sessions and settings rather than failing', () => {
    expect(migrate({ schemaVersion: SCHEMA_VERSION })).toEqual(emptyDocument())
  })

  it('refuses a sessions field that is present but not an array', () => {
    // The distinction that matters: absent means first run, malformed means damage. Collapsing
    // the second into an empty log would discard the user's only copy of their history.
    expect(() => migrate({ schemaVersion: SCHEMA_VERSION, sessions: 'corrupt' })).toThrow(
      UnreadableStoreError,
    )
    expect(() => migrate({ schemaVersion: SCHEMA_VERSION, sessions: 42 })).toThrow(
      UnreadableStoreError,
    )
  })

  it('refuses a settings field that is present but not an object', () => {
    expect(() => migrate({ schemaVersion: SCHEMA_VERSION, sessions: [], settings: 42 })).toThrow(
      UnreadableStoreError,
    )
    expect(() => migrate({ schemaVersion: SCHEMA_VERSION, sessions: [], settings: [] })).toThrow(
      UnreadableStoreError,
    )
  })

  it('refuses a document written by a newer build', () => {
    expect(() => migrate({ schemaVersion: SCHEMA_VERSION + 1, sessions: [], settings: {} })).toThrow(
      FutureSchemaError,
    )
  })

  it('refuses anything that is not an object', () => {
    for (const raw of [null, undefined, 42, 'text', []]) {
      expect(() => migrate(raw)).toThrow(UnreadableStoreError)
    }
  })

  it('refuses a document with no usable version', () => {
    expect(() => migrate({ sessions: [] })).toThrow(UnreadableStoreError)
    expect(() => migrate({ schemaVersion: 0 })).toThrow(UnreadableStoreError)
    expect(() => migrate({ schemaVersion: 'one' })).toThrow(UnreadableStoreError)
    expect(() => migrate({ schemaVersion: 1.5 })).toThrow(UnreadableStoreError)
  })

  it('rejects a negative version before it can reach the migration loop', () => {
    // Honest about what this covers: the `version < 1` guard, not the loop. While
    // SCHEMA_VERSION is 1 there is NO valid input that enters the loop body at all, so the
    // "no migration for this gap" branch is unreachable and therefore untested. When
    // SCHEMA_VERSION next rises, add a case with a genuine registered gap — a test named for
    // a branch it cannot reach ships false confidence.
    expect(() => migrate({ schemaVersion: -1 })).toThrow(UnreadableStoreError)
  })
})

describe('emptyDocument', () => {
  it('is stamped with the current schema version', () => {
    expect(emptyDocument().schemaVersion).toBe(SCHEMA_VERSION)
  })

  it('returns a fresh object each time so callers cannot share state', () => {
    const a = emptyDocument()
    a.sessions.push(session)
    expect(emptyDocument().sessions).toEqual([])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot resolve `./migrations`.

- [ ] **Step 3: Write the repository seam**

Create `src/lib/storage/repository.ts`:

```ts
import type { ISODate, PracticeSession } from '../domain/types'
import { SCHEMA_VERSION } from './migrations'

export interface Settings {
  /** The Monday the current 3-week block began. Unset until the user says. */
  blockStart?: ISODate
}

/** One JSON document in one key. At a few sessions a week this is simpler and safer than
 *  key-per-record, and it makes export trivial. */
export interface StoreDocument {
  schemaVersion: number
  sessions: PracticeSession[]
  settings: Settings
}

export interface ImportSummary {
  added: number
  updated: number
}

/**
 * The seam. **Every method is `async`, deliberately**, even though `localStorage` is
 * synchronous — if they were synchronous now, adding a backend later would change every call
 * site. Paying the `await` cost up front is the entire point.
 *
 * No component may call `localStorage`. Components go through `lib/stores/`, which owns the
 * single instance of this.
 */
export interface Repository {
  /** Newest first. */
  listSessions(): Promise<PracticeSession[]>
  /** Upsert by id: an existing id updates, a new one inserts. */
  saveSession(session: PracticeSession): Promise<void>
  deleteSession(id: string): Promise<void>
  getSettings(): Promise<Settings>
  saveSettings(settings: Settings): Promise<void>
  exportDocument(): Promise<StoreDocument>
  /** Merges by session id. Adds and updates; never drops. */
  importDocument(raw: unknown): Promise<ImportSummary>
  /**
   * Non-null when the stored data could not be read and writing is therefore refused.
   * Part of the interface, not an implementation detail: a future remote repo has the same
   * "I can see something is wrong, don't let the user overwrite it" state.
   */
  readonly faultMessage: string | null
  /** The quarantined raw text, if a fault put one aside. Lets the UI offer it as a download. */
  readQuarantine(): Promise<string | null>
}

export function emptyDocument(): StoreDocument {
  return { schemaVersion: SCHEMA_VERSION, sessions: [], settings: {} }
}
```

- [ ] **Step 4: Write the migrations**

Create `src/lib/storage/migrations.ts`:

```ts
import type { PracticeSession } from '../domain/types'
import type { Settings, StoreDocument } from './repository'

/** Bump this and add a migration below for **any** change to the stored shape. */
export const SCHEMA_VERSION = 1

/** Stable across schema versions — the version lives inside the document, not in the key. */
export const STORAGE_KEY = 'golf:store'

/** Where an unreadable document is copied before anything else happens. */
export const QUARANTINE_KEY = 'golf:store.unreadable'

/** The stored data is not in a shape this build understands. */
export class UnreadableStoreError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnreadableStoreError'
  }
}

/** The stored data was written by a newer build. Older code must not touch it. */
export class FutureSchemaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FutureSchemaError'
  }
}

type Migration = (doc: Record<string, unknown>) => Record<string, unknown>

/**
 * Keyed by the version being migrated **from**. Empty at v1 — the machinery and its tests exist
 * so the first real schema change is a data edit rather than an architecture change.
 *
 * A migration must be pure and total: given any document at version N, return one at N+1.
 */
const MIGRATIONS: Record<number, Migration> = {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Bring a parsed document up to `SCHEMA_VERSION`.
 *
 * Throws rather than returning a default, because the caller's response differs: an unreadable
 * document must be quarantined and writing refused, while an absent one is simply a first run.
 * Silently substituting an empty document here would be a data-loss bug.
 */
export function migrate(raw: unknown): StoreDocument {
  if (!isRecord(raw)) {
    throw new UnreadableStoreError('The stored data is not an object.')
  }

  const version = raw.schemaVersion
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new UnreadableStoreError('The stored data has no usable schemaVersion.')
  }

  if (version > SCHEMA_VERSION) {
    throw new FutureSchemaError(
      `The stored data is version ${version}; this build understands ${SCHEMA_VERSION}. ` +
        'Refusing to touch it — update the site, or export from the newer one first.',
    )
  }

  let doc = raw
  for (let v = version; v < SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[v]
    if (!step) {
      throw new UnreadableStoreError(`No migration from version ${v} to ${v + 1}.`)
    }
    doc = step(doc)
  }

  // `undefined` means the field was never written — fill it in, that's a first run. A field that
  // is *present but the wrong shape* is corruption, and must throw so the caller quarantines the
  // document instead of silently zeroing it. `sessions: "corrupt"` is not `sessions: []`: the
  // first is damage worth recovering, the second is an empty log. Collapsing them would lose
  // months of practice data without a word, which is the exact failure this function exists to
  // prevent — the same bug the comment above warns about, one level down.
  if (doc.sessions !== undefined && !Array.isArray(doc.sessions)) {
    throw new UnreadableStoreError('The stored data has a malformed "sessions" field.')
  }
  if (doc.settings !== undefined && !isRecord(doc.settings)) {
    throw new UnreadableStoreError('The stored data has a malformed "settings" field.')
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    sessions: (doc.sessions as PracticeSession[] | undefined) ?? [],
    settings: (doc.settings as Settings | undefined) ?? {},
  }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test && npm run check`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/storage
git commit -m "$(cat <<'EOF'
Add the storage seam and schema-version machinery

Repository is the interface every component reaches storage through, and every
method on it is async even though localStorage is not. That is the whole point:
if they were sync now, adding a backend later would change every call site.

migrate() throws rather than defaulting. An unreadable document and an absent
one need opposite responses -- quarantine and refuse to write, versus start
fresh -- so quietly substituting an empty document here would be a data-loss
bug. The migration table is empty at v1; the tests around it are not.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UDMck26QppQA5Rbic9coEL
EOF
)"
```

---

### Task 5: `LocalStorageRepo`

**Files:**
- Create: `src/lib/storage/local.ts`
- Create: `src/lib/storage/local.test.ts`

**Interfaces:**
- Consumes: everything from Task 4.
- Produces: `class LocalStorageRepo implements Repository`, `constructor(storage?: Storage)`; `class MemoryStorage implements Storage` exported from `local.test.ts`'s sibling — **no**, defined inside the test file only.

**Why `Storage` is injected:** Vitest runs in Node, where `localStorage` does not exist. Injecting it (`constructor(storage: Storage = localStorage)`) means the repository is testable against a 30-line in-memory fake with **no jsdom dependency**, and production code still just writes `new LocalStorageRepo()`.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/storage/local.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { LocalStorageRepo } from './local'
import { QUARANTINE_KEY, SCHEMA_VERSION, STORAGE_KEY } from './migrations'
import type { PracticeSession } from '../domain/types'

/** Enough of the `Storage` interface for the repository. Keeps jsdom out of the dependency list. */
class MemoryStorage implements Storage {
  private map = new Map<string, string>()
  get length() {
    return this.map.size
  }
  clear() {
    this.map.clear()
  }
  getItem(key: string) {
    return this.map.get(key) ?? null
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null
  }
  removeItem(key: string) {
    this.map.delete(key)
  }
  setItem(key: string, value: string) {
    this.map.set(key, value)
  }
}

const session = (id: string, date = '2026-08-05'): PracticeSession => ({
  id,
  type: 'practice',
  date,
  location: 'home',
  entries: [{ drillId: '01', swings: 12, feel: 3 }],
})

let storage: MemoryStorage
let repo: LocalStorageRepo

beforeEach(() => {
  storage = new MemoryStorage()
  repo = new LocalStorageRepo(storage)
})

describe('an empty store', () => {
  it('lists nothing', async () => {
    expect(await repo.listSessions()).toEqual([])
  })

  it('returns empty settings', async () => {
    expect(await repo.getSettings()).toEqual({})
  })

  it('reports no fault', () => {
    expect(repo.faultMessage).toBeNull()
  })

  it('writes nothing until asked', () => {
    expect(storage.getItem(STORAGE_KEY)).toBeNull()
  })
})

describe('saveSession', () => {
  it('inserts a new session', async () => {
    await repo.saveSession(session('a'))
    expect(await repo.listSessions()).toEqual([session('a')])
  })

  it('updates in place when the id already exists', async () => {
    await repo.saveSession(session('a'))
    await repo.saveSession({ ...session('a'), location: 'course' })
    const stored = await repo.listSessions()
    expect(stored).toHaveLength(1)
    expect(stored[0].location).toBe('course')
  })

  it('survives a new repository over the same storage', async () => {
    await repo.saveSession(session('a'))
    expect(await new LocalStorageRepo(storage).listSessions()).toEqual([session('a')])
  })

  it('stamps the document with the current schema version', async () => {
    await repo.saveSession(session('a'))
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).schemaVersion).toBe(SCHEMA_VERSION)
  })
})

describe('listSessions', () => {
  it('returns newest first', async () => {
    await repo.saveSession(session('old', '2026-08-01'))
    await repo.saveSession(session('new', '2026-08-09'))
    await repo.saveSession(session('mid', '2026-08-05'))
    expect((await repo.listSessions()).map((s) => s.id)).toEqual(['new', 'mid', 'old'])
  })

  it('does not hand out a reference into the store', async () => {
    await repo.saveSession(session('a'))
    const first = await repo.listSessions()
    first.push(session('b'))
    expect(await repo.listSessions()).toHaveLength(1)
  })
})

describe('deleteSession', () => {
  it('removes only the named session', async () => {
    await repo.saveSession(session('a'))
    await repo.saveSession(session('b'))
    await repo.deleteSession('a')
    expect((await repo.listSessions()).map((s) => s.id)).toEqual(['b'])
  })

  it('is silent about an id that is not there', async () => {
    await expect(repo.deleteSession('ghost')).resolves.toBeUndefined()
  })
})

describe('settings', () => {
  it('round-trips the block start date', async () => {
    await repo.saveSettings({ blockStart: '2026-08-03' })
    expect(await repo.getSettings()).toEqual({ blockStart: '2026-08-03' })
  })

  it('leaves sessions untouched', async () => {
    await repo.saveSession(session('a'))
    await repo.saveSettings({ blockStart: '2026-08-03' })
    expect(await repo.listSessions()).toHaveLength(1)
  })
})

describe('exportDocument', () => {
  it('returns the whole document, sessions and settings together', async () => {
    await repo.saveSession(session('a'))
    await repo.saveSettings({ blockStart: '2026-08-03' })
    const doc = await repo.exportDocument()
    expect(doc.schemaVersion).toBe(SCHEMA_VERSION)
    expect(doc.sessions).toEqual([session('a')])
    expect(doc.settings).toEqual({ blockStart: '2026-08-03' })
  })

  it('exports an empty document from an untouched store', async () => {
    expect(await repo.exportDocument()).toEqual({
      schemaVersion: SCHEMA_VERSION,
      sessions: [],
      settings: {},
    })
  })
})

describe('unreadable stored data', () => {
  beforeEach(() => {
    storage.setItem(STORAGE_KEY, '{ not json')
    repo = new LocalStorageRepo(storage)
  })

  it('quarantines the raw text before anything else', async () => {
    await repo.listSessions()
    expect(storage.getItem(QUARANTINE_KEY)).toBe('{ not json')
  })

  it('reports a fault', async () => {
    await repo.listSessions()
    expect(repo.faultMessage).toMatch(/could not be read/i)
  })

  it('refuses to write over it', async () => {
    await repo.listSessions()
    await expect(repo.saveSession(session('a'))).rejects.toThrow(/refusing to overwrite/i)
    expect(storage.getItem(STORAGE_KEY)).toBe('{ not json')
  })

  it('offers the quarantined text back for download', async () => {
    await repo.listSessions()
    expect(await repo.readQuarantine()).toBe('{ not json')
  })

  it('refuses to export, even when export is the first call on a fresh repository', async () => {
    // The fault is detected *by* reading, so a fault check placed before `read()` would pass on
    // a fresh instance and hand back an empty document that looks like a successful backup.
    // Export is the safety valve for rescuing data — it must fail loudly, not quietly.
    await expect(new LocalStorageRepo(storage).exportDocument()).rejects.toThrow(/could not be read/i)
  })

  it('does not overwrite an existing quarantine with a second failure', async () => {
    await repo.listSessions()
    storage.setItem(STORAGE_KEY, 'also broken')
    await new LocalStorageRepo(storage).listSessions()
    expect(storage.getItem(QUARANTINE_KEY)).toBe('{ not json')
  })
})

describe('data from a newer build', () => {
  beforeEach(() => {
    storage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: SCHEMA_VERSION + 1, sessions: [] }))
    repo = new LocalStorageRepo(storage)
  })

  it('refuses to write', async () => {
    await repo.listSessions()
    await expect(repo.saveSession(session('a'))).rejects.toThrow(/refusing to overwrite/i)
  })

  it('does not quarantine it — the data is fine, this build is old', async () => {
    await repo.listSessions()
    expect(storage.getItem(QUARANTINE_KEY)).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot resolve `./local`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/storage/local.ts`:

```ts
import type { PracticeSession } from '../domain/types'
import type { ImportSummary, Repository, Settings, StoreDocument } from './repository'
import { emptyDocument } from './repository'
import {
  FutureSchemaError,
  QUARANTINE_KEY,
  STORAGE_KEY,
  migrate,
} from './migrations'
import { mergeDocuments, parseDocument } from './transfer'

/**
 * The `localStorage` implementation of `Repository`.
 *
 * `Storage` is injected so the tests can run in Node against an in-memory fake — no jsdom.
 * Production code writes `new LocalStorageRepo()` and gets the real thing.
 *
 * Read-modify-write on every mutation. At a few sessions a week the cost is irrelevant, and it
 * keeps a second tab from clobbering the first with stale in-memory state.
 */
export class LocalStorageRepo implements Repository {
  private readonly storage: Storage
  private fault: string | null = null

  constructor(storage: Storage = localStorage) {
    this.storage = storage
  }

  get faultMessage(): string | null {
    return this.fault
  }

  async listSessions(): Promise<PracticeSession[]> {
    // Sorted newest first, and structurally cloned — callers must not be able to reach in and
    // mutate the store by editing the array they were handed.
    return this.read()
      .sessions.slice()
      .sort((a, b) => b.date.localeCompare(a.date))
  }

  async saveSession(session: PracticeSession): Promise<void> {
    const doc = this.read()
    const index = doc.sessions.findIndex((s) => s.id === session.id)
    if (index === -1) doc.sessions.push(session)
    else doc.sessions[index] = session
    this.write(doc)
  }

  async deleteSession(id: string): Promise<void> {
    const doc = this.read()
    doc.sessions = doc.sessions.filter((s) => s.id !== id)
    this.write(doc)
  }

  async getSettings(): Promise<Settings> {
    return { ...this.read().settings }
  }

  async saveSettings(settings: Settings): Promise<void> {
    const doc = this.read()
    doc.settings = { ...settings }
    this.write(doc)
  }

  async exportDocument(): Promise<StoreDocument> {
    // `read()` FIRST — it is what *detects* a fault. Checking `this.fault` beforehand only sees
    // one left behind by an earlier call, so on a fresh instance over corrupt data the guard
    // passes and the empty document `read()` returns is handed back as though it were a
    // successful backup. That failure would land in the one method whose entire job is getting
    // the data out safely. Every other method here already has this order right.
    const doc = this.read()
    if (this.fault) throw new Error(this.fault)
    return doc
  }

  async importDocument(raw: unknown): Promise<ImportSummary> {
    const incoming = parseDocument(raw)
    const { doc, summary } = mergeDocuments(this.read(), incoming)
    this.write(doc)
    return summary
  }

  async readQuarantine(): Promise<string | null> {
    return this.storage.getItem(QUARANTINE_KEY)
  }

  /** Reading also detects and records a fault. It always runs before any write, which is what
   *  guarantees the quarantine copy is taken before anything can overwrite the original. */
  private read(): StoreDocument {
    const raw = this.storage.getItem(STORAGE_KEY)
    if (raw === null) {
      this.fault = null
      return emptyDocument()
    }

    try {
      const doc = migrate(JSON.parse(raw))
      this.fault = null
      return doc
    } catch (error) {
      if (error instanceof FutureSchemaError) {
        // The data is fine; this build is behind. Don't quarantine — there is nothing wrong
        // with it and moving it would strand the newer build's data.
        this.fault = error.message
      } else {
        this.quarantine(raw)
        this.fault =
          `The stored practice data could not be read. Nothing has been changed — the original ` +
          `is kept under "${QUARANTINE_KEY}" and can be downloaded from the Data panel below.`
      }
      return emptyDocument()
    }
  }

  private write(doc: StoreDocument): void {
    if (this.fault) {
      throw new Error(`Refusing to overwrite the stored data: ${this.fault}`)
    }
    this.storage.setItem(STORAGE_KEY, JSON.stringify(doc))
  }

  /** Copy the unreadable text aside once. A second failure must not overwrite the first copy —
   *  the earliest one is the one most likely to still hold real sessions. */
  private quarantine(raw: string): void {
    if (this.storage.getItem(QUARANTINE_KEY) !== null) return
    this.storage.setItem(QUARANTINE_KEY, raw)
  }
}
```

**Note:** this imports `parseDocument` and `mergeDocuments` from `./transfer`, which Task 6 creates. Write Task 6 first if you prefer a green build at every step; otherwise expect Task 5's `importDocument` not to compile until Task 6 lands. The `local.test.ts` tests above do not exercise `importDocument`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS for `local.test.ts`. `npm run check` will report the missing `./transfer` module until Task 6 — that is expected and resolved there.

- [ ] **Step 5: Commit**

Commit together with Task 6 so the tree is never left un-type-checkable. Proceed straight to Task 6.

---

### Task 6: Export and merge-by-id import

**Files:**
- Create: `src/lib/storage/transfer.ts`
- Create: `src/lib/storage/transfer.test.ts`

**Interfaces:**
- Consumes: `StoreDocument`, `ImportSummary`, `emptyDocument` (Task 4); `SCHEMA_VERSION`, `migrate` (Task 4).
- Produces:
  - `class InvalidImportError extends Error`
  - `parseDocument(raw: unknown): StoreDocument`
  - `mergeDocuments(current: StoreDocument, incoming: StoreDocument): { doc: StoreDocument; summary: ImportSummary }`
  - `serialiseDocument(doc: StoreDocument): string`
  - `exportFilename(today: ISODate): string`

**Why the whole file is rejected if any session is invalid:** a partial import leaves the store in a state nobody chose, and there's no way to tell afterwards which records were dropped. All-or-nothing is the only outcome that can be reasoned about.

**Settings on merge:** incoming `blockStart` is taken **only if the current store has none**. Import must not silently move the block start on a device that already has one set.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/storage/transfer.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  InvalidImportError,
  exportFilename,
  mergeDocuments,
  parseDocument,
  serialiseDocument,
} from './transfer'
import { SCHEMA_VERSION } from './migrations'
import { emptyDocument } from './repository'
import type { PracticeSession } from '../domain/types'

const session = (id: string, over: Partial<PracticeSession> = {}): PracticeSession => ({
  id,
  type: 'practice',
  date: '2026-08-05',
  location: 'home',
  entries: [{ drillId: '01', swings: 12, feel: 3 }],
  ...over,
})

const doc = (sessions: PracticeSession[], settings = {}) => ({
  schemaVersion: SCHEMA_VERSION,
  sessions,
  settings,
})

describe('parseDocument', () => {
  it('accepts a well-formed export', () => {
    expect(parseDocument(doc([session('a')]))).toEqual(doc([session('a')]))
  })

  it('accepts a document with no sessions', () => {
    expect(parseDocument(doc([])).sessions).toEqual([])
  })

  it('rejects a file that is not a document', () => {
    for (const raw of [null, 'text', 42, []]) {
      expect(() => parseDocument(raw)).toThrow(InvalidImportError)
    }
  })

  it('rejects a session missing an id', () => {
    const bad = { ...session('a'), id: '' }
    expect(() => parseDocument(doc([bad]))).toThrow(InvalidImportError)
  })

  it('rejects a session with an unknown drill id', () => {
    const bad = session('a', { entries: [{ drillId: '99' as never, swings: 1, feel: 3 }] })
    expect(() => parseDocument(doc([bad]))).toThrow(InvalidImportError)
  })

  it('rejects a session with an out-of-range feel', () => {
    const bad = session('a', { entries: [{ drillId: '01', swings: 1, feel: 9 as never }] })
    expect(() => parseDocument(doc([bad]))).toThrow(InvalidImportError)
  })

  it('rejects a session with a malformed date', () => {
    expect(() => parseDocument(doc([session('a', { date: '5 Aug' })]))).toThrow(InvalidImportError)
  })

  it('rejects a session with an unknown location', () => {
    expect(() => parseDocument(doc([session('a', { location: 'range' as never })]))).toThrow(
      InvalidImportError,
    )
  })

  it('rejects the whole file when one session of many is bad', () => {
    const bad = { ...session('b'), location: 'range' }
    expect(() => parseDocument(doc([session('a'), bad as PracticeSession]))).toThrow(
      InvalidImportError,
    )
  })

  it('rejects duplicate ids within one file', () => {
    expect(() => parseDocument(doc([session('a'), session('a')]))).toThrow(InvalidImportError)
  })

  it('explains why it refused', () => {
    expect(() => parseDocument('text')).toThrow(/not a practice-log export/i)
  })
})

describe('mergeDocuments', () => {
  it('adds sessions that are not already stored', () => {
    const { doc: merged, summary } = mergeDocuments(doc([session('a')]), doc([session('b')]))
    expect(merged.sessions.map((s) => s.id).sort()).toEqual(['a', 'b'])
    expect(summary).toEqual({ added: 1, updated: 0 })
  })

  it('updates a session whose id is already stored', () => {
    const { doc: merged, summary } = mergeDocuments(
      doc([session('a')]),
      doc([session('a', { location: 'course' })]),
    )
    expect(merged.sessions).toHaveLength(1)
    expect(merged.sessions[0].location).toBe('course')
    expect(summary).toEqual({ added: 0, updated: 1 })
  })

  it('never drops a stored session that the file does not mention', () => {
    const { doc: merged } = mergeDocuments(doc([session('keep')]), doc([]))
    expect(merged.sessions.map((s) => s.id)).toEqual(['keep'])
  })

  it('takes the block start when the store has none', () => {
    const { doc: merged } = mergeDocuments(doc([]), doc([], { blockStart: '2026-08-03' }))
    expect(merged.settings.blockStart).toBe('2026-08-03')
  })

  it('keeps the block start the store already had', () => {
    const { doc: merged } = mergeDocuments(
      doc([], { blockStart: '2026-08-03' }),
      doc([], { blockStart: '2026-01-01' }),
    )
    expect(merged.settings.blockStart).toBe('2026-08-03')
  })

  it('does not mutate either input', () => {
    const current = doc([session('a')])
    const incoming = doc([session('b')])
    mergeDocuments(current, incoming)
    expect(current.sessions).toHaveLength(1)
    expect(incoming.sessions).toHaveLength(1)
  })

  it('stamps the result with the current schema version', () => {
    expect(mergeDocuments(emptyDocument(), emptyDocument()).doc.schemaVersion).toBe(SCHEMA_VERSION)
  })
})

describe('serialiseDocument', () => {
  it('produces JSON that parses back to the same document', () => {
    const original = doc([session('a')], { blockStart: '2026-08-03' })
    expect(JSON.parse(serialiseDocument(original))).toEqual(original)
  })

  it('is indented, so the file is readable if it ever needs hand-editing', () => {
    expect(serialiseDocument(emptyDocument())).toContain('\n  ')
  })
})

describe('exportFilename', () => {
  it('names the file after the date it was taken', () => {
    expect(exportFilename('2026-08-04')).toBe('golf-practice-2026-08-04.json')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — cannot resolve `./transfer`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/storage/transfer.ts`:

```ts
import type { DrillId, ISODate, Location, PracticeSession } from '../domain/types'
import { DRILLS } from '../domain/drills'
import { parseISODate } from '../domain/block'
import type { ImportSummary, StoreDocument } from './repository'
import { SCHEMA_VERSION, migrate } from './migrations'

const DRILL_IDS = new Set<string>(DRILLS.map((d) => d.id))
const LOCATIONS = new Set<string>(['sim', 'home', 'course'] satisfies Location[])

/** The chosen file is not a practice-log export, or one of its records is malformed. */
export class InvalidImportError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidImportError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function reject(reason: string): never {
  throw new InvalidImportError(`That file is not a practice-log export: ${reason}`)
}

function checkSession(raw: unknown, index: number): PracticeSession {
  const where = `session ${index + 1}`
  if (!isRecord(raw)) reject(`${where} is not an object.`)

  if (typeof raw.id !== 'string' || raw.id === '') reject(`${where} has no id.`)
  if (raw.type !== 'practice') reject(`${where} is not a practice session.`)
  if (typeof raw.date !== 'string' || parseISODate(raw.date) === null) {
    reject(`${where} has an invalid date.`)
  }
  if (typeof raw.location !== 'string' || !LOCATIONS.has(raw.location)) {
    reject(`${where} has an unknown location.`)
  }
  if (!Array.isArray(raw.entries)) reject(`${where} has no drill entries.`)
  if (raw.notes !== undefined && typeof raw.notes !== 'string') reject(`${where} has invalid notes.`)

  const entries = raw.entries.map((entry, i) => {
    const what = `${where}, drill entry ${i + 1}`
    if (!isRecord(entry)) reject(`${what} is not an object.`)
    if (typeof entry.drillId !== 'string' || !DRILL_IDS.has(entry.drillId)) {
      reject(`${what} names a drill that does not exist.`)
    }
    if (typeof entry.swings !== 'number' || !Number.isInteger(entry.swings) || entry.swings < 1) {
      reject(`${what} has an invalid swing count.`)
    }
    if (typeof entry.feel !== 'number' || !Number.isInteger(entry.feel) || entry.feel < 1 || entry.feel > 5) {
      reject(`${what} has a feel outside 1-5.`)
    }
    return {
      drillId: entry.drillId as DrillId,
      swings: entry.swings as number,
      feel: entry.feel as PracticeSession['entries'][number]['feel'],
    }
  })

  const session: PracticeSession = {
    id: raw.id as string,
    type: 'practice',
    date: raw.date as ISODate,
    location: raw.location as Location,
    entries,
  }
  if (typeof raw.notes === 'string' && raw.notes !== '') session.notes = raw.notes
  return session
}

/**
 * Validate an imported file. **All or nothing** — one bad record rejects the whole file.
 * A partial import leaves the store in a state nobody chose, with no way to tell afterwards
 * what was dropped.
 */
export function parseDocument(raw: unknown): StoreDocument {
  let migrated: StoreDocument
  try {
    // Reuse the version guards: an export from a newer build must be refused here too.
    migrated = migrate(raw)
  } catch (error) {
    reject(error instanceof Error ? error.message : 'it could not be read.')
  }

  const sessions = migrated.sessions.map(checkSession)

  const ids = new Set<string>()
  for (const s of sessions) {
    if (ids.has(s.id)) reject(`it contains two sessions with the id "${s.id}".`)
    ids.add(s.id)
  }

  return { schemaVersion: SCHEMA_VERSION, sessions, settings: migrated.settings }
}

/**
 * Merge by session id. Adds and updates; **never drops**. `localStorage` is the only copy of
 * this data, so an import that could delete would be a foot-gun aimed at months of logs.
 *
 * Settings are taken from the file only where the store has nothing — importing must not
 * silently move a block start that is already set on this device.
 */
export function mergeDocuments(
  current: StoreDocument,
  incoming: StoreDocument,
): { doc: StoreDocument; summary: ImportSummary } {
  const merged = new Map(current.sessions.map((s) => [s.id, s]))
  let added = 0
  let updated = 0

  for (const session of incoming.sessions) {
    if (merged.has(session.id)) updated++
    else added++
    merged.set(session.id, session)
  }

  return {
    doc: {
      schemaVersion: SCHEMA_VERSION,
      sessions: [...merged.values()],
      settings: {
        ...incoming.settings,
        ...current.settings,
      },
    },
    summary: { added, updated },
  }
}

/** Indented, because the file is a backup a human may one day have to read or repair. */
export function serialiseDocument(doc: StoreDocument): string {
  return JSON.stringify(doc, null, 2)
}

export function exportFilename(today: ISODate): string {
  return `golf-practice-${today}.json`
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test && npm run check`
Expected: PASS, and `check` is now clean — `local.ts`'s import of `./transfer` resolves.

- [ ] **Step 5: Commit Tasks 5 and 6 together**

```bash
git add src/lib/storage
git commit -m "$(cat <<'EOF'
Store practice sessions in localStorage, with export and import

LocalStorageRepo takes Storage by constructor injection, so the whole thing is
tested in Node against a 30-line in-memory fake rather than pulling in jsdom.

Three guards, all serving the fact that localStorage is the only copy of this
data. Unreadable JSON is copied aside before anything is written and further
writes are refused. A document from a newer build is refused but not moved --
the data is fine, this build is behind. Import merges by id, so it can add and
update but never drop, and one malformed record rejects the whole file rather
than leaving a partial state nobody chose.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UDMck26QppQA5Rbic9coEL
EOF
)"
```

---

### Task 7: The sessions store

**Files:**
- Create: `src/lib/stores/sessions.svelte.ts`

**Interfaces:**
- Consumes: `Repository`, `Settings`, `ImportSummary` (Task 4); `LocalStorageRepo` (Task 5); `serialiseDocument`, `parseDocument`, `exportFilename` (Task 6); `PracticeSession` (Task 1).
- Produces: `const sessions` — a singleton with reactive `list`, `settings`, `ready`, `warning`; and methods `load()`, `save(session)`, `remove(id)`, `setBlockStart(date)`, `exportText()`, `exportName()`, `importText(text)`, `quarantinedText()`.

**Why `.svelte.ts`:** Svelte 5 only compiles rune syntax (`$state`) in files with a `.svelte.ts` extension. A plain `.ts` file will silently treat `$state` as an undefined function.

**This file is the only place in the app that constructs a repository.** Components import `sessions`, never `LocalStorageRepo`.

- [ ] **Step 1: Write the store**

Create `src/lib/stores/sessions.svelte.ts`:

```ts
import type { ISODate, PracticeSession } from '../domain/types'
import { resolveISODate } from '../domain/today'
import type { ImportSummary, Repository, Settings } from '../storage/repository'
import { LocalStorageRepo } from '../storage/local'
import { InvalidImportError, exportFilename, serialiseDocument } from '../storage/transfer'

/**
 * The single point where the app touches storage. **No component may import a repository or
 * call `localStorage`** — see `CLAUDE.md`. Everything goes through this object.
 *
 * The repository is injectable so a future `RemoteRepo` is a one-line change here and nowhere
 * else, which is the entire justification for the async interface.
 */
class SessionStore {
  /** Newest first, mirroring the repository's ordering. */
  list = $state<PracticeSession[]>([])
  settings = $state<Settings>({})
  /** False until the first load resolves, so the UI can avoid flashing "no sessions yet". */
  ready = $state(false)
  /** Surfaced by the Data panel. Non-null means writes are being refused. */
  warning = $state<string | null>(null)

  #repo: Repository

  constructor(repo: Repository = new LocalStorageRepo()) {
    this.#repo = repo
  }

  async load(): Promise<void> {
    this.list = await this.#repo.listSessions()
    this.settings = await this.#repo.getSettings()
    this.warning = this.#repo.faultMessage
    this.ready = true
  }

  async save(session: PracticeSession): Promise<void> {
    await this.#repo.saveSession(session)
    await this.load()
  }

  async remove(id: string): Promise<void> {
    await this.#repo.deleteSession(id)
    await this.load()
  }

  async setBlockStart(date: ISODate): Promise<void> {
    await this.#repo.saveSettings({ ...this.settings, blockStart: date })
    await this.load()
  }

  async exportText(): Promise<string> {
    return serialiseDocument(await this.#repo.exportDocument())
  }

  exportName(): string {
    return exportFilename(resolveISODate())
  }

  /**
   * Throws `InvalidImportError` with a readable reason, and the caller shows `error.message`
   * as-is.
   *
   * The bare `JSON.parse` is wrapped deliberately. Left unguarded it throws a `SyntaxError`
   * worded by the browser — "Unexpected token < in JSON at position 0" — which is not a stated
   * reason in this app's voice, and it would give the import UI a second error type to
   * special-case. One type, one voice, every rejection path.
   */
  async importText(text: string): Promise<ImportSummary> {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new InvalidImportError('That file is not a practice-log export: it is not valid JSON.')
    }
    const summary = await this.#repo.importDocument(parsed)
    await this.load()
    return summary
  }

  async quarantinedText(): Promise<string | null> {
    return this.#repo.readQuarantine()
  }
}

export const sessions = new SessionStore()
```

- [ ] **Step 2: Verify it type-checks**

Run: `npm run check`
Expected: no errors. (`npm test` has nothing new to run — this layer is UI glue, and decision D8 puts UI outside the test boundary.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/stores/sessions.svelte.ts
git commit -m "$(cat <<'EOF'
Wrap the repository in a rune store

The one place in the app that constructs a repository. Components import
`sessions` and never see LocalStorageRepo, which is what keeps the rule in
CLAUDE.md -- no component calls localStorage -- enforceable by inspection.

Named .svelte.ts because Svelte 5 only compiles rune syntax in files with that
extension; in a plain .ts file $state is silently an undefined function.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UDMck26QppQA5Rbic9coEL
EOF
)"
```

---

### Task 8: Routing, the nav, and the 404 shim

**Files:**
- Create: `src/lib/stores/router.svelte.ts`
- Create: `src/routes/PlanView.svelte`
- Create: `src/routes/LogView.svelte` (placeholder; filled in Tasks 9–11)
- Create: `src/lib/components/SiteNav.svelte`
- Modify: `src/App.svelte`
- Modify: `vite.config.ts`
- Modify: `.github/workflows/deploy.yml`
- Modify: `docs/design.md`
- Modify: `docs/architecture.md`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `type Route = 'plan' | 'log'`, `const router` with reactive `current: Route`, and methods `start(): () => void`, `href(route: Route): string`, `go(route: Route): void`, `onNavClick(event: MouseEvent, route: Route): void`.

> **⚠ The one thing that will silently break the phone layout.**
> `app.css` makes `.wrap` a flex column at `≤760px`, and `TodayPanel.svelte` uses `order:-1` to
> float the Today panel above the hero. That works only because `.wrap`'s flex children are the
> sections themselves.
>
> - **`PlanView.svelte` must NOT wrap its sections in a container element.** Its template is a
>   bare list of components. A wrapper `<div>` makes `.wrap` have one child, and `order:-1` on
>   `.today` stops doing anything — with no error and no test failure.
> - **`SiteNav` needs `order:-2` inside its own `≤760px` media query**, or the Today panel's
>   `order:-1` will float above the nav.

- [ ] **Step 1: Write the router**

Create `src/lib/stores/router.svelte.ts`:

```ts
export type Route = 'plan' | 'log'

const PATHS: Record<Route, string> = { plan: '/', log: '/log' }

/** `null` for anything unrecognised — the caller normalises it back to the plan. */
function routeFor(pathname: string): Route | null {
  const path = pathname.replace(/\/+$/, '') || '/'
  if (path === '/' || path === '/index.html') return 'plan'
  if (path === '/log') return 'log'
  return null
}

/** A modified click means the user wants a new tab or window. Leave those to the browser. */
function isPlainClick(event: MouseEvent): boolean {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    !event.defaultPrevented
  )
}

class Router {
  current = $state<Route>('plan')

  /** Call once, from an `$effect`. Returns the teardown. */
  start(): () => void {
    this.#sync(true)
    const onPop = () => this.#sync(false)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }

  href(route: Route): string {
    return PATHS[route]
  }

  go(route: Route): void {
    if (this.current !== route) {
      history.pushState({}, '', PATHS[route])
      this.current = route
    }
    window.scrollTo({ top: 0 })
  }

  /**
   * For nav links. They stay real `<a href>` elements — middle-click and open-in-new-tab must
   * keep working, and they only do if the href is genuine and modified clicks fall through.
   */
  onNavClick(event: MouseEvent, route: Route): void {
    if (!isPlainClick(event)) return
    event.preventDefault()
    this.go(route)
  }

  /** `replace` rewrites an unknown path rather than pushing, so Back doesn't bounce off it. */
  #sync(replace: boolean): void {
    const route = routeFor(window.location.pathname)
    if (route === null) {
      if (replace) history.replaceState({}, '', PATHS.plan)
      this.current = 'plan'
      return
    }
    this.current = route
  }
}

export const router = new Router()
```

- [ ] **Step 2: Move the plan page into a view**

Create `src/routes/PlanView.svelte` with the **exact** current contents of `App.svelte`'s markup, minus the `.wrap` div. No wrapper element — see the warning above.

```svelte
<script lang="ts">
  import AidsSection from '../lib/components/AidsSection.svelte'
  import ArcSection from '../lib/components/ArcSection.svelte'
  import DrillsSection from '../lib/components/DrillsSection.svelte'
  import Hero from '../lib/components/Hero.svelte'
  import KpiBand from '../lib/components/KpiBand.svelte'
  import OneIdea from '../lib/components/OneIdea.svelte'
  import SiteFooter from '../lib/components/SiteFooter.svelte'
  import TodayPanel from '../lib/components/TodayPanel.svelte'
  import WatchOuts from '../lib/components/WatchOuts.svelte'
  import WeekSection from '../lib/components/WeekSection.svelte'
</script>

<!-- No wrapper element. `.wrap` is a flex column at <=760px and `.today` uses `order:-1` to
     float above the hero; a container here would make that silently do nothing. -->
<Hero />
<TodayPanel />
<KpiBand />
<OneIdea />
<DrillsSection />
<WeekSection />
<ArcSection />
<AidsSection />
<WatchOuts />
<SiteFooter />
```

- [ ] **Step 3: Add a placeholder log view**

Create `src/routes/LogView.svelte`. Tasks 9–11 fill it in.

```svelte
<script lang="ts">
  import SiteFooter from '../lib/components/SiteFooter.svelte'
</script>

<section class="log reveal" aria-labelledby="log-title">
  <span class="eyebrow">Practice log</span>
  <h1 id="log-title">Log a session</h1>
</section>
<SiteFooter />

<style>
  .log{margin-top:40px}
  /* The hero h1 is the poster treatment and belongs to the plan page. A form page takes the
     section h2 scale instead — see docs/design.md section 2. */
  .log h1{font-size:clamp(1.5rem,3.6vw,2.15rem);font-weight:800;margin-top:10px}
</style>
```

- [ ] **Step 4: Write the nav**

Create `src/lib/components/SiteNav.svelte`:

```svelte
<script lang="ts">
  import { router, type Route } from '../stores/router.svelte'

  const ITEMS: { route: Route; label: string }[] = [
    { route: 'plan', label: 'Plan' },
    { route: 'log', label: 'Log' },
  ]
</script>

<nav class="sitenav" aria-label="Sections">
  {#each ITEMS as item (item.route)}
    <a
      href={router.href(item.route)}
      aria-current={router.current === item.route ? 'page' : undefined}
      onclick={(event) => router.onNavClick(event, item.route)}
    >{item.label}</a>
  {/each}
  <!-- Progress arrives in Phase 4. Rendered, not linked: a dead link reads as a broken app,
       and hiding it entirely hides the shape of the thing being built. -->
  <span class="soon">Progress<span class="badge">Soon</span></span>
</nav>

<style>
  .sitenav{
    display:flex;gap:6px;align-items:center;flex-wrap:wrap;
    padding-bottom:20px;border-bottom:1px solid var(--line);
  }
  .sitenav a,.sitenav .soon{
    font-family:'Space Mono',monospace;font-size:.72rem;letter-spacing:.16em;
    text-transform:uppercase;text-decoration:none;
    display:flex;align-items:center;gap:8px;
    padding:12px 16px;min-height:44px;border-radius:100px;
    border:1px solid transparent;color:var(--dim);
    transition:color .18s ease,border-color .18s ease;
  }
  .sitenav a:hover{color:var(--chalk);border-color:var(--line-hover)}
  .sitenav a[aria-current="page"]{color:var(--ball);border-color:var(--ball-dim)}
  /* Not a link and not focusable — there is nothing there to activate yet. The badge carries
     the meaning in text, so it never depends on the dimming alone. */
  .sitenav .soon{opacity:.5;cursor:default}
  .sitenav .badge{
    font-size:.58rem;letter-spacing:.08em;padding:2px 7px;
    border:1px solid var(--line);border-radius:100px;color:var(--dim);
  }

  @media (max-width:760px){
    /* `.wrap` is a flex column here and `.today` claims order:-1, so the nav must outrank it. */
    .sitenav{order:-2}
  }

  @media (prefers-reduced-motion:reduce){
    .sitenav a{transition:none}
  }
</style>
```

- [ ] **Step 5: Rewrite `App.svelte`**

```svelte
<script lang="ts">
  import SiteNav from './lib/components/SiteNav.svelte'
  import LogView from './routes/LogView.svelte'
  import PlanView from './routes/PlanView.svelte'
  import { router } from './lib/stores/router.svelte'
  import { sessions } from './lib/stores/sessions.svelte'

  $effect(() => router.start())
  $effect(() => {
    void sessions.load()
  })
</script>

<div class="wrap">
  <SiteNav />
  {#if router.current === 'log'}
    <LogView />
  {:else}
    <PlanView />
  {/if}
</div>
```

- [ ] **Step 6: Generate the 404 shim at build time**

Modify `vite.config.ts`:

```ts
import { copyFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'

/**
 * GitHub Pages serves static files only, so `GET /log` is a hard 404 without a shim.
 *
 * The shim must be **copied from the build output**, never hand-written into `public/`: Vite
 * hashes asset filenames, so a static copy would point at a stale bundle after the next build
 * and fail only in production, only on deep links.
 *
 * Pages returns HTTP 404 alongside this file's contents. The app renders correctly; only
 * crawlers and `curl -f` see the status. Accepted — see the spec.
 */
function pagesSpaFallback(): Plugin {
  let root = process.cwd()
  let outDir = 'dist'
  return {
    name: 'pages-spa-fallback',
    apply: 'build',
    configResolved(config) {
      root = config.root
      outDir = config.build.outDir
    },
    closeBundle() {
      const dir = resolve(root, outDir)
      const index = resolve(dir, 'index.html')
      if (!existsSync(index)) {
        throw new Error('dist/index.html is missing — cannot write the 404 shim')
      }
      copyFileSync(index, resolve(dir, '404.html'))
    },
  }
}

export default defineConfig({
  // Apex-style custom domain (golf.whitfield.life), not a project subpath.
  base: '/',
  plugins: [svelte(), pagesSpaFallback()],
  test: {
    include: ['src/**/*.test.ts'],
  },
})
```

- [ ] **Step 7: Assert the shim survives the build**

In `.github/workflows/deploy.yml`, extend the existing verification step. Replace the `Verify CNAME survived the build` step with:

```yaml
      - name: Verify CNAME and the 404 shim survived the build
        # Losing CNAME drops the custom domain; losing 404.html breaks every deep link
        # (/log). Both fail silently otherwise — the site still builds and still deploys.
        run: |
          test -f dist/CNAME || { echo "::error::dist/CNAME is missing — the custom domain would be dropped"; exit 1; }
          grep -qx 'golf.whitfield.life' dist/CNAME || { echo "::error::dist/CNAME has unexpected contents"; exit 1; }
          test -f dist/404.html || { echo "::error::dist/404.html is missing — deep links like /log would 404"; exit 1; }
          grep -q 'id="app"' dist/404.html || { echo "::error::dist/404.html is not the built app shell"; exit 1; }
```

- [ ] **Step 8: Verify the build and both routes**

```bash
npm run check && npm test && npm run build
test -f dist/404.html && echo "404 shim written"
diff <(sed 's/[[:space:]]//g' dist/index.html) <(sed 's/[[:space:]]//g' dist/404.html) && echo "shim matches index"
```

Then `npm run dev` and check, at a phone width (≤760px) and a desktop width:
- `/` renders the poster page **exactly** as before, with the nav above it.
- At ≤760px the order is **nav, Today panel, hero** — if the Today panel is below the hero, Step 2's no-wrapper rule was broken.
- `/log` renders the placeholder.
- The `PLAN`/`LOG` links change the URL without a full page load; Back and Forward work.
- `#drills` from the Today panel still scrolls rather than routing.
- Middle-clicking `LOG` opens a real new tab.
- Tab focus shows the yellow `:focus-visible` ring on every nav link.

- [ ] **Step 9: Document it**

In `docs/design.md` §4 (Components), add:

> ### Site nav
> `.sitenav` — a mono pill row at the top of the page, above everything, with a hairline beneath.
> Active view carries `aria-current="page"` and renders in `--ball` with a `--ball-dim` border.
> Progress is not a link — it is a `<span>` with a `SOON` badge, because a dead link reads as a
> broken app and hiding it hides the shape of what's being built. Its unavailability is carried
> by the badge text, never by the dimming alone. `44px` minimum, and `order:-2` below the
> breakpoint so the Today panel's `order:-1` cannot float above it.

In `docs/design.md` §2 (Typography), under **Scale**, add a note:

> The `h1` row above is the **hero** treatment and belongs to the Plan view. The Log view's `h1`
> takes the section `h2` scale — a form page shouldn't open with a poster headline. Each view
> still has exactly one `h1`.

In `docs/architecture.md` §1, add the routing decisions to the table:

| # | Decision | Choice | Rationale |
|---|---|---|---|
| D9 | Navigation | **Client-side views** (Plan, Log; Progress in Phase 4) | The log needs its own screen. The poster page becomes the Plan view, visually unchanged. |
| D10 | URL scheme | **Clean paths** via the History API, with a generated `404.html` | Real URLs. The shim is copied from `dist/index.html` at build time — a hand-written `public/404.html` would reference stale hashed assets. |

And in `docs/architecture.md` §5 (Deployment), add:

> `dist/404.html` must survive the build alongside `CNAME`. It is generated by the
> `pages-spa-fallback` plugin in `vite.config.ts`, copying the built `index.html` so it carries
> the correct hashed asset names. The deploy workflow asserts both. Losing the shim 404s every
> deep link and fails silently — the site still builds and still deploys.

- [ ] **Step 10: Commit**

```bash
git add src vite.config.ts .github/workflows/deploy.yml docs/design.md docs/architecture.md
git commit -m "$(cat <<'EOF'
Split the page into Plan and Log views behind a router

The log needs its own screen, so the poster page becomes the Plan view --
visually unchanged, with a nav bar above it. Progress is shown with a SOON
badge rather than hidden or dead-linked.

Clean paths need a 404 shim on Pages, and it has to be copied from the build
output. A hand-written public/404.html would reference stale hashed asset names
and break only in production, only on deep links. The deploy workflow now
asserts it alongside CNAME.

PlanView deliberately has no wrapper element: `.wrap` is a flex column below
760px and the Today panel uses order:-1 to float above the hero, which stops
working the moment its sections stop being `.wrap`'s direct children.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UDMck26QppQA5Rbic9coEL
EOF
)"
```

---

### Task 9: The log form

**Files:**
- Create: `src/lib/components/SwingStepper.svelte`
- Create: `src/lib/components/FeelPicker.svelte`
- Create: `src/lib/components/DrillEntryRow.svelte`
- Create: `src/lib/components/SessionForm.svelte`
- Modify: `src/routes/LogView.svelte`
- Modify: `docs/design.md`

**Interfaces:**
- Consumes: `SessionDraft`, `DraftEntry`, `draftForDay`, `draftFromSession`, `toSession`, `validateDraft`, `seedEntries`, `defaultLocation` (Task 3); `resolveDayKey`, `resolveISODate` (Task 1); `WEEK`, `DAY_NAMES` (existing); `drill` (existing); `sessions` store (Task 7).
- Produces: `SessionForm` with props `{ editing?: PracticeSession | null; onDone?: () => void }`.

**Why native radios and checkboxes:** a `role="radiogroup"` of `<button>`s needs hand-written arrow-key handling to be conformant. Real `<input type="radio">` elements with styled `<label>`s get the keyboard behaviour, the grouping and the AT announcement for free, and the label is what gets sized to `44px`.

- [ ] **Step 1: Write the swing stepper**

Create `src/lib/components/SwingStepper.svelte`:

```svelte
<script lang="ts">
  import type { DrillId } from '../domain/types'

  // `drillId` keys the element id; `label` only ever goes into human-readable aria-label text.
  // Never build an id from `label` — drill names contain spaces and an ampersand, and
  // `aria-labelledby` parses its value as a *space-separated list of ids*, so an id with a
  // space in it silently resolves to nothing and the input announces as unlabelled.
  let {
    value = $bindable(),
    drillId,
    label,
  }: { value: number; drillId: DrillId; label: string } = $props()

  const MIN = 1
  const MAX = 999

  function step(by: number) {
    value = Math.min(MAX, Math.max(MIN, value + by))
  }

  function onInput(event: Event) {
    const next = Number((event.currentTarget as HTMLInputElement).value)
    value = Number.isFinite(next) ? Math.min(MAX, Math.max(MIN, Math.round(next))) : MIN
  }
</script>

<div class="stepper">
  <span class="lab" id="swings-{drillId}">Swings</span>
  <button type="button" onclick={() => step(-1)} aria-label="One fewer swing for {label}">−</button>
  <input
    type="number"
    inputmode="numeric"
    min={MIN}
    max={MAX}
    {value}
    oninput={onInput}
    aria-labelledby="swings-{drillId}"
  />
  <button type="button" onclick={() => step(1)} aria-label="One more swing for {label}">+</button>
</div>

<style>
  .stepper{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .lab{
    font-family:'Space Mono',monospace;font-size:.68rem;letter-spacing:.14em;
    text-transform:uppercase;color:var(--dim);flex-basis:100%;
  }
  .stepper button{
    font-family:'Space Mono',monospace;font-size:1.1rem;line-height:1;
    width:44px;height:44px;flex:0 0 44px;
    background:var(--card);color:var(--chalk);
    border:1px solid var(--line);border-radius:100px;cursor:pointer;
    transition:border-color .18s ease,color .18s ease;
  }
  .stepper button:hover{border-color:var(--line-hover);color:var(--ball)}
  .stepper input{
    font-family:'Space Mono',monospace;font-size:1rem;text-align:center;
    width:72px;height:44px;
    background:var(--card);color:var(--chalk);
    border:1px solid var(--line);border-radius:10px;
  }
  /* The spinners are a 20px-wide tap target next to a 44px one. Ours replace them. */
  .stepper input::-webkit-outer-spin-button,
  .stepper input::-webkit-inner-spin-button{appearance:none;margin:0}
  .stepper input{appearance:textfield;-moz-appearance:textfield}

  @media (prefers-reduced-motion:reduce){
    .stepper button{transition:none}
  }
</style>
```

- [ ] **Step 2: Write the feel picker**

Create `src/lib/components/FeelPicker.svelte`:

```svelte
<script lang="ts">
  import type { Feel } from '../domain/types'

  let {
    value = $bindable(),
    touched = $bindable(),
    name,
    cue,
  }: { value: Feel; touched: boolean; name: string; cue: string } = $props()

  const LEVELS: Feel[] = [1, 2, 3, 4, 5]

  function choose(level: Feel) {
    value = level
    touched = true
  }
</script>

<fieldset class="feel" class:untouched={!touched}>
  <legend>Feel · <span class="cue">{cue}</span></legend>
  <div class="levels">
    {#each LEVELS as level (level)}
      <input
        type="radio"
        id="{name}-feel-{level}"
        {name}
        checked={value === level}
        onchange={() => choose(level)}
      />
      <label for="{name}-feel-{level}">{level}</label>
    {/each}
  </div>
</fieldset>

<style>
  .feel{border:none;margin-top:14px}
  .feel legend{
    font-family:'Space Mono',monospace;font-size:.68rem;letter-spacing:.14em;
    text-transform:uppercase;color:var(--dim);padding:0;margin-bottom:8px;
  }
  .feel .cue{text-transform:none;letter-spacing:.02em;font-style:italic}
  .levels{display:flex;gap:6px;flex-wrap:wrap}
  .levels input{position:absolute;opacity:0;width:0;height:0}
  .levels label{
    font-family:'Space Mono',monospace;font-size:.8rem;
    display:flex;align-items:center;justify-content:center;
    width:44px;height:44px;border-radius:100px;
    border:1px solid var(--line);color:var(--dim);
    cursor:pointer;transition:color .18s ease,border-color .18s ease;
  }
  .levels label:hover{color:var(--chalk);border-color:var(--line-hover)}
  .levels input:checked + label{
    background:var(--ball);border-color:var(--ball);color:var(--bg);font-weight:700;
  }
  /* The radio is visually hidden, so the focus ring has to be forwarded to its label —
     otherwise keyboard users get no focus state at all. */
  .levels input:focus-visible + label{outline:2px solid var(--ball);outline-offset:3px}

  /* Feel defaults to a neutral 3. Until it is actually tapped the whole group renders muted,
     so at a glance you can see which drills you judged and which just took the default.
     Nothing about the stored value changes. */
  .feel.untouched .levels input:checked + label{
    background:transparent;color:var(--dim);border-color:var(--line);font-weight:400;
  }

  @media (prefers-reduced-motion:reduce){
    .levels label{transition:none}
  }
</style>
```

- [ ] **Step 3: Write the drill row**

Create `src/lib/components/DrillEntryRow.svelte`:

```svelte
<script lang="ts">
  import type { DraftEntry } from '../domain/session'
  import { drill } from '../domain/drills'
  import FeelPicker from './FeelPicker.svelte'
  import SwingStepper from './SwingStepper.svelte'

  // `onchange` tells the form its drill selection has been touched by hand, so a later date
  // change stops re-seeding over the top of it.
  let { entry = $bindable(), onchange }: { entry: DraftEntry; onchange?: () => void } = $props()

  const info = $derived(drill(entry.drillId))
</script>

<div class="row" class:on={entry.selected}>
  <input
    type="checkbox"
    id="pick-{entry.drillId}"
    bind:checked={entry.selected}
    onchange={() => onchange?.()}
  />
  <label for="pick-{entry.drillId}">
    <span class="no">{entry.drillId}</span>
    <span class="name">{info.name}</span>
    <span class="reps">{info.reps}</span>
  </label>

  {#if entry.selected}
    <div class="detail">
      <SwingStepper bind:value={entry.swings} drillId={entry.drillId} label={info.name} />
      <FeelPicker
        bind:value={entry.feel}
        bind:touched={entry.feelTouched}
        name="feel-{entry.drillId}"
        cue={info.feelsLike}
      />
    </div>
  {/if}
</div>

<style>
  .row{
    background:var(--card);border:1px solid var(--line);border-radius:14px;
    padding:0 16px;transition:border-color .18s ease;
  }
  .row.on{border-color:var(--ball-dim)}
  .row input[type="checkbox"]{position:absolute;opacity:0;width:0;height:0}
  .row label{
    display:flex;align-items:center;gap:12px;flex-wrap:wrap;
    min-height:44px;padding:12px 0;cursor:pointer;
  }
  /* Drawn rather than native so it can carry the design's colours and reach 44px. The real
     checkbox above still owns the state, the keyboard and the announcement. */
  .row label::before{
    content:'';flex:0 0 24px;width:24px;height:24px;border-radius:7px;
    border:1px solid var(--line);
  }
  .row.on label::before{
    background:var(--ball);border-color:var(--ball);
    /* The tick, drawn as a clipped block — no icon font, no SVG asset. */
    clip-path:polygon(14% 46%,0 60%,38% 100%,100% 22%,86% 8%,38% 70%);
  }
  .row input:focus-visible + label::before{outline:2px solid var(--ball);outline-offset:3px}
  .row .no{font-family:'Space Mono',monospace;color:var(--ball);font-size:.82rem}
  .row .name{font-weight:600}
  .row .reps{
    font-family:'Space Mono',monospace;font-size:.72rem;color:var(--dim);
    margin-left:auto;letter-spacing:.06em;
  }
  .detail{padding:4px 0 18px;border-top:1px solid var(--line)}
  .detail :global(.stepper){margin-top:14px}

  @media (prefers-reduced-motion:reduce){
    .row{transition:none}
  }
</style>
```

- [ ] **Step 4: Write the form**

Create `src/lib/components/SessionForm.svelte`:

```svelte
<script lang="ts">
  import type { PracticeSession } from '../domain/types'
  import {
    draftForDay,
    draftFromSession,
    defaultLocation,
    seedEntries,
    toSession,
    validateDraft,
    type SessionDraft,
  } from '../domain/session'
  import { DAY_NAMES, WEEK } from '../domain/plan'
  import { resolveDayKey, resolveISODate } from '../domain/today'
  import { dayKeyFor } from '../domain/block'
  import type { Location } from '../domain/types'
  import { sessions } from '../stores/sessions.svelte'
  import DrillEntryRow from './DrillEntryRow.svelte'

  let { editing = null, onDone }: { editing?: PracticeSession | null; onDone?: () => void } =
    $props()

  const LOCATIONS: { value: Location; label: string }[] = [
    { value: 'sim', label: 'Sim' },
    { value: 'home', label: 'Home' },
    { value: 'course', label: 'Course' },
  ]

  function fresh(): SessionDraft {
    return draftForDay(resolveDayKey(), resolveISODate())
  }

  let draft = $state<SessionDraft>(editing ? draftFromSession(editing) : fresh())
  /** Once the drills have been changed by hand, a date change must not re-seed over the top. */
  let drillsTouched = $state(editing !== null)
  let problems = $state<string[]>([])
  let saved = $state<string | null>(null)

  // Reload the form when the caller switches which session is being edited.
  $effect(() => {
    draft = editing ? draftFromSession(editing) : fresh()
    drillsTouched = editing !== null
    problems = []
  })

  /** The day the chosen date falls on, so the header names the plan the ticks came from.
   *  Falls back to today when the date box is mid-edit and momentarily unparseable. */
  const dayKey = $derived(dayKeyFor(draft.date) ?? resolveDayKey())
  const plan = $derived(WEEK[dayKey])

  function onDateChange() {
    if (drillsTouched) return
    draft.entries = seedEntries(dayKey)
    draft.location = defaultLocation(dayKey)
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault()
    problems = validateDraft(draft)
    if (problems.length > 0) return
    try {
      await sessions.save(toSession(draft))
    } catch (error) {
      problems = [error instanceof Error ? error.message : 'Could not save.']
      return
    }
    saved = editing ? 'Session updated.' : 'Session saved.'
    draft = fresh()
    drillsTouched = false
    onDone?.()
  }
</script>

<form onsubmit={submit} novalidate>
  <div class="head">
    <span class="eyebrow">{editing ? 'Editing' : DAY_NAMES[dayKey]}</span>
    <span class="plan-title">{plan.title}</span>
  </div>

  <div class="field">
    <label class="lab" for="session-date">Date</label>
    <input
      id="session-date"
      type="date"
      bind:value={draft.date}
      onchange={onDateChange}
      required
    />
  </div>

  <div class="field">
    <span class="lab" id="where-label">Where</span>
    <div class="pills" role="group" aria-labelledby="where-label">
      {#each LOCATIONS as option (option.value)}
        <button
          type="button"
          aria-pressed={draft.location === option.value ? 'true' : 'false'}
          onclick={() => (draft.location = option.value)}
        >{option.label}</button>
      {/each}
    </div>
  </div>

  <div class="field">
    <span class="lab">Drills</span>
    <div class="rows">
      {#each draft.entries as entry, i (entry.drillId)}
        <DrillEntryRow
          bind:entry={draft.entries[i]}
          onchange={() => (drillsTouched = true)}
        />
      {/each}
    </div>
  </div>

  <div class="field">
    <label class="lab" for="session-notes">Notes</label>
    <textarea id="session-notes" rows="3" bind:value={draft.notes}
      placeholder="Optional. What changed, what to try next."></textarea>
  </div>

  {#if problems.length > 0}
    <ul class="problems" role="alert">
      {#each problems as problem (problem)}<li>{problem}</li>{/each}
    </ul>
  {/if}

  <div class="actions">
    <button class="save" type="submit">{editing ? 'Update session' : 'Save session'}</button>
    {#if editing}
      <button class="cancel" type="button" onclick={() => onDone?.()}>Cancel</button>
    {/if}
  </div>

  <p class="saved" role="status">{saved ?? ''}</p>
</form>

<style>
  form{
    background:linear-gradient(100deg,var(--panel),var(--panel-2));
    border:1px solid var(--line);border-left:3px solid var(--ball);
    border-radius:16px;padding:24px 26px 26px;margin-top:24px;
  }
  .head{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap}
  .plan-title{font-family:'Space Mono',monospace;font-size:.76rem;color:var(--dim);letter-spacing:.06em}
  .field{margin-top:22px}
  .lab{
    font-family:'Space Mono',monospace;font-size:.72rem;letter-spacing:.14em;
    text-transform:uppercase;color:var(--dim);display:block;margin-bottom:10px;
  }
  input[type="date"],textarea{
    width:100%;background:var(--card);color:var(--chalk);
    border:1px solid var(--line);border-radius:10px;padding:12px 14px;min-height:44px;
    font-family:'Space Mono',monospace;font-size:.95rem;
  }
  textarea{font-family:'Inter',system-ui,sans-serif;line-height:1.6;resize:vertical}
  textarea::placeholder{color:var(--dim);opacity:.8}

  .pills{display:flex;gap:6px;flex-wrap:wrap}
  .pills button{
    font-family:'Space Mono',monospace;font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;
    background:transparent;color:var(--dim);border:1px solid var(--line);
    border-radius:100px;padding:10px 20px;min-height:44px;cursor:pointer;
    transition:color .18s ease,border-color .18s ease;
  }
  .pills button:hover{color:var(--chalk);border-color:var(--line-hover)}
  .pills button[aria-pressed="true"]{color:var(--bg);background:var(--ball);border-color:var(--ball);font-weight:700}

  .rows{display:flex;flex-direction:column;gap:10px}

  .problems{
    margin-top:20px;padding:14px 16px;list-style:none;
    border:1px solid var(--flag);border-radius:14px;background:var(--flag-wash);
    font-size:.9rem;
  }

  .actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:24px}
  .save{
    flex:1 1 220px;min-height:52px;
    font-family:'Space Mono',monospace;font-size:.8rem;letter-spacing:.14em;text-transform:uppercase;
    background:var(--ball);color:var(--bg);border:1px solid var(--ball);
    border-radius:100px;font-weight:700;cursor:pointer;
  }
  .cancel{
    min-height:52px;padding:0 22px;
    font-family:'Space Mono',monospace;font-size:.8rem;letter-spacing:.14em;text-transform:uppercase;
    background:transparent;color:var(--dim);border:1px solid var(--line);
    border-radius:100px;cursor:pointer;
  }
  .cancel:hover{color:var(--chalk);border-color:var(--line-hover)}

  .saved{
    margin-top:12px;min-height:1.4em;
    font-family:'Space Mono',monospace;font-size:.74rem;letter-spacing:.1em;
    text-transform:uppercase;color:var(--ball);
  }

  @media (prefers-reduced-motion:reduce){
    .pills button{transition:none}
  }
</style>
```

- [ ] **Step 5: Put the form on the log view**

Replace `src/routes/LogView.svelte`'s body:

```svelte
<script lang="ts">
  import SessionForm from '../lib/components/SessionForm.svelte'
  import SiteFooter from '../lib/components/SiteFooter.svelte'
</script>

<section class="log reveal" aria-labelledby="log-title">
  <span class="eyebrow">Practice log</span>
  <h1 id="log-title">Log a session</h1>
  <p class="sub">Today's drills are already ticked. Change what you actually did, then save.</p>
  <SessionForm />
</section>
<SiteFooter />

<style>
  .log{margin-top:40px}
  /* The hero h1 is the poster treatment and belongs to the plan page. A form page takes the
     section h2 scale instead — see docs/design.md section 2. */
  .log h1{font-size:clamp(1.5rem,3.6vw,2.15rem);font-weight:800;margin:10px 0 6px}
  .log .sub{color:var(--dim);font-size:.95rem;max-width:60ch}
</style>
```

- [ ] **Step 6: Verify**

Run: `npm run check && npm test && npm run dev`

At a phone width, on `/log`:
- The day's drills are pre-ticked with their default swing counts.
- Every feel group starts on 3, **rendered muted**; tapping any level makes the group solid.
- `−`/`+` and every feel level measure at least 44×44 (check in devtools).
- Ticking a drill, then changing the date, does **not** re-seed the ticks. Changing the date first, without touching a drill, **does** re-seed.
- Submitting with nothing ticked shows the red problem panel and saves nothing.
- Saving clears the form and shows `SESSION SAVED`.
- Reloading the browser and returning to `/log` keeps the saved session in `localStorage` (check the `golf:store` key in devtools — this is the only place you should ever see that key referenced by hand).
- Keyboard: Tab reaches every control, arrow keys move between feel levels, and the focus ring is visible on the drawn checkbox and the feel labels.

- [ ] **Step 7: Document the new components**

Add to `docs/design.md` §4:

> ### Form field
> `.lab` mono uppercase label above a `--card` control with a `--line` border and `10px` radius.
> Text inputs use Space Mono (they hold data); the notes `textarea` uses Inter (it holds prose).
>
> ### Location pills
> Identical to the day bar — mono pill `<button>`s carrying `aria-pressed`, `44px` minimum,
> solid `--ball` when selected. Reused deliberately: the two controls do the same job.
>
> ### Drill entry row
> `.row` — a `--card` row whose whole label is the tap target. The checkbox is visually hidden
> and a `::before` box is drawn in its place so it can carry `--ball` and reach `44px`; the real
> input keeps the state, the keyboard and the announcement. Ticked rows take a `--ball-dim`
> border and reveal the swing stepper and feel picker.
>
> ### Swing stepper
> `[−] n [+]` — two `44px` round buttons around a `72px` mono number field. Native spinners are
> suppressed: they are a 20px target sitting next to a 44px one.
>
> ### Feel picker
> Five `44px` mono pills backed by real radio inputs, so arrow-key navigation and grouping come
> free. The visually-hidden input forwards `:focus-visible` to its label — without that,
> keyboard users get no focus state at all.
>
> **Untouched state:** feel defaults to a neutral 3 and the group renders muted until tapped.
> This is a rendering state only; the stored value is 3 either way. It exists so you can see at
> a glance which drills you actually judged.
>
> ### Save button
> Full-width `--ball` fill with `--bg` text, `52px` — the page's only primary action.

- [ ] **Step 8: Commit**

```bash
git add src docs/design.md
git commit -m "$(cat <<'EOF'
Add the log form

The day's drills arrive pre-ticked with their authored swing counts, so a
normal session is a couple of taps and save. Changing the date re-seeds the
ticks only while they are untouched -- otherwise a date correction would wipe
what you had already entered.

Feel defaults to a neutral 3 and renders muted until tapped. The stored value
is 3 either way; the muting is there so you can see at a glance which drills
you actually judged rather than accepted the default on.

Checkboxes and radios are real inputs with drawn labels, not styled divs.
Arrow-key navigation, grouping and announcement come free, and the visually
hidden input forwards its focus ring to the label it controls.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UDMck26QppQA5Rbic9coEL
EOF
)"
```

---

### Task 10: Recent sessions, edit and delete

**Files:**
- Create: `src/lib/components/RecentSessions.svelte`
- Modify: `src/routes/LogView.svelte`
- Modify: `docs/design.md`

**Interfaces:**
- Consumes: `sessions` store (Task 7); `drill` (existing); `PracticeSession` (Task 1).
- Produces: `RecentSessions` with props `{ onEdit: (session: PracticeSession) => void }`.

**Why `<details>`:** the expand/collapse gets keyboard support, `aria-expanded` and screen-reader announcement from the browser. Hand-rolling it would be twenty lines of state and event handling to arrive somewhere worse.

- [ ] **Step 1: Write the list**

Create `src/lib/components/RecentSessions.svelte`:

```svelte
<script lang="ts">
  import type { PracticeSession } from '../domain/types'
  import { drill } from '../domain/drills'
  import { sessions } from '../stores/sessions.svelte'

  let { onEdit }: { onEdit: (session: PracticeSession) => void } = $props()

  /** Confirm in place rather than with `confirm()` — a native dialog is easy to dismiss by
   *  accident on a phone, and this deletes the only copy of a session. */
  let confirming = $state<string | null>(null)

  const SHOWN = 10
  const recent = $derived(sessions.list.slice(0, SHOWN))

  function dayAndMonth(date: string): string {
    const [, month, day] = date.split('-')
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return `${day} ${names[Number(month) - 1] ?? month}`
  }

  async function remove(id: string) {
    await sessions.remove(id)
    confirming = null
  }
</script>

<h2 class="head">Recent sessions</h2>

{#if !sessions.ready}
  <p class="empty">Loading…</p>
{:else if recent.length === 0}
  <p class="empty">Nothing logged yet. Your first session will appear here.</p>
{:else}
  <ul class="list">
    {#each recent as session (session.id)}
      <li>
        <details>
          <summary>
            <span class="date">{dayAndMonth(session.date)}</span>
            <span class="tag">{session.location.toUpperCase()}</span>
            <span class="ids">{session.entries.map((e) => e.drillId).join(' · ')}</span>
          </summary>
          <div class="body">
            {#each session.entries as entry (entry.drillId)}
              <p class="entry">
                <span class="no">{entry.drillId}</span>
                {drill(entry.drillId).name}
                <span class="nums">{entry.swings} swings · feel {entry.feel}/5</span>
              </p>
            {/each}
            {#if session.notes}<p class="notes">{session.notes}</p>{/if}
            <div class="acts">
              <button type="button" onclick={() => onEdit(session)}>Edit</button>
              {#if confirming === session.id}
                <button class="danger" type="button" onclick={() => remove(session.id)}>
                  Delete for good
                </button>
                <button type="button" onclick={() => (confirming = null)}>Keep it</button>
              {:else}
                <button class="danger" type="button" onclick={() => (confirming = session.id)}>
                  Delete
                </button>
              {/if}
            </div>
          </div>
        </details>
      </li>
    {/each}
  </ul>
  {#if sessions.list.length > SHOWN}
    <p class="empty">Showing the most recent {SHOWN} of {sessions.list.length}.</p>
  {/if}
{/if}

<style>
  .head{font-size:clamp(1.25rem,2.6vw,1.6rem);font-weight:800;margin-top:56px}
  .empty{color:var(--dim);font-size:.92rem;margin-top:14px}
  .list{list-style:none;margin-top:18px;display:flex;flex-direction:column;gap:10px}
  details{background:var(--card);border:1px solid var(--line);border-radius:14px}
  summary{
    display:flex;align-items:center;gap:12px;flex-wrap:wrap;
    min-height:44px;padding:12px 16px;cursor:pointer;list-style:none;
  }
  summary::-webkit-details-marker{display:none}
  .date{font-family:'Space Mono',monospace;color:var(--ball);font-size:.82rem;letter-spacing:.06em}
  .tag{
    font-family:'Space Mono',monospace;font-size:.62rem;letter-spacing:.08em;
    padding:3px 8px;border-radius:100px;border:1px solid var(--line);color:var(--dim);
  }
  .ids{font-family:'Space Mono',monospace;font-size:.76rem;color:var(--dim);margin-left:auto}
  .body{padding:4px 16px 16px;border-top:1px solid var(--line)}
  .entry{font-size:.92rem;margin-top:10px;display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
  .entry .no{font-family:'Space Mono',monospace;color:var(--ball);font-size:.78rem}
  .entry .nums{font-family:'Space Mono',monospace;font-size:.76rem;color:var(--dim);margin-left:auto}
  .notes{margin-top:12px;font-size:.9rem;color:var(--dim);font-style:italic}
  .acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}
  .acts button{
    font-family:'Space Mono',monospace;font-size:.7rem;letter-spacing:.12em;text-transform:uppercase;
    min-height:44px;padding:0 18px;border-radius:100px;cursor:pointer;
    background:transparent;color:var(--dim);border:1px solid var(--line);
    transition:color .18s ease,border-color .18s ease;
  }
  .acts button:hover{color:var(--chalk);border-color:var(--line-hover)}
  /* Deleting removes the only copy of a session — the flag colour is exactly what it is for. */
  .acts .danger{color:var(--flag);border-color:var(--flag)}
  .acts .danger:hover{color:var(--flag);border-color:var(--flag);background:var(--flag-wash)}

  @media (prefers-reduced-motion:reduce){
    .acts button{transition:none}
  }
</style>
```

- [ ] **Step 2: Wire it into the log view**

Update `src/routes/LogView.svelte`:

```svelte
<script lang="ts">
  import type { PracticeSession } from '../lib/domain/types'
  import RecentSessions from '../lib/components/RecentSessions.svelte'
  import SessionForm from '../lib/components/SessionForm.svelte'
  import SiteFooter from '../lib/components/SiteFooter.svelte'

  let editing = $state<PracticeSession | null>(null)
  let formTop = $state<HTMLElement | null>(null)

  function edit(session: PracticeSession) {
    editing = session
    formTop?.scrollIntoView({ block: 'start' })
  }
</script>

<section class="log reveal" aria-labelledby="log-title" bind:this={formTop}>
  <span class="eyebrow">Practice log</span>
  <h1 id="log-title">{editing ? 'Edit a session' : 'Log a session'}</h1>
  <p class="sub">
    {editing
      ? 'Change what you need and update, or cancel to go back to a new session.'
      : "Today's drills are already ticked. Change what you actually did, then save."}
  </p>
  <SessionForm {editing} onDone={() => (editing = null)} />
  <RecentSessions onEdit={edit} />
</section>
<SiteFooter />

<style>
  .log{margin-top:40px}
  /* The hero h1 is the poster treatment and belongs to the plan page. A form page takes the
     section h2 scale instead — see docs/design.md section 2. */
  .log h1{font-size:clamp(1.5rem,3.6vw,2.15rem);font-weight:800;margin:10px 0 6px}
  .log .sub{color:var(--dim);font-size:.95rem;max-width:60ch}
</style>
```

- [ ] **Step 3: Verify**

Run: `npm run check && npm test && npm run dev`

On `/log`:
- Saved sessions appear newest first, immediately after saving.
- Expanding a row shows each drill with its swings and feel, plus any notes.
- **Edit** loads the session into the form, the heading changes to "Edit a session", and the page scrolls to it.
- Updating changes the existing row rather than adding a second one.
- **Cancel** returns the form to a fresh draft for today.
- **Delete** requires the second confirming tap; "Keep it" backs out.
- `scroll-behavior: smooth` in `app.css` means `scrollIntoView` animates — confirm it still lands correctly with reduced motion enabled at the OS level.

- [ ] **Step 4: Document**

Add to `docs/design.md` §4:

> ### Session row
> `details`/`summary` on `--card` — mono date in `--ball`, a location tag, and the drill numbers
> right-aligned. Expanded, it lists each drill's swings and feel and offers Edit and Delete.
> Native `<details>` is used deliberately: keyboard support, `aria-expanded` and announcement
> come from the browser rather than from hand-written state.
>
> **Delete confirms in place**, with a second `--flag` button, not a native `confirm()` — a
> browser dialog is easy to dismiss by accident on a phone, and this removes the only copy of a
> session.

- [ ] **Step 5: Commit**

```bash
git add src docs/design.md
git commit -m "$(cat <<'EOF'
List recent sessions, with edit and delete

Edit loads a stored session back into the same form and saves through the same
upsert -- the id is what makes it an update, so there is no second code path to
keep in step.

Delete confirms in place rather than through confirm(). A native dialog is easy
to dismiss by accident on a phone and this removes the only copy of a session.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UDMck26QppQA5Rbic9coEL
EOF
)"
```

---

### Task 11: Export and import

**Files:**
- Create: `src/lib/components/DataPanel.svelte`
- Modify: `src/routes/LogView.svelte`
- Modify: `docs/design.md`

**Interfaces:**
- Consumes: `sessions` store (Task 7).
- Produces: `DataPanel` — no props.

- [ ] **Step 1: Write the panel**

Create `src/lib/components/DataPanel.svelte`:

```svelte
<script lang="ts">
  import { sessions } from '../stores/sessions.svelte'

  let message = $state<string | null>(null)
  let problem = $state<string | null>(null)
  let importing = $state(false)

  function download(text: string, filename: string) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  }

  async function exportAll() {
    problem = null
    try {
      download(await sessions.exportText(), sessions.exportName())
      message = `Exported ${sessions.list.length} session${sessions.list.length === 1 ? '' : 's'}.`
    } catch (error) {
      problem = error instanceof Error ? error.message : 'Export failed.'
    }
  }

  async function downloadQuarantine() {
    const text = await sessions.quarantinedText()
    if (text === null) {
      problem = 'There is no set-aside copy to download.'
      return
    }
    download(text, 'golf-practice-unreadable.json')
    message = 'Downloaded the set-aside copy.'
  }

  async function onFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return

    importing = true
    message = null
    problem = null
    try {
      const summary = await sessions.importText(await file.text())
      message = `${summary.added} new · ${summary.updated} updated.`
    } catch (error) {
      problem = error instanceof Error ? error.message : 'That file could not be imported.'
    } finally {
      importing = false
      // Clear it, so re-picking the same file after a fix fires `change` again.
      input.value = ''
    }
  }
</script>

<h2 class="head">Your data</h2>
<p class="sub">
  This browser is the only place your practice log lives. Clearing site data would delete it —
  export a copy somewhere safe now and then.
</p>

{#if sessions.warning}
  <div class="warn" role="alert">
    <span class="eyebrow">Heads up</span>
    <p>{sessions.warning}</p>
    <button type="button" onclick={downloadQuarantine}>Download the set-aside copy</button>
  </div>
{/if}

<div class="acts">
  <button type="button" onclick={exportAll}>Export JSON</button>
  <label class="file">
    <input type="file" accept="application/json,.json" onchange={onFile} disabled={importing} />
    <span>{importing ? 'Importing…' : 'Import JSON'}</span>
  </label>
</div>

<p class="note">Importing adds and updates. It never deletes a session you already have.</p>

{#if message}<p class="msg" role="status">{message}</p>{/if}
{#if problem}<p class="err" role="alert">{problem}</p>{/if}

<style>
  .head{font-size:clamp(1.25rem,2.6vw,1.6rem);font-weight:800;margin-top:56px}
  .sub{color:var(--dim);font-size:.92rem;margin-top:12px;max-width:60ch}
  .acts{display:flex;gap:10px;flex-wrap:wrap;margin-top:20px}
  .acts button,.file span{
    font-family:'Space Mono',monospace;font-size:.74rem;letter-spacing:.12em;text-transform:uppercase;
    display:flex;align-items:center;justify-content:center;
    min-height:44px;padding:0 22px;border-radius:100px;cursor:pointer;
    background:transparent;color:var(--dim);border:1px solid var(--line);
    transition:color .18s ease,border-color .18s ease;
  }
  .acts button:hover,.file:hover span{color:var(--ball);border-color:var(--ball-dim)}
  /* The native file input is unstyleable, so the label carries the design and the input is
     hidden — not removed, so it keeps its keyboard behaviour. */
  .file input{position:absolute;opacity:0;width:0;height:0}
  .file input:focus-visible + span{outline:2px solid var(--ball);outline-offset:3px}
  .file input:disabled + span{opacity:.6;cursor:default}
  .note{margin-top:14px;font-size:.86rem;color:var(--dim);font-style:italic}
  .msg{
    margin-top:14px;font-family:'Space Mono',monospace;font-size:.74rem;
    letter-spacing:.1em;text-transform:uppercase;color:var(--ball);
  }
  .err{margin-top:14px;font-size:.9rem;color:var(--flag)}
  .warn{
    margin-top:20px;padding:16px 18px;border:1px solid var(--flag);
    border-radius:14px;background:var(--flag-wash);
  }
  .warn .eyebrow{color:var(--flag)}
  .warn p{font-size:.92rem;margin-top:8px}
  .warn button{
    margin-top:14px;
    font-family:'Space Mono',monospace;font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;
    min-height:44px;padding:0 20px;border-radius:100px;cursor:pointer;
    background:transparent;color:var(--flag);border:1px solid var(--flag);
  }

  @media (prefers-reduced-motion:reduce){
    .acts button,.file span{transition:none}
  }
</style>
```

- [ ] **Step 2: Add it to the log view**

In `src/routes/LogView.svelte`, import `DataPanel` and place it after `<RecentSessions … />`:

```svelte
  import DataPanel from '../lib/components/DataPanel.svelte'
```
```svelte
  <RecentSessions onEdit={edit} />
  <DataPanel />
```

- [ ] **Step 3: Verify**

Run: `npm run check && npm test && npm run dev`

On `/log`:
- **Export JSON** downloads `golf-practice-<today>.json`; open it and confirm it contains `schemaVersion`, your sessions and your settings.
- Importing that same file back reports `0 new · N updated` and leaves the list unchanged.
- Editing the file to change one session's notes and re-importing reports `0 new · 1 updated` and shows the change.
- Importing a file with a session removed does **not** delete it locally.
- Importing a text file, or JSON with a bad `location`, shows a red reason and changes nothing.
- To check the fault path: in devtools set `localStorage['golf:store'] = '{ broken'`, reload, and confirm the warning appears, the set-aside copy downloads, and saving a session is refused with a readable message. Then remove `golf:store` and `golf:store.unreadable` to clean up.

- [ ] **Step 4: Document**

Add to `docs/design.md` §4:

> ### Data panel
> Export and import as mono outline buttons; the file input is visually hidden behind a styled
> `<label>` that forwards `:focus-visible`, since a native file input cannot be styled. Import
> reports `N new · N updated` in `--ball`; failures report a reason in `--flag`.
>
> The unreadable-store warning reuses the `.warn` treatment — `--flag` border over
> `--flag-wash` — and is the one place the app tells you it is refusing to write.

- [ ] **Step 5: Commit**

```bash
git add src docs/design.md
git commit -m "$(cat <<'EOF'
Export and import the practice log as JSON

Required, not a nicety: this browser is the only copy, and clearing site data
would take months of logs with it.

Import merges by id and says what it did -- "3 new, 1 updated" -- so a file
that is missing sessions can never quietly delete them. A malformed file is
rejected whole, with the reason shown.

The panel also surfaces the unreadable-store warning and offers the set-aside
copy as a download, which is the only route back to data the app itself can no
longer parse.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UDMck26QppQA5Rbic9coEL
EOF
)"
```

---

### Task 12: Block start in the Today panel (OQ-5)

**Files:**
- Modify: `src/lib/components/TodayPanel.svelte`
- Modify: `docs/design.md`
- Modify: `docs/roadmap.md`

**Interfaces:**
- Consumes: `blockPosition` (Task 2); `resolveISODate` (Task 1); `sessions` store (Task 7).
- Produces: nothing new.

- [ ] **Step 1: Add the block state to the script**

In `src/lib/components/TodayPanel.svelte`, add to the `<script>` block:

```ts
  import { blockPosition } from '../domain/block'
  import { resolveISODate } from '../domain/today'
  import { sessions } from '../stores/sessions.svelte'

  /** Where today sits in the 3-week arc. `null` before a start date is set, and once the
   *  block has run out — a finished plan should say nothing, not claim "week 7". */
  const position = $derived.by(() => {
    const start = sessions.settings.blockStart
    return start ? blockPosition(start, resolveISODate()) : null
  })

  let settingBlock = $state(false)
  let blockDraft = $state('')

  function openBlockEditor() {
    blockDraft = sessions.settings.blockStart ?? resolveISODate()
    settingBlock = true
  }

  async function saveBlockStart() {
    await sessions.setBlockStart(blockDraft)
    settingBlock = false
  }
```

- [ ] **Step 2: Add the markup**

Replace the existing `.today-head` block with:

```svelte
  <div class="today-head">
    <span class="eyebrow">{isToday ? `Today · ${DAY_NAMES[selected]}` : DAY_NAMES[selected]}</span>
    <span class="today-date">{isToday ? formatDayLabel() : ''}</span>
  </div>

  {#if position}
    <p class="arc">
      <span class="wk">Week {position.week}</span>
      <a href="#arc">{position.phase.title}</a>
      <button type="button" class="arc-edit" onclick={openBlockEditor}>Change start</button>
    </p>
  {:else if sessions.ready && !settingBlock}
    <button type="button" class="arc-set" onclick={openBlockEditor}>
      {sessions.settings.blockStart ? 'Block finished · set a new start' : 'Set block start'}
    </button>
  {/if}

  {#if settingBlock}
    <div class="arc-form">
      <label class="lab" for="block-start">Block start · the Monday it began</label>
      <input id="block-start" type="date" bind:value={blockDraft} />
      <button type="button" class="arc-save" onclick={saveBlockStart}>Save</button>
      <button type="button" class="arc-cancel" onclick={() => (settingBlock = false)}>Cancel</button>
    </div>
  {/if}
```

Confirm `ArcSection.svelte`'s `<section>` carries `id="arc"`; if it does not, add it so the phase link resolves.

- [ ] **Step 3: Add the styles**

Add to `TodayPanel.svelte`'s `<style>` block:

```css
  /* ---- block position (OQ-5) ---- */
  .arc{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:8px}
  .arc .wk{
    font-family:'Space Mono',monospace;font-size:.7rem;letter-spacing:.12em;
    text-transform:uppercase;color:var(--bg);background:var(--ball);
    padding:4px 10px;border-radius:100px;font-weight:700;
  }
  .arc a{
    font-family:'Space Mono',monospace;font-size:.72rem;letter-spacing:.1em;
    text-transform:uppercase;color:var(--ball);text-decoration:none;
    border-bottom:1px solid var(--ball-dim);padding-bottom:2px;position:relative;
  }
  /* 19.4px padding box (20.4px border box less the 1px underline): 19.4 + 2x13 = 45.4px.
     The 8px margin above and the 10px flex gap absorb the overhang. */
  .arc a::after{content:'';position:absolute;inset:-13px 0}
  .arc a:hover{border-bottom-color:var(--ball)}

  .arc-set,.arc-edit,.arc-cancel{
    background:none;border:none;color:var(--dim);cursor:pointer;padding:4px 0;
    font-family:'Space Mono',monospace;font-size:.72rem;letter-spacing:.08em;
    text-transform:uppercase;text-decoration:underline;text-underline-offset:3px;
    position:relative;
  }
  /* Same overhang technique as `.today-reset` — 25px padding box, expanded to 44px. These sit
     with clear space below, so the overhang can be symmetric. */
  .arc-set::after,.arc-edit::after,.arc-cancel::after{content:'';position:absolute;inset:-10px 0}
  .arc-set{margin-top:10px}
  .arc-set:hover,.arc-edit:hover,.arc-cancel:hover{color:var(--ball)}

  .arc-form{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:12px}
  .arc-form .lab{
    font-family:'Space Mono',monospace;font-size:.68rem;letter-spacing:.14em;
    text-transform:uppercase;color:var(--dim);flex-basis:100%;
  }
  .arc-form input{
    background:var(--card);color:var(--chalk);border:1px solid var(--line);
    border-radius:10px;padding:10px 12px;min-height:44px;
    font-family:'Space Mono',monospace;font-size:.9rem;
  }
  .arc-save{
    font-family:'Space Mono',monospace;font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;
    min-height:44px;padding:0 20px;border-radius:100px;cursor:pointer;font-weight:700;
    background:var(--ball);color:var(--bg);border:1px solid var(--ball);
  }
```

- [ ] **Step 4: Verify**

Run: `npm run check && npm test && npm run dev`

On `/`:
- With nothing stored, the Today panel offers **SET BLOCK START**.
- Setting it to a Monday within the last three weeks shows `WEEK n` and the phase title, and the phase links to section 04.
- Setting it more than 20 days ago shows the "block finished" prompt instead of a week number.
- The date survives a reload.
- Both the phase link and the change control measure at least 44px, and neither overlaps the day bar.
- The panel still floats above the hero at ≤760px.

- [ ] **Step 5: Document**

In `docs/design.md` §4, extend the **Today panel** entry:

> The panel also carries the **block position** when a start date is stored: a solid `--ball`
> `WEEK n` pill beside the phase title, which links to section 04. Outside the three weeks it
> offers to set a new start rather than reporting a week number the plan doesn't have.

In `docs/roadmap.md`, mark OQ-5 resolved:

> ### OQ-5 · When did the 3-week block start? — **resolved 2026-08-04**
>
> [#10](https://github.com/RichardWhitfield/golf/issues/10) · closed
>
> Captured once and stored, as Phase 2's storage layer made it cheap. `Settings.blockStart` holds
> the date; `domain/block.ts` turns it into a week and an arc phase; the Today panel shows
> `WEEK 2 · TRANSFER` beside the day. Outside the three weeks it says nothing and offers a new
> start date — a finished plan should not claim "week 7".

- [ ] **Step 6: Commit**

```bash
git add src docs/design.md docs/roadmap.md
git commit -m "$(cat <<'EOF'
Show which week of the arc you are in (OQ-5)

Closes #10. The Today panel knew the day but not the week, so it could not say
"week 2, transfer phase" -- arguably the more useful instruction, since a drill
means something different in week one than week three.

The start date is captured once and stored in settings, which is why this waited
for Phase 2. Outside the three weeks the panel offers a new start rather than
reporting a week the plan does not have.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UDMck26QppQA5Rbic9coEL
EOF
)"
```

---

### Task 13: Documentation, deploy and verification

**Files:**
- Modify: `docs/architecture.md`
- Modify: `docs/roadmap.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update `docs/architecture.md`**

Retitle §2's **Proposed layout** to **Layout**, and annotate the tree so built and unbuilt are
distinguishable at a glance — `domain/`, `storage/`, `stores/` and `routes/` are built (add
`block.ts`, `session.ts`, `transfer.ts`, `router.svelte.ts`, `sessions.svelte.ts`, `PlanView.svelte`,
`LogView.svelte`); mark `ingest/` and `domain/stats.ts` `# Phase 5` and `# Phase 4`.

Replace §3's preamble line ("Sketch, not final…") with:

> **Built.** `domain/types.ts` is the source of truth; the sketch below is kept because it explains
> *why* the shapes are what they are. `PracticeSession` is implemented exactly as written, with one
> omission: **`durationMin` was deliberately not built.** Issue #3 doesn't ask for it and every
> Tue–Sun session is the same 5–10 minutes. Adding it later is a field on a new schema version, not
> a rework.

Replace the §3 **Persistence** paragraphs with:

> One `localStorage` key, `golf:store`, holding one JSON document with `schemaVersion: 1`. At a few
> sessions a week that is simpler and safer than key-per-record, and it makes export trivial.
> Migrations live in `storage/migrations.ts`, keyed by the version being migrated *from*. The table
> is empty at v1; the tests around it are not.
>
> Because `localStorage` is the only copy, three guards exist:
>
> 1. **Unreadable JSON** is copied to `golf:store.unreadable` before anything is written, and all
>    further writes are refused. The Data panel surfaces the warning and offers the copy as a
>    download.
> 2. **A document from a newer build** is refused but *not* moved — the data is fine, this build is
>    behind, and relocating it would strand the newer build.
> 3. **Import merges by session id.** It adds and updates; it never drops. One malformed record
>    rejects the whole file rather than leaving a partial state nobody chose.
>
> Manual JSON export/import is a required feature, not a nice-to-have.

- [ ] **Step 2: Update `docs/roadmap.md`**

Replace the **Where things stand** list with:

> - Svelte 5 + Vite + TypeScript, built by GitHub Actions and published to Pages.
> - Two views behind a History-API router: `/` (the plan) and `/log` (the practice log). Deep links
>   depend on a generated `dist/404.html`.
> - Practice sessions persist in `localStorage` behind the async repository seam, with JSON
>   export/import.
> - `CNAME` — `golf.whitfield.life`, copied from `public/` into `dist/`.
> - `npm run check` and `npm test` both gate the deploy.

Change the Phase 2 heading to `## Phase 2 · Log a practice session — **done (2026-08-04)**` and
add beneath it:

> Shipped: the storage seam (`Repository`, `LocalStorageRepo`, `schemaVersion`, migration
> machinery), the log form with the day's drills pre-ticked from `plan.ts`, recent sessions with
> edit and delete, JSON export/import merging by id, and the block start date (OQ-5) surfaced as
> the arc week and phase in the Today panel.
>
> Phase 3 now has a storage layer, a form pattern and an export format to build on — a Trackman
> session is a second session type through the same seam, not new machinery.

- [ ] **Step 3: Update `CLAUDE.md`**

Under **Current state**, replace the "Only the Phase 1 slice … exists" paragraph:

> `storage/`, `stores/` and `routes/` are built (Phase 2, issue #3). `ingest/` arrives with
> Phase 5.
>
> The site has two views behind a History-API router: `/` (the plan page) and `/log`. Deep links
> depend on `dist/404.html`, generated from the built `index.html` by the `pages-spa-fallback`
> plugin in `vite.config.ts` and asserted by the deploy workflow alongside `CNAME`.
>
> Practice data lives in one `localStorage` key, `golf:store`, holding one versioned JSON
> document. **Reach it only through `lib/stores/sessions.svelte.ts`** — that file constructs the
> only `Repository` in the app.

Under **Things to be careful about**, add:

> - **The store refuses to write when it cannot read.** Unreadable JSON is copied to
>   `golf:store.unreadable` and every write throws until it is dealt with. That is deliberate —
>   the alternative is overwriting data that might still be recoverable. Don't "fix" it by
>   falling back to an empty document.

- [ ] **Step 4: Full verification**

```bash
npm run check
npm test
npm run build
test -f dist/CNAME && grep -qx 'golf.whitfield.life' dist/CNAME && echo "CNAME ok"
test -f dist/404.html && grep -q 'id="app"' dist/404.html && echo "404 shim ok"
npm run preview
```

Against the preview server, confirm:
- `/` renders the poster page identically to before, with the nav above it.
- `/log` loads **directly** — not just by clicking through. This is the deep-link path the shim exists for.
- A session logged on `/log` survives a full browser restart.
- At ≤760px the order is nav, Today panel, hero.
- With `prefers-reduced-motion` enabled at the OS level, nothing animates and everything stays visible.

- [ ] **Step 5: Commit**

```bash
git add docs CLAUDE.md
git commit -m "$(cat <<'EOF'
Record Phase 2 in the docs

Marks storage, stores and routes as built, pins down the concrete persistence
details (key names, schema version, the three write guards) and notes why
durationMin was left out of the implemented model.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01UDMck26QppQA5Rbic9coEL
EOF
)"
```

- [ ] **Step 6: Deploy and verify live**

This is a live site on a real domain. **Verify the deploy before considering the work done.**

```bash
git push -u origin fix/design-rule-compliance
gh pr create --fill
```

After merge, watch the run (`gh run watch`), then confirm on the real domain:
- `https://golf.whitfield.life/` renders correctly.
- `https://golf.whitfield.life/log` loads **directly**, in a fresh tab, not via a nav click.
- The custom domain is intact — `curl -sI https://golf.whitfield.life/ | head -1`.
- Log a session on a real phone, outdoors if you can. That is the actual acceptance test.

- [ ] **Step 7: Close the issues**

```bash
gh issue close 3 --comment "Shipped. Storage seam, log form with plan-seeded drills, recent sessions with edit and delete, and JSON export/import. Live on golf.whitfield.life."
gh issue close 10 --comment "Resolved as part of #3. Block start is stored in settings and the Today panel now shows the arc week and phase."
```

---

## Notes for the implementer

**Things that will bite you, in rough order of likelihood:**

1. **`PlanView.svelte` must have no wrapper element** and **`SiteNav` needs `order:-2`** below the breakpoint. Both are invisible failures — the page renders fine on a desktop and the Today panel silently drops below the hero on a phone. Task 8's warning box has the detail.
2. **Rune files must be `.svelte.ts`.** In a plain `.ts` file `$state` is an undefined function and the error is confusing.
3. **Task 5 doesn't type-check until Task 6 lands** — `local.ts` imports `./transfer`. Do them back to back and commit together, as Task 5 Step 5 says.
4. **Never add a scoped rule for an element whose base rule is global, or vice versa.** Svelte scoping raises specificity and the global rule silently loses. This is the single most repeated warning in `CLAUDE.md`.
5. **No new colour tokens are needed.** If you reach for one, re-read `docs/design.md` §1 — `opacity` on a token is not a new colour, and there are already tints for hover, muted borders and washes.
