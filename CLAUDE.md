# CLAUDE.md

Guidance for Claude Code when working in this repository.

## What this is

A personal golf-improvement site for one user, live at **`golf.whitfield.life`**.

It currently holds a **3-week "slice-buster" practice plan** built around a single KPI: club path
moving from `−6°/−10°` to `−2°/+2°` on a Trackman. It is being expanded from a static page into a
**living practice tracker** — logging sessions, drills and path numbers over time.

## Documentation map

Read the relevant file before working in that area. Keep them current — if a change makes one
of these wrong, fix it in the same commit.

| File | Contents |
|---|---|
| `docs/design.md` | Colour tokens, typography, components, motion, accessibility. **Read before touching any UI.** |
| `docs/content.md` | The golf domain: drills, plan, KPI, coaching voice. **Read before touching copy or content data.** |
| `docs/architecture.md` | Target stack, data model, storage seam, deployment. **Read before adding features.** |
| `docs/roadmap.md` | Phasing and open questions. **Check before starting work** — it may already be sequenced or blocked. |

## Current state

**Svelte 5 + Vite + TypeScript, built from source** (Phase 1, issue #2). GitHub Actions builds
`dist/` and publishes it to GitHub Pages; `public/CNAME` sets the custom domain. Pages no longer
serves the repo root — pushing `index.html` does nothing on its own.

The page is composed from components in `src/lib/components/`, styled by `src/app.css` plus
scoped component styles. The Today panel is now a Svelte component reading the schedule from
`src/lib/domain/plan.ts`; the vanilla JavaScript that used to power it is gone.

**Key constraint: `src/lib/domain/drills.ts` is the single source of truth for drill content.**
The Today panel and the "Core drills" section both render from it. Never restate drill copy in
markup — if a drill's text changes, it must change in exactly one place. (This inverts the
pre-Phase-1 rule, where the *cards* were authoritative and the panel cloned them.)

