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

`storage/`, `stores/` and `routes/` are built (Phase 2, issue #3). `ingest/` arrives with
Phase 5.

The site has two views behind a History-API router: `/` (the plan page) and `/log`. Deep links
depend on `dist/404.html`, generated from the built `index.html` by the `pages-spa-fallback`
plugin in `vite.config.ts` and asserted by the deploy workflow alongside `CNAME`.

Practice data lives in one `localStorage` key, `golf:store`, holding one versioned JSON
document. **Reach it only through `lib/stores/sessions.svelte.ts`** — that file constructs the
only `Repository` in the app.

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
- Club path is **signed**; negative is out-to-in. Never store an absolute value.
- The target is a **band** (`−2°` to `+2°`), not a maximum. Overshooting is a fault. Progress
  visuals need fault regions on both sides — never a "higher is better" bar.
- Plan and drill content lives in `lib/domain/` as data, not in markup.
- Bump `schemaVersion` and write a migration for any stored-shape change.

### Deployment
- **`CNAME` must end up in `dist/`** (it lives in `public/`). Losing it drops the custom domain.
  The deploy workflow asserts `dist/CNAME` exists and has the right contents — don't remove that
  guard. `public/favicon.ico` matters for the same reason: browsers request it from the root.
- Anything in `dist/` is publicly readable. **No secrets in the client bundle** — credentials
  belong in GitHub Actions secrets only.
- Every phase must leave `golf.whitfield.life` working.

## Things to be careful about

- **This is a live site on a real domain.** Verify a deploy before considering work done.
- **`localStorage` is the only copy of the user's practice data.** Clearing site data destroys
  it. JSON export/import is a requirement, not a nicety. Never write code that can wipe the store
  without an explicit user action.
- **Trackman integration is resolved but undocumented** (OQ-1, closed 2026-07-31). A GraphQL API at
  `api.trackmangolf.com/graphql` works with the player's own token — see `docs/architecture.md` §4.
  It is unofficial and **must be assumed to break without notice**: never let it block app load, and
  keep manual entry working as the baseline.
- **Club path is meaningless without a club.** Store it per club and never chart a blended average —
  a mixed-club mean tracks club selection, not swing change (OQ-7 / issue #14).
- **Don't redesign.** The user explicitly likes the current look. Extend the system; don't
  replace it.
- **The store refuses to write when it cannot read.** Unreadable JSON is copied to
  `golf:store.unreadable` and every write throws until it is dealt with. That is deliberate —
  the alternative is overwriting data that might still be recoverable. Don't "fix" it by
  falling back to an empty document.
- **The app must render even when `localStorage` is unavailable.** Reading the global throws
  outright in private browsing and under "block all cookies", and the store is constructed at
  module scope — so an eager read blanks the whole site, plan page included. `LocalStorageRepo`
  resolves storage lazily and treats it as absent rather than fatal. Don't reintroduce a
  top-level `localStorage` reference.

## Commands

```
npm install       # once
npm run dev       # dev server with HMR
npm run build     # production build into dist/
npm run preview   # serve the built dist/ locally
npm run check     # svelte-check (TypeScript + template type errors)
npm test          # Vitest, domain logic only
```

`npm run check` and `npm test` both run in CI before a deploy — a failure there blocks
publication.

Opening `index.html` directly no longer works: it is a Vite entry point containing only a mount
node. Use `npm run dev`.

**TypeScript is pinned to v6** — `svelte-check` does not yet accept v7.
