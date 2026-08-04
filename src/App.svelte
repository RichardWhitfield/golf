<script lang="ts">
  import SiteNav from './lib/components/SiteNav.svelte'
  import LogView from './routes/LogView.svelte'
  import PlanView from './routes/PlanView.svelte'
  import { router } from './lib/stores/router.svelte'
  import { sessions } from './lib/stores/sessions.svelte'

  $effect(() => router.start())
  $effect(() => {
    void sessions.load()
  })
</script>

<div class="wrap">
  <SiteNav />
  {#if router.current === 'log'}
    <LogView />
  {:else}
    <PlanView />
  {/if}
</div>
