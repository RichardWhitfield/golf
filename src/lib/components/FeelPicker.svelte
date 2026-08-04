<script lang="ts">
  import type { Feel } from '../domain/types'

  let {
    value = $bindable(),
    touched = $bindable(),
    name,
    cue,
  }: { value: Feel; touched: boolean; name: string; cue: string } = $props()

  const LEVELS: Feel[] = [1, 2, 3, 4, 5]

  function choose(level: Feel) {
    value = level
    touched = true
  }
</script>

<fieldset class="feel" class:untouched={!touched}>
  <legend>Feel · <span class="cue">{cue}</span></legend>
  <div class="levels">
    {#each LEVELS as level (level)}
      <input
        type="radio"
        id="{name}-feel-{level}"
        {name}
        checked={value === level}
        onchange={() => choose(level)}
      />
      <label for="{name}-feel-{level}">{level}</label>
    {/each}
  </div>
</fieldset>

<style>
  .feel{border:none;margin-top:14px}
  .feel legend{
    font-family:'Space Mono',monospace;font-size:.68rem;letter-spacing:.14em;
    text-transform:uppercase;color:var(--dim);padding:0;margin-bottom:8px;
  }
  .feel .cue{text-transform:none;letter-spacing:.02em;font-style:italic}
  .levels{display:flex;gap:6px;flex-wrap:wrap}
  .levels input{position:absolute;opacity:0;width:0;height:0}
  .levels label{
    font-family:'Space Mono',monospace;font-size:.8rem;
    display:flex;align-items:center;justify-content:center;
    width:44px;height:44px;border-radius:100px;
    border:1px solid var(--line);color:var(--dim);
    cursor:pointer;transition:color .18s ease,border-color .18s ease;
  }
  .levels label:hover{color:var(--chalk);border-color:var(--line-hover)}
  .levels input:checked + label{
    background:var(--ball);border-color:var(--ball);color:var(--bg);font-weight:700;
  }
  /* The radio is visually hidden, so the focus ring has to be forwarded to its label —
     otherwise keyboard users get no focus state at all. */
  .levels input:focus-visible + label{outline:2px solid var(--ball);outline-offset:3px}

  /* Feel defaults to a neutral 3. Until it is actually tapped the whole group renders muted,
     so at a glance you can see which drills you judged and which just took the default.
     Nothing about the stored value changes. */
  .feel.untouched .levels input:checked + label{
    background:transparent;color:var(--dim);border-color:var(--line);font-weight:400;
  }

  @media (prefers-reduced-motion:reduce){
    .levels label{transition:none}
  }
</style>
