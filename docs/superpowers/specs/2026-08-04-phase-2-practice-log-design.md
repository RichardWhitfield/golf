# Phase 2 · Log a practice session — design

**Date:** 2026-08-04
**Issue:** [#3](https://github.com/RichardWhitfield/golf/issues/3) · also resolves
[#10](https://github.com/RichardWhitfield/golf/issues/10) (OQ-5, block start date)
**Status:** approved

Six days a week currently record nothing. This phase adds the storage seam, a log form, a
recent-sessions list, and JSON export/import — and introduces client-side views so the log has
somewhere to live.

---

## 1. Scope

In scope:

- Storage layer: repository interface, `LocalStorageRepo`, `schemaVersion`, migration machinery.
- Client-side routing: Plan and Log views, Progress shown but not yet built.
- Log form: date, location, drills with swing counts and a 1–5 feel rating, optional note.
- Pre-selection of the day's scheduled drills from `plan.ts`.
- Recent sessions, with edit and delete.
- JSON export and import.
- Block start date, stored and surfaced as the arc week and phase (OQ-5).

Out of scope: Trackman sessions (Phase 3), charts (Phase 4), ingest (Phase 5), course rounds
(OQ-6).

---

## 2. Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| D9 | Navigation | **Client-side views with a nav bar** | The log needs its own screen. The poster page becomes the Plan view, visually unchanged. |
| D10 | URL scheme | **Clean paths** (`/`, `/log`) via the History API | Real URLs. Costs a `404.html` shim on Pages — see §3. |
| D11 | Progress tab | **Visible, marked unavailable** | Shows the app's shape from day one. Phase 4 fills it in. |
| D12 | Swing defaults | **Authored `defaultSwings` on each drill** | The prose `reps` field ("10 rehearsals + 5 hits") cannot be parsed reliably. An authored number keeps `drills.ts` the single source of truth. |
| D13 | Feel default | **Defaults to 3, rendered dimmed until tapped** | Keeps saving fast. The dimmed state marks entries not yet judged without changing the stored shape. |
| D14 | Import semantics | **Merge by session id** | Import can add and update; it can never drop. `localStorage` is the only copy. |
| D15 | Session mutation | **Edit and delete** | Edit reuses the form and the `saveSession` upsert — the id decides insert vs update, so there is no second code path. |

---

## 3. Routing

`src/lib/stores/router.svelte.ts`. History API, no dependency.

| Path | View |
|---|---|
| `/` | Plan |
| `/log` | Log |
| anything else | Plan, via `replaceState` to `/` |

The nav renders real `<a href>` elements. The click handler intercepts **only** plain left-clicks
with no modifier keys, so middle-click and open-in-new-tab keep working. Hrefs beginning with `#`
are never intercepted — the existing `#drills` and `#week` anchors continue to behave as anchors.

`popstate` drives back and forward. Route changes scroll to the top of the document.

### The 404 shim

GitHub Pages serves static files only, so `GET /log` is a hard 404 unless a `404.html` exists to
re-bootstrap the app.

`404.html` **must not** be a hand-written file in `public/`. Vite hashes asset filenames, so a
static copy would reference a stale bundle after the next build. Instead, a `closeBundle` plugin in
`vite.config.ts` copies the built `dist/index.html` to `dist/404.html`, so it always carries the
correct hashed names.

The deploy workflow's existing `dist/CNAME` assertion gains a sibling assertion for
`dist/404.html`. Without it, losing the shim breaks every deep link and nothing fails loudly.

**Known and accepted:** Pages returns HTTP 404 alongside the shim's content. The app renders
correctly; only crawlers and `curl -f` see a failure. Irrelevant for a single-user tool.

### File layout

```
src/
  routes/
    PlanView.svelte     the existing sections, unchanged
    LogView.svelte      new
  lib/
    stores/
      router.svelte.ts
      sessions.svelte.ts
```

`App.svelte` becomes the nav plus a route switch.

---

## 4. Storage

```
src/lib/storage/
  repository.ts   Repository interface, StoreDocument, Settings — the seam
  local.ts        LocalStorageRepo
  migrations.ts   SCHEMA_VERSION, migrate(), version guards
  transfer.ts     export serialisation, merge-by-id import
```

```ts
interface Repository {
  listSessions(): Promise<PracticeSession[]>
  saveSession(session: PracticeSession): Promise<void>   // upsert by id
  deleteSession(id: string): Promise<void>
  getSettings(): Promise<Settings>
  saveSettings(settings: Settings): Promise<void>
  exportDocument(): Promise<StoreDocument>
  importDocument(raw: unknown): Promise<ImportSummary>   // { added, updated }
}
```

Every method is `async` from day one, even though `localStorage` is synchronous. This is the entire
reason the seam exists: if the methods are synchronous now, adding a backend later changes every
call site.

**No component calls `localStorage`.** Components read and write through
`lib/stores/sessions.svelte.ts`, which owns the single `Repository` instance.

### Document shape

One `localStorage` key holding one JSON document.

```ts
interface StoreDocument {
  schemaVersion: number
  sessions: PracticeSession[]
  settings: Settings
}

interface Settings {
  blockStart?: ISODate
}
```

The key name is stable across schema versions; `schemaVersion` inside the document is what
migrations act on. `SCHEMA_VERSION` is `1`, and the migration table is empty at v1 — the machinery
and its tests exist so that the first real schema change is a data edit rather than an architecture
change.

### Guards

All three exist because `localStorage` is the only copy of the data.

1. **Unparseable stored JSON** — the raw string is copied to a backup key *before* anything is
   written, and the Data panel surfaces a warning. Nothing is destroyed.
2. **`schemaVersion` newer than the build** — refuse to load and refuse to write. A stale phone
   cannot truncate a laptop's data.
3. **Import merges by id** — it adds and updates, never drops.

### Testability

`LocalStorageRepo` takes `Storage` by constructor injection
(`constructor(storage: Storage = localStorage)`), so Vitest exercises it against an in-memory fake
with no jsdom dependency.

---

## 5. Domain

### Model

Follows `architecture.md` §3 unchanged.

```ts
type Location = 'sim' | 'home' | 'course'

interface DrillEntry {
  drillId: DrillId
  swings: number
  feel: 1 | 2 | 3 | 4 | 5
}

interface PracticeSession {
  id: string
  type: 'practice'
  date: ISODate
  location: Location
  entries: DrillEntry[]
  notes?: string
}
```

`feel` is per drill entry, not per session. Two drills in one session can go very differently, and
the plan is built on feel cues.

**`durationMin` is deliberately omitted.** `architecture.md` §3 lists it as optional; issue #3 does
not ask for it, and every Tue–Sun session is the same 5–10 minutes. Adding it later is a field on a
new schema version, not a rework.

### Additions

- **`drills.ts`** — each drill gains `defaultSwings: number` beside its existing prose `reps`.
  `reps` stays exactly as authored; the new field is a separate, explicit value.
- **`today.ts`** — `resolveISODate(now?)` returns the Sydney date as `YYYY-MM-DD`, via the `en-CA`
  locale, which formats ISO-style natively.
- **`block.ts` (new, pure)** — `blockPosition(start, today)` returns `{ week: 1 | 2 | 3, phase }`
  or `null` when the date falls outside the three-week block. Dates are parsed as UTC midnight and
  differenced in whole days, so daylight saving cannot shift a boundary.
- **`session.ts` (new, pure)** — id generation (`crypto.randomUUID` with a fallback),
  `draftForDay(dayKey, date)`, and draft validation.

---

## 6. Log view

Single column, phone-first. Order top to bottom: day header, date, location, drills, notes, save.

**Day header** — mono eyebrow (`LOG · WEDNESDAY`) and the day's plan title, so it is obvious which
day's drills were pre-ticked.

**Date** — `<input type="date">`, defaulting to today in Sydney. Changing it re-seeds the drill
ticks from that day's plan **only while the selection is untouched**; a `touched` flag prevents a
date change from wiping manual edits.

**Location** — SIM / HOME / COURSE pills carrying `aria-pressed`, `44px` minimum. Defaults from
the day: Monday `sim`, otherwise `home`. Reuses the day-bar visual language exactly.

**Drills** — all seven listed as tappable rows with the day's drills pre-ticked. A ticked row
reveals its swing stepper and feel picker; unticked rows stay collapsed. Rows are real
`<input type="checkbox">` plus `<label>`.

**Swings** — `[−] 12 [+]` around a real `<input type="number" inputmode="numeric">`, seeded from
`defaultSwings`. Both buttons are `44px`.

**Feel** — five buttons, 1–5, in a `radiogroup`. Defaults to 3. **An untouched 3 renders dimmed
and turns solid on first tap.** This changes nothing in the stored data; it exists so that at a
glance you can see which drills you actually judged.

**Notes** — optional `<textarea>`.

**Save** — full-width `--ball` button. Saving resets the form to a fresh draft for today and
confirms inline.

---

## 7. Recent sessions

Newest first. Each row: mono date, location tag, drill numbers, feel values. Expanding a row
reveals two controls:

- **Edit** — loads the session back into the form, switches the heading to `EDITING · 04 AUG`, and
  offers Cancel. Saving calls the same `saveSession` upsert; the existing id makes it an update.
- **Delete** — `--flag`, behind a confirm step.

---

## 8. Data panel

At the foot of the Log view.

- **Export** — downloads `golf-practice-YYYY-MM-DD.json` via a Blob and a `download` anchor.
- **Import** — takes a file, validates it, merges by session id, and reports `5 new · 3 updated`.
  A malformed file is rejected with a stated reason and changes nothing.
- Surfaces the corrupt-document warning from §4 if the backup guard fired.

---

## 9. Block start (OQ-5 / #10)

Stored in `Settings.blockStart`. The control lives in the **Today panel**, because that is where
the payoff appears:

- Unset — the panel offers `SET BLOCK START`.
- Set and within the block — the panel reads `WEDNESDAY · WEEK 2 · TRANSFER`, with the phase
  linking to section 04.
- Outside the three weeks — the panel says nothing rather than reporting "week 7".

---

## 10. Design system

New UI inherits `docs/design.md`. Specifically:

- Existing tokens only; any genuinely new colour is added as a token and documented.
- Input fields sit on `--card` over the panel — still three surface levels.
- Every control reaches a `44px` hit target.
- The global `:focus-visible` ring is not suppressed anywhere.
- Any new animation ships a `prefers-reduced-motion` override, scoped to the component that owns
  it, in the same layer as the rule it cancels.
- Delete uses `--flag`; save and selection use `--ball`. The yellow/red semantic is unchanged.
- The nav marks the active view with `aria-current="page"`. Progress is rendered as an
  unavailable item, not a broken link.

The Plan view must remain visually identical to the current page apart from the nav above it.

---

## 11. Tests

Vitest, domain and storage only, per decision D8. No UI tests.

| File | Covers |
|---|---|
| `block.test.ts` | Week and phase boundaries, first and last day, dates before and after the block, DST crossings |
| `migrations.test.ts` | v1 passthrough, newer-version refusal, corrupt-JSON backup, missing document |
| `local.test.ts` | Async contract, upsert by id, delete, settings round-trip, empty store |
| `transfer.test.ts` | Export shape, merge-by-id add and update, malformed input rejection |
| `session.test.ts` | Draft seeding per day, default swings, validation failures |

---

## 12. Documentation to update

Same commits as the code, per `CLAUDE.md`:

- `docs/architecture.md` — decisions D9–D15, the 404 shim, storage marked built.
- `docs/design.md` — nav, form controls, feel picker, swing stepper, session row, data panel.
- `docs/content.md` — the `defaultSwings` field.
- `docs/roadmap.md` — Phase 2 done, OQ-5 resolved.
- `CLAUDE.md` — current state.
- `.github/workflows/` — the `dist/404.html` assertion.

---

## 13. Done when

A Tuesday session can be logged outdoors on a phone in under a minute, the data survives a browser
restart, `npm run check` and `npm test` pass, and `golf.whitfield.life` serves both `/` and `/log`.
