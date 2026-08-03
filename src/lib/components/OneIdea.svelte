<script lang="ts">
  import SectionHead from './SectionHead.svelte'
</script>

<section>
  <SectionHead idx="01" title="The one idea behind everything" />
  <p class="idea"><strong>Lower body leads, and the club drops into the slot.</strong> The step drill already does this for you — it shifts pressure to your lead foot and gives the hips a head start, so the club falls to the inside instead of being thrown over the top. Every drill below recreates that step feeling standing still.</p>
</section>

<style>
  .idea{
    border-left:3px solid var(--ball);
    padding:6px 0 6px 24px;
    font-size:1.25rem;line-height:1.5;max-width:60ch;
  }
  .idea strong{color:var(--ball);font-weight:600}
</style>
