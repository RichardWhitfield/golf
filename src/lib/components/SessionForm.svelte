<script lang="ts">
  import type { PracticeSession } from '../domain/types'
  import {
    draftForDay,
    draftFromSession,
    defaultLocation,
    seedEntries,
    toSession,
    validateDraft,
    type SessionDraft,
  } from '../domain/session'
  import { DAY_NAMES, WEEK } from '../domain/plan'
  import { resolveDayKey, resolveISODate } from '../domain/today'
  import { dayKeyFor } from '../domain/block'
  import type { Location } from '../domain/types'
  import { sessions } from '../stores/sessions.svelte'
  import DrillEntryRow from './DrillEntryRow.svelte'

  let { editing = null, onDone }: { editing?: PracticeSession | null; onDone?: () => void } =
    $props()

  const LOCATIONS: { value: Location; label: string }[] = [
    { value: 'sim', label: 'Sim' },
    { value: 'home', label: 'Home' },
    { value: 'course', label: 'Course' },
  ]

  function fresh(): SessionDraft {
    return draftForDay(resolveDayKey(), resolveISODate())
  }

  let draft = $state<SessionDraft>(editing ? draftFromSession(editing) : fresh())
  /** Once the drills have been changed by hand, a date change must not re-seed over the top. */
  let drillsTouched = $state(editing !== null)
  let problems = $state<string[]>([])
  let saved = $state<string | null>(null)

  // Reload the form when the caller switches which session is being edited.
  $effect(() => {
    draft = editing ? draftFromSession(editing) : fresh()
    drillsTouched = editing !== null
    problems = []
  })

  /** The day the chosen date falls on, so the header names the plan the ticks came from.
   *  Falls back to today when the date box is mid-edit and momentarily unparseable. */
  const dayKey = $derived(dayKeyFor(draft.date) ?? resolveDayKey())
  const plan = $derived(WEEK[dayKey])

  function onDateChange() {
    if (drillsTouched) return
    draft.entries = seedEntries(dayKey)
    draft.location = defaultLocation(dayKey)
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault()
    problems = validateDraft(draft)
    if (problems.length > 0) return
    try {
      await sessions.save(toSession(draft))
    } catch (error) {
      problems = [error instanceof Error ? error.message : 'Could not save.']
      return
    }
    saved = editing ? 'Session updated.' : 'Session saved.'
    draft = fresh()
    drillsTouched = false
    onDone?.()
  }
</script>

<form onsubmit={submit} novalidate>
  <div class="head">
    <span class="eyebrow">{editing ? 'Editing' : DAY_NAMES[dayKey]}</span>
    <span class="plan-title">{plan.title}</span>
  </div>

  <div class="field">
    <label class="lab" for="session-date">Date</label>
    <input
      id="session-date"
      type="date"
      bind:value={draft.date}
      onchange={onDateChange}
      required
    />
  </div>

  <div class="field">
    <span class="lab" id="where-label">Where</span>
    <div class="pills" role="group" aria-labelledby="where-label">
      {#each LOCATIONS as option (option.value)}
        <button
          type="button"
          aria-pressed={draft.location === option.value ? 'true' : 'false'}
          onclick={() => (draft.location = option.value)}
        >{option.label}</button>
      {/each}
    </div>
  </div>

  <div class="field">
    <span class="lab">Drills</span>
    <div class="rows">
      {#each draft.entries as entry, i (entry.drillId)}
        <DrillEntryRow
          bind:entry={draft.entries[i]}
          onchange={() => (drillsTouched = true)}
        />
      {/each}
    </div>
  </div>

  <div class="field">
    <label class="lab" for="session-notes">Notes</label>
    <textarea id="session-notes" rows="3" bind:value={draft.notes}
      placeholder="Optional. What changed, what to try next."></textarea>
  </div>

  {#if problems.length > 0}
    <ul class="problems" role="alert">
      {#each problems as problem (problem)}<li>{problem}</li>{/each}
    </ul>
  {/if}

  <div class="actions">
    <button class="save" type="submit">{editing ? 'Update session' : 'Save session'}</button>
    {#if editing}
      <button class="cancel" type="button" onclick={() => onDone?.()}>Cancel</button>
    {/if}
  </div>

  <p class="saved" role="status">{saved ?? ''}</p>
</form>

<style>
  form{
    background:linear-gradient(100deg,var(--panel),var(--panel-2));
    border:1px solid var(--line);border-left:3px solid var(--ball);
    border-radius:16px;padding:24px 26px 26px;margin-top:24px;
  }
  .head{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap}
  .plan-title{font-family:'Space Mono',monospace;font-size:.76rem;color:var(--dim);letter-spacing:.06em}
  .field{margin-top:22px}
  .lab{
    font-family:'Space Mono',monospace;font-size:.72rem;letter-spacing:.14em;
    text-transform:uppercase;color:var(--dim);display:block;margin-bottom:10px;
  }
  input[type="date"],textarea{
    width:100%;background:var(--card);color:var(--chalk);
    border:1px solid var(--line);border-radius:10px;padding:12px 14px;min-height:44px;
    font-family:'Space Mono',monospace;font-size:.95rem;
  }
  textarea{font-family:'Inter',system-ui,sans-serif;line-height:1.6;resize:vertical}
  textarea::placeholder{color:var(--dim);opacity:.8}

  .pills{display:flex;gap:6px;flex-wrap:wrap}
  .pills button{
    font-family:'Space Mono',monospace;font-size:.72rem;letter-spacing:.1em;text-transform:uppercase;
    background:transparent;color:var(--dim);border:1px solid var(--line);
    border-radius:100px;padding:10px 20px;min-height:44px;cursor:pointer;
    transition:color .18s ease,border-color .18s ease;
  }
  .pills button:hover{color:var(--chalk);border-color:var(--line-hover)}
  .pills button[aria-pressed="true"]{color:var(--bg);background:var(--ball);border-color:var(--ball);font-weight:700}

  .rows{display:flex;flex-direction:column;gap:10px}

  .problems{
    margin-top:20px;padding:14px 16px;list-style:none;
    border:1px solid var(--flag);border-radius:14px;background:var(--flag-wash);
    font-size:.9rem;
  }

  .actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:24px}
  .save{
    flex:1 1 220px;min-height:52px;
    font-family:'Space Mono',monospace;font-size:.8rem;letter-spacing:.14em;text-transform:uppercase;
    background:var(--ball);color:var(--bg);border:1px solid var(--ball);
    border-radius:100px;font-weight:700;cursor:pointer;
  }
  .cancel{
    min-height:52px;padding:0 22px;
    font-family:'Space Mono',monospace;font-size:.8rem;letter-spacing:.14em;text-transform:uppercase;
    background:transparent;color:var(--dim);border:1px solid var(--line);
    border-radius:100px;cursor:pointer;
  }
  .cancel:hover{color:var(--chalk);border-color:var(--line-hover)}

  .saved{
    margin-top:12px;min-height:1.4em;
    font-family:'Space Mono',monospace;font-size:.74rem;letter-spacing:.1em;
    text-transform:uppercase;color:var(--ball);
  }

  @media (prefers-reduced-motion:reduce){
    .pills button{transition:none}
  }
</style>
