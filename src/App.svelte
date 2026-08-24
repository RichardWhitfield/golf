<script lang="ts">
  import SiteNav from './lib/components/SiteNav.svelte'
  import StaleNotice from './lib/components/StaleNotice.svelte'
  import LogView from './routes/LogView.svelte'
  import PlanView from './routes/PlanView.svelte'
  import ProgressView from './routes/ProgressView.svelte'
  import { router } from './lib/stores/router.svelte'
  import { sessions } from './lib/stores/sessions.svelte'

  /**
   * The destinations routes are loaded on demand; the practice routes are imported statically
   * above and render synchronously, exactly as they always have.
   *
   * The asymmetry is the point. `courses.ts` is 93 kB raw of travel-planning data, and a static
   * import here puts every byte of it in the chunk that `/practice` loads — a page opened daily,
   * outdoors, on a phone, that never reads a single course. D1 chose this stack for a small
   * bundle at the range; making the daily page 70% larger to carry a trip planner inverts that.
   *
   * The promises are memoised rather than called inline in `{#await}`. An inline `import()` is a
   * new promise on every re-render, which would drop the view back to its pending state each
   * time the router or the store ticked.
   */
  let destinationsChunk: Promise<typeof import('./routes/DestinationsView.svelte')> | undefined
  let courseChunk: Promise<typeof import('./routes/CourseView.svelte')> | undefined

  const loadDestinations = () => (destinationsChunk ??= import('./routes/DestinationsView.svelte'))
  const loadCourse = () => (courseChunk ??= import('./routes/CourseView.svelte'))

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
  <!-- Above the view, not inside one: stale data is equally misleading on all three. -->
  <StaleNotice />
  {#if router.current === 'log'}
    <LogView />
  {:else if router.current === 'progress'}
    <ProgressView />
  {:else if router.current === 'destinations'}
    {#await loadDestinations()}
      <p class="chunk">Loading destinations…</p>
    {:then module}
      {@const View = module.default}
      <View />
    {:catch}
      <!-- A chunk that never arrived is offline or a bad deploy. Say so and leave the nav
           standing: the practice routes are already in this bundle and still work. -->
      <p class="chunk fail">
        Destinations could not be loaded. It needs a connection the first time you open it — the
        practice pages still work offline.
      </p>
    {/await}
  {:else if router.current === 'course'}
    {#await loadCourse()}
      <p class="chunk">Loading…</p>
    {:then module}
      {@const View = module.default}
      <!-- `?? ''` cannot happen: the router only sets `course` with a slug. It keeps the type
           honest without inventing a fallback route the resolver would never produce. -->
      <View slug={router.slug ?? ''} />
    {:catch}
      <p class="chunk fail">
        This course could not be loaded. It needs a connection the first time you open it — the
        practice pages still work offline.
      </p>
    {/await}
  {:else}
    <PlanView />
  {/if}
</div>

<style>
  /* Only ever rendered inside the two destinations branches, so nothing here can reach the
     practice routes — they have no wrapper and no pending state at all. */
  .chunk{margin-top:40px;color:var(--dim);font-size:.94rem;max-width:60ch}
  .chunk.fail{color:var(--flag)}
</style>
