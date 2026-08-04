<script lang="ts">
  import SessionForm from '../lib/components/SessionForm.svelte'
  import SiteFooter from '../lib/components/SiteFooter.svelte'
</script>

<section class="log reveal" aria-labelledby="log-title">
  <span class="eyebrow">Practice log</span>
  <h1 id="log-title">Log a session</h1>
  <p class="sub">Today's drills are already ticked. Change what you actually did, then save.</p>
  <SessionForm />
</section>
<SiteFooter />

<style>
  .log{margin-top:40px}
  /* The hero h1 is the poster treatment and belongs to the plan page. A form page takes the
     section h2 scale instead — see docs/design.md section 2. */
  .log h1{font-size:clamp(1.5rem,3.6vw,2.15rem);font-weight:800;margin:10px 0 6px}
  .log .sub{color:var(--dim);font-size:.95rem;max-width:60ch}
</style>
