# Design System

The visual language of the site, extracted from the original `index.html`. The look is
deliberate and worth protecting — this document exists so that new screens and components
inherit it rather than reinventing it.

**Character in one line:** a chalkboard in a dark clubhouse. Deep forest greens, off-white
"chalk" text, golf-ball yellow for anything that matters, flag red for anything that's wrong.
Data is always monospaced. Headings are tight and heavy.

---

## 1. Colour

### Tokens

Defined on `:root` and used throughout. These are the whole palette — eight values.

| Token | Value | Role |
|---|---|---|
| `--bg` | `#0E2117` | Page background. The darkest green. |
| `--panel` | `#143026` | Raised surfaces: KPI band, weekly blocks, training-aid rows. |
| `--card` | `#173A2A` | Cards that sit on the page: drills, arc phases. Lightest surface. |
| `--chalk` | `#F4F2E9` | Primary text. Warm off-white, never pure `#fff`. |
| `--dim` | `#A9BEB0` | Secondary text, labels, captions. Desaturated sage. |
| `--line` | `#294A3A` | All borders and dividers. Also the decorative phase numerals. |
| `--ball` | `#EFC64B` | **The accent.** Golf-ball yellow. Targets, goals, numbering, emphasis. |
| `--flag` | `#E0533B` | **The alarm.** Flag red. Current/bad state, warnings, the slice. |

### The yellow/red rule

This is the most important semantic in the design and must not be diluted:

- **`--ball` (yellow) = where you're going.** Goal path number, goal ball-flight trace,
  section indices, drill numbers, "feels like" emphasis, week labels.
- **`--flag` (red) = where you are, or what's going wrong.** Current path number, the slice
  trace, the watch-outs panel.

Never use yellow for a warning or red for a target. In the KPI band the two sit either side of
an arrow — `−6°/−10°` in red, `→`, `−2°/+2°` in yellow — and that single line teaches the
reader the colour code for the whole page.

### Surface elevation

Three greens, getting lighter as they come forward: `--bg` → `--panel` → `--card`. There is no
fourth level. If something needs to feel more prominent, use a border or the accent colour, not
a new shade.

### Supporting shades

Tokenised 2026-08-01, clearing the debt carried through the Phase 1 port. Each is a tint of a
core token used for exactly one job. **They are not a fourth surface level** — the
`--bg` → `--panel` → `--card` rule above still holds.

| Token | Value | Purpose |
|---|---|---|
| `--glow` | `#1a3d2c` | Body radial-gradient glow. |
| `--glow-fade` | `rgba(26,61,44,0)` | `--glow` at zero alpha, so the gradient ramps out through its own hue rather than through grey. |
| `--panel-2` | `#193a2b` | Gradient end for the KPI band and the Today panel. |
| `--line-hover` | `#3c6650` | Border on hover — drill cards, day buttons. |
| `--ball-dim` | `#5a4d1f` | Muted `--ball` for borders that shouldn't shout: `.tag.sim`, today's day button, the "all drills" underline. |
| `--home` | `#8fd0a6` | `.tag.home` text. The only green that carries meaning rather than depth. |
| `--home-dim` | `#2f5a3f` | `.tag.home` border. |
| `--flag-wash` | `rgba(224,83,59,.06)` | Watch-outs panel background. `--flag` at 6%. |

**The hero SVG carries no colour of its own.** It used to hardcode `#294A3A`, `#E0533B`,
`#EFC64B`, `#F4F2E9` and `#A9BEB0` as presentation attributes — literal copies of `--line`,
`--flag`, `--ball`, `--chalk` and `--dim` that would silently desync the moment a token moved.
Every shape now carries a class (`.target`, `.trace.slice`, `.trace.goal`, `.tee`, `.lbl.note`)
and takes its `fill`/`stroke` from the scoped stylesheet. Keep it that way: no colour attributes
in the markup.

---

## 2. Typography

Three families, each with one job. Do not add a fourth, and do not use a family outside its job.

| Family | Weights | Job |
|---|---|---|
| **Archivo** | 500, 700, 800 | Headings only (`h1`–`h3`), plus large decorative numerals. |
| **Inter** | 400, 500, 600 | Body copy, descriptions, list content. |
| **Space Mono** | 400, 700 | **Anything that is data or a label.** Numbers, eyebrows, tags, times, day codes, section indices, footer. |

The Space Mono rule is what makes the page feel like an instrument rather than a blog post.
Every measurement, count, rep range, angle and category label is monospaced. When in doubt: if
you'd read it aloud as a value, it's mono.

### Scale

