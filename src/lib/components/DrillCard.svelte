<script lang="ts">
  import type { Drill } from '../domain/types'

  let { drill }: { drill: Drill } = $props()
</script>

<div class="drill">
  <span class="no">{drill.id}</span>
  <div class="tags">
    {#each drill.tags as tag (tag)}
      <span class="tag" class:sim={tag === 'sim'} class:home={tag === 'home'}>{tag.toUpperCase()}</span>
    {/each}
  </div>
  <h3>{drill.name}</h3>
  <p>{drill.description}</p>
  <div class="foot">
    <span>Reps · <b>{drill.reps}</b></span>
    <span>Feels like · {drill.feelsLike}</span>
  </div>
</div>

<style>
  .drill{
    background:var(--card);border:1px solid var(--line);border-radius:14px;
    padding:20px 20px 18px;position:relative;transition:transform .18s ease,border-color .18s ease;
  }
  .drill:hover{transform:translateY(-3px);border-color:var(--line-hover)}
  .drill .no{font-family:'Space Mono',monospace;color:var(--ball);font-size:.82rem}
  .drill h3{font-size:1.24rem;font-weight:700;margin:2px 0 10px}
  .drill .tags{display:flex;gap:6px;margin-bottom:12px}
  .tag{
    font-family:'Space Mono',monospace;font-size:.62rem;letter-spacing:.08em;
    padding:3px 8px;border-radius:100px;border:1px solid var(--line);color:var(--dim);
  }
  .tag.sim{color:var(--ball);border-color:var(--ball-dim)}
  .tag.home{color:var(--home);border-color:var(--home-dim)}
  .drill p{font-size:.94rem;color:var(--chalk);opacity:.9}
  .drill .foot{
    margin-top:14px;padding-top:12px;border-top:1px solid var(--line);
    display:flex;flex-direction:column;gap:5px;font-size:.85rem;
  }
  .drill .foot span{color:var(--dim)}
  .drill .foot b{font-family:'Space Mono',monospace;color:var(--chalk);font-weight:400}

  /* Scoped, not global: Svelte compiles `.drill` to `.drill.svelte-xxx`, so an override in
     app.css would lose the specificity contest and silently do nothing.
     The lift is dropped; the border still responds, so hover stays perceivable. */
  @media (prefers-reduced-motion:reduce){
    .drill{transition:none}
    .drill:hover{transform:none}
  }
</style>
