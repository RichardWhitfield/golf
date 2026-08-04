<script lang="ts">
  import { isTrackman, type Session } from '../domain/types'
  import { drill } from '../domain/drills'
  import { clubInfo } from '../domain/clubs'
  import { sessions } from '../stores/sessions.svelte'

  let { onEdit }: { onEdit: (session: Session) => void } = $props()

  /** Confirm in place rather than with `confirm()` — a native dialog is easy to dismiss by
   *  accident on a phone, and this deletes the only copy of a session. */
  let confirming = $state<string | null>(null)

  const SHOWN = 10
  const recent = $derived(sessions.list.slice(0, SHOWN))

  function dayAndMonth(date: string): string {
    const [, month, day] = date.split('-')
    const names = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return `${day} ${names[Number(month) - 1] ?? month}`
  }

  /** Signed, always, with a real minus sign rather than a hyphen. Negative is out-to-in. */
  function degrees(value: number): string {
    return `${value < 0 ? '−' : '+'}${Math.abs(value).toFixed(1)}°`
  }

  async function remove(id: string) {
    await sessions.remove(id)
    confirming = null
  }
</script>

<h2 class="head">Recent sessions</h2>

{#if !sessions.ready}
  <p class="empty">Loading…</p>
{:else if recent.length === 0}
  <p class="empty">Nothing logged yet. Your first session will appear here.</p>
{:else}
  <ul class="list">
    {#each recent as session (session.id)}
      <li>
        <details>
          {#if isTrackman(session)}
            <summary>
              <span class="date">{dayAndMonth(session.date)}</span>
              <span class="tag">TRACKMAN</span>
              <span class="tag">{session.source.toUpperCase()}</span>
              <span class="ids">
                {session.clubs.map((c) => clubInfo(c.club).short).join(' · ')}
              </span>
            </summary>
            <div class="body">
              {#each session.clubs as path (path.club)}
                <p class="entry">
                  <span class="no">{clubInfo(path.club).short}</span>
                  <span class="nums">
                    <span class="pair">typical <b>{degrees(path.typical)}</b></span>
                    <span class="pair">best <b>{degrees(path.best)}</b></span>
                    <!-- An em dash, never 0: a hand-typed reading has no shot count, and showing
                         a zero would read as "no shots measured". -->
                    <span class="pair">{path.n === undefined ? '—' : `${path.n} shots`}</span>
                  </span>
                </p>
              {/each}
              {#if session.drillsWorked?.length}
                <p class="worked">
                  Drills worked: {session.drillsWorked.map((d) => `${d} ${drill(d).name}`).join(' · ')}
                </p>
              {/if}
              {#if session.notes}<p class="notes">{session.notes}</p>{/if}
              <div class="acts">
                <button type="button" onclick={() => onEdit(session)}>Edit</button>
                {#if confirming === session.id}
                  <button class="danger" type="button" onclick={() => remove(session.id)}>
                    Delete for good
                  </button>
                  <button type="button" onclick={() => (confirming = null)}>Keep it</button>
                {:else}
                  <button class="danger" type="button" onclick={() => (confirming = session.id)}>
                    Delete
                  </button>
                {/if}
              </div>
            </div>
          {:else}
            <summary>
              <span class="date">{dayAndMonth(session.date)}</span>
              <span class="tag">{session.location.toUpperCase()}</span>
              <span class="ids">{session.entries.map((e) => e.drillId).join(' · ')}</span>
            </summary>
            <div class="body">
              {#each session.entries as entry (entry.drillId)}
                <p class="entry">
                  <span class="no">{entry.drillId}</span>
                  {drill(entry.drillId).name}
                  <span class="nums">{entry.swings} swings · feel {entry.feel}/5</span>
                </p>
              {/each}
              {#if session.notes}<p class="notes">{session.notes}</p>{/if}
              <div class="acts">
                <button type="button" onclick={() => onEdit(session)}>Edit</button>
                {#if confirming === session.id}
                  <button class="danger" type="button" onclick={() => remove(session.id)}>
                    Delete for good
                  </button>
                  <button type="button" onclick={() => (confirming = null)}>Keep it</button>
                {:else}
                  <button class="danger" type="button" onclick={() => (confirming = session.id)}>
                    Delete
                  </button>
                {/if}
              </div>
            </div>
          {/if}
        </details>
      </li>
    {/each}
  </ul>
  {#if sessions.list.length > SHOWN}
    <p class="empty">Showing the most recent {SHOWN} of {sessions.list.length}.</p>
  {/if}
{/if}

<style>
  .head{font-size:clamp(1.25rem,2.6vw,1.6rem);font-weight:800;margin-top:56px}
  .empty{color:var(--dim);font-size:.92rem;margin-top:14px}
  .list{list-style:none;margin-top:18px;display:flex;flex-direction:column;gap:10px}
  details{background:var(--card);border:1px solid var(--line);border-radius:14px}
  summary{
    display:flex;align-items:center;gap:12px;flex-wrap:wrap;
    min-height:44px;padding:12px 16px;cursor:pointer;list-style:none;
  }
  summary::-webkit-details-marker{display:none}
  .date{font-family:'Space Mono',monospace;color:var(--ball);font-size:.82rem;letter-spacing:.06em}
  .tag{
    font-family:'Space Mono',monospace;font-size:.62rem;letter-spacing:.08em;
    padding:3px 8px;border-radius:100px;border:1px solid var(--line);color:var(--dim);
  }
  .ids{font-family:'Space Mono',monospace;font-size:.76rem;color:var(--dim);margin-left:auto}
  .body{padding:4px 16px 16px;border-top:1px solid var(--line)}
  .entry{font-size:.92rem;margin-top:10px;display:flex;gap:8px;align-items:baseline;flex-wrap:wrap}
  .entry .no{font-family:'Space Mono',monospace;color:var(--ball);font-size:.78rem}
  .entry .nums{font-family:'Space Mono',monospace;font-size:.76rem;color:var(--dim);margin-left:auto}
  .entry .nums .pair{margin-left:14px;white-space:nowrap}
  .entry .nums b{color:var(--chalk);font-weight:700}
  .worked{margin-top:14px;font-family:'Space Mono',monospace;font-size:.72rem;color:var(--dim)}
  .notes{margin-top:12px;font-size:.9rem;color:var(--dim);font-style:italic}
  .acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}
  .acts button{
    font-family:'Space Mono',monospace;font-size:.7rem;letter-spacing:.12em;text-transform:uppercase;
    min-height:44px;padding:0 18px;border-radius:100px;cursor:pointer;
    background:transparent;color:var(--dim);border:1px solid var(--line);
    transition:color .18s ease,border-color .18s ease;
  }
  .acts button:hover{color:var(--chalk);border-color:var(--line-hover)}
  /* Deleting removes the only copy of a session — the flag colour is exactly what it is for. */
  .acts .danger{color:var(--flag);border-color:var(--flag)}
  .acts .danger:hover{color:var(--flag);border-color:var(--flag);background:var(--flag-wash)}

  @media (max-width:760px){
    /* On a phone the numbers get their own line rather than being squeezed against the club. */
    .entry .nums{margin-left:0;flex-basis:100%}
    .entry .nums .pair:first-child{margin-left:0}
  }

  @media (prefers-reduced-motion:reduce){
    .acts button{transition:none}
  }
</style>
