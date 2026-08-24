# Destinations — Australia's Top 100 courses

**Status:** design, approved 2026-08-24
**Covers:** Phases 9–12. Each ships and deploys on its own.

---

## 1. Summary

The site does one thing: it tracks a swing change against a single KPI. This adds a second thing
that is not practice at all — **where to play** — and separates the two in the URL scheme so
neither has to pretend to be the other.

Four pieces, deliberately kept apart:

- **Phase 9 · The route restructure.** Everything that exists today moves under `/practice`.
  `/destinations` becomes its peer. No new content; the phase exists so the reshuffle lands on
  its own and can be verified on its own.
- **Phase 10 · The dataset.** Golf Australia's Top 100 for 2026, as a typed registry in
  `lib/domain/courses.ts`, widened by research into what it actually costs to play each one and
  whether a non-member can. No UI.
- **Phase 11 · The view.** A map with per-club markers, a course detail at
  `/destinations/<slug>`, and a ranked list that works when the map does not.
- **Phase 12 · The wishlist.** Marking a course *want to play* or *played*, stored beside the
  practice history.

The split is not ceremony. Phase 10 is slow, research-bound work with an uncertain yield; Phase 9
is a two-hour change to a router. Sequencing them together would hold a small certain change
behind a large uncertain one.

---

## 2. What prompted it

The plan is explicitly three weeks and ends before a trip (OQ-2). The trip is the point of the
practice, and the repo has nothing to say about it. A destinations page is the other half of the
same intent: the KPI answers *is the swing changing*, and this answers *what is it changing for*.

---

## 3. Phase 9 — the route restructure

### 3.1 The scheme

| Path | Behaviour |
|---|---|
| `/practice` | the plan page — today's `/`, unchanged in appearance |
| `/practice/log` | today's `/log` |
| `/practice/progress` | today's `/progress` |
| `/destinations` | the map |
| `/destinations/<slug>` | one course |
| `/`, `/log`, `/progress` | **redirect** to the path above |
| anything else | as now: rewritten to the default route |

`routeFor()` grows from three equality checks into a table plus a legacy map. `Route` stays a
string union; nesting is a fact about the *path*, not a new tree structure in the router. A
hundred-line hierarchical router would be machinery this site does not need.

### 3.2 Redirects use `replaceState`, not `pushState`

The router already does this for unrecognised paths, and the reason generalises: a redirect that
pushes leaves the old URL in history, so Back returns to it, which redirects forward again. The
bookmark on the phone points at `/`. Turning it into a Back-button trap is the one way this phase
can make the site worse.

### 3.3 Navigation

`SiteNav` becomes two levels: **Practice | Destinations** as peers, with **Plan | Log | Progress**
beneath, shown only inside Practice.

The mobile ordering needs care. `SiteNav` currently claims `order:-2` under `760px` because
`.today` claims `order:-1` and the nav has to outrank it. A second row is a second thing competing
for the top of a phone screen, above the panel that is the reason the site gets opened daily. The
sub-nav sits **below** the primary row and must not push the Today panel further down than one
row's height.

### 3.4 Done when

`golf.whitfield.life/practice` is the plan page, the three old URLs all land where they should
without a Back-button trap, and nothing about the plan, log or progress views has changed
visually.

---

## 4. Phase 10 — the dataset

### 4.1 Shape

`lib/domain/courses.ts`, following `drills.ts`, `clubs.ts` and `metrics.ts`: one typed registry,
the single source of truth, never restated in markup.

```ts
type CourseSlug = string                                  // 'royal-melbourne-west'
type AusState = 'NSW' | 'VIC' | 'QLD' | 'SA' | 'WA' | 'TAS' | 'NT' | 'ACT'
type Access = 'public' | 'limited' | 'members' | 'unknown'

interface Course {
  slug: CourseSlug
  rank: number            // 1–100, the 2026 Golf Australia ranking
  name: string
  suburb: string
  state: AusState
  lat: number
  lon: number
  architects: string[]    // with dates where the source gives them
  summary: string         // written here, not quoted — see §4.4
  site?: string           // the club's own site
  visitorUrl?: string     // the visitor-rates page specifically, where one exists
  access: Access
  greenFee?: { amount: number; currency: 'AUD'; note?: string }
  logo?: string           // 'logos/<slug>.png' under public/
  checkedOn?: ISODate     // when access, fee and site were last verified
}
```

### 4.2 Three rules carried over from elsewhere in the repo

- **`greenFee` is absent, never `0`.** The same discipline as `n` on a hand-typed club-path row.
  An unknown fee renders as a dash. A `0` would render as free, and be wrong in the most expensive
  possible direction.
- **`access: 'unknown'` is a real answer**, exactly as `better: 'none'` is in `metrics.ts` and as
  `coverage.ts` keeps "never scheduled" apart from "avoided". A club that could not be confirmed
  must not render as members-only. That is inventing a finding, which is the failure this codebase
  has designed against twice already.
