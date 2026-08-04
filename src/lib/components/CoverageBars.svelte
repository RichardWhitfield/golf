<script lang="ts">
  import type { ISODate } from '../domain/types'
  import type { DrillCoverage } from '../domain/coverage'
  import { DRILLS } from '../domain/drills'

  let { rows, from, to }: { rows: DrillCoverage[]; from: ISODate; to: ISODate } = $props()

  // Names come from drills.ts, never restated here — CLAUDE.md.
  const NAMES = new Map(DRILLS.map((d) => [d.id, d.name]))

  /**
   * Fill is capped at 100% so an over-done drill doesn't overflow the track. The counts beside
   * it stay uncapped, so diligence is still reported truthfully.
   *
   * An avoided drill fills the whole track in `--flag` rather than drawing nothing. Zero
   * progress rendered as zero width is invisible — the row that matters most would be the one
   * you cannot see. It is a fault region, the same idea as the fault bands on the club-path
   * chart, and the red `0 of 28` beside it is what stops a full bar reading as "done".
   */
  function fill(row: DrillCoverage): number {
    if (row.scheduled === 0) return 0
    if (row.status === 'avoided') return 100
    return Math.min(100, (row.done / row.scheduled) * 100)
  }
</script>

<p class="window">
  <span class="mono">{from}</span> to <span class="mono">{to}</span>
</p>

<ul class="rows">
  {#each rows as row (row.drillId)}
    <li class="row" class:unscheduled={row.status === 'unscheduled'}>
      <span class="num">{row.drillId}</span>
      <span class="name">{NAMES.get(row.drillId)}</span>

      {#if row.status === 'unscheduled'}
        <!-- Never an empty bar. 0 of 0 looks exactly like "asked six times and
             skipped", which would name this the most avoided drill in the plan. -->
        <span class="track"><span class="none">Not in the current schedule</span></span>
        <span class="count">{row.done > 0 ? `${row.done} done off-plan` : '—'}</span>
      {:else}
        <span class="track" aria-hidden="true">
          <span class="fill" class:avoided={row.status === 'avoided'} style="width:{fill(row)}%"
          ></span>
        </span>
        <span class="count" class:avoided={row.status === 'avoided'}>
          {row.done} of {row.scheduled}
        </span>
      {/if}
    </li>
  {/each}
</ul>

<style>
  .window{font-size:.8rem;color:var(--dim);margin-bottom:14px}
  .window .mono{font-family:'Space Mono',monospace;color:var(--chalk)}

  .rows{list-style:none;display:grid;gap:8px}
  .row{
    display:grid;grid-template-columns:34px 1fr 120px 84px;align-items:center;gap:12px;
    background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;
  }
  .row.unscheduled{opacity:.72}

  .num{font-family:'Space Mono',monospace;font-size:.8rem;color:var(--ball)}
  .name{font-size:.94rem}

  .track{display:block;height:8px;background:var(--line);border-radius:100px;overflow:hidden}
  .fill{display:block;height:100%;background:var(--ball);border-radius:100px}
  /* Nothing done against a real schedule is the finding, so it reads as a fault. */
  .fill.avoided{background:var(--flag)}
  .none{
    font-family:'Space Mono',monospace;font-size:.58rem;letter-spacing:.06em;
    text-transform:uppercase;color:var(--dim);line-height:1.35;
  }
  /* The base .track clips with overflow:hidden so a bar fill cannot escape its rounded ends.
     This row reuses that element for a text label instead, and the label is wider than the
     column — left to clip it read "NOT IN THE CURRENT", which is the false finding this row
     exists to prevent. It wraps rather than truncates. */
  .row.unscheduled .track{background:none;height:auto;overflow:visible}

  .count{font-family:'Space Mono',monospace;font-size:.76rem;color:var(--dim);text-align:right}
  .count.avoided{color:var(--flag)}

  @media (max-width:760px){
    .row{grid-template-columns:34px 1fr;grid-template-areas:'num name' 'track count'}
    .num{grid-area:num}
    .name{grid-area:name}
    .track{grid-area:track}
    .count{grid-area:count}
  }
</style>
