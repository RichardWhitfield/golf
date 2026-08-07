<script lang="ts">
  import type { Relation } from '../domain/relate'
  import { metricInfo } from '../domain/metrics'
  import { CHART, inRange, radiusFor, xIn, yIn } from '../domain/scale'
  import { clubInfo } from '../domain/clubs'

  let { relation }: { relation: Relation } = $props()

  const xInfo = $derived(metricInfo(relation.x))
  const yInfo = $derived(metricInfo(relation.y))
  const club = $derived(clubInfo(relation.club))

  const PLOT_W = CHART.w - CHART.padL - CHART.padR
  const PLOT_BOTTOM = CHART.h - CHART.padB

  const plotted = $derived(
    relation.points.map((p) => ({
      ...p,
      // x maps across its own authored domain, exactly as y maps down its own. Both live in
      // `domain/scale.ts` — a component renders, it does not calculate.
      cx: xIn(p.x, xInfo.domain),
      cy: yIn(p.y, yInfo.domain),
      good: yInfo.band ? inRange(p.y, yInfo.band) : false,
      // Sized by the thinner of the pair's two counts, and `null` when either side has none —
      // a hand-typed row carries no count, and sizing it would weight a guess as though it
      // were measured. The ring is the same signal `ClubPathChart` uses.
      r: radiusFor(p.n),
    })),
  )

  /** Only where zero falls inside the authored domain — it does not for every metric. */
  const zeroY = $derived(
    yInfo.domain.min < 0 && yInfo.domain.max > 0 ? yIn(0, yInfo.domain) : null,
  )

  /** A positive bound only reads as positive when the axis carries negatives too. */
  function tick(value: number, domain: { min: number; max: number }): string {
    return domain.min < 0 && value > 0 ? `+${value}` : `${value}`
  }

  /**
   * Stated in words, because the strength of a relationship is exactly what a scatter of dots
   * does not communicate on its own — and screen readers get nothing from the shapes.
   *
   * **Computed from `relation.r` every render.** No figure from the design notes appears here:
   * one would keep being quoted long after the swing had changed.
   */
  const verdict = $derived.by(() => {
    // `null` is not `0`. Fewer than two points and a metric that never varied are different
    // findings, and neither is "no correlation".
    if (relation.r === null) {
      return relation.points.length < 2
        ? 'Not enough readings yet to say.'
        : 'These readings do not vary enough to say.'
    }
    const y = yInfo.name.toLowerCase()
    const x = xInfo.name.toLowerCase()
    const strength = Math.abs(relation.r)
    if (strength < 0.2) return `Essentially nothing — ${y} barely moves with ${x}.`
    const named =
      strength < 0.45 ? 'A weak relationship'
      : strength < 0.7 ? 'A moderate relationship'
      : 'A strong relationship'
    return relation.r > 0
      ? `${named} — ${y} rises with ${x}.`
      : `${named} — ${y} falls as ${x} rises.`
  })

  const alt = $derived(
    `${club.name}, ${xInfo.name.toLowerCase()} against ${yInfo.name.toLowerCase()}, ` +
      `${plotted.length} ${plotted.length === 1 ? 'session' : 'sessions'}. ${verdict}`,
  )
</script>