- **Nothing is guessed.** `clubs.ts` returns `null` for an unrecognised club name and reports it
  rather than picking the nearest spelling. Research follows the same rule: a fee that could not
  be read off the club's own site is absent, and the gap is listed on the ticket.

### 4.3 Sourcing

Four stages.

1. **Scrape once.** `…/ranking-australias-top-100-courses-for-2026-622887/page0` holds the whole
   list in one document — 98 `<strong>`-wrapped rank blocks were counted there against 18 and 10
   on the paginated views, which hold subsets. One fetch yields rank, name, suburb, state and
   architects. **Implementation must assert all of ranks 1–100 are present** rather than trusting
   that count.
2. **Fan out.** Sub-agents, roughly ten courses each, resolving from the club's own site: official
   URL, visitor-rates URL, access policy, current visitor green fee, coordinates, favicon or logo.
3. **Verify, and leave gaps as gaps.** A second pass samples the results. Anything unconfirmed
   stays `unknown`/absent. Sixty confirmed fees and forty dashes is a better dataset than a
   hundred plausible ones of unknown provenance.
4. **Emit.** `courses.ts`, plus logos normalised to 64px under `public/logos/`.

Coordinates get a cheap sanity check: a course whose `lat`/`lon` falls outside its own state's
bounding box is a research error, and it is the one error a map makes obvious only if you already
know where the course is.

### 4.4 Attribution

The ranking page's per-course text is panel commentary by named judges. `dist/` is publicly
readable on a real domain.

Rank, name, location and architect are facts and are stored as such. `summary` is **written for
this site**, in the site's own voice, and every course links back to the Golf Australia article as
its source. The judges' paragraphs are not reproduced.

Club logos are trademarks. They are used as map markers at 64px, sourced from each club's own
site, linking to that club — nominative use for identification, which is the ordinary purpose of a
favicon. Recorded here so the choice is visible rather than incidental.

### 4.5 Done when

`courses.ts` holds 100 entries, every one with a rank, a name, a location and coordinates inside
the right state; every fee present is dated by `checkedOn`; and the courses that could not be
resolved are listed on the issue rather than filled in.

---

## 5. Phase 11 — the view

### 5.1 The map

Leaflet (~40 KB gzipped, plus its own stylesheet) with CARTO's dark basemap. OSM's default tiles
are light and would fight the palette; CARTO's dark style is free at this volume and requires
attribution, which is rendered.

This is **the first external runtime dependency in the bundle and the first third-party network
request the site makes on load.** Three consequences, all of them rules this repo already holds:

- **It must degrade.** A failed read never blanks the site — that is why `StaleNotice` exists and
  why `sync()` is fired without `await`. If Leaflet or the tile server fails, `/destinations`
  renders the ranked list. The list is not a fallback bolted on afterwards; it is the primary
  content, and the map is drawn over it.
- **Leaflet's CSS is light-themed** — zoom controls, attribution box, popup chrome. All restyled
  to tokens. No hardcoded colour survives review.
- **Leaflet animates pan and zoom.** Every animation on this site needs a
  `prefers-reduced-motion` override that leaves content visible, so `zoomAnimation` and
  `fadeAnimation` come off under that query.

### 5.2 Markers

A fixed 44px circular chip carrying the club's favicon — which satisfies the outdoor hit-target
minimum at the same size. **The chip falls back to the rank number** when a logo is missing, is
too small to survive the scale, or fails to load: roughly a hundred club sites will not all yield
a usable 64px mark, and a broken image icon on a map is worse than a number.

Clustering is needed and is not optional. Around fifteen of the hundred sit within greater
Melbourne, and the Sandbelt puts several within a few kilometres of each other.

### 5.3 Calculation stays out of components

Phase 4's rule — *components render; they never calculate* — applies unchanged. A
`lib/domain/destinations.ts` owns filtering, sorting, grouping by state and the state
bounding-box check. It is pure, and it is what the tests test.

### 5.4 Layout

The map sits inside the existing `--maxw: 900px` column, tall on mobile. Breaking the content
width is a visual change to a design the brief is explicitly to extend rather than replace, and it
can be revisited once there is a real map to look at.

### 5.5 Access needs its own tokens

Three new tokens, documented in `docs/design.md`, for public / limited / members-only.

`--flag` is **not** reused for members-only, though "you cannot play here" is superficially a
problem. `--flag` means *the slice* — the fault the entire site is built around — and `--ball`
means the target band. Overloading that vocabulary with an unrelated meaning would cost more than
three tokens do.

### 5.6 Done when

`/destinations` shows all 100 on a map with per-club markers, a marker opens the course, a deep
link to `/destinations/<slug>` loads that course directly, and blocking the tile host still leaves
a usable ranked list.

---

## 6. Phase 12 — the wishlist

### 6.1 Storage

