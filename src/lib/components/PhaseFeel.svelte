<script lang="ts">
  import type { DrillPhaseFeel } from '../domain/feel'
  import { DRILLS } from '../domain/drills'

  let { rows }: { rows: DrillPhaseFeel[] } = $props()

  const NAMES = new Map(DRILLS.map((d) => [d.id, d.name]))

  /** Five pips, filled to the rounded mean. Decorative — the number sits beside it. */
  const PIPS = [1, 2, 3, 4, 5]
</script>

<ul class="drills">
  {#each rows as row (row.drillId)}
    <li class="drill">
      <h3><span class="num">{row.drillId}</span> {NAMES.get(row.drillId)}</h3>
      <ul class="phases">
        {#each row.phases as p (p.week)}
          <!-- Bound to a const so TypeScript narrows it. Narrowing on `p.mean` directly across
               an {#if} does not survive into the {:else} for a loop variable's property. -->
          {@const mean = p.mean}
          <li class="phase">
            <span class="label">{p.phase.title}</span>
            {#if mean === null}
              <span class="unlogged">Not logged yet</span>
            {:else}
              <span class="pips" aria-hidden="true">
                {#each PIPS as pip (pip)}
                  <span class="pip" class:on={pip <= Math.round(mean)}></span>
                {/each}
              </span>
              <span class="mean">{mean.toFixed(1)}</span>
              <span class="n">n={p.n}</span>
            {/if}
          </li>
        {/each}
      </ul>
    </li>
  {/each}
</ul>

<style>
  .drills{list-style:none;display:grid;grid-template-columns:repeat(auto-fill,minmax(258px,1fr));gap:16px}
  .drill{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px 18px}
  .drill h3{font-size:1.05rem;font-weight:700;margin-bottom:10px}
  .num{font-family:'Space Mono',monospace;font-size:.78rem;color:var(--ball)}

  .phases{list-style:none;display:grid;gap:8px}
  .phase{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .label{
    font-family:'Space Mono',monospace;font-size:.62rem;letter-spacing:.08em;
    text-transform:uppercase;color:var(--dim);flex:1;
  }
  .pips{display:flex;gap:3px}
  .pip{width:8px;height:8px;border-radius:100px;border:1px solid var(--line)}
  .pip.on{background:var(--ball);border-color:var(--ball)}
  .mean{font-family:'Space Mono',monospace;font-size:.8rem;color:var(--chalk)}
  .n{font-family:'Space Mono',monospace;font-size:.62rem;color:var(--dim)}
  /* Said in words, never as a 0 — zero is a real feel value and would read as "terrible". */
  .unlogged{font-family:'Space Mono',monospace;font-size:.62rem;letter-spacing:.06em;text-transform:uppercase;color:var(--dim)}
</style>
