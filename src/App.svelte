<script lang="ts">
  import SiteNav from './lib/components/SiteNav.svelte'
  import LogView from './routes/LogView.svelte'
  import PlanView from './routes/PlanView.svelte'
  import ProgressView from './routes/ProgressView.svelte'
  import { router } from './lib/stores/router.svelte'
  import { sessions } from './lib/stores/sessions.svelte'

  $effect(() => router.start())
  $effect(() => {
    sessions
      .load()
      .catch((error) => {
        // Never let a storage failure stop the plan page rendering — it needs no storage at all.
        console.error('Could not load the practice log:', error)
      })
      // Deliberately not awaited by anything that renders. `load()` answers from the cache so
      // the page paints immediately; this then refreshes from the store. A slow, hanging or
      // unreachable store must not delay first paint, and `sync` swallows every error itself.
      .then(() => sessions.sync())
  })
</script>

<div class="wrap">
  <SiteNav />
  {#if router.current === 'log'}
    <LogView />
  {:else if router.current === 'progress'}
    <ProgressView />
  {:else}
    <PlanView />
  {/if}
</div>