`storage/`, `stores/` and `routes/` are built (Phase 2, issue #3). `ingest/` is built (Phase 3,
issue #4), along with `scripts/trackman-ingest.ts` — the Node entry point the daily Actions
workflow runs. It imports from `lib/ingest/` and `lib/storage/`, so the null-filtering,
Sydney-date and merge rules exist once and are shared with the browser. That is why `tsx` is a
devDependency.

The site has three views behind a History-API router: `/practice` (the plan page), `/practice/log`
and `/practice/progress`. The paths they used to hold — `/`, `/log`, `/progress` — **redirect**
with `replaceState`, never `pushState`: a push would leave the old URL one Back away, redirecting
forward again, and the daily entry point is a phone bookmark on `/`. `resolvePath()` in
`stores/router.svelte.ts` owns that map, is pure and is tested. Deep links depend on
`dist/404.html`, generated from the built `index.html` by the `pages-spa-fallback` plugin in
`vite.config.ts` and asserted by the deploy workflow alongside `CNAME`.

Progress charts are built (Phase 4, issue #5). Every calculation lives in `lib/domain/` —
`scale.ts` (fixed chart axes, against any authored domain), `series.ts` (per-club series),
`coverage.ts` (done vs scheduled) and `feel.ts` (feel per arc phase). **Components render; they
never calculate.**

The **Top 100 course dataset** is built (Phase 10, issue #31) and has no consumer yet — the map is
issue #32. `lib/domain/courses.ts` is the registry: 100 entries in rank order, holding rank, name,
location, coordinates, architects, an original `summary`, the club's own URLs, `access`, an
optional `greenFee` and an optional `logo`. `lib/domain/destinations.ts` holds only
`STATE_BOUNDS`, `isWithinState()` and `courseBySlug()` — no filtering, sorting or grouping helper,
because nothing consumes one yet. Logos are committed under `public/logos/<slug>.png`; ImageMagick
normalised them once by hand and is **not** a build or test dependency.

Practice data lives in **DynamoDB** behind a Lambda Function URL (Phase 6). `localStorage` is a
read cache under the key `golf:store`, holding the same versioned document at `schemaVersion` 5.
**Reach either only through `lib/stores/sessions.svelte.ts`** — that file constructs the only
`Repository` in the app, a `CachedRepo` wrapping a `RemoteRepo` and a `LocalStorageRepo`.

The ingest carries **forty-three metrics** — every `Measurement` field Trackman actually
populates (Phase 8). `lib/domain/metrics.ts` is the registry, and its entries come in two kinds:
**carried** metrics are stored per shot and as a session reading, and **charted** metrics add a
hand-authored, driver-scoped axis. Eighteen are charted. `isCharted()` and `chartedInfo()` are
the only routes to a domain, so asking to plot a metric that has no authored axis fails at the
call rather than rendering an undefined one. Each club row gains `metrics`, a map of
`MetricReading { typical, best?, n }` keyed by every metric **except** club path, which keeps its
own dedicated fields. The shot-by-shot record lives in its own item under `SHOTS#<sessionId>`,
written by the ingest and reachable only from `RemoteRepo`. `lib/domain/relate.ts` correlates two
metrics for one club, `lib/domain/latest.ts` picks the newest reading for a club and reads the
face-to-path verdict, and `/practice/progress` gained a driver section — "Why the ball curves" —
rendered by `SlicePanel` and `RelationPanel`.

The store also holds **destination notes** (Phase 12): `Record<CourseSlug, DestinationNote>` in
its own singleton item at `pk: 'DESTINATIONS', sk: 'v1'`, a sibling of `SETTINGS` reached through
`GET`/`PUT /destinations` and two `Repository` methods. **An absent key means no opinion** —
un-marking a course deletes its key, and there is no third `'none'` status. A failed *read*
degrades to an empty map inside `CachedRepo`; a failed *write* throws. Slugs are never checked
against `COURSES` — not in `transfer.ts`, not in the Lambda — so a future ranking cannot strand a
mark.

**Carrying is the default; charting is the deliberate decision.** Phase 7 applied one test to
both and dropped `ballSpeed`, `smashFactor`, `spinRate`, `launchAngle` and `total` — the
best-populated fields in the dataset, `0%` null on the driver where `clubPath` is 14.5% null.

`readingFor` returns **`Reading`**, whose `n` is optional — distinct from the stored
`MetricReading`, whose `n` is required. A hand-typed club-path row genuinely has no count, and
the widened type is what makes the compiler enforce "absent, never zero" rather than a comment.

**Destinations** is built (Phase 11, issue #32). `lib/domain/courses.ts` is the Top 100 registry
and `lib/domain/destinations.ts` is its maths: bounding boxes, the slug lookup, `spreadCoincident`
(seven courses share three coordinates), `clusterProjected` (grid clustering on already-projected
pixels), and the `feeLabel`/`ACCESS_LABELS` wording. `CourseMap.svelte` is the **only** file that
touches Leaflet — the repo's first and only runtime dependency (D34).

Infrastructure lives in `infra/` and is deployed by hand, never from CI — see `infra/README.md`.
**Writes are unauthenticated by explicit decision (D19):** the bounds are point-in-time recovery,
the handler's structural validation, and writing one item at a time.

The store holds **two session types**: `PracticeSession` (Tue–Sun) and `TrackmanSession` (the bay
session, with per-club club path). `Session` is the union; narrow with `isPractice`/`isTrackman`.

### Where a style rule belongs

`app.css` holds tokens, the reset, shared typography, the section scaffold, and classes used by
more than one component (`.grid`, `.sec-head`, `.aid-note`). Everything else is scoped to its
component — **including that component's own `760px` media query.**

Never split one element's rules across both layers. Svelte compiles `.hero` to `.hero.svelte-xxx`,
so a scoped base rule outranks a global override and the override silently loses.

## Rules

### Design
- **Use the CSS custom properties.** Never hardcode a colour. New colour needs a new token,
  documented in `docs/design.md`.
- **`--ball` (yellow) means the goal. `--flag` (red) means the problem.** Never invert this.
- **Data and labels are Space Mono. Prose is Inter. Headings are Archivo.** Every number,
  measurement, rep count and category label is monospaced.
- Three surface levels only: `--bg` → `--panel` → `--card`.
- One breakpoint (`760px`). Prefer `clamp()`, `auto-fill`, `minmax()` over new media queries.
- **Every animation needs a `prefers-reduced-motion` override that leaves content visible.**
- Every interactive element needs a visible focus state. A global `:focus-visible` rule using
  `--ball` exists — don't remove it, and don't suppress outlines on new controls.
- Interactive controls need a `44px` minimum hit target — this gets used outdoors, one-handed.

### Content
- British English (`lang="en-GB"`).
- Second-person, direct, coach-like. Short declaratives.
- **Drill numbers `01`–`07` are stable identifiers.** The weekly schedule references them by
  digit. Never renumber.
- Every drill keeps its *"feels like"* cue — it is the most valuable field in the model.

### Code
- **No component may call `localStorage` directly.** Everything goes through the repository
  interface in `lib/storage/`.
- **Repository methods are `async`, always** — even over synchronous `localStorage`. This is what
  makes a future backend a contained change rather than a rewrite.
- Club path is **signed**; negative is out-to-in. Never store an absolute value, and never
  range-check one with `Math.abs` — that accepts a sign flip, the one error that matters most.
- The target is a **band** (`−2°` to `+2°`), not a maximum. Overshooting is a fault. Progress
  visuals need fault regions on both sides — never a "higher is better" bar. This is also why
  `best` means the reading closest to neutral, **never `Math.max`**.
- **Never blend club path across clubs.** No code path may compute a mean spanning more than one
  club — a blended figure tracks club selection, not swing change (OQ-7, issue #14). The KPI club
  is the **driver**.
- **`domain/series.ts` is where the never-blend rule is enforced structurally.** It keys by
  `Club` and never reduces across keys, so no cross-club mean is expressible. Keep it that way.
  `domain/relate.ts` gives the same guarantee a different way: it takes a single `Club` and never
  looks at another, so no cross-club pairing is expressible either.
- **The chart y-domain is a fixed constant, never derived from the data.** A fitted domain moves
  between visits and silently redefines "good" as "better than recent" rather than "in the band".
- **"Never scheduled" and "avoided" are different findings.** Drill `03` appears in no day's
  `plan.ts` schedule, so it computes to `0 of 0` — identical to a drill asked for six times and
  skipped. `coverage.ts` carries a `status` to keep them apart. Never render them alike.
- **`domain/clubs.ts` is the single source of truth for club names, order and the Trackman name
  mapping.** That mapping contains only spellings verified against real API responses; an unknown
  string returns `null` and is reported, never guessed at.
- **`n` (shot count) is absent, never zero, on hand-typed readings.** Don't fabricate a default —
  a chart would weight the guess as though it were measured.
- **`domain/courses.ts` is the single source of truth for course data**, as `drills.ts` is for
  drills. The ranking article is linked once as `RANKING_SOURCE`, never repeated per entry, and
  **its panel commentary is never reproduced** — every `summary` is prose written for this site,
  and `dist/` is publicly readable on a real domain.
- **A course whose access could not be confirmed is `'unknown'`, never `'members'`.** That is the
  same rule as `better: 'none'` in `metrics.ts` and "never scheduled" in `coverage.ts`: rounding
  an unconfirmed club up to members-only invents a finding. The `accessNote` must not assert
  either — it may say what is believed, and that it is unverified.
- **A `greenFee` is absent, never `0`.** An absent fee renders as a dash; a `0` renders as free,
  which is wrong in the most expensive possible direction. Only a fee read off the club's own site
  is stored. `access` and `greenFee` are a dated snapshot (D37), stamped with `checkedOn` and
  refreshed by hand, never automatically.
- **A `logo` path is written only where the file exists** under `public/`. A path with no file
  behind it is a broken marker, and `courses.test.ts` checks every one against `node:fs`.
- **`domain/metrics.ts` is the single source of truth for metric field names, axes and bands.**
  Every `field` was read from the live schema via `npm run introspect`, never from memory. The
  GraphQL selection set is built from it, so a wire name exists in exactly one place.
- **`n` is per metric, not per club row.** The stored metrics differ by **52** points of null
  rate on the driver alone — every ball-flight field (`carry`, `total`, `ballSpeed`,
  `launchAngle`, `launchDirection`, `spinRate`, `carrySide`, `totalSide`, `landingAngle`,
  `hangTime`, `maxHeight`) is `0%` null across 730 strokes, down to `dynamicLie`/`impactOffset`/
  `impactHeight` at 52.2% null, with `clubPath` itself at 14.5% (624 of 730) and `faceToPath` at
  23.0% (562 of 730). A shared count would size a sparse reading like a dense one.
  `MetricReading.n` is therefore required, while `ClubPath.n` stays optional: hand entry produces
  a club-path row and never a `MetricReading`.
- **`best` means closest to the band's midpoint, not closest to zero.** For club path the band
  is `−2…+2` and the midpoint is `0`, so nothing about the KPI changes. `spinRate` (2,200–2,700
  rpm) and `launchAngle` (13–15°) are why it is expressed as a midpoint. A `neutral` metric with
  no band throws — the midpoint would be undefined. `smashFactor` is `higher` despite having a
  band, because ~1.50 is a physical ceiling and "closest to the midpoint" would rank 1.475 above
  1.50.
- **`better: 'none'` is a real answer.** `attackAngle` wants positive on a driver and negative on
  an iron, so there is no shared band. Metrics with no target store no `best` and draw no band.
  Never invent one.
- **The authored domains in `metrics.ts` are scoped to the driver.** Several metrics are strongly
  club-dependent — swing plane runs ~50° on a driver against ~69° on a 4-iron. Charting one of
  them for a second club means authoring that club's domain first. It is not a derivation to be
  automated.
- **Per-shot data is not on the `Repository` interface.** `SHOTS#<sessionId>` is reachable only
  from `RemoteRepo`, and the ingest is its only writer. Putting it on the interface components
  use would invite a page to download thousands of rows to draw charts that do not use them.
  There is no `DELETE` either: the ingest is the only writer and nothing reads shots back, so an
  orphaned item costs a few KB and nothing else. **Deleting a session leaves its shots behind** —
  the `SHOTS#<id>` item is orphaned, not retired.
- **`courses.ts` is never edited to make a map look right.** Seven courses genuinely share three
  coordinates — one clubhouse, several courses — so `spreadCoincident` returns a **derived display
  position** and the researched pair stays untouched. A fabricated latitude sitting beside verified
  ones is indistinguishable from them six months later, and the dataset's credibility rests on
  nothing being guessed.
- **An absent `greenFee` is a dash, never "Free" and never `$0`**, and a fee that is present
  **always carries its `checkedOn` date** (`$395 · checked Aug 2026`). It is a hand-checked
  snapshot (D37), and a stale figure that reads as current is what dating it prevents. Both rules
  live in `feeLabel`, not in a template, so neither can be got wrong twice. Forty of the hundred
  have no fee; eight have `access: 'unknown'`, which must never round to public or members-only.
- **The two destinations views are imported dynamically in `App.svelte`, and must stay that way.**
  `courses.ts` is ~95 kB raw of travel-planning data. A static import puts every byte of it in the
  chunk `/practice` loads — the page opened daily, outdoors, on a phone, that never reads a
  course. D1 chose this stack for a small bundle at the range, and making the daily page 70%
  larger to carry a trip planner inverts that. The practice routes stay synchronous, with no
  wrapper and no pending state; only the destinations branches are lazy, and a chunk that fails to
  arrive renders an honest message beside the nav rather than throwing.
- **The map must never block or blank the page.** The ranked list is the primary content and the
  map is drawn over it. Leaflet is **dynamically imported**, and that is not a size optimisation:
  a static import would put it in the chunk that renders the list, so a Leaflet that failed to
  parse would take the list down with it. Construction failure, and a tile host that never paints
  a single tile, both hide the map and leave the list.
- **Leaflet animates from JS options, not CSS.** A stylesheet `prefers-reduced-motion` rule cannot
  reach it. Read the query with `matchMedia` and pass `zoomAnimation`/`fadeAnimation`/
  `markerZoomAnimation` to the constructor — and `animate` to any `setView`.
- **No second map dependency.** Clustering is maths, so it lives in `lib/domain/` where it can be
  tested without a browser. `leaflet.markercluster` is not installed and should not be.
- Plan and drill content lives in `lib/domain/` as data, not in markup.
- Bump `schemaVersion` and write a migration for any stored-shape change. The Lambda handler
  carries its own `SCHEMA_VERSION` constant, and it is bumped in the same commit.

### Deployment
- **`CNAME` must end up in `dist/`** (it lives in `public/`). Losing it drops the custom domain.
  The deploy workflow asserts `dist/CNAME` exists and has the right contents — don't remove that
  guard. `public/favicon.ico` matters for the same reason: browsers request it from the root.
- Anything in `dist/` is publicly readable. **No secrets in the client bundle** — credentials
  belong in GitHub Actions secrets only.
- **`VITE_API_URL` is public and is not a secret.** The browser must call it, so it ships in
  `dist/` either way. It is the repository *variable* `API_URL`, never an Actions secret — filing
  a non-secret as a secret blurs the rule that matters. The deploy asserts it reached the bundle.
- **`infra/` is deployed by hand, never from CI.** Deploying from a public repo's Actions would
  need AWS credentials, and nothing else in this design does. See `infra/README.md`.
- Every phase must leave `golf.whitfield.life` working.

## Things to be careful about

- **This is a live site on a real domain.** Verify a deploy before considering work done.
- **DynamoDB is the record; `localStorage` is a cache.** Reads paint from the cache and refresh
  from the store; writes go remote-first. A failed **read** degrades to cached data and must never
  blank the site. A failed **write** must *throw* — silently losing a session is the one failure
  mode `localStorage` never had. JSON export/import stays the escape hatch. Never write code that
  can wipe the store without an explicit user action.
- **A swallowed read failure looks exactly like a healthy site.** That is why `StaleNotice` exists
  and why `CachedRepo` carries `stale`. A bug that stopped the app reaching the store entirely
  once shipped and looked fine, because the cache held the same data. **Never verify the store
  against a browser whose cache is already populated** — clear site data first, and watch for the
  network request.
- **`fetch` must be bound before it is stored on an object.** `this.#fetch(...)` makes the holder
  the receiver, and browsers reject `window.fetch` on any other receiver with "Illegal
  invocation". **Node tolerates it**, so the whole test suite passes while the browser fails.
- **Trackman integration is built, and undocumented** (Phase 3, issue #4). A GraphQL API at
  `api.trackmangolf.com/graphql` works with the player's own token — see `docs/architecture.md` §4.
  It is unofficial and **must be assumed to break without notice**: never let it block app load, and
  keep manual entry working as the baseline. `sync()` is fired without `await` and swallows every
  failure by design.
- **Deleting `.github/workflows/trackman.yml` must leave the app fully usable.** That is a stated
  "done when", not a nicety. Manual entry is the baseline (D6).
- **The ingest carries no AWS credentials, and must not acquire any.** Writes are open, so the
  workflow simply `PUT`s to the public Function URL. `API_URL` is a repository *variable*, never a
  secret — it ships in `dist/` because the browser has to call it.
- **Never interpolate a workflow input into a `run:` command.** `trackman.yml`'s `since` input
  reaches the script through `env:`; the script re-validates its shape before it reaches a URL.
- **A widened GraphQL query is all-or-nothing.** One field the token cannot read fails the whole
  request, `clubPath` included — there is no partial-field response. Do not add retry logic that
  narrows the selection: a retry that silently dropped the KPI would be worse than a loud
  failure. Note also that a **bad credential** surfaces as a field-level "not authorized to
  access this resource" inside a `200`, not as a `401`.
- **The Trackman schema is public and needs no credential.** `npm run introspect` runs anywhere.
  That is also why it cannot be read as a statement of permission — it describes the whole
  facility and partner surface. **Four fields it advertises hold no data at all**
  (`strokeLength`, `backswingTime`, `forwardswingTime`, `tempo`), so verify with
  `npm run probe` before designing against a field.
- **Ids from Trackman are 88-character base64 ending in `=`, and `rawPath` arrives
  percent-encoded.** The Lambda decodes before comparing or storing. Do not "validate" such an id
  against an allowlist of characters — that guessed wrong once and rejected all 86 real sessions.
  Check what matters: it decodes, is non-empty, is bounded, and holds no control characters.
- **The refresh token must never be echoed, written to a file, or included in an error message.**
  Workflow logs on a public repo are public. A failed token exchange reports its HTTP status only,
  because the response body of a failed grant can echo the grant back.
- **Club path is meaningless without a club.** Store it per club and never chart a blended average —
  a mixed-club mean tracks club selection, not swing change (OQ-7 / issue #14).
- **Don't redesign.** The user explicitly likes the current look. Extend the system; don't
  replace it.
- **`LocalStorageRepo` refuses to write when it cannot read.** Unreadable JSON is copied to
  `golf:store.unreadable` and every write throws until it is dealt with. That is deliberate when
  it is the only copy — the alternative is overwriting data that might still be recoverable.
  **`CachedRepo` neutralises it in the cache role**, where an unreadable cache must not block a
  save the store would have accepted: only the *remote's* fault gates writes. Don't "fix" either
  by falling back to an empty document.
- **The app must render even when `localStorage` is unavailable.** Reading the global throws
  outright in private browsing and under "block all cookies", and the store is constructed at
  module scope — so an eager read blanks the whole site, plan page included. `LocalStorageRepo`
  resolves storage lazily and treats it as absent rather than fatal. Don't reintroduce a
  top-level `localStorage` reference.

## Commands

```
npm install        # once
npm run dev        # dev server with HMR
npm run build      # production build into dist/
npm run preview    # serve the built dist/ locally
npm run check      # svelte-check (TypeScript + template type errors)
npm test           # Vitest, domain logic only
npm run ingest     # pull Trackman sessions — needs TRACKMAN_REFRESH_TOKEN and API_URL
npm run introspect # print the Measurement schema — no credential needed
npm run probe      # print null rates, ranges and correlations — needs TRACKMAN_REFRESH_TOKEN
```

`introspect` and `probe` are the two halves of "verify before designing": the schema says what
exists, the probe says what is populated. Neither runs in CI — the branch-triggered probe
workflow was deleted once it had done its work. `probe` prints aggregates only; no individual
reading and no credential reaches its output.

`npm run ingest` accepts `--since YYYY-MM-DD` (default: the last 14 days) and merges into the
practice store, so a narrow window never truncates history and an unchanged pull writes nothing
at all. A session deleted by accident is restored by the next run inside the window — that is
what the 14-day default is for.

`VITE_API_URL` must be set for `npm run dev`, `build` and `preview`; copy `.env.example` to
`.env`. An unset value builds a bundle that requests `undefined/sessions`, which renders from
cache and looks perfectly healthy — the deploy workflow asserts against exactly that.

`npm run check` and `npm test` both run in CI before a deploy — a failure there blocks
publication.

Opening `index.html` directly no longer works: it is a Vite entry point containing only a mount
node. Use `npm run dev`.

**TypeScript is pinned to v6** — `svelte-check` does not yet accept v7.
