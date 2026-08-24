<script lang="ts">
  import {
    ACCESS_OPTIONS,
    FEE_BANDS,
    MARK_FILTERS,
    STATES_PRESENT,
    activeCount,
    emptyFilter,
    toggle,
    type CourseFilter,
    type FilterCounts,
  } from '../domain/courseFilter'

  let {
    filter = $bindable(),
    counts,
    shown,
    total,
  }: { filter: CourseFilter; counts: FilterCounts; shown: number; total: number } = $props()

  /**
   * Every option's wording and every count comes in from `courseFilter.ts`. This file renders and
   * does not calculate — it does not know what a fee band is, and it never counts a course.
   *
   * `toggle` returns a **new** filter rather than mutating the `Set` in place. Svelte 5 tracks the
   * assignment, not the Set's internals, so a mutating `add()` would filter correctly and never
   * re-render — the worst of both.
   */
  const active = $derived(activeCount(filter))

  /**
   * Open state for the phone disclosure only. On desktop the groups are always rendered and this
   * is ignored: `.groups` is only ever hidden inside the 760px media query, so a stale `false`
   * here can never hide the controls on a wide screen.
   */
  let open = $state(false)
</script>

<section class="filters" aria-labelledby="filters-title">
  <div class="bar">
    <h3 id="filters-title" class="title">Filter</h3>

    <!-- Phone only. `aria-expanded` and `aria-controls` are the whole contract; the button is
         display:none above 760px, where the groups are always shown. -->
    <button
      type="button"
      class="disclosure"
      aria-expanded={open}
      aria-controls="filter-groups"
      onclick={() => (open = !open)}
    >
      {open ? 'Hide filters' : 'Filters'}{active > 0 ? ` (${active})` : ''}
    </button>

    <!-- `aria-live` so a screen reader hears the result change as options are pressed; `polite`
         because a filter is not an interruption. -->
    <p class="result" aria-live="polite">
      <span class="count">{shown}</span> of {total}
    </p>

    <!-- Rendered only when there is something to clear. A permanently disabled control is a
         permanently wrong affordance. -->
    {#if active > 0}
      <button type="button" class="clear" onclick={() => (filter = emptyFilter())}>
        Clear all
      </button>
    {/if}
  </div>

  <div id="filter-groups" class="groups" class:closed={!open}>
    <fieldset class="group">
      <legend>State</legend>
      <div class="opts" role="group" aria-label="Filter by state">
        {#each STATES_PRESENT as state (state)}
          <!-- `data-state` carries the hue exactly as it does on a list row, so these buttons
               are also the legend for the spines below. No colour is named in markup. -->
          <button
            type="button"
            class="opt st"
            data-state={state}
            aria-pressed={filter.states.has(state)}
            aria-label="{state}, {counts.states[state]} courses"
            onclick={() => (filter = toggle(filter, 'states', state))}
          >
            <span class="label">{state}</span>
            <span class="n" aria-hidden="true">{counts.states[state]}</span>
          </button>
        {/each}
      </div>
    </fieldset>

    <fieldset class="group">
      <legend>Access</legend>
      <div class="opts" role="group" aria-label="Filter by visitor access">
        <!-- All four, `unknown` included. Omitting it would make those eight courses unreachable
             — the interface equivalent of rounding them up to members-only. -->
        {#each ACCESS_OPTIONS as option (option.value)}
          <button
            type="button"
            class="opt"
            data-access={option.value}
            aria-pressed={filter.access.has(option.value)}
            aria-label="{option.label}, {counts.access[option.value]} courses"
            onclick={() => (filter = toggle(filter, 'access', option.value))}
          >
            <span class="label">{option.label}</span>
            <span class="n" aria-hidden="true">{counts.access[option.value]}</span>
          </button>
        {/each}
      </div>
    </fieldset>

    <fieldset class="group">
      <legend>Green fee</legend>
      <div class="opts" role="group" aria-label="Filter by green fee">
        <!-- "No fee published" is a band like any other. Forty of the hundred are in it, and a
             price control that silently dropped them is what `feeLabel`'s dash rule prevents. -->
        {#each FEE_BANDS as band (band.value)}
          <button
            type="button"
            class="opt"
            class:unpriced={band.value === 'none'}
            aria-pressed={filter.bands.has(band.value)}
            aria-label="{band.label}, {counts.bands[band.value]} courses"
            onclick={() => (filter = toggle(filter, 'bands', band.value))}
          >
            <span class="label">{band.label}</span>
            <span class="n" aria-hidden="true">{counts.bands[band.value]}</span>
          </button>
        {/each}
      </div>
    </fieldset>

    <fieldset class="group">
      <legend>Your mark</legend>
      <div class="opts" role="group" aria-label="Filter by your mark">
        {#each MARK_FILTERS as mark (mark.value)}
          <button
            type="button"
            class="opt"
            data-mark={mark.value}
            aria-pressed={filter.marks.has(mark.value)}
            aria-label="{mark.label}, {counts.marks[mark.value]} courses"
            onclick={() => (filter = toggle(filter, 'marks', mark.value))}
          >
            <span class="label">{mark.label}</span>
            <span class="n" aria-hidden="true">{counts.marks[mark.value]}</span>
          </button>
        {/each}
      </div>
    </fieldset>
  </div>
</section>

<style>
  .filters{
    background:var(--panel);border:1px solid var(--line);border-radius:14px;
    padding:14px 16px;margin-bottom:18px;
  }

  .bar{display:flex;align-items:center;flex-wrap:wrap;gap:10px 14px}
  .title{
    font-family:'Space Mono',monospace;font-size:.66rem;letter-spacing:.16em;
    text-transform:uppercase;color:var(--dim);font-weight:400;
  }
  /* The result pushes right and the clear button follows it. */
  .result{
    margin-left:auto;font-family:'Space Mono',monospace;font-size:.72rem;color:var(--dim);
  }
  .count{color:var(--chalk)}

  .clear{
    font-family:'Space Mono',monospace;font-size:.6rem;letter-spacing:.14em;
    text-transform:uppercase;cursor:pointer;
    min-height:44px;padding:0 14px;border-radius:100px;
    background:transparent;color:var(--dim);border:1px solid var(--line);
    transition:color .18s ease,border-color .18s ease;
  }
  .clear:hover{color:var(--chalk);border-color:var(--line-hover)}

  /* Phone only — see the media query. */
  .disclosure{display:none}

  .groups{display:grid;gap:14px;margin-top:14px}
  .group{border:0;display:grid;gap:8px}
  legend{
    font-family:'Space Mono',monospace;font-size:.58rem;letter-spacing:.16em;
    text-transform:uppercase;color:var(--dim);padding:0;
  }

  .opts{display:flex;flex-wrap:wrap;gap:8px}
  /* `.opt` rather than `.chip`: a map marker is already called a chip, and two unrelated things
     under one name is a trap for whoever greps next. Mirrors `.mark-btn` on the course page —
     same pill, same Space Mono, same 44px. This gets used outdoors, one-handed — design.md §6. */
  .opt{
    font-family:'Space Mono',monospace;font-size:.62rem;letter-spacing:.1em;
    text-transform:uppercase;cursor:pointer;
    display:inline-flex;align-items:center;gap:8px;
    min-height:44px;padding:0 14px;border-radius:100px;
    background:transparent;color:var(--dim);border:1px solid var(--line);
    transition:color .18s ease,border-color .18s ease,background-color .18s ease;
  }
  .opt:hover{color:var(--chalk);border-color:var(--line-hover)}

  /* The count, dimmer than the label it qualifies. `aria-hidden`, because the button's own
     `aria-label` already says "8 courses" in words rather than as a bare number. */
  .n{font-size:.58rem;color:var(--dim);opacity:.75}

  /* Pressed is a **fill**, not a tint. Colour is never the only signal and `aria-pressed` carries
     it for anyone not seeing either — the same construction as the marks on a course page. */
  .opt[aria-pressed='true']{
    background:var(--ball-dim);border-color:var(--ball);color:var(--chalk);
  }
  .opt[aria-pressed='true'] .n{color:var(--ball);opacity:1}

  /* A state chip carries its own hue when pressed, so the chips double as the legend for the
     spines on the rows below. Tokens from app.css, never a literal — design.md §1. */
  .st[data-state='NSW']{--st:var(--st-nsw)}
  .st[data-state='VIC']{--st:var(--st-vic)}
  .st[data-state='QLD']{--st:var(--st-qld)}
  .st[data-state='SA']{--st:var(--st-sa)}
  .st[data-state='WA']{--st:var(--st-wa)}
  .st[data-state='TAS']{--st:var(--st-tas)}
  .st[data-state='ACT']{--st:var(--st-act)}
  /* Unpressed, the hue is a 3px stub on the left — enough to key the chip to the spine without
     turning the control into a colour chart. */
  .st .label{position:relative;padding-left:12px}
  .st .label::before{
    content:'';position:absolute;left:0;top:50%;translate:0 -50%;
    width:3px;height:11px;border-radius:2px;background:var(--st,var(--line));
  }
  .st[aria-pressed='true']{border-color:var(--st,var(--ball));background:transparent;color:var(--chalk)}
  .st[aria-pressed='true'] .n{color:var(--st,var(--ball))}

  /* Dashed, like the `unknown` access pill — "not established", not a fourth grade on the ramp. */
  .opt[data-access='unknown']{border-style:dashed}
  /* Same reasoning for the absent fee: an absence should not read with the weight of a price. */
  .opt.unpriced{border-style:dashed}

  /* `--ball` for want and `--home` for played, matching the tag in the list and the buttons on a
     course. **Never `--flag`** — nothing in a wishlist is a fault. */
  .opt[data-mark='want'][aria-pressed='true']{background:var(--ball);border-color:var(--ball);color:var(--bg)}
  .opt[data-mark='want'][aria-pressed='true'] .n{color:var(--bg)}
  .opt[data-mark='played'][aria-pressed='true']{background:var(--home);border-color:var(--home);color:var(--bg)}
  .opt[data-mark='played'][aria-pressed='true'] .n{color:var(--bg)}

  @media (max-width:760px){
    /* The four groups are a lot of vertical space above a list that is the point of the page, so
       on a phone they collapse. The count on the button is what makes a collapsed filter honest:
       a narrowed list with its controls hidden and nothing saying so is the failure mode. */
    .disclosure{
      display:inline-flex;align-items:center;
      font-family:'Space Mono',monospace;font-size:.6rem;letter-spacing:.14em;
      text-transform:uppercase;cursor:pointer;
      min-height:44px;padding:0 14px;border-radius:100px;
      background:transparent;color:var(--dim);border:1px solid var(--line);
    }
    .disclosure[aria-expanded='true']{color:var(--chalk);border-color:var(--line-hover)}
    .groups.closed{display:none}
  }

  @media (prefers-reduced-motion:reduce){
    .opt,.clear{transition:none}
  }
</style>