<figure class="panel">
  <figcaption>
    <span class="club">{club.short}</span>
    <span class="pair">{xInfo.short} vs {yInfo.short}</span>
    {#if relation.r !== null}
      <span class="r">r {relation.r.toFixed(2)}</span>
    {/if}
    <span class="count">{plotted.length} {plotted.length === 1 ? 'session' : 'sessions'}</span>
  </figcaption>

  <svg viewBox="0 0 {CHART.w} {CHART.h}" role="img" aria-label={alt}>
    {#if yInfo.band}
      <!-- Fault regions FIRST, both sides. Overshooting past the band is a fault, not success —
           the same semantic the club-path chart carries, and the one that must never invert. -->
      <rect
        class="fault"
        x={CHART.padL}
        y={CHART.padT}
        width={PLOT_W}
        height={yIn(yInfo.band.max, yInfo.domain) - CHART.padT}
      />
      <rect
        class="fault"
        x={CHART.padL}
        y={yIn(yInfo.band.min, yInfo.domain)}
        width={PLOT_W}
        height={PLOT_BOTTOM - yIn(yInfo.band.min, yInfo.domain)}
      />
      <!-- The target band. Yellow means the goal. -->
      <rect
        class="band"
        x={CHART.padL}
        y={yIn(yInfo.band.max, yInfo.domain)}
        width={PLOT_W}
        height={yIn(yInfo.band.min, yInfo.domain) - yIn(yInfo.band.max, yInfo.domain)}
      />
    {/if}

    {#if zeroY !== null}
      <line class="zero" x1={CHART.padL} y1={zeroY} x2={CHART.w - CHART.padR} y2={zeroY} />
    {/if}
    <line class="axis" x1={CHART.padL} y1={CHART.padT} x2={CHART.padL} y2={PLOT_BOTTOM} />

    <text class="tick" x={CHART.padL - 4} y={CHART.padT + 4}>{tick(yInfo.domain.max, yInfo.domain)}</text>
    {#if zeroY !== null}
      <text class="tick" x={CHART.padL - 4} y={zeroY + 4}>0</text>
    {/if}
    <text class="tick" x={CHART.padL - 4} y={PLOT_BOTTOM}>{tick(yInfo.domain.min, yInfo.domain)}</text>

    <!-- The horizontal axis, named and bounded: dots in an unlabelled box say nothing about
         whether a reading sits at 48 degrees of plane or 60. -->
    <text class="tick start" x={CHART.padL} y={CHART.h - 4}>{tick(xInfo.domain.min, xInfo.domain)}</text>
    <text class="tick mid" x={CHART.padL + PLOT_W / 2} y={CHART.h - 4}>{xInfo.short}</text>
    <text class="tick" x={CHART.w - CHART.padR} y={CHART.h - 4}>{tick(xInfo.domain.max, xInfo.domain)}</text>

    <!-- Index in the key: two sessions can share a date, and two readings clamped to the same
         edge can share an x, so date-plus-position is the only unique one. -->
    {#each plotted as p, i (p.date + '#' + i)}
      {#if p.r === null}
        <!-- No shot count, so no size to draw. A hollow ring says "typed, not measured". -->
        <circle class="dot typed" cx={p.cx} cy={p.cy} r="3.5" />
      {:else}
        <circle class="dot" class:good={p.good} cx={p.cx} cy={p.cy} r={p.r} />
      {/if}
    {/each}
  </svg>

  <p class="verdict">{verdict}</p>
  {#if relation.skipped > 0}
    <p class="skipped">
      {relation.skipped}
      {relation.skipped === 1 ? 'session has' : 'sessions have'} only one of the two, so
      {relation.skipped === 1 ? 'it is' : 'they are'} not plotted.
    </p>
  {/if}
</figure>

<style>
  .panel{
    background:var(--card);border:1px solid var(--line);border-radius:14px;
    padding:16px 18px;margin:0;
  }
  figcaption{
    display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;
    font-family:'Space Mono',monospace;font-size:.72rem;letter-spacing:.1em;
  }
  .club{color:var(--chalk);font-weight:700}
  /* Neutral deliberately. `--ball` means the goal, and a correlation is neither good nor bad —
     painting it yellow would borrow a verdict the number does not carry. */
  .pair,.count,.r{color:var(--dim)}
  svg{width:100%;height:auto;display:block;margin-top:12px}

  /* No colour attributes in the markup — every shape takes its colour here. */
  .fault{fill:var(--flag-wash)}
  .band{fill:var(--ball-wash)}
  .zero{stroke:var(--line);stroke-width:1}
  .axis{stroke:var(--line);stroke-width:1}
  .dot{fill:var(--chalk)}
  .dot.good{fill:var(--ball)}
  .typed{fill:none;stroke:var(--chalk);stroke-width:1.2;stroke-dasharray:2 2}
  .tick{font-family:'Space Mono',monospace;font-size:7px;fill:var(--dim);text-anchor:end}
  .tick.start{text-anchor:start}
  .tick.mid{text-anchor:middle}

  .verdict{color:var(--chalk);font-size:.9rem;margin:12px 0 0;max-width:60ch}
  .skipped{color:var(--dim);font-size:.82rem;margin:6px 0 0;max-width:60ch}

  @media (max-width:760px){
    .panel{padding:14px}
  }
</style>
