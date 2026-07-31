# Roadmap & Open Questions

**Last updated:** 2026-07-31

Sequencing for the move from static page to practice tracker. Each phase leaves the site working
and deployed — no phase ends with something half-migrated on `golf.whitfield.life`.

---

## Where things stand

- `index.html` — self-contained, single file. The complete 3-week plan, plus a Today panel
  driven by a small vanilla script (see Phase 0.5).
- `CNAME` — `golf.whitfield.life`, served by GitHub Pages from the repo root.
- `README.md` — one line.
- No build step, no dependencies, no tests.

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

## Phase 2 · Log a practice session

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

---

## Phase 3 · Log a Trackman session, manually

- Trackman session form: date, best path, typical path, drills worked, notes.
- Fits the existing 5-minute "log it" block that ends every Monday session.
- Records `source: 'manual'`.

**Done when:** Monday's numbers are captured without needing any integration to exist.

---

## Phase 4 · Progress

Make the accumulated data answer questions.

- **Club path over time** against the `−2°` to `+2°` target band. The band must be drawn as a
  band with fault regions on both sides — overshooting is a fault, not success (see the
  "don't overcook it" watch-out in `content.md`).
- **Drill coverage** — which drills are actually being done versus quietly avoided.
- **Feel trend per drill.**
- **Current position in the 3-week arc**, and which phase (groove / transfer / proof) is active,
  since a drill means something different in week 1 than week 3.

**Depends on:** several weeks of Phase 2/3 data existing. Don't build charts against an empty
store — the design decisions will be wrong.

---

## Phase 5 · Trackman ingest

**Blocked on OQ-1 below.** Do not start until the investigation concludes.

If a data path exists: build it behind the `TrackmanSource` interface, add a scheduled GitHub
Actions workflow, keep credentials in Actions secrets, and ensure it degrades silently to manual
entry on failure.

If no data path exists: close the phase, keep manual entry, and consider reducing friction
instead (a fast phone-optimised entry form, an iOS Shortcut).

---

## Open questions

### OQ-1 · Is TrackMan data programmatically accessible? — **blocking Phase 5**

TrackMan's documented API is a facility/partner product; there is no published API for individual
golfers. Data currently reaches the player only through the phone app.

To determine:
1. Does the TrackMan phone app or web portal offer any export (CSV, PDF, share link)?
2. Does the facility's booking or bay system provide session reports by email?
3. Is there an official personal-data export (a GDPR subject-access request is a legitimate route
   and may reveal the underlying data shape)?
4. Failing all of the above: how does the app authenticate, and is there a stable endpoint?

**Constraints on any answer:** it must be the player's own data, credentials must live only in
Actions secrets, the integration must never block app load, and it must be assumed breakable at
any time.

**Note:** an emailed report or PDF is *not* a reliable parsing target. If that's the only route,
manual entry of two numbers is more honest than a brittle parser.

### OQ-2 · What happens after week three?

The plan is explicitly 3 weeks and ends before a trip. Options: repeat with a tightened target,
switch KPI (face angle, strike location, start direction), or archive and start a new block.

Affects the data model — a `Block` entity may be needed to group sessions, so progress can be
read per block rather than as one endless series. **Decide before Phase 4**, since it changes what
the charts are scoped to.

### OQ-3 · Does storage ever need to leave the device?

Currently `localStorage` only. It becomes a real problem if logging happens on a phone but
review happens on a laptop — the two devices would hold different data.

Mitigated short-term by JSON export/import. Revisit once there's evidence of actual friction, not
before. The async repository interface (see `architecture.md`) exists precisely so this stays a
contained change.

### OQ-4 · Should the plan itself become editable?

Currently the plan is fixed content in the repo. If the coaching changes — new drills, revised
schedule — is that a code edit or an in-app edit?

**Recommendation: keep it a code edit.** It changes rarely, it's version-controlled, and in-app
plan editing is a large feature for one user. Revisit only if the plan starts changing weekly.

### OQ-5 · When did the 3-week block start?

The Today panel knows the day but not which *week of the arc* you're in — so it can't say
"week 2, transfer phase, mix drill-swings with normal swings", which is arguably the more useful
instruction. That needs a block start date.

Options: hardcode a start date in the markup, or capture it once and store it. Falls out
naturally once Phase 2 introduces storage. **Cheap and high value — do it early in Phase 2.**

### OQ-6 · Do course rounds get logged?

The plan mentions the step drill as an on-course reset, and "score how many stay left of a
slice". Whether actual rounds are tracked is undecided. **Out of scope until Phase 4 ships** —
it's a third session type and would widen the app considerably.

---

## Principles for sequencing

1. **Every phase deploys.** Never leave `golf.whitfield.life` broken or half-migrated.
2. **Capture data before visualising it.** Phases 2 and 3 must precede 4 — charts designed
   against an empty store are designed wrong.
3. **The blocked thing is last.** Trackman ingest is the most uncertain and least essential piece;
   everything else works without it.
4. **Preserve what works.** The visual design is the thing already worth keeping. Phase 1 changes
   the machinery, not the appearance.
