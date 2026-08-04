<script lang="ts">
  import type { BlockPosition } from '../domain/block'
  import { ARC } from '../domain/plan'

  let { position }: { position: BlockPosition | null } = $props()

  const BLOCK_DAYS = 21
</script>

{#if position === null}
  <!-- Outside the three weeks says nothing rather than claiming "week 7" — the same rule the
       Today panel follows. -->
  <p class="outside">
    You are outside the three-week block. Set a new start date on the Plan page when you begin
    the next one.
  </p>
{:else}
  <div class="arc">
    {#each ARC as phase, i (phase.n)}
      {@const week = i + 1}
      <div class="phase" class:now={week === position.week} class:done={week < position.week}>
        <div class="n">{phase.n}</div>
        <span class="wk">{phase.week}</span>
        <h3>{phase.title}</h3>
        {#if week === position.week}
          <span class="badge">Day {position.dayOfBlock} of {BLOCK_DAYS}</span>
        {/if}
      </div>
    {/each}
  </div>
{/if}

<style>
  .outside{color:var(--dim);font-size:.94rem;max-width:60ch}

  .arc{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
  .phase{
    background:var(--card);border:1px solid var(--line);border-radius:14px;
    padding:22px 22px 24px;position:relative;overflow:hidden;
  }
  /* The active phase is the one you're aiming at, so it takes the accent border. */
  .phase.now{border-color:var(--ball)}
  .phase.done{opacity:.6}
  .phase .n{
    font-family:'Archivo',sans-serif;font-weight:800;font-size:3.4rem;color:var(--line);
    line-height:.8;letter-spacing:-.04em;
  }
  .phase.now .n{color:var(--ball-dim)}
  .phase h3{font-size:1.12rem;font-weight:700;margin:10px 0 8px}
  .phase .wk{
    font-family:'Space Mono',monospace;font-size:.7rem;letter-spacing:.12em;
    text-transform:uppercase;color:var(--ball);
  }
  .badge{
    font-family:'Space Mono',monospace;font-size:.62rem;letter-spacing:.08em;
    text-transform:uppercase;background:var(--ball);color:var(--bg);
    border-radius:100px;padding:3px 10px;display:inline-block;
  }

  @media (max-width:760px){
    .arc{grid-template-columns:1fr}
  }
</style>
