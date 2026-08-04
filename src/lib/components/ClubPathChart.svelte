<script lang="ts">
  import type { ISODate } from '../domain/types'
  import type { ClubSeries } from '../domain/series'
  import { BAND, CHART, DOMAIN, inBand, radiusFor, xFor, yFor } from '../domain/scale'
  import { clubInfo } from '../domain/clubs'

  let {
    series,
    first,
    last,
    blockStart,
    headline = false,
  }: {
    series: ClubSeries
    first: ISODate
    last: ISODate
    blockStart?: ISODate
    headline?: boolean
  } = $props()

  const info = $derived(clubInfo(series.club))

  /** Same-date sessions share an x. Nudge by ordinal so neither hides under the other. */
  const NUDGE = 2.5

  const plotted = $derived(
    series.points
      .map((p) => {
        const x = xFor(p.date, first, last)
        return x === null
          ? null
          : { ...p, x: x + p.ordinal * NUDGE, y: yFor(p.typical), r: radiusFor(p.n) }
      })
      // A type predicate, not a bare `!== null` — without it TypeScript keeps `null` in the
      // element type and every use below needs an assertion.
      .filter((p): p is NonNullable<typeof p> => p !== null),
  )

  /** A single reading gets no line — there is nothing to join it to. */
  const path = $derived(
    plotted.length > 1 ? plotted.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x} ${p.y}`).join(' ') : '',
  )

  const latest = $derived(plotted.at(-1))
  const earliest = $derived(plotted[0])

  /** The block shading, only when a start date falls inside the plotted span. */
  const block = $derived.by(() => {
    if (!blockStart) return null
    const x = xFor(blockStart, first, last)
    if (x === null) return null
    const right = CHART.w - CHART.padR
    return x >= right ? null : { x, width: right - x }
  })

  /** Stated in words for screen readers, which get no benefit from the shapes. */
  const summary = $derived.by(() => {
    if (plotted.length === 0) return `${info.name}: no readings.`
    if (plotted.length === 1) {
      return `${info.name}: one reading, ${earliest!.typical.toFixed(2)} degrees on ${earliest!.date}.`
    }
    const change = latest!.typical - earliest!.typical
    const direction =
      Math.abs(change) < 0.05 ? 'unchanged' : change > 0 ? 'toward neutral' : 'further out-to-in'
    return `${info.name}: ${plotted.length} readings from ${earliest!.date} to ${latest!.date}. Club path moved from ${earliest!.typical.toFixed(2)} to ${latest!.typical.toFixed(2)} degrees, ${direction}. The target band is minus 2 to plus 2 degrees.`
  })
</script>

<figure class="panel" class:headline>
  <figcaption>
    <span class="club">{info.short}</span>
    {#if latest}
      <span class="now" class:good={inBand(latest.typical)}>{latest.typical.toFixed(1)}°</span>
    {/if}
    <span class="count">{plotted.length} {plotted.length === 1 ? 'reading' : 'readings'}</span>
  </figcaption>

  <!-- No `preserveAspectRatio="none"`. Stretching the viewBox non-uniformly would turn every
       <circle> into an ellipse, distorting the dots by a different factor on the headline than
       on the small panels — so the shot-count encoding would stop being comparable between
       them. The headline is made larger by capping its width, never by stretching. -->
  <svg viewBox="0 0 {CHART.w} {CHART.h}" role="img" aria-label={summary}>
    <!-- Fault regions FIRST, both sides. Overshooting past +2 is a fault, not success. -->
    <rect
      class="fault"
      x={CHART.padL}
      y={CHART.padT}
      width={CHART.w - CHART.padL - CHART.padR}
      height={yFor(BAND.max) - CHART.padT}
    />
    <rect
      class="fault"
      x={CHART.padL}
      y={yFor(BAND.min)}
      width={CHART.w - CHART.padL - CHART.padR}
      height={CHART.h - CHART.padB - yFor(BAND.min)}
    />
    <!-- The target band. Yellow means the goal. -->
    <rect
      class="band"
      x={CHART.padL}
      y={yFor(BAND.max)}
      width={CHART.w - CHART.padL - CHART.padR}
      height={yFor(BAND.min) - yFor(BAND.max)}
    />
    {#if block}
      <rect
        class="block"
        x={block.x}
        y={CHART.padT}
        width={block.width}
        height={CHART.h - CHART.padT - CHART.padB}
      />
    {/if}

    <line class="zero" x1={CHART.padL} y1={yFor(0)} x2={CHART.w - CHART.padR} y2={yFor(0)} />
    <line class="axis" x1={CHART.padL} y1={CHART.padT} x2={CHART.padL} y2={CHART.h - CHART.padB} />

    <text class="tick" x={CHART.padL - 4} y={yFor(DOMAIN.max) + 4}>+{DOMAIN.max}</text>
    <text class="tick" x={CHART.padL - 4} y={yFor(0) + 4}>0</text>
    <text class="tick" x={CHART.padL - 4} y={yFor(DOMAIN.min)}>{DOMAIN.min}</text>

    {#if path}
      <path class="line" d={path} />
    {/if}

    {#each plotted as point (point.date + point.ordinal)}
      {#if point.r === null}
        <!-- No shot count, so no size to draw. A hollow ring says "typed, not measured". -->
        <circle class="dot typed" cx={point.x} cy={point.y} r="3.5" />
      {:else}
        <circle
          class="dot"
          class:good={inBand(point.typical)}
          cx={point.x}
          cy={point.y}
          r={point.r}
        />
      {/if}
    {/each}
  </svg>

  <table class="visually-hidden">
    <caption>{info.name} club path readings</caption>
    <thead>
      <tr
        ><th scope="col">Date</th><th scope="col">Typical</th><th scope="col">Best</th><th
          scope="col">Shots</th
        ></tr
      >
    </thead>
    <tbody>
      {#each plotted as point (point.date + point.ordinal)}
        <tr>
          <td>{point.date}</td>
          <td>{point.typical.toFixed(2)}°</td>
          <td>{point.best.toFixed(2)}°</td>
          <td>{point.n ?? 'typed by hand, not counted'}</td>
        </tr>
      {/each}
    </tbody>
  </table>
</figure>

<style>
  .panel{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 14px 10px}
  .panel.headline{background:var(--panel)}

  figcaption{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:8px}
  .club{font-family:'Space Mono',monospace;font-size:.72rem;letter-spacing:.12em;color:var(--chalk)}
  .now{font-family:'Space Mono',monospace;font-size:.9rem;font-weight:700;color:var(--flag)}
  /* Inside the band is the goal, so it turns yellow. */
  .now.good{color:var(--ball)}
  .count{font-family:'Space Mono',monospace;font-size:.62rem;letter-spacing:.08em;color:var(--dim);margin-left:auto}

  svg{display:block;width:100%;height:auto}
  /* The headline reads bigger because the panel is wider and sits on --panel, not because the
     chart is stretched. 620px at the 300x140 viewBox is about 290px tall. */
  .panel.headline{max-width:620px}

  /* No colour attributes in the markup — every shape takes its colour here. */
  .fault{fill:var(--flag-wash)}
  .band{fill:var(--ball-wash)}
  .block{fill:var(--ball-wash)}
  .zero{stroke:var(--line);stroke-width:1}
  .axis{stroke:var(--line);stroke-width:1}
  .line{fill:none;stroke:var(--dim);stroke-width:1.2;stroke-linejoin:round}
  .dot{fill:var(--chalk)}
  .dot.good{fill:var(--ball)}
  .typed{fill:none;stroke:var(--chalk);stroke-width:1.2;stroke-dasharray:2 2}
  .tick{
    font-family:'Space Mono',monospace;font-size:7px;fill:var(--dim);text-anchor:end;
  }

  caption{text-align:left}

  .visually-hidden{
    position:absolute;width:1px;height:1px;overflow:hidden;
    clip-path:inset(50%);white-space:nowrap;
  }
</style>
