<script lang="ts">
  import { KPI } from '../domain/plan'
</script>

<div class="kpi reveal">
  <span class="label">{KPI.label}</span>
  <span class="now">{KPI.now}</span>
  <span class="arrow">→</span>
  <span class="goal">{KPI.goal}</span>
  <p class="note">{KPI.note}</p>
</div>

<style>
  .kpi{
    margin:44px 0;padding:30px 34px;border-radius:16px;
    background:linear-gradient(100deg,var(--panel),#193a2b);
    border:1px solid var(--line);
    display:flex;flex-wrap:wrap;align-items:center;gap:14px 30px;
  }
  .kpi .label{font-family:'Space Mono',monospace;font-size:.78rem;letter-spacing:.14em;text-transform:uppercase;color:var(--dim)}
  .kpi .now,.kpi .goal{font-family:'Space Mono',monospace;font-weight:700;font-size:1.9rem}
  /* --flag is the problem, --ball is the goal. Never invert. */
  .kpi .now{color:var(--flag)}
  .kpi .goal{color:var(--ball)}
  .kpi .arrow{color:var(--dim);font-size:1.4rem}
  .kpi .note{flex-basis:100%;color:var(--dim);font-size:.95rem;margin-top:2px}
</style>
