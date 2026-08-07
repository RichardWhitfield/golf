<script lang="ts">
  import { sessions } from '../lib/stores/sessions.svelte'
  import { router } from '../lib/stores/router.svelte'
  import SectionHead from '../lib/components/SectionHead.svelte'
  import SiteFooter from '../lib/components/SiteFooter.svelte'
  import { clubSeries, dateBounds } from '../lib/domain/series'
  import { KPI_CLUB } from '../lib/domain/clubs'
  import ClubPathChart from '../lib/components/ClubPathChart.svelte'
  import { drillCoverage } from '../lib/domain/coverage'
  import { resolveISODate } from '../lib/domain/today'
  import { blockPosition, parseISODate } from '../lib/domain/block'
  import CoverageBars from '../lib/components/CoverageBars.svelte'
  import { feelByPhase } from '../lib/domain/feel'
  import PhaseFeelPanel from '../lib/components/PhaseFeel.svelte'
  import ArcPosition from '../lib/components/ArcPosition.svelte'
  import { relate } from '../lib/domain/relate'
  import SlicePanel from '../lib/components/SlicePanel.svelte'
  import RelationPanel from '../lib/components/RelationPanel.svelte'

  const hasTrackman = $derived(sessions.trackman.length > 0)
  const blockStart = $derived(sessions.settings.blockStart)

  const today = resolveISODate()
  const BLOCK_DAYS = 21

  /** The current block when one is set, otherwise the last 21 days — the same length, so the
   *  counts mean the same thing either way. */
  const coverageWindow = $derived.by(() => {
    if (blockStart) return { from: blockStart, to: today }
    const end = parseISODate(today)
    if (end === null) return { from: today, to: today }
    const from = new Date(end - (BLOCK_DAYS - 1) * 86_400_000).toISOString().slice(0, 10)
    return { from, to: today }
  })

  const coverage = $derived(drillCoverage(sessions.list, coverageWindow.from, coverageWindow.to))

  const feel = $derived(blockStart ? feelByPhase(sessions.list, blockStart) : [])

  const position = $derived(blockStart ? blockPosition(blockStart, today) : null)

  const series = $derived(clubSeries(sessions.list))
  const bounds = $derived(dateBounds(series))
  const kpi = $derived(series.find((s) => s.club === KPI_CLUB))
  const rest = $derived(series.filter((s) => s.club !== KPI_CLUB))

  /** Both relations are driver-only. `relate` takes one club and never looks at another, so
   *  there is no blended figure to compute here — see OQ-7. */
  const planeVsPath = $derived(relate(sessions.list, KPI_CLUB, 'swingPlane', 'clubPath'))
  const faceVsPath = $derived(relate(sessions.list, KPI_CLUB, 'faceToPath', 'clubPath'))
  const hasMetrics = $derived(planeVsPath.points.length > 0 || faceVsPath.points.length > 0)

  const showWhy = $derived(sessions.ready && hasMetrics)

  /** Section numbers are visible on the page, so they must not gap when `#why` is hidden.
   *  Derived rather than hardcoded: `#why` only appears once a session carries the wider
   *  metric set, and a missing `02` reads as a broken page rather than an absent section. */
  const idx = $derived(
    showWhy
      ? { why: '02', coverage: '03', feel: '04', where: '05' }
      : { why: '02', coverage: '02', feel: '03', where: '04' },
  )
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

{#if showWhy}
  <section id="why">
    <SectionHead idx={idx.why} title="Why the ball curves" />
    <p class="note">
      Club path is the KPI, but it is only half of what bends the ball. The other half is where
      the face points <em>relative to that path</em> — and a square face is still open when the
      path is far enough left.
    </p>
    <SlicePanel sessions={sessions.list} />
    <div class="pair-grid">
      <RelationPanel relation={faceVsPath} />
      <RelationPanel relation={planeVsPath} />
    </div>
    <p class="note">
      Both panels read one session as one dot, never one shot. Swing plane is here because it was
      the obvious suspect for the out-to-in path — read what the panel actually says rather than
      what it was expected to say.
    </p>
  </section>
{/if}

<section id="coverage">
  <SectionHead idx={idx.coverage} title="Drill coverage" />
  <p class="note">
    What the plan asked for against what you logged. A drill sitting at zero against a real
    schedule is the finding.
  </p>
  <CoverageBars rows={coverage} from={coverageWindow.from} to={coverageWindow.to} />
</section>

<section id="feel">
  <SectionHead idx={idx.feel} title="Feel by phase" />
  {#if sessions.ready && !blockStart}
    <p class="empty">
      No block start date is set, so there are no phases yet. Set one on the
      <a href={router.href('plan')} onclick={(e) => router.onNavClick(e, 'plan')}>Plan</a> page.
    </p>
  {:else}
    <p class="note">
      How close each drill came to its cue. Read within a phase — grooving a feel in week one
      is not the same job as proving it in week three.
    </p>
    <PhaseFeelPanel rows={feel} />
  {/if}
</section>

<section id="where">
  <SectionHead idx={idx.where} title="Where you are" />
  {#if sessions.ready && !blockStart}
    <p class="empty">
      No block start date is set. Set one on the
      <a href={router.href('plan')} onclick={(e) => router.onNavClick(e, 'plan')}>Plan</a> page.
    </p>
  {:else}
    <ArcPosition {position} />
  {/if}
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
  .pair-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-top:18px}
</style>