The store already has a singleton-item pattern: `GET /settings` and `PUT /settings` read and write
one non-session item. Destinations notes are the same shape — one small document, read whole,
written whole — so they get a sibling item and a sibling route pair rather than a new item type or
a per-course write path.

```ts
type DestinationNotes = Record<CourseSlug, {
  status: 'want' | 'played'
  playedOn?: ISODate
  note?: string
}>
```

**An absent key means no opinion.** There is no third `'none'` status to keep in step with
deletion.

### 6.2 What it costs

- `schemaVersion` **4 → 5**, with a migration adding an empty map.
- `SCHEMA_VERSION` in `infra/function/handler.mjs` bumped **in the same commit**, per the standing
  rule.
- `infra/` redeployed by hand. Never from CI.
- Two `Repository` methods, `getDestinations` / `saveDestinations`. On the interface, not on
  `RemoteRepo` alone: D28 keeps shots off the interface because they are megabytes, and a hundred
  short notes are not.
- `transfer.ts` carries them through export and import, merging per slug and never clobbering what
  the store already holds — the rule settings already follow.
- A failed write **throws**. Silently losing a note is the failure mode `localStorage` never had.

### 6.3 This is adjacent to OQ-6, and stays separate

OQ-6 (issue #11) asks whether course rounds get logged. A `played` status carrying a date is the
thin end of it.

They stay apart. A wishlist tick records an intention or a memory; a round is a third session type
with a score, a date, conditions and a relationship to the KPI. Merging them would widen the
session model to satisfy a bookmark. If rounds are ever logged, `played` becomes derived from them
— but that is OQ-6's decision to make, not this phase's.

### 6.4 Done when

A course can be marked and unmarked on the phone, the mark is on the laptop on the next load, and
a JSON export round-trips it.

---

## 7. Decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| D32 | URL scheme | **Nested paths**, `/practice/*` and `/destinations/*`, with the three legacy paths redirected | Log and Progress only make sense inside Practice. Redirects rather than breakage because the daily entry point is a bookmark. |
| D33 | Course data | **Static typed registry in `lib/domain/courses.ts`**, shipped in the bundle | Same class of content as drills and the plan: it changes rarely, it belongs in version control, and it must render with the store unreachable. |
| D34 | Map | **Leaflet + CARTO dark raster tiles**, degrading to a ranked list | Real pan/zoom for ~40 KB against a bespoke SVG map that would need hand-built drill-down to separate the Sandbelt. The first external runtime dependency in the bundle, accepted on that trade. |
| D35 | Markers | **Favicon in a fixed 44px chip**, falling back to the rank number | Recognition without a hundred mismatched crests, and the chip is the hit target. Not every club site yields a usable mark, so the fallback is part of the design rather than a patch. |
| D36 | Unknowns | **`access: 'unknown'` and an absent `greenFee` are real answers** | The same rule as `better: 'none'` and as coverage's "never scheduled". A guessed fee is worse than a dash because it looks measured. |
| D37 | Fee freshness | **A dated snapshot, refreshed by hand.** `checkedOn` per course, surfaced in the UI | An automatic refresh has no API behind it — a hundred club sites in a hundred layouts. Extraction in CI needs a model, a key and a recurring spend, and can silently commit a misread number. See OQ-9. |
| D38 | Wishlist storage | **A singleton item beside settings**, not a new item type | It is one small document read and written whole. Per-course items would buy write granularity that a single user does not need. |

---

## 8. Risks

- **The live site.** Phase 9 changes every URL on a domain that is bookmarked and in use. The
  redirect map is the phase, and it is what gets verified after deploy — not just that
  `/practice` loads.
- **The tile host is somebody else's.** Blocked, rate-limited or gone, the map stops. That is
  survivable only because §5.1 makes the list primary. Verify by blocking the host, not by
  assuming.
- **Research yield is unknown.** Some clubs publish visitor rates; some publish "contact the
  office". The dataset is designed to hold that honestly, and the risk is to the *usefulness* of
  Phase 11, not to its correctness.
- **Bundle growth.** A hundred courses plus a hundred 64px logos is a real payload on a phone at a
  range. Logos are separate files under `public/`, so they are fetched as markers need them rather
  than parsed with the bundle.
- **`schemaVersion` 5 touches the practice history.** Phase 12's migration runs against the
  document holding every session. It is additive, and it still gets a test against a real v4
  export.

---

## 9. Open question

### OQ-9 · Should green fees be re-checked automatically?

Raised and **deliberately not built**. The options examined were a change-detection job (fetch
each visitor-rates page, hash the relevant text, open an issue when it moves) and full
agent-driven re-extraction in CI.

The first is cheap and needs no credential; the second needs an `ANTHROPIC_API_KEY` in a public
repo and can commit a misread figure. Neither was judged worth its maintenance against a hundred
unrelated sites for a dataset consulted a few times a year.

**Revisit if a stale fee ever misleads a real decision** — that is the evidence this would need,
and it is the same bar OQ-3 was held to.
