# Roadmap & Open Questions

**Last updated:** 2026-07-31

Sequencing for the move from static page to practice tracker. Each phase leaves the site working
and deployed — no phase ends with something half-migrated on `golf.whitfield.life`.

---

## Where things stand

- `index.html` — self-contained, single file. The complete 3-week plan, plus a Today panel
  driven by a small vanilla script (see Phase 0.5).
- `CNAME` — `golf.whitfield.life`, served by GitHub Pages from the repo root.
- `README.md` — orientation and a documentation index.
- No build step, no dependencies, no tests.

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

## Phase 2 · Log a practice session

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

---

## Phase 3 · Log a Trackman session, manually

[#4](https://github.com/RichardWhitfield/golf/issues/4)

- Trackman session form: date, best path, typical path, drills worked, notes.
- Fits the existing 5-minute "log it" block that ends every Monday session.
- Records `source: 'manual'`.

**Done when:** Monday's numbers are captured without needing any integration to exist.

---

## Phase 4 · Progress

[#5](https://github.com/RichardWhitfield/golf/issues/5)

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

[#6](https://github.com/RichardWhitfield/golf/issues/6)

**Unblocked (2026-07-31).** OQ-1 resolved — a data path and a reusable headless credential both
exist.

Build it behind the `TrackmanSource` interface as `ApiSource`, driven by a scheduled GitHub Actions
workflow, degrading silently to manual entry on failure.

- **Endpoint:** `POST https://api.trackmangolf.com/graphql`, `Authorization: Bearer <token>`.
- **Query:** `me.activities(kinds: [VIRTUAL_RANGE], timeFrom:, timeTo:)` — Monday sessions arrive as
  `VirtualRangeSessionActivity`. `timeFrom`/`timeTo` maps directly onto `fetchSince()`.
- **KPI:** `aggregatedMeasurement(clubs:)` returns per-club averages server-side, so
  `averageClubPath` is a single field. Store it **per club**, never blended — see OQ-7.
- **Auth:** refresh-token grant against the public mobile client
  `old-golf-app.c686e909-5102-45ac-9860-8d0b789073ae` (PKCE, no client secret). The refresh token is
  **non-rotating and reusable**, so a single static `TRACKMAN_REFRESH_TOKEN` Actions secret needs no
  write-back. Access tokens last 14 days.
- **Workflow triggers:** `schedule` and `workflow_dispatch` **only**. Never `pull_request_target` or
  `workflow_run` — this repo is public and those triggers expose secrets to fork PRs.

**Watch out:** ~17% of strokes carry no club data and return `null` measurements — filter them, they
are not zeros. Units are SI (m/s, metres, degrees). `club` is returned as `7Iron` but filtered as
`IRON7`.

**Depends on** Phases 2 and 3 — ingest writes into that model, and manual entry must be proven
before anything automatic is trusted.

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

### OQ-5 · When did the 3-week block start?

[#10](https://github.com/RichardWhitfield/golf/issues/10)

The Today panel knows the day but not which *week of the arc* you're in — so it can't say
"week 2, transfer phase, mix drill-swings with normal swings", which is arguably the more useful
instruction. That needs a block start date.

Options: hardcode a start date in the markup, or capture it once and store it. Falls out
naturally once Phase 2 introduces storage. **Cheap and high value — do it early in Phase 2.**

### OQ-6 · Do course rounds get logged?

[#11](https://github.com/RichardWhitfield/golf/issues/11)

The plan mentions the step drill as an on-course reset, and "score how many stay left of a
slice". Whether actual rounds are tracked is undecided. **Out of scope until Phase 4 ships** —
it's a third session type and would widen the app considerably.

### OQ-7 · Which club is the KPI scoped to? — **blocking Phase 4**

[#14](https://github.com/RichardWhitfield/golf/issues/14)

Raised by the OQ-1 backfill. `content.md` defines the KPI as "one number: club path" and never says
which club. Against real data that is not measurable — a blended average tracks club selection as
much as swing change. In 2025-11 the blended figure was the best in the series (`-3.27`) while the
driver was the worst to that point (`-7.79`), purely because more seven-irons were hit. Over the
same 13 months the driver worsened (`-4.01` → `-7.50`) while the 4-iron improved (`-7.19` → `-4.73`)
— opposite trends a single series cannot show.

Recommendation: scope the KPI to the **driver**, store `club` on every path value, chart per-club
small multiples with `n` visible, and decide whether the `−2°`/`+2°` target band is itself per-club
(the driver sits systematically shallower than the irons throughout the data). **Decide before
Phase 4.**

---

## Principles for sequencing

1. **Every phase deploys.** Never leave `golf.whitfield.life` broken or half-migrated.
2. **Capture data before visualising it.** Phases 2 and 3 must precede 4 — charts designed
   against an empty store are designed wrong.
3. **The blocked thing is last.** Trackman ingest is the most uncertain and least essential piece;
   everything else works without it.
4. **Preserve what works.** The visual design is the thing already worth keeping. Phase 1 changes
   the machinery, not the appearance.
