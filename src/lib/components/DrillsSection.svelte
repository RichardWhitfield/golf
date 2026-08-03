<script lang="ts">
  import { DRILL_GROUPS, drill } from '../domain/drills'
  import DrillCard from './DrillCard.svelte'
  import SectionHead from './SectionHead.svelte'
</script>

<section id="drills">
  <SectionHead idx="02" title="Core drills" />

  {#each DRILL_GROUPS as group (group.label)}
    <div class="group-label">{group.label}</div>
    <div class="grid">
      {#each group.drills as id (id)}
        <DrillCard drill={drill(id)} />
      {/each}
    </div>
  {/each}
</section>

<style>
  .group-label{
    font-family:'Space Mono',monospace;font-size:.75rem;letter-spacing:.16em;
    text-transform:uppercase;color:var(--dim);
    margin:34px 0 16px;display:flex;align-items:center;gap:12px;
  }
  .group-label::after{content:"";flex:1;height:1px;background:var(--line)}
</style>
