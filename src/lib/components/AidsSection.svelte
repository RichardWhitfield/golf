<script lang="ts">
  import SectionHead from './SectionHead.svelte'

  // Equipment recommendations, not plan content — one consumer, so they stay local
  // rather than going into lib/domain/.
  const AIDS = [
    {
      rank: 1,
      title: 'Alignment sticks',
      body: 'Cheap, essential, and they power half the drills here — gates, the angled shallowing stick, path and alignment checks. Buy these first.',
    },
    {
      rank: 2,
      title: 'Orange Whip Trainer',
      body: 'Weighted, flexible shaft you can swing outdoors in a small space. The floppy shaft punishes an arms-first move and rewards proper sequencing.',
    },
    {
      rank: 3,
      title: 'Lag Shot 7-iron',
      body: 'A whippy training club you can actually hit airflow balls with — the one aid that gives you real feedback outdoors between Monday sessions. Come over the top and you feel it instantly.',
    },
  ]
</script>

<section>
  <SectionHead idx="05" title="Training aids" />
  <div class="aids">
    {#each AIDS as aid (aid.rank)}
      <div class="aid">
        <div class="rank">{aid.rank}</div>
        <div><h3>{aid.title}</h3><p>{aid.body}</p></div>
      </div>
    {/each}
  </div>
  <p class="aid-note">Optional, later: a swing-plane trainer like the Tour Striker PlaneMate or a GravityFit setup — a bigger investment, and not needed for these three weeks.</p>
</section>

<style>
  .aids{display:flex;flex-direction:column;gap:12px}
  .aid{display:grid;grid-template-columns:44px 1fr;gap:18px;align-items:center;
    background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:18px 22px}
  .aid .rank{font-family:'Archivo',sans-serif;font-weight:800;font-size:1.5rem;color:var(--ball);text-align:center}
  .aid h3{font-size:1.05rem;font-weight:700;margin-bottom:3px}
  .aid p{font-size:.9rem;color:var(--dim)}
</style>
