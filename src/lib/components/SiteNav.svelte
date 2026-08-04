<script lang="ts">
  import { router, type Route } from '../stores/router.svelte'

  const ITEMS: { route: Route; label: string }[] = [
    { route: 'plan', label: 'Plan' },
    { route: 'log', label: 'Log' },
    { route: 'progress', label: 'Progress' },
  ]
</script>

<nav class="sitenav" aria-label="Sections">
  {#each ITEMS as item (item.route)}
    <a
      href={router.href(item.route)}
      aria-current={router.current === item.route ? 'page' : undefined}
      onclick={(event) => router.onNavClick(event, item.route)}
    >{item.label}</a>
  {/each}
</nav>

<style>
  .sitenav{
    display:flex;gap:6px;align-items:center;flex-wrap:wrap;
    padding-bottom:20px;border-bottom:1px solid var(--line);
  }
  .sitenav a{
    font-family:'Space Mono',monospace;font-size:.72rem;letter-spacing:.16em;
    text-transform:uppercase;text-decoration:none;
    display:flex;align-items:center;gap:8px;
    padding:12px 16px;min-height:44px;border-radius:100px;
    border:1px solid transparent;color:var(--dim);
    transition:color .18s ease,border-color .18s ease;
  }
  .sitenav a:hover{color:var(--chalk);border-color:var(--line-hover)}
  .sitenav a[aria-current="page"]{color:var(--ball);border-color:var(--ball-dim)}

  @media (max-width:760px){
    /* `.wrap` is a flex column here and `.today` claims order:-1, so the nav must outrank it. */
    .sitenav{order:-2}
  }

  @media (prefers-reduced-motion:reduce){
    .sitenav a{transition:none}
  }
</style>
