<script lang="ts">
  import { sessions } from '../stores/sessions.svelte'

  let retrying = $state(false)

  async function retry(): Promise<void> {
    retrying = true
    try {
      await sessions.sync()
    } finally {
      retrying = false
    }
  }
</script>

<!--
  Shown when the practice store could not be reached.

  `CachedRepo` serves cached data and swallows read failures on purpose — the plan page must
  render with the store down. The cost of that is a site which looks perfectly healthy while
  showing numbers that could be weeks old, and which will reject the next save. This is the one
  place that says so.
-->
{#if sessions.stale}
  <div class="stale" role="status">
    <span class="label">Not synced</span>
    <p>
      These are your saved numbers. The practice store could not be reached, so anything you log
      now will not save.
    </p>
    <button type="button" onclick={retry} disabled={retrying}>
      {retrying ? 'Trying…' : 'Try again'}
    </button>
  </div>
{/if}

<style>
  /* `--flag` because this is a bad state, not a target — see design.md. 14px radius matches
     the other warning boxes. */
  .stale{
    display:flex;align-items:center;gap:8px 16px;flex-wrap:wrap;
    margin-top:16px;padding:12px 16px;
    border:1px solid var(--flag);border-radius:14px;background:var(--flag-wash);
  }
  .label{
    font-family:'Space Mono',monospace;font-size:.72rem;letter-spacing:.16em;
    text-transform:uppercase;color:var(--flag);
  }
  .stale p{font-size:.9rem;color:var(--chalk);flex:1;min-width:22ch}
  .stale button{
    font-family:'Space Mono',monospace;font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;
    display:flex;align-items:center;justify-content:center;
    min-height:44px;padding:0 20px;border-radius:100px;cursor:pointer;
    background:transparent;color:var(--flag);border:1px solid var(--flag);
    transition:color .18s ease,border-color .18s ease,background-color .18s ease;
  }
  .stale button:hover:not(:disabled){background:var(--flag);color:var(--bg)}
  .stale button:disabled{opacity:.6;cursor:default}

  @media (max-width:760px){
    /* `.wrap` is a flex column here. `.today` claims order:-1 and the nav order:-2; this must
       sit with the nav, because a warning below the fold is a warning nobody reads. Equal order
       falls back to DOM order, and this renders after `SiteNav`. */
    .stale{order:-2}
  }

  @media (prefers-reduced-motion:reduce){
    .stale button{transition:none}
  }
</style>
