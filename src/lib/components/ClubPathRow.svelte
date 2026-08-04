<script lang="ts">
  import { CLUBS, clubInfo } from '../domain/clubs'
  import type { ClubRowDraft } from '../domain/trackman'

  let {
    row = $bindable(),
    removable,
    onremove,
  }: { row: ClubRowDraft; removable: boolean; onremove: () => void } = $props()

  const name = $derived(clubInfo(row.club).name)
</script>

<div class="row">
  <div class="cell club">
    <label class="lab" for="club-{row.club}">Club</label>
    <select id="club-{row.club}" bind:value={row.club}>
      {#each CLUBS as club (club.id)}
        <option value={club.id}>{club.name}</option>
      {/each}
    </select>
  </div>

  <!-- `type="text"` with `inputmode="decimal"`, never `type="number"`. A number input strips a
       lone `-` while it is still being typed, and the sign is the whole meaning here: negative
       is out-to-in. It also fights a leading `+` on the way in. -->
  <div class="cell">
    <label class="lab" for="typical-{row.club}">Typical</label>
    <input
      id="typical-{row.club}"
      type="text"
      inputmode="decimal"
      autocomplete="off"
      placeholder="−7.5"
      aria-label="{name} typical club path in degrees"
      bind:value={row.typical}
    />
  </div>

  <div class="cell">
    <label class="lab" for="best-{row.club}">Best</label>
    <input
      id="best-{row.club}"
      type="text"
      inputmode="decimal"
      autocomplete="off"
      placeholder="−1.2"
      aria-label="{name} best club path in degrees"
      bind:value={row.best}
    />
  </div>

  <div class="cell">
    <label class="lab" for="shots-{row.club}">Shots <span class="opt">(opt)</span></label>
    <input
      id="shots-{row.club}"
      type="text"
      inputmode="numeric"
      autocomplete="off"
      placeholder="—"
      aria-label="{name} shots counted, optional"
      bind:value={row.shots}
    />
  </div>

  <div class="cell act">
    {#if removable}
      <button type="button" aria-label="Remove {name}" onclick={onremove}>Remove</button>
    {/if}
  </div>
</div>

<style>
  .row{
    background:var(--card);border:1px solid var(--line);border-radius:14px;
    padding:14px 16px 16px;
    display:grid;gap:10px 12px;align-items:end;
    grid-template-columns:minmax(0,1.4fr) repeat(3,minmax(0,1fr)) auto;
  }
  .cell{min-width:0}
  .lab{
    font-family:'Space Mono',monospace;font-size:.66rem;letter-spacing:.12em;
    text-transform:uppercase;color:var(--dim);display:block;margin-bottom:6px;
  }
  .opt{opacity:.7;letter-spacing:.06em}
  select,input{
    width:100%;background:var(--bg);color:var(--chalk);
    border:1px solid var(--line);border-radius:10px;padding:10px 12px;min-height:44px;
    font-family:'Space Mono',monospace;font-size:.9rem;
  }
  input::placeholder{color:var(--dim);opacity:.7}
  .act{display:flex;justify-content:flex-end}
  .act button{
    font-family:'Space Mono',monospace;font-size:.66rem;letter-spacing:.12em;text-transform:uppercase;
    min-height:44px;padding:0 16px;border-radius:100px;cursor:pointer;
    background:transparent;color:var(--dim);border:1px solid var(--line);
    transition:color .18s ease,border-color .18s ease;
  }
  .act button:hover{color:var(--flag);border-color:var(--flag)}

  @media (max-width:760px){
    /* Two columns on a phone: club spans the top, then the three numbers wrap beneath it.
       Every target stays 44px — this gets used one-handed, outdoors, possibly gloved. */
    .row{grid-template-columns:repeat(2,minmax(0,1fr))}
    .club{grid-column:1 / -1}
    .act{grid-column:1 / -1;justify-content:flex-start}
  }

  @media (prefers-reduced-motion:reduce){
    .act button{transition:none}
  }
</style>
