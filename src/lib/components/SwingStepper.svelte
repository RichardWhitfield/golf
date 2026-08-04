<script lang="ts">
  import type { DrillId } from '../domain/types'

  // `drillId` keys the element id; `label` only ever goes into human-readable aria-label text.
  // Never build an id from `label` — drill names contain spaces and an ampersand, and
  // `aria-labelledby` parses its value as a *space-separated list of ids*, so an id with a
  // space in it silently resolves to nothing and the input announces as unlabelled.
  let {
    value = $bindable(),
    drillId,
    label,
  }: { value: number; drillId: DrillId; label: string } = $props()

  const MIN = 1
  const MAX = 999

  function step(by: number) {
    value = Math.min(MAX, Math.max(MIN, value + by))
  }

  function onInput(event: Event) {
    const next = Number((event.currentTarget as HTMLInputElement).value)
    value = Number.isFinite(next) ? Math.min(MAX, Math.max(MIN, Math.round(next))) : MIN
  }
</script>

<div class="stepper">
  <span class="lab" id="swings-{drillId}">Swings</span>
  <button type="button" onclick={() => step(-1)} aria-label="One fewer swing for {label}">−</button>
  <input
    type="number"
    inputmode="numeric"
    min={MIN}
    max={MAX}
    {value}
    oninput={onInput}
    aria-labelledby="swings-{drillId}"
  />
  <button type="button" onclick={() => step(1)} aria-label="One more swing for {label}">+</button>
</div>

<style>
  .stepper{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .lab{
    font-family:'Space Mono',monospace;font-size:.68rem;letter-spacing:.14em;
    text-transform:uppercase;color:var(--dim);flex-basis:100%;
  }
  .stepper button{
    font-family:'Space Mono',monospace;font-size:1.1rem;line-height:1;
    width:44px;height:44px;flex:0 0 44px;
    background:var(--card);color:var(--chalk);
    border:1px solid var(--line);border-radius:100px;cursor:pointer;
    transition:border-color .18s ease,color .18s ease;
  }
  .stepper button:hover{border-color:var(--line-hover);color:var(--ball)}
  .stepper input{
    font-family:'Space Mono',monospace;font-size:1rem;text-align:center;
    width:72px;height:44px;
    background:var(--card);color:var(--chalk);
    border:1px solid var(--line);border-radius:10px;
  }
  /* The spinners are a 20px-wide tap target next to a 44px one. Ours replace them. */
  .stepper input::-webkit-outer-spin-button,
  .stepper input::-webkit-inner-spin-button{appearance:none;margin:0}
  .stepper input{appearance:textfield;-moz-appearance:textfield}

  @media (prefers-reduced-motion:reduce){
    .stepper button{transition:none}
  }
</style>
