<script lang="ts">
  const WATCH_OUTS = [
    {
      lead: "Don't overcook it.",
      body: 'Pulling or hooking means the path has gone too far in-to-out, or the face is shutting. Ease off the "draw" exaggeration and let the number settle near neutral.',
    },
    {
      lead: 'Fatigue equals slice.',
      body: "Tiredness makes you rush and revert to arms — that's why Monday was worse. If a session's going sideways, do three step drills and finish on a good feel.",
    },
    {
      lead: 'Trust the number, not the day.',
      body: 'Ball flight varies. The path trend over a session is the honest measure of progress.',
    },
  ]
</script>

<section>
  <div class="warn">
    <span class="eyebrow">Watch-outs</span>
    <ul>
      {#each WATCH_OUTS as item (item.lead)}
        <li><strong>{item.lead}</strong> {item.body}</li>
      {/each}
    </ul>
  </div>
</section>

<style>
  .warn{border:1px solid var(--flag);border-radius:14px;padding:26px 28px;background:var(--flag-wash)}
  .warn .eyebrow{color:var(--flag)}
  .warn ul{list-style:none;margin-top:16px;display:flex;flex-direction:column;gap:14px}
  .warn li{padding-left:22px;position:relative;font-size:.98rem}
  .warn li::before{content:"";position:absolute;left:0;top:.5em;width:9px;height:11px;
    background:var(--flag);clip-path:polygon(0 0,100% 22%,0 44%);border-radius:1px}
  .warn li strong{color:var(--flag);font-weight:600}
</style>
