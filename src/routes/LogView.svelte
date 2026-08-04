<script lang="ts">
  import type { PracticeSession } from '../lib/domain/types'
  import RecentSessions from '../lib/components/RecentSessions.svelte'
  import SessionForm from '../lib/components/SessionForm.svelte'
  import SiteFooter from '../lib/components/SiteFooter.svelte'

  let editing = $state<PracticeSession | null>(null)
  let formTop = $state<HTMLElement | null>(null)

  function edit(session: PracticeSession) {
    editing = session
    formTop?.scrollIntoView({ block: 'start' })
  }
</script>

<section class="log reveal" aria-labelledby="log-title" bind:this={formTop}>
  <span class="eyebrow">Practice log</span>
  <h1 id="log-title">{editing ? 'Edit a session' : 'Log a session'}</h1>
  <p class="sub">
    {editing
      ? 'Change what you need and update, or cancel to go back to a new session.'
      : "Today's drills are already ticked. Change what you actually did, then save."}
  </p>
  <!-- Keyed on the session being edited, so switching in or out of edit mode REMOUNTS the form.
       That makes `SessionForm`'s `$state` initialisers correct by construction — they run once,
       with the right `editing` value — and lets its re-seeding `$effect` be deleted (Step 0).
       Without the key, the initialiser captures `editing` once and only the effect corrects it,
       one reactive tick later: the pattern `svelte-check` flags as `state_referenced_locally`. -->
  {#key editing?.id ?? 'new'}
    <SessionForm {editing} onDone={() => (editing = null)} />
  {/key}
  <RecentSessions onEdit={edit} />
</section>
<SiteFooter />

<style>
  .log{margin-top:40px}
  /* The hero h1 is the poster treatment and belongs to the plan page. A form page takes the
     section h2 scale instead — see docs/design.md section 2. */
  .log h1{font-size:clamp(1.5rem,3.6vw,2.15rem);font-weight:800;margin:10px 0 6px}
  .log .sub{color:var(--dim);font-size:.95rem;max-width:60ch}
</style>
