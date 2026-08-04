<script lang="ts">
  import { ARC } from '../domain/plan'
  import SectionHead from './SectionHead.svelte'
</script>

<section id="arc">
  <SectionHead idx="04" title="The 3-week arc" />
  <div class="arc">
    {#each ARC as phase (phase.n)}
      <div class="phase">
        <div class="n">{phase.n}</div>
        <span class="wk">{phase.week}</span>
        <h3>{phase.title}</h3>
        <p>{phase.body}{#if phase.emphasis}<em>{phase.emphasis}</em>{/if}</p>
      </div>
    {/each}
  </div>
</section>

<style>
  .arc{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
  .phase{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:22px 22px 24px;position:relative;overflow:hidden}
  .phase .n{font-family:'Archivo',sans-serif;font-weight:800;font-size:3.4rem;color:var(--line);line-height:.8;letter-spacing:-.04em}
  .phase h3{font-size:1.12rem;font-weight:700;margin:10px 0 8px}
  .phase p{font-size:.9rem;color:var(--dim)}
  .phase .wk{font-family:'Space Mono',monospace;font-size:.7rem;letter-spacing:.12em;text-transform:uppercase;color:var(--ball)}

  @media (max-width:760px){
    .arc{grid-template-columns:1fr}
  }
</style>