| Element | Size | Notes |
|---|---|---|
| `h1` | `clamp(2.7rem, 7vw, 4.7rem)` / 800 | Fluid. One per page. |
| `h2` (section) | `clamp(1.5rem, 3.6vw, 2.15rem)` / 800 | |
| `h3` (card) | `1.05`–`1.24rem` / 700 | Varies slightly by component. |
| Lead paragraph | `1.08rem` | Hero only, `max-width: 46ch`. |
| "One idea" | `1.25rem` | `max-width: 60ch`. |
| Body | `1rem` | `line-height: 1.6`. |
| Card body | `.94rem` / `opacity: .9` | |
| Secondary / captions | `.88`–`.9rem`, `--dim` | |
| Eyebrow | `.72rem`, `.22em` tracking, uppercase | Mono, `--ball`. |
| Tag | `.62rem`, `.08em` tracking | Mono. Smallest text on the page. |

### Headline treatment

Headings use `line-height: 1.02` and `letter-spacing: -.02em` — very tight, which is what gives
them their poster-like density. Mono labels do the opposite: wide positive tracking
(`.08em`–`.22em`) and uppercase. That tension between tight headings and airy labels is a
signature of the design; preserve it.

Measure is constrained deliberately (`46ch`, `60ch`). Don't let body text run the full 900px.

---

## 3. Layout & spacing

- **Container:** `max-width: 900px`, centred, with `20px` body padding. Vertical padding
  `64px` top / `96px` bottom.
- **Section rhythm:** `margin-top: 72px` between sections. Section headers sit `26px` above
  their content.
- **Radii:** `16px` KPI band · `14px` cards, blocks, phases, warnings · `12px` aid rows ·
  `100px` tags (full pill).
- **Gaps:** `16px` in card grids, `24px` in the weekly split, `40px` in the hero.

### Grid patterns

| Region | Definition |
|---|---|
| Hero | `1.35fr .95fr` — text left, ball-flight SVG right |
| Drill grids | `repeat(auto-fill, minmax(258px, 1fr))` — self-wrapping, no media query needed |
| Your week | `1.3fr 1fr` — Monday detail left, daily menu right |
| 3-week arc | `repeat(3, 1fr)` |

The drill grid is the only auto-responsive one; the others collapse at the breakpoint.

### Breakpoint

**One breakpoint: `760px`.** Below it, hero / week / arc all collapse to single column and the
SVG is capped at `300px` and centred. Resist adding more breakpoints — a single container width
and one collapse point is a large part of why this stays maintainable.

---

## 4. Components

### Section header
`.sec-head` — a mono index (`01`, `02`…) in `--ball` sitting on the baseline beside the `h2`.
Every numbered section uses this. New sections continue the numbering.

### Group label
`.group-label` — mono, uppercase, `--dim`, followed by a rule that fills remaining width
(`::after { flex: 1; height: 1px }`). Used to sub-divide drills into categories.

### Drill card
`.drill` — the workhorse. Fixed internal order:
1. Mono number (`--ball`)
2. Tag row (`SIM` / `HOME`)
3. Title (`h3`)
4. Description
5. Footer above a hairline: **Reps** and **Feels like**

Hover lifts `3px` and brightens the border over `.18s`.

### Tag
`.tag` — mono pill. `.sim` renders yellow-on-dark, `.home` renders green. Tags are *categories*,
never actions.

### KPI band
`.kpi` — gradient panel, flex-wrap. Label, red current value, arrow, yellow goal value, then a
full-width explanatory note. The page's thesis statement.

### Emphasis quote
`.idea` — no box. A `3px` `--ball` left border with generous left padding. Used for the single
most important sentence in a section. Sparingly.

### Timeline / menu lists
`.tl` and `.menu` — two-column grids (`64px`/`52px` + content) with hairline separators between
rows and no border on the first. Left column is always mono in `--ball`.

### Phase card
`.phase` — carries a huge (`3.4rem`, weight 800) numeral in `--line`, which reads as a
watermark rather than content. Then a mono week label, heading, and description.

### Today panel
`.today` — the same gradient as the KPI band, but with a `3px` `--ball` left border marking it as
the actionable element. Holds an eyebrow (`Today · Friday`), the Sydney date in mono, a title,
a one-line brief, the day bar, and cloned drill cards.

**Placement is deliberately different per viewport.** On desktop it sits below the hero. On
mobile (`≤760px`) `.wrap` becomes a flex column and `.today` takes `order:-1`, floating it above
the hero — on a phone you're there to practise, not to read the poster. This is the only place
the design reorders content, and it's the reason `.wrap` is flex at all below the breakpoint.

