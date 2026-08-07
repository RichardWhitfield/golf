# Roadmap & Open Questions

**Last updated:** 2026-08-07

Sequencing for the move from static page to practice tracker. Each phase leaves the site working
and deployed — no phase ends with something half-migrated on `golf.whitfield.life`.

---

## Where things stand

- Svelte 5 + Vite + TypeScript, built by GitHub Actions and published to Pages.
- Three views behind the router: `/` (the plan), `/log` (the practice log) and `/progress`
  (the charts). Deep links depend on a generated `dist/404.html`.
- Practice **and Trackman** sessions live in **DynamoDB** behind the async repository seam at
  `schemaVersion` 3, with JSON export/import. `localStorage` is a read cache, so the same history
  is on the phone and the laptop.
- Club path is stored **per club** and never blended. The KPI is **driver** club path.
- Each club row carries **twelve metrics**, each with its own shot count, and the shot-by-shot
  record sits in a separate `SHOTS#` item that nothing on the site downloads.
- A daily Actions workflow pulls Trackman sessions straight into the store, holding no
  permissions and no AWS credentials, and never overwriting anything typed by hand.
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

## Phase 4 · Progress — **done (2026-08-05)**

[#5](https://github.com/RichardWhitfield/golf/issues/5)

Shipped: a `/progress` route holding four views — per-club club-path small multiples on a fixed
shared domain with the band and **both** fault regions, drill coverage against the plan's own
schedule, feel per drill per arc phase, and the live arc position. The calculations live in four
pure modules (`domain/scale.ts`, `series.ts`, `coverage.ts`, `feel.ts`); components only render.

**Two findings from the real backfill changed the design** — see
`docs/superpowers/specs/2026-08-04-phase-4-progress-design.md`:

- **The worst readings carry the smallest `n`.** The driver's `−11.53°` on 2026-07-20 is three
  shots. Dot area encodes the count, so a thin reading cannot shout as loudly as a measured one.
- **Drill `03` is scheduled by no day in `plan.ts`.** It computes to `0 of 0`, which is
  indistinguishable from a drill asked for six times and skipped. Coverage carries a `status`
  so "never asked" and "avoided" can never render alike — otherwise the chart would invent a
  finding.

**The headline is not flattering:** across 44 driver readings the club path has gone from
`−1.83°` (2025-07-03) to `−3.18°` (2026-07-22), and only three of those readings have ever sat
inside the `−2°…+2°` band. The page reports that rather than finding a window that flatters it.

---

## Phase 5 · Trackman ingest — **merged into Phase 3**

[#6](https://github.com/RichardWhitfield/golf/issues/6) · closed as duplicate of
[#4](https://github.com/RichardWhitfield/golf/issues/4)

Merged on 2026-07-31, once OQ-1 confirmed both a working data path and a reusable headless
credential. There was no longer a reason to build manual entry as a separate, earlier phase: it
shipped alongside the ingest instead, and D6 is unchanged — deleting the workflow must still leave
the app fully usable. Built as part of Phase 3 above.

---

## Phase 6 · Synced storage — **done (2026-08-06)**

[#8](https://github.com/RichardWhitfield/golf/issues/8) (OQ-3) · design and plan in
`docs/superpowers/`

Practice and Trackman data moved from `localStorage` to DynamoDB behind a Lambda Function URL.
`localStorage` is now a read cache. `public/trackman.json` and `ingest/published.ts` are gone —
both writers, the browser and the daily workflow, go through one path.

Shipped: `infra/` (table, function, Function URL, and a `$1` monthly spend alert);
`storage/remote.ts` and `storage/cached.ts`;
the ingest rewritten to write to the store; and `StaleNotice`, because the failure this design
produces is otherwise invisible.

**Writes are unauthenticated by explicit decision (D19)**, taken after the risk was put. The bounds
are point-in-time recovery, the handler's structural validation, and per-item writes.

**Three findings from real data and a real browser changed the design:**

- **Trackman ids are 88-character base64 ending in `=`, and Lambda's `rawPath` is
  percent-encoded.** The first route matched an allowlisted charset that omitted `=` and rejected
  **all 86 sessions**. Validation is now about safety, not format: it decodes, is non-empty, is
  bounded, and holds no control characters.
- **`fetch` stored on an object and called as a method throws in every browser** — "Illegal
  invocation" — because the receiver is the holder rather than the window. **Node tolerates it**,
  so the seed, the ingest and 318 tests all passed while the deployed site never reached the store
  once. It shipped. See below.
- **A refresh that saves the store's sessions over the cache without dropping what is no longer
  there makes deletions invisible** — remove a session on the laptop and the phone resurrects it
  on every refresh.

**The verification lesson is the one worth keeping.** The `fetch` bug survived because it was
checked in a browser whose cache already held the same 86 sessions, so cache and store were
indistinguishable and the cached page was read as proof the store worked. Verifying a cache
against the thing it mirrors proves nothing. Clear site data, then watch for the network request.

The ingest's write path was proven by deleting a real session and confirming the next run restored
it byte-identically — stronger evidence than the two quiet runs originally planned as the gate,
both of which would only have exercised reads.

**Done when** — met: the same history is on the phone and the laptop, and deleting the workflow
still leaves the app fully usable with the numbers enterable by hand.

**Unblocked by this:** per-shot Trackman metrics. The `SHOTS#<sessionId>` key space is reserved,
and the first step is a schema introspection query — field names read from the live schema, never
guessed, the same discipline `domain/clubs.ts` applies to club spellings.

---

## Phase 7 · Per-shot Trackman metrics — **done (2026-08-07)**

[#25](https://github.com/RichardWhitfield/golf/issues/25) · design in
`docs/superpowers/specs/2026-08-06-phase-7-per-shot-metrics-design.md`

The GraphQL query named one field and discarded everything else Trackman measures. It now names
twelve, chosen on whether each answers a question being asked rather than on availability.

Shipped: `domain/metrics.ts`, the registry that refuses to guess an axis the way `clubs.ts`
refuses to guess a club spelling; `MetricReading` on every club row, **each with its own shot
count**; the shot-by-shot record under `SHOTS#<sessionId>` with `PUT`/`GET` endpoints and no
`DELETE`; `schemaVersion` 3 with an identity migration; `domain/relate.ts`; and a driver section
on `/progress` — `SlicePanel` and two `RelationPanel`s — that states what the data says.

**The KPI did not move.** It stays driver club path (OQ-7). This phase explains the path rather
than replacing it.

**Findings from the live schema and 5,877 real strokes changed the design:**

- **Four fields the schema advertises hold no data at all** — `strokeLength`, `backswingTime`,
  `forwardswingTime`, `tempo`, plus `detectedClubCategory`, null on every stroke. A design
  written from introspection alone would have shipped a tempo chart with nothing in it. This is
  why there are two scripts: `npm run introspect` says what exists, `npm run probe` says what is
  populated.
- **Null rates differ per metric** — by up to 45 points across the whole 75-field surface, and by
  about 23 among the twelve metrics that ship: on the driver, 723 carry readings against 556 for
  face to path, with swing plane at 666 and club path at 618. One `n` per club row would have
  sized a sparse reading like a dense one, silently. Hence a count per metric (D27).
- **Per-shot and session-mean ranges are different**, and mixing them misdraws a chart. Per-shot
  club path spans `−18…10.9` where session means span `−13.76…0.89`. Every authored domain comes
  from session means, because that is the level a panel plots (D30).
- **`attackAngle` has no shared target** — a driver wants positive, an iron negative — which is
  what forced `better: 'none'` as a real answer rather than an invented band (D29).

**The headline finding is not the one the phase set out to confirm.** Swing plane does not explain
the out-to-in path, and the face is not the fault — see the two answers below and `content.md`.

**Done when** — met in code: the wider metric set is written by every import, the shot record
exists where nothing has to download it, and `/progress` answers the plane question from the
player's own data rather than from a figure typed into a component. **Still pending: the
backfill.** Sessions imported before this phase carry club path alone, so the wider set is not
on them until a re-ingest runs — deliberately sequenced after the merge.

**Two things shipped differently from the plan:** `/progress`'s section numbers are derived rather
than hardcoded, so hiding the conditional section renumbers the rest instead of leaving a gap; and
`RelationPanel` draws fault regions on **both** sides plus axis ticks, which the plan's draft
omitted — without them the panel would have inverted the coaching message.

**The probe workflow was deleted with this phase.** Both scripts stay: introspection needs no
credential, and the probe is run by whoever holds the token. What went was the branch-triggered
CI job, which had done its work.

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
read per block rather than as one endless series.

**Partly answered by Phase 4 (2026-08-05):** for *charting scope* the decision is **all-time,
with the current block shaded on the axis** — the question worth answering is whether the block
is bending a 13-month trend, and scoping to three weeks leaves the club-path chart with about
three points. This needed no `Block` entity. The wider question — what happens after week three,
and whether sessions get grouped per block — **remains open.**

### OQ-3 · Does storage ever need to leave the device? — **resolved 2026-08-06**

[#8](https://github.com/RichardWhitfield/golf/issues/8) · closed by Phase 6

**Yes.** The question asked for evidence of friction rather than a guess, and two things supplied
it. Logging happens on a phone and review on a laptop, so the two held different histories and
JSON export/import was a chore nobody performed weekly. More decisively, the **next phase is
blocked without it**: widening the Trackman query to the full per-shot measurement set has nowhere
to land while the publication channel is a file committed to a public repo. That is defensible for
per-club aggregates and not defensible for a shot-by-shot record.

The async repository interface did exactly what D2 promised — adding the backend touched
`stores/sessions.svelte.ts` and nothing else. Decisions D18–D26 are in `architecture.md`.

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

### The swing-plane question — **answered 2026-08-07**

Never a numbered open question, but the reason Phase 7 was raised:

> *Swing plane is probably too steep, and that may be causing the out-to-in path.*

**The data does not support it, and the sign runs the other way.** On the driver, at the
session-mean level `/progress` plots, `r = +0.503` across 44 sessions — a *positive* r, meaning a
steeper plane has gone with a **less** out-to-in path. The relationship is moderate (R² ≈ 0.25)
and club-dependent: at the 4-iron, **measured shot by shot**, it vanishes (`−0.053`). No 4-iron
session-mean figure was computed, so the two are not the same measurement — but neither reading
puts steepness behind the path.

**And the face is not the fault either.** Driver face angle has a median of `−0.86°` — square to
target — while face to path has a median of `+4.8°` and has **never once been negative** across 44
sessions, minimum `+0.97°`, with curve never below `+3.61 m`. The face is only open *relative to
the path*, because the path is so far left. That independently vindicates the KPI: fix the path
and the curve goes with it.

**What follows is a coaching question, not a software one.** The app now says what the cause is
not; what it *is* is not something the repo can answer. `swingPlane` stays stored and charted so
the answer stays checkable as the swing changes.

### OQ-8 · Does `swingDirection` deserve a place after all?

Raised by Phase 7. It correlates at `r = 0.819` with club path on the driver and was excluded as
near-collinear — a second panel saying the same thing. But if the path neutralises and the two
diverge, **that divergence is itself the interesting signal**.

**Revisit when driver club path first sits inside the band for three consecutive sessions.** Not
before: while the two move together there is nothing to see, and adding it now would cost a panel
and buy nothing.

---

## Principles for sequencing

1. **Every phase deploys.** Never leave `golf.whitfield.life` broken or half-migrated.
2. **Capture data before visualising it.** Phases 2 and 3 must precede 4 — charts designed
   against an empty store are designed wrong.
3. **The blocked thing is last.** Trackman ingest is the most uncertain and least essential piece;
   everything else works without it.
4. **Preserve what works.** The visual design is the thing already worth keeping. Phase 1 changes
   the machinery, not the appearance.
