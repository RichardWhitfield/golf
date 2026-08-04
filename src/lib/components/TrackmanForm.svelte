<script lang="ts">
  import type { DrillId, TrackmanSession } from '../domain/types'
  import { DRILLS } from '../domain/drills'
  import { CLUBS } from '../domain/clubs'
  import { KPI, WEEK } from '../domain/plan'
  import { resolveISODate } from '../domain/today'
  import {
    draftFromTrackman,
    emptyRow,
    toTrackmanSession,
    trackmanDraft,
    validateTrackmanDraft,
    type TrackmanDraft,
  } from '../domain/trackman'
  import { sessions } from '../stores/sessions.svelte'
  import ClubPathRow from './ClubPathRow.svelte'

  let { editing = null, onDone }: { editing?: TrackmanSession | null; onDone?: () => void } =
    $props()

  function fresh(): TrackmanDraft {
    return trackmanDraft(resolveISODate())
  }

  // Capture-once is exactly what is wanted: `LogView` keys this component on `editing?.id`, so a
  // different session means a fresh component rather than a mutated one, and the initialiser
  // always sees the right value. If that `{#key}` ever goes away, this becomes a bug.
  // svelte-ignore state_referenced_locally
  let draft = $state<TrackmanDraft>(editing ? draftFromTrackman(editing) : fresh())
  let problems = $state<string[]>([])
  let saved = $state<string | null>(null)

  const taken = $derived(draft.rows.map((r) => r.club))
  const canAdd = $derived(draft.rows.length < CLUBS.length)

  function addRow() {
    draft.rows = [...draft.rows, emptyRow(taken)]
  }

  function removeRow(index: number) {
    draft.rows = draft.rows.filter((_, i) => i !== index)
  }

  function toggleDrill(id: DrillId) {
    draft.drills = draft.drills.includes(id)
      ? draft.drills.filter((d) => d !== id)
      : [...draft.drills, id]
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault()
    problems = validateTrackmanDraft(draft)
    if (problems.length > 0) return
    try {
      await sessions.save(toTrackmanSession(draft))
    } catch (error) {
      problems = [error instanceof Error ? error.message : 'Could not save.']
      return
    }
    saved = editing ? 'Session updated.' : 'Session saved.'
    draft = fresh()
    onDone?.()
  }
</script>

<form onsubmit={submit} novalidate>
  <div class="head">
    <span class="eyebrow">{editing ? 'Editing' : 'Monday'}</span>
    <span class="plan-title">{WEEK.mon.title}</span>
  </div>

  <div class="field">
    <label class="lab" for="trackman-date">Date</label>
    <input id="trackman-date" type="date" bind:value={draft.date} required />
  </div>

  <div class="field">
    <span class="lab">Club path</span>
    <p class="hint">
      Negative is out-to-in. Target is {KPI.goal} — overshooting past it counts against you, so
      "best" means the shot closest to neutral, not the biggest number.
    </p>
    <div class="rows">
      <!-- Deliberately unkeyed. The obvious key is `row.club`, but the club select *changes* it,
           which would tear down and rebuild the row mid-edit and drop the user's focus. -->
      {#each draft.rows as _row, i}
        <ClubPathRow
          bind:row={draft.rows[i]}
          index={i}
          removable={draft.rows.length > 1}
          onremove={() => removeRow(i)}
        />
      {/each}
    </div>
    <button class="add" type="button" onclick={addRow} disabled={!canAdd}>
      {canAdd ? 'Add a club' : 'Every club is listed'}
    </button>
  </div>

  <div class="field">
    <span class="lab" id="drills-label">Drills worked</span>
    <div class="pills" role="group" aria-labelledby="drills-label">
      {#each DRILLS as d (d.id)}
        <button
          type="button"
          aria-pressed={draft.drills.includes(d.id) ? 'true' : 'false'}
          onclick={() => toggleDrill(d.id)}
        >{d.id} · {d.name}</button>
      {/each}
    </div>
  </div>

  <div class="field">
    <label class="lab" for="trackman-notes">Notes</label>
    <textarea id="trackman-notes" rows="3" bind:value={draft.notes}
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
  .hint{color:var(--dim);font-size:.88rem;margin:-4px 0 12px;max-width:60ch}
  input[type="date"],textarea{
    width:100%;background:var(--card);color:var(--chalk);
    border:1px solid var(--line);border-radius:10px;padding:12px 14px;min-height:44px;
    font-family:'Space Mono',monospace;font-size:.95rem;
  }
  textarea{font-family:'Inter',system-ui,sans-serif;line-height:1.6;resize:vertical}
  textarea::placeholder{color:var(--dim);opacity:.8}

  .rows{display:flex;flex-direction:column;gap:10px}
  .add{
    margin-top:12px;
    font-family:'Space Mono',monospace;font-size:.7rem;letter-spacing:.12em;text-transform:uppercase;
    background:transparent;color:var(--dim);border:1px dashed var(--line);
    border-radius:100px;padding:0 22px;min-height:44px;cursor:pointer;
    transition:color .18s ease,border-color .18s ease;
  }
  .add:hover:not(:disabled){color:var(--ball);border-color:var(--ball-dim)}
  .add:disabled{opacity:.5;cursor:default}

  .pills{display:flex;gap:6px;flex-wrap:wrap}
  .pills button{
    font-family:'Space Mono',monospace;font-size:.7rem;letter-spacing:.08em;
    background:transparent;color:var(--dim);border:1px solid var(--line);
    border-radius:100px;padding:10px 16px;min-height:44px;cursor:pointer;
    transition:color .18s ease,border-color .18s ease;
  }
  .pills button:hover{color:var(--chalk);border-color:var(--line-hover)}
  .pills button[aria-pressed="true"]{color:var(--bg);background:var(--ball);border-color:var(--ball);font-weight:700}

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
    .pills button,.add{transition:none}
  }
</style>
