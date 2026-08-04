<script lang="ts">
  import { sessions } from '../stores/sessions.svelte'

  let message = $state<string | null>(null)
  let problem = $state<string | null>(null)
  let importing = $state(false)

  function download(text: string, filename: string) {
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
  }

  async function exportAll() {
    message = null
    problem = null
    try {
      download(await sessions.exportText(), sessions.exportName())
      message = `Exported ${sessions.list.length} session${sessions.list.length === 1 ? '' : 's'}.`
    } catch (error) {
      problem = error instanceof Error ? error.message : 'Export failed.'
    }
  }

  async function downloadQuarantine() {
    const text = await sessions.quarantinedText()
    if (text === null) {
      problem = 'There is no set-aside copy to download.'
      return
    }
    download(text, 'golf-practice-unreadable.json')
    message = 'Downloaded the set-aside copy.'
  }

  async function onFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return

    importing = true
    message = null
    problem = null
    try {
      const summary = await sessions.importText(await file.text())
      message = `${summary.added} new · ${summary.updated} updated.`
    } catch (error) {
      problem = error instanceof Error ? error.message : 'That file could not be imported.'
    } finally {
      importing = false
      // Clear it, so re-picking the same file after a fix fires `change` again.
      input.value = ''
    }
  }
</script>

<h2 class="head">Your data</h2>
<p class="sub">
  This browser is the only place your practice log lives. Clearing site data would delete it —
  export a copy somewhere safe now and then.
</p>

{#if sessions.warning}
  <div class="warn" role="alert">
    <span class="eyebrow">Heads up</span>
    <p>{sessions.warning}</p>
    <button type="button" onclick={downloadQuarantine}>Download the set-aside copy</button>
  </div>
{/if}

<div class="acts">
  <button type="button" onclick={exportAll}>Export JSON</button>
  <label class="file">
    <input type="file" accept="application/json,.json" onchange={onFile} disabled={importing} />
    <span>{importing ? 'Importing…' : 'Import JSON'}</span>
  </label>
</div>

<p class="note">Importing adds and updates. It never deletes a session you already have.</p>

{#if message}<p class="msg" role="status">{message}</p>{/if}
{#if problem}<p class="err" role="alert">{problem}</p>{/if}

<style>
  .head{font-size:clamp(1.25rem,2.6vw,1.6rem);font-weight:800;margin-top:56px}
  .sub{color:var(--dim);font-size:.92rem;margin-top:12px;max-width:60ch}
  .acts{display:flex;gap:10px;flex-wrap:wrap;margin-top:20px}
  .acts button,.file span{
    font-family:'Space Mono',monospace;font-size:.74rem;letter-spacing:.12em;text-transform:uppercase;
    display:flex;align-items:center;justify-content:center;
    min-height:44px;padding:0 22px;border-radius:100px;cursor:pointer;
    background:transparent;color:var(--dim);border:1px solid var(--line);
    transition:color .18s ease,border-color .18s ease;
  }
  .acts button:hover,.file:hover span{color:var(--ball);border-color:var(--ball-dim)}
  /* The native file input is unstyleable, so the label carries the design and the input is
     hidden — not removed, so it keeps its keyboard behaviour. */
  .file input{position:absolute;opacity:0;width:0;height:0}
  .file input:focus-visible + span{outline:2px solid var(--ball);outline-offset:3px}
  .file input:disabled + span{opacity:.6;cursor:default}
  .note{margin-top:14px;font-size:.86rem;color:var(--dim);font-style:italic}
  .msg{
    margin-top:14px;font-family:'Space Mono',monospace;font-size:.74rem;
    letter-spacing:.1em;text-transform:uppercase;color:var(--ball);
  }
  .err{margin-top:14px;font-size:.9rem;color:var(--flag)}
  .warn{
    margin-top:20px;padding:16px 18px;border:1px solid var(--flag);
    border-radius:14px;background:var(--flag-wash);
  }
  .warn .eyebrow{color:var(--flag)}
  .warn p{font-size:.92rem;margin-top:8px}
  .warn button{
    margin-top:14px;
    font-family:'Space Mono',monospace;font-size:.72rem;letter-spacing:.12em;text-transform:uppercase;
    min-height:44px;padding:0 20px;border-radius:100px;cursor:pointer;
    background:transparent;color:var(--flag);border:1px solid var(--flag);
  }

  @media (prefers-reduced-motion:reduce){
    .acts button,.file span{transition:none}
  }
</style>
