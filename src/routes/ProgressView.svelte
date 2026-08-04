<script lang="ts">
  import { sessions } from '../lib/stores/sessions.svelte'
  import { router } from '../lib/stores/router.svelte'
  import SectionHead from '../lib/components/SectionHead.svelte'
  import SiteFooter from '../lib/components/SiteFooter.svelte'
  import { clubSeries, dateBounds } from '../lib/domain/series'
  import { KPI_CLUB } from '../lib/domain/clubs'
  import ClubPathChart from '../lib/components/ClubPathChart.svelte'

  const hasTrackman = $derived(sessions.trackman.length > 0)
  const blockStart = $derived(sessions.settings.blockStart)

  const series = $derived(clubSeries(sessions.list))
  const bounds = $derived(dateBounds(series))
  const kpi = $derived(series.find((s) => s.club === KPI_CLUB))
  const rest = $derived(series.filter((s) => s.club !== KPI_CLUB))
</script>

<section class="progress reveal" aria-labelledby="progress-title">
  <span class="eyebrow">Progress</span>
  <h1 id="progress-title">What the numbers say</h1>
  <p class="sub">
    Club path per club against the target band, which drills are actually getting done, and
    where you are in the three weeks.
  </p>
</section>

<section id="path">
  <SectionHead idx="01" title="Club path" />
  {#if !sessions.ready}
    <p class="empty">Loading your sessions…</p>
  {:else if !hasTrackman}
    <p class="empty">
      No Trackman readings yet. Log a bay session on the
      <a href={router.href('log')} onclick={(e) => router.onNavClick(e, 'log')}>Log</a> page and
      the charts appear here.
    </p>
  {:else if bounds}
    {#if kpi}
      <ClubPathChart series={kpi} first={bounds.first} last={bounds.last} {blockStart} headline />
    {/if}
    <p class="note">
      The band is <span class="mono">−2°</span> to <span class="mono">+2°</span>. Red on
      <em>both</em> sides — too far in-to-out is a fault too. Dot size is the shot count, so a
      three-shot reading does not shout as loudly as a seventy-shot one. A hollow dot was typed
      by hand and has no count.
    </p>
    <div class="grid">
      {#each rest as s (s.club)}
        <ClubPathChart series={s} first={bounds.first} last={bounds.last} {blockStart} />
      {/each}
    </div>
  {/if}
</section>

<section id="coverage">
  <SectionHead idx="02" title="Drill coverage" />
  <p class="empty">Coverage arrives in the next step.</p>
</section>

<section id="feel">
  <SectionHead idx="03" title="Feel by phase" />
  {#if sessions.ready && !blockStart}
    <p class="empty">
      No block start date is set, so there are no phases yet. Set one on the
      <a href={router.href('plan')} onclick={(e) => router.onNavClick(e, 'plan')}>Plan</a> page.
    </p>
  {:else}
    <p class="empty">Feel arrives in the next step.</p>
  {/if}
</section>

<section id="where">
  <SectionHead idx="04" title="Where you are" />
  <p class="empty">The arc position arrives in the next step.</p>
</section>
<SiteFooter />

<style>
  .progress{margin-top:40px}
  /* The hero h1 belongs to the plan page. This takes the section h2 scale —
     see docs/design.md section 2. */
  .progress h1{font-size:clamp(1.5rem,3.6vw,2.15rem);font-weight:800;margin:10px 0 6px}
  .progress .sub{color:var(--dim);font-size:.95rem;max-width:60ch}
  .empty{color:var(--dim);font-size:.94rem;max-width:60ch}
  .empty a{color:var(--ball)}
  .note{color:var(--dim);font-size:.88rem;max-width:70ch;margin:14px 0 18px}
  .note .mono{font-family:'Space Mono',monospace;color:var(--chalk)}
</style>
