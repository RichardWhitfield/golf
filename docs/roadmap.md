# Roadmap & Open Questions

**Last updated:** 2026-08-04

Sequencing for the move from static page to practice tracker. Each phase leaves the site working
and deployed — no phase ends with something half-migrated on `golf.whitfield.life`.

---

## Where things stand

- Svelte 5 + Vite + TypeScript, built by GitHub Actions and published to Pages.
- Two views behind a History-API router: `/` (the plan) and `/log` (the practice log). Deep links
  depend on a generated `dist/404.html`.
- Practice **and Trackman** sessions persist in `localStorage` behind the async repository seam at
  `schemaVersion` 2, with JSON export/import.
- Club path is stored **per club** and never blended. The KPI is **driver** club path.
- A daily Actions workflow pulls Trackman sessions into `public/trackman.json` and publishes them;
  the browser merges that file on load without ever overwriting anything typed by hand.
- `CNAME` — `golf.whitfield.life`, copied from `public/` into `dist/`.
- `npm run check` and `npm test` both gate the deploy.

Work is tracked in [GitHub issues](https://github.com/RichardWhitfield/golf/issues); each phase
and open question below links to its issue.

---

## Phase 0 · Documentation

**Status: done (2026-07-31).** `CLAUDE.md`, `docs/design.md`, `docs/content.md`,
`docs/architecture.md`, this file.

---

## Phase 0.5 · Today panel

**Status: done (2026-07-31).** Shipped ahead of the scaffold because it solved a daily friction
(scrolling to find the day's drills, then scrolling back for their detail) and didn't need one.

- Resolves the current day in `Australia/Sydney` via `Intl.DateTimeFormat`, so it stays correct
  when travelling and across NSW daylight saving.
- Shows the day's title, brief, and the **full drill cards** — no scrolling to cross-reference.
- MON–SUN picker to preview any other day, with a "back to today" reset.
- Drill cards are **cloned from the authored markup** via `data-drill`, so drill copy exists in
  exactly one place.
- On mobile the panel is ordered above the hero; on desktop it stays below it.
- Degrades without JavaScript: the panel shows a neutral heading and a link to the full plan.
- Added the first `:focus-visible` styles to the site.

Roughly 120 lines of vanilla JS in `index.html`. **Phase 1 should absorb this**, not preserve it
— the schedule map becomes `domain/plan.ts` and the panel becomes a component.

---

## Phase 1 · Scaffold, keeping the site identical

[#2](https://github.com/RichardWhitfield/golf/issues/2)

Prove the toolchain end to end before changing anything visible.

- Vite + Svelte 5 + TypeScript.
- Extract tokens and shared styles into `app.css`; port the existing page into components with
  scoped styles. **Output should be visually indistinguishable from today.**
- Move plan and drill content into `domain/drills.ts` and `domain/plan.ts`; render the page from
  that data.
- `CNAME` into `public/`.
- GitHub Actions workflow: build → deploy Pages.

**Done when:** `golf.whitfield.life` looks exactly as it does now, but is built from source.

**Risk:** breaking the live site or the custom domain. Verify the deployed `CNAME` before
considering the phase complete.

---

## Phase 2 · Log a practice session — **done (2026-08-04)**

[#3](https://github.com/RichardWhitfield/golf/issues/3)

The first real feature. Highest value per unit of work — six days a week currently record nothing.

- Storage layer: repository interface, `LocalStorageRepo`, schema versioning, migrations.
- Log form: date (defaults today), location, drills with swing counts and a 1–5 feel rating,
  optional note.
- **Pre-select the day's scheduled drills** from the plan — Wednesday offers 01 + 04 already
  ticked. Most sessions should be two taps and save.
- A simple list of recent sessions.
- JSON export/import — required, since `localStorage` is the only copy.
- Phone layout first. Large targets, minimal typing.

**Done when:** a Tuesday session can be logged outdoors on a phone in under a minute, and the data
survives a browser restart.

Shipped: the storage seam (`Repository`, `LocalStorageRepo`, `schemaVersion`, migration
machinery), the log form with the day's drills pre-ticked from `plan.ts`, recent sessions with
edit and delete, JSON export/import merging by id, and the block start date (OQ-5) surfaced as
the arc week and phase in the Today panel.

Phase 3 now has a storage layer, a form pattern and an export format to build on — a Trackman
session is a second session type through the same seam, not new machinery.

---

## Phase 3 · Monday's Trackman session — **done (2026-08-04)**

[#4](https://github.com/RichardWhitfield/golf/issues/4), also closing
[#14](https://github.com/RichardWhitfield/golf/issues/14) (OQ-7) and absorbing the former Phase 5.

Automatic pull, with manual entry as the permanent baseline. Club path became a **per-club series**
in the same phase, because OQ-7 showed a blended figure is not measurable.

Shipped: `Club`/`ClubPath`/`TrackmanSession` at `schemaVersion` 2; the manual Trackman form behind
Practice / Trackman pills on the log view; `ApiSource` over the GraphQL API; a daily Actions
workflow committing `public/trackman.json` and publishing it via `workflow_call`; and a
non-blocking browser-side merge that never overwrites anything typed by hand.

**Four findings from probing the live API changed the design** — see
`docs/superpowers/specs/2026-08-04-phase-3-trackman-design.md`:

- The `null` is on `measurement.clubPath`, not `measurement` (976 of 5,877 strokes, plus 3 with no
  club). Code written to the issue's wording would have filtered nothing.
- 10 of 91 sessions fall on a different UTC date than Sydney date.
- 23 dates carry more than one session, so a date can never be a key.
- Dropping the first 5 or 10 strokes moves driver monthly means by ≤0.1° and reverses no trend, so
  **no warm-up rule was built.**

**Done when** — met: a Monday session appears without anything being typed, *and* deleting the
workflow leaves the app fully usable with the numbers still enterable by hand.

**Set up by hand after merge:** the `TRACKMAN_REFRESH_TOKEN` secret, then one `workflow_dispatch`
with `since: 2025-06-01` to create the backfill (86 sessions, 369 rows, ~30 KiB).

---

## Phase 4 · Progress

[#5](https://github.com/RichardWhitfield/golf/issues/5)

Make the accumulated data answer questions.

- **Club path over time, as per-club small multiples** — one panel per club, shared axes, the
  target band drawn on each. Fits the existing `auto-fill`/`minmax()` grid; needs no new
  breakpoint. **Never a blended series** (OQ-7). The headline panel is the driver.
- **Show `n` on every point.** July's 7-iron `−10.27°` is ten shots, and the tail of every series
  will be over-read without a visible count. A hand-typed reading has no `n` and must be rendered
  differently rather than weighted as though it were measured.
- The band must be drawn as a **band with fault regions on both sides** — overshooting is a fault,
  not success (see the "don't overcook it" watch-out in `content.md`).
- **Drill coverage** — which drills are actually being done versus quietly avoided.
- **Feel trend per drill.**
- **Current position in the 3-week arc**, and which phase (groove / transfer / proof) is active,
  since a drill means something different in week 1 than week 3.

**Depends on:** several weeks of Phase 2/3 data existing. Don't build charts against an empty
store — the design decisions will be wrong.

---

## Phase 5 · Trackman ingest — **merged into Phase 3**

[#6](https://github.com/RichardWhitfield/golf/issues/6) · closed as duplicate of
[#4](https://github.com/RichardWhitfield/golf/issues/4)

Merged on 2026-07-31, once OQ-1 confirmed both a working data path and a reusable headless
credential. There was no longer a reason to build manual entry as a separate, earlier phase: it
shipped alongside the ingest instead, and D6 is unchanged — deleting the workflow must still leave
the app fully usable. Built as part of Phase 3 above.

---

## Open questions

### OQ-1 · Is TrackMan data programmatically accessible? — **resolved 2026-07-31**

[#1](https://github.com/RichardWhitfield/golf/issues/1) · closed

**Yes.** Verified end to end against a real account. There is no user-facing export in the portal —
TrackMan Performance Studio exports a CSV but only the facility can run it — and no facility email
route was needed. The answer is an undocumented but publicly reachable GraphQL API with schema
introspection enabled, plus a public mobile OAuth client that yields a reusable refresh token. The
design is summarised under Phase 5 above; the full findings are on the issue.

A **13-month backfill** was taken at the same time: 91 sessions, 5,877 strokes, 4,901 with a
measured club path, 2025-07-03 → 2026-07-27. It is held locally and **deliberately not committed** —
the repo root is served publicly on `golf.whitfield.life`. This retires the "don't build charts
against an empty store" risk on Phase 4.

**Residual risks** (carried into Phase 5, not resolved): the interface is undocumented and can break
without notice; the refresh token's absolute lifetime is unknown, though it does not rotate. Manual
entry remains the baseline — decision D6 in `architecture.md` is unchanged.

### OQ-2 · What happens after week three?

[#7](https://github.com/RichardWhitfield/golf/issues/7)

The plan is explicitly 3 weeks and ends before a trip. Options: repeat with a tightened target,
switch KPI (face angle, strike location, start direction), or archive and start a new block.

Affects the data model — a `Block` entity may be needed to group sessions, so progress can be
read per block rather than as one endless series. **Decide before Phase 4**, since it changes what
the charts are scoped to.

### OQ-3 · Does storage ever need to leave the device?

[#8](https://github.com/RichardWhitfield/golf/issues/8)

Currently `localStorage` only. It becomes a real problem if logging happens on a phone but
review happens on a laptop — the two devices would hold different data.

Mitigated short-term by JSON export/import. Revisit once there's evidence of actual friction, not
before. The async repository interface (see `architecture.md`) exists precisely so this stays a
contained change.

### OQ-4 · Should the plan itself become editable?

[#9](https://github.com/RichardWhitfield/golf/issues/9)

Currently the plan is fixed content in the repo. If the coaching changes — new drills, revised
schedule — is that a code edit or an in-app edit?

**Recommendation: keep it a code edit.** It changes rarely, it's version-controlled, and in-app
plan editing is a large feature for one user. Revisit only if the plan starts changing weekly.

### OQ-5 · When did the 3-week block start? — **resolved 2026-08-04**

[#10](https://github.com/RichardWhitfield/golf/issues/10) · closed

Captured once and stored, as Phase 2's storage layer made it cheap. `Settings.blockStart` holds
the date; `domain/block.ts` turns it into a week and an arc phase; the Today panel shows
`WEEK 2 · TRANSFER` beside the day. Outside the three weeks it says nothing and offers a new
start date — a finished plan should not claim "week 7".

### OQ-6 · Do course rounds get logged?

[#11](https://github.com/RichardWhitfield/golf/issues/11)

The plan mentions the step drill as an on-course reset, and "score how many stay left of a
slice". Whether actual rounds are tracked is undecided. **Out of scope until Phase 4 ships** —
it's a third session type and would widen the app considerably.

### OQ-7 · Which club is the KPI scoped to? — **resolved 2026-08-04**

[#14](https://github.com/RichardWhitfield/golf/issues/14) · closed by
[#4](https://github.com/RichardWhitfield/golf/issues/4)

Raised by the OQ-1 backfill. `content.md` defined the KPI as "one number: club path" and never said
which club. Against real data that is not measurable — a blended average tracks club selection as
much as swing change. In 2025-11 the blended figure was the best in the series (`-3.27`) while the
driver was the worst to that point (`-7.79`), purely because more seven-irons were hit. Over the
same 13 months the driver worsened (`-4.01` → `-7.50`) while the 4-iron improved (`-7.19` → `-4.73`)
— opposite trends a single series cannot show.

**Decided:**

- **The KPI is driver club path**, named in `content.md` and in `plan.ts`. It is where the slice
  costs most and the club currently trending backwards.
- **`club` is stored on every path value**, normalised on write by `domain/clubs.ts`. No code path
  may compute a mean across clubs.
- **The `−2°`/`+2°` band is shared, not per club.** It is a coaching target; deriving a band per
  club would turn "where you have been" into "where you should be". `content.md` records instead
  that the driver sits systematically shallower, so an iron inside the band is the stronger result.
- **`n` is stored and shown**, and is absent rather than faked on hand-typed entries.
- **The warm-up question is answered: there is no effect worth correcting for.** Dropping the first
  5 or 10 strokes of each session moves driver monthly means by ≤0.1° in every month with a
  meaningful `n` and reverses no trend. **No warm-up rule was built.**

Per-club small multiples are the remaining piece and belong to Phase 4 — the stored shape now
supports them.

---

## Principles for sequencing

1. **Every phase deploys.** Never leave `golf.whitfield.life` broken or half-migrated.
2. **Capture data before visualising it.** Phases 2 and 3 must precede 4 — charts designed
   against an empty store are designed wrong.
3. **The blocked thing is last.** Trackman ingest is the most uncertain and least essential piece;
   everything else works without it.
4. **Preserve what works.** The visual design is the thing already worth keeping. Phase 1 changes
   the machinery, not the appearance.
