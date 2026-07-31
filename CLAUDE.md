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

Single self-contained `index.html`, no build step, no dependencies. GitHub Pages serves the repo
root; `CNAME` sets the custom domain.

It now contains a small amount of vanilla JavaScript powering the **Today panel** — it resolves
the current day in `Australia/Sydney` and shows that day's drills. This is deliberate interim
code, not a departure from the Svelte plan: it delivers the feature today without blocking on a
scaffold. Phase 1 should absorb it rather than work around it.

**Key constraint on that script:** the drill cards in the "Core drills" section are the single
source of truth for drill content. The Today panel *clones* them via `data-drill` attributes.
Never duplicate drill copy into JavaScript — if a drill's text changes, it must change in exactly
one place.

**The stack described in `docs/architecture.md` (Svelte 5 + Vite + TypeScript) is the agreed
target, not the current state.** Nothing has been scaffolded yet.

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
- **`CNAME` must end up in `dist/`** (put it in `public/`). Losing it drops the custom domain.
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

## Commands

No build tooling yet. Once Phase 1 lands, expect `npm run dev`, `npm run build`,
`npm run check`, `npm test` — update this section when it's true.

To preview the current site: open `index.html` in a browser, or `python3 -m http.server` from the
repo root.