### Day bar
`.daybar` — a row of mono pill `<button>`s, MON–SUN. Three visual states:
- default: `--dim` text, `--line` border
- today: `--ball` text, `--ball-dim` border (`.is-today`)
- selected: solid `--ball` fill with `--bg` text (`[aria-pressed="true"]`)

`44px` minimum height — this is used outdoors on a phone, possibly gloved. Selection state is
carried by `aria-pressed`, not by class alone.

### Warning panel
`.warn` — `--flag` border, 6%-opacity red wash, red eyebrow. Custom list markers drawn with
`clip-path` as small triangular flags. Reserved for genuine watch-outs.

---

## 5. Motion

Restrained and purposeful. Two entrance animations and one hover.

| Name | Effect | Timing |
|---|---|---|
| `rise` | `opacity 0→1`, `translateY(16px)→0` | `.7s ease forwards` |
| `draw` | SVG path draws itself via `stroke-dashoffset` | `1.6s ease .3s forwards` |
| hover | `translateY(-3px)` + border brighten | `.18s ease` |

The `draw` technique sets `--len` per path as an inline style, used as both `stroke-dasharray`
and initial `stroke-dashoffset`. Any new drawn path must set its own `--len` to roughly its own
length or the animation will look wrong.

### Reduced motion — non-negotiable

The entrance animations are global, so their override lives in `app.css`:

```css
@media (prefers-reduced-motion: reduce){
  .reveal,.trace{animation:none;opacity:1;transform:none;stroke-dashoffset:0}
}
```

**Hover motion is overridden inside the component that owns it**, not here — `DrillCard.svelte`
and `TodayPanel.svelte` each carry their own `prefers-reduced-motion` block. This is not a style
preference: Svelte compiles `.drill` to `.drill.svelte-xxx`, so a global override targeting
`.drill` loses the specificity contest and silently does nothing. A reduced-motion rule must sit
in the same layer as the rule it is cancelling.

Suppress the *movement*, not the *feedback*. Both overrides drop the `transform` and the
`transition` while leaving the border and colour change intact, so hover remains perceivable.

Every animation added from here must have a corresponding reduced-motion override, and the
override must leave content **fully visible** — never animate in something that stays hidden
when motion is disabled.

---

## 6. Accessibility

**Already good:**
- `lang="en-GB"` set.
- The hero SVG has `role="img"` and a descriptive `aria-label`.
- Reduced motion respected.
- Body text contrast is strong (`--chalk` and `--dim` on `--bg` both pass AA comfortably).

- A global focus ring is defined: `:focus-visible { outline: 2px solid var(--ball); outline-offset: 3px }`.
  `--ball` is high contrast against every surface and semantically means "this is what you're
  aiming at". Never suppress it on a new control.
- Day-bar controls are real `<button>`s with `aria-pressed`, at a `44px` minimum hit target.
- Small text controls reach `44px` **without changing the layout**, using a transparent
  pseudo-element rather than `min-height`:

  ```css
  .today-reset{position:relative}
  .today-reset::after{content:'';position:absolute;inset:0 0 -18px}
  ```

  Growing the box itself would push the drill grid down and break the "visually identical to the
  pre-Phase-1 page" contract. Check what sits next to the control before choosing the overhang:
  `.today .more` can expand symmetrically (`inset:-11px 0`) because margin and padding absorb it,
  but `.today-reset` expands **downward only** — the day bar sits directly above it with no gap,
  and a symmetric overhang would swallow taps meant for the bottom row of day buttons.

**Must be addressed as the app grows:**
- Interactive elements must be real `<button>` / `<input>` / `<a>`, not styled `<div>`s.
- Keep the `44px` minimum on every new control — this app is used one-handed on a phone,
  outdoors, possibly wearing a glove.
- Content injected by script (like the cloned drill cards) must remain reachable in DOM order;
  don't reorder with CSS in a way that separates visual and tab order beyond the one documented
  mobile `order:-1` case.
- Tag colours are decorative; category must never be conveyed by colour alone.
- `.phase .n` uses `--line` on `--card` — near-invisible by design. Keep it decorative and
  ensure the week is also stated in text (it currently is, via `.wk`).

---

## 7. Rules for new UI

1. Use the tokens. If you need a new colour, add a token and justify it here.
2. Respect the yellow/red semantic. Yellow is the goal, red is the problem.
3. Data and labels are monospaced. Prose is Inter. Headings are Archivo.
4. Three surface levels only.
5. One breakpoint. Prefer intrinsic layouts (`auto-fill`, `minmax`, `clamp`) over media queries.
6. Every animation gets a reduced-motion override that leaves content visible.
7. Every interactive element gets a visible focus state.
8. Borders are `1px solid var(--line)`. Shadows are not part of this design — depth comes from
   surface colour and hairlines.
