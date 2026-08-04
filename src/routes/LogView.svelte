<script lang="ts">
  import { isTrackman, type Session } from '../lib/domain/types'
  import { resolveDayKey } from '../lib/domain/today'
  import DataPanel from '../lib/components/DataPanel.svelte'
  import RecentSessions from '../lib/components/RecentSessions.svelte'
  import SessionForm from '../lib/components/SessionForm.svelte'
  import TrackmanForm from '../lib/components/TrackmanForm.svelte'
  import SiteFooter from '../lib/components/SiteFooter.svelte'

  type Mode = 'practice' | 'trackman'

  const MODES: { value: Mode; label: string }[] = [
    { value: 'practice', label: 'Practice' },
    { value: 'trackman', label: 'Trackman' },
  ]

  // Monday is the bay day, so Monday opens on the Trackman form — the same reasoning that makes
  // `defaultLocation()` default Monday to `sim`.
  let mode = $state<Mode>(resolveDayKey() === 'mon' ? 'trackman' : 'practice')
  let editing = $state<Session | null>(null)
  let formTop = $state<HTMLElement | null>(null)

  const editingPractice = $derived(editing !== null && !isTrackman(editing) ? editing : null)
  const editingTrackman = $derived(editing !== null && isTrackman(editing) ? editing : null)

  function edit(session: Session) {
    // Switch the pills to match, or they would claim "Practice" over a Trackman form.
    mode = isTrackman(session) ? 'trackman' : 'practice'
    editing = session
    formTop?.scrollIntoView({ block: 'start' })
  }

  function pick(next: Mode) {
    // Leaving a half-finished edit behind on the other tab would be a trap.
    if (next !== mode) editing = null
    mode = next
  }
</script>

<section class="log reveal" aria-labelledby="log-title" bind:this={formTop}>
  <span class="eyebrow">Practice log</span>
  <h1 id="log-title">{editing ? 'Edit a session' : 'Log a session'}</h1>
  <p class="sub">
    {#if editing}
      Change what you need and update, or cancel to go back to a new session.
    {:else if mode === 'trackman'}
      Monday's numbers. Driver first — it is the KPI. Add the other clubs you measured.
    {:else}
      Today's drills are already ticked. Change what you actually did, then save.
    {/if}
  </p>

  <div class="modes" role="group" aria-label="What kind of session">
    {#each MODES as option (option.value)}
      <button
        type="button"
        aria-pressed={mode === option.value ? 'true' : 'false'}
        onclick={() => pick(option.value)}
      >{option.label}</button>
    {/each}
  </div>

  <!-- Keyed on the session being edited, so switching in or out of edit mode REMOUNTS the form.
       That makes each form's `$state` initialisers correct by construction — they run once, with
       the right `editing` value. Without the key, the initialiser captures `editing` once and
       only a re-seeding effect could correct it, one reactive tick later. -->
  {#if mode === 'trackman'}
    {#key editingTrackman?.id ?? 'new'}
      <TrackmanForm editing={editingTrackman} onDone={() => (editing = null)} />
    {/key}
  {:else}
    {#key editingPractice?.id ?? 'new'}
      <SessionForm editing={editingPractice} onDone={() => (editing = null)} />
    {/key}
  {/if}

  <RecentSessions onEdit={edit} />
  <DataPanel />
</section>
<SiteFooter />

<style>
  .log{margin-top:40px}
  /* The hero h1 is the poster treatment and belongs to the plan page. A form page takes the
     section h2 scale instead — see docs/design.md section 2. */
  .log h1{font-size:clamp(1.5rem,3.6vw,2.15rem);font-weight:800;margin:10px 0 6px}
  .log .sub{color:var(--dim);font-size:.95rem;max-width:60ch}

  .modes{display:flex;gap:6px;flex-wrap:wrap;margin-top:18px}
  .modes button{
    font-family:'Space Mono',monospace;font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;
    background:transparent;color:var(--dim);border:1px solid var(--line);
    border-radius:100px;padding:10px 24px;min-height:44px;cursor:pointer;
    transition:color .18s ease,border-color .18s ease;
  }
  .modes button:hover{color:var(--chalk);border-color:var(--line-hover)}
  .modes button[aria-pressed="true"]{
    color:var(--bg);background:var(--ball);border-color:var(--ball);font-weight:700;
  }

  @media (prefers-reduced-motion:reduce){
    .modes button{transition:none}
  }
</style>
