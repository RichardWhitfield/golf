<script lang="ts">
  // `.sec-head` styles live in app.css — the section scaffold is shared page furniture.
  let { idx, title }: { idx: string; title: string } = $props()
</script>

<div class="sec-head"><span class="idx">{idx}</span><h2>{title}</h2></div>
