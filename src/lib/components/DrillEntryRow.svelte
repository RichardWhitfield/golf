<script lang="ts">
  import type { DraftEntry } from '../domain/session'
  import { drill } from '../domain/drills'
  import FeelPicker from './FeelPicker.svelte'
  import SwingStepper from './SwingStepper.svelte'

  // `onchange` tells the form its drill selection has been touched by hand, so a later date
  // change stops re-seeding over the top of it.
  let { entry = $bindable(), onchange }: { entry: DraftEntry; onchange?: () => void } = $props()

  const info = $derived(drill(entry.drillId))
</script>

<div class="row" class:on={entry.selected}>
  <input
    type="checkbox"
    id="pick-{entry.drillId}"
    bind:checked={entry.selected}
    onchange={() => onchange?.()}
  />
  <label for="pick-{entry.drillId}">
    <span class="no">{entry.drillId}</span>
    <span class="name">{info.name}</span>
    <span class="reps">{info.reps}</span>
  </label>

  {#if entry.selected}
    <div class="detail">
      <SwingStepper bind:value={entry.swings} drillId={entry.drillId} label={info.name} />
      <FeelPicker
        bind:value={entry.feel}
        bind:touched={entry.feelTouched}
        name="feel-{entry.drillId}"
        cue={info.feelsLike}
      />
    </div>
  {/if}
</div>

<style>
  .row{
    background:var(--card);border:1px solid var(--line);border-radius:14px;
    padding:0 16px;transition:border-color .18s ease;
  }
  .row.on{border-color:var(--ball-dim)}
  .row input[type="checkbox"]{position:absolute;opacity:0;width:0;height:0}
  .row label{
    display:flex;align-items:center;gap:12px;flex-wrap:wrap;
    min-height:44px;padding:12px 0;cursor:pointer;
  }
  /* Drawn rather than native so it can carry the design's colours and reach 44px. The real
     checkbox above still owns the state, the keyboard and the announcement. */
  .row label::before{
    content:'';flex:0 0 24px;width:24px;height:24px;border-radius:7px;
    border:1px solid var(--line);
  }
  .row.on label::before{
    background:var(--ball);border-color:var(--ball);
    /* The tick, drawn as a clipped block — no icon font, no SVG asset. */
    clip-path:polygon(14% 46%,0 60%,38% 100%,100% 22%,86% 8%,38% 70%);
  }
  .row input:focus-visible + label::before{outline:2px solid var(--ball);outline-offset:3px}
  .row .no{font-family:'Space Mono',monospace;color:var(--ball);font-size:.82rem}
  .row .name{font-weight:600}
  .row .reps{
    font-family:'Space Mono',monospace;font-size:.72rem;color:var(--dim);
    margin-left:auto;letter-spacing:.06em;
  }
  .detail{padding:4px 0 18px;border-top:1px solid var(--line)}
  .detail :global(.stepper){margin-top:14px}

  @media (prefers-reduced-motion:reduce){
    .row{transition:none}
  }
</style>
