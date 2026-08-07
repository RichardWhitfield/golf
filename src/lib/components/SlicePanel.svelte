<script lang="ts">
  import type { Session } from '../domain/types'
  import { KPI_CLUB } from '../domain/clubs'
  import { metricInfo, readingFor } from '../domain/metrics'
  import { faceOpenToPath, latestTrackman } from '../domain/latest'

  let { sessions }: { sessions: Session[] } = $props()

  /** The most recent session carrying a driver reading. The headline is "now", not "ever". */
  const latest = $derived(latestTrackman(sessions, KPI_CLUB))

  const path = $derived(latest ? readingFor(latest.row, 'clubPath') : undefined)
  const face = $derived(latest ? readingFor(latest.row, 'faceAngle') : undefined)
  const faceToPath = $derived(latest ? readingFor(latest.row, 'faceToPath') : undefined)
  const curve = $derived(latest ? readingFor(latest.row, 'curve') : undefined)

  const shown = $derived(
    [
      { info: metricInfo('clubPath'), reading: path },
      { info: metricInfo('faceAngle'), reading: face },
      { info: metricInfo('faceToPath'), reading: faceToPath },
      { info: metricInfo('curve'), reading: curve },
    ]
      // A type predicate, not a bare `!== undefined` — without it TypeScript keeps `undefined`
      // in the element type and every use below needs an assertion.
      .filter((c): c is typeof c & { reading: NonNullable<typeof c.reading> } => c.reading !== undefined),
  )

  /**
   * The reading, in words. Face-to-path is what makes the ball curve: a face open to the path
   * sends it right for a right-hander, whatever the face is doing relative to the target.
   *
   * The verdict itself is `domain/latest.ts`'s — this only picks the sentence.
   */
  const story = $derived.by(() => {
    const open = path ? faceOpenToPath(faceToPath) : null
    if (open === null) return null
    return {
      open,
      text: open
        ? 'The face is open to the path, so the ball starts left of the path and curves right.'
        : 'The face is closed to the path, so the ball curves left of the path.',
    }
  })
</script>

{#if latest && shown.length > 0}
  <div class="slice">
    <div class="rows">
      {#each shown as c (c.info.id)}
        <div class="row">
          <span class="lab">{c.info.short}</span>
          <span class="val">
            {c.reading.typical.toFixed(c.info.decimals)}<span class="unit">{c.info.unit}</span>
          </span>
          <!-- `Reading.n` is optional because a hand-typed club-path row genuinely has no count.
               Say so rather than printing `undefined`, and never stand a `0` in for it. -->
          <span class="n">
            {#if c.reading.n !== undefined}{c.reading.n} shots{:else}typed by hand{/if}
          </span>
        </div>
      {/each}
    </div>
    {#if story}
      <p class="story" class:fault={story.open}>{story.text}</p>
    {/if}
    <p class="when">Driver, {latest.date}.</p>
  </div>
{/if}

<style>
  .slice{
    background:var(--card);border:1px solid var(--line);border-left:3px solid var(--ball);
    border-radius:14px;padding:18px 20px;
  }
  .rows{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:14px}
  .row{display:flex;flex-direction:column;gap:4px}
  .lab{
    font-family:'Space Mono',monospace;font-size:.68rem;letter-spacing:.14em;
    text-transform:uppercase;color:var(--dim);
  }
  /* Every value in --chalk, including club path, even though #path colours it by band. Four
     judged numbers in a row would be noise; the story line below carries the verdict instead. */
  .val{font-family:'Space Mono',monospace;font-size:1.35rem;color:var(--chalk);font-weight:700}
  .unit{font-size:.8rem;color:var(--dim);margin-left:2px}
  .n{font-family:'Space Mono',monospace;font-size:.68rem;color:var(--dim)}
  .story{color:var(--chalk);font-size:.92rem;margin:16px 0 0;max-width:62ch}
  .story.fault{color:var(--flag)}
  .when{font-family:'Space Mono',monospace;font-size:.7rem;letter-spacing:.1em;color:var(--dim);margin:10px 0 0}

  @media (max-width:760px){
    .slice{padding:16px}
    .val{font-size:1.2rem}
  }
</style>
