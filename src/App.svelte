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
      // Deliberately not awaited by anything that renders. A slow, hanging or failing fetch of
      // the published Trackman file must not delay first paint, and `syncPublished` swallows
      // every error itself — manual entry is the baseline and works without any of this.
      .then(() => sessions.syncPublished())
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
