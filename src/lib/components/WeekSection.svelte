<script lang="ts">
  import {
    DAY_NAMES,
    MONDAY_TIMELINE,
    OUTDOOR_BLOCK,
    OUTDOOR_DAYS,
    WEEK,
    WEEKEND,
  } from '../domain/plan'
  import SectionHead from './SectionHead.svelte'
</script>

<section id="week">
  <SectionHead idx="03" title="Your week" />
  <div class="week">
    <div class="block">
      <h3>{DAY_NAMES.mon}</h3>
      <div class="sub">{WEEK.mon.menuLabel}</div>
      <ul class="tl">
        {#each MONDAY_TIMELINE as item (item.title)}
          <li><span class="t">{item.time}</span><span class="d"><strong>{item.title}</strong><span>{item.detail}</span></span></li>
        {/each}
      </ul>
    </div>
    <div class="block">
      <h3>{OUTDOOR_BLOCK.title}</h3>
      <div class="sub">{OUTDOOR_BLOCK.sub}</div>
      <ul class="menu">
        {#each OUTDOOR_DAYS as key (key)}
          <li><span class="day" class:we={WEEKEND.includes(key)}>{key.toUpperCase()}</span><span>{WEEK[key].menuLabel}</span></li>
        {/each}
      </ul>
      <p class="aid-note">{OUTDOOR_BLOCK.note}</p>
    </div>
  </div>
</section>

<style>
  .week{display:grid;grid-template-columns:1.3fr 1fr;gap:24px;align-items:start}
  .block{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:24px 26px}
  .block h3{font-size:1.15rem;font-weight:700;margin-bottom:4px}
  .block .sub{font-family:'Space Mono',monospace;font-size:.74rem;color:var(--ball);letter-spacing:.1em;text-transform:uppercase;margin-bottom:18px}
  .tl{list-style:none;display:flex;flex-direction:column;gap:0}
  .tl li{display:grid;grid-template-columns:64px 1fr;gap:14px;padding:12px 0;border-top:1px solid var(--line)}
  .tl li:first-child{border-top:none;padding-top:0}
  .tl .t{font-family:'Space Mono',monospace;font-size:.82rem;color:var(--ball)}
  .tl .d strong{display:block;font-weight:600;font-size:.98rem}
  .tl .d span{color:var(--dim);font-size:.88rem}
  .menu{list-style:none;display:flex;flex-direction:column;gap:0}
  .menu li{display:grid;grid-template-columns:52px 1fr;gap:12px;padding:11px 0;border-top:1px solid var(--line);font-size:.92rem}
  .menu li:first-child{border-top:none;padding-top:0}
  .menu .day{font-family:'Space Mono',monospace;color:var(--ball);font-size:.82rem}
  .menu .day.we{color:var(--dim)}

  @media (max-width:760px){
    .week{grid-template-columns:1fr}
  }
</style>
