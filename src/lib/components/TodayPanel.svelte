<script lang="ts">
  import { DAY_NAMES, DAY_ORDER, WEEK } from '../domain/plan'
  import { drill } from '../domain/drills'
  import { formatDayLabel, resolveDayKey } from '../domain/today'
  import DrillCard from './DrillCard.svelte'

  /** The real day in Sydney, and the day being viewed — they differ once you browse the daybar. */
  let actualToday = $state(resolveDayKey())
  let selected = $state(resolveDayKey())

  const day = $derived(WEEK[selected])
  const isToday = $derived(selected === actualToday)

  // Keep a page left open overnight honest: roll to the new day, and follow it only if the
  // reader hadn't navigated away from today.
  $effect(() => {
    const timer = setInterval(() => {
      const key = resolveDayKey()
      if (key === actualToday) return
      const wasOnToday = selected === actualToday
      actualToday = key
      if (wasOnToday) selected = key
    }, 60000)
    return () => clearInterval(timer)
  })
</script>

<section class="today reveal" id="today" aria-labelledby="today-title">
  <div class="today-head">
    <span class="eyebrow">{isToday ? `Today · ${DAY_NAMES[selected]}` : DAY_NAMES[selected]}</span>
    <span class="today-date">{isToday ? formatDayLabel() : ''}</span>
  </div>
  <h2 id="today-title">{day.title}</h2>
  <p class="sub">{day.sub}</p>
  <div class="daybar" role="group" aria-label="Choose a day">
    {#each DAY_ORDER as key (key)}
      <button
        type="button"
        aria-pressed={selected === key ? 'true' : 'false'}
        aria-label={DAY_NAMES[key]}
        class:is-today={key === actualToday}
        onclick={() => (selected = key)}
      >{key.toUpperCase()}</button>
    {/each}
  </div>
  <button class="today-reset" type="button" hidden={isToday} onclick={() => (selected = actualToday)}>Back to today</button>
  <div class="grid">
    {#each day.drills as id (id)}
      <DrillCard drill={drill(id)} />
    {/each}
  </div>
  <a class="more" href={day.moreHref ?? '#drills'}>{day.moreText ?? 'All drills ↓'}</a>
</section>

<style>
  .today{
    margin:40px 0 0;padding:24px 26px 26px;border-radius:16px;
    background:linear-gradient(100deg,var(--panel),var(--panel-2));
    border:1px solid var(--line);border-left:3px solid var(--ball);
  }
  .today-head{display:flex;justify-content:space-between;align-items:baseline;gap:12px;flex-wrap:wrap}
  .today-date{font-family:'Space Mono',monospace;font-size:.76rem;color:var(--dim);letter-spacing:.06em}
  .today h2{font-size:clamp(1.35rem,3vw,1.8rem);font-weight:800;margin:10px 0 6px}
  .today .sub{color:var(--dim);font-size:.95rem;max-width:60ch}
  .today .grid{margin-top:20px}
  .today .more{
    display:inline-block;margin-top:16px;font-family:'Space Mono',monospace;
    font-size:.76rem;letter-spacing:.1em;text-transform:uppercase;
    color:var(--ball);text-decoration:none;border-bottom:1px solid var(--ball-dim);padding-bottom:2px;
    position:relative;
  }
  /* This gets tapped outdoors, so expand the hit area to 44px with a pseudo-element rather
     than min-height, leaving the ported layout untouched. The pseudo-element resolves against
     the *padding* box (21.4px — the 22.4px border box less the 1px underline), not the border
     box, so the inset must clear 44px from 21.4px, not from 22.4px: 21.4 + 2×12 = 45.4px.
     The 16px margin above and the panel's 26px bottom padding both absorb the 12px overhang. */
  .today .more::after{content:'';position:absolute;inset:-12px 0}
  .today .more:hover{border-bottom-color:var(--ball)}

  /* ---- day bar ---- */
  .daybar{display:flex;gap:6px;margin-top:18px;flex-wrap:wrap}
  .daybar button{
    font-family:'Space Mono',monospace;font-size:.7rem;letter-spacing:.1em;
    background:transparent;color:var(--dim);border:1px solid var(--line);
    border-radius:100px;padding:10px 16px;min-height:44px;cursor:pointer;
    transition:color .18s ease,border-color .18s ease;
  }
  .daybar button:hover{color:var(--chalk);border-color:var(--line-hover)}
  .daybar button[aria-pressed="true"]{color:var(--bg);background:var(--ball);border-color:var(--ball);font-weight:700}
  .daybar button.is-today{border-color:var(--ball-dim);color:var(--ball)}
  .daybar button.is-today[aria-pressed="true"]{color:var(--bg)}
  .today-reset{
    background:none;border:none;color:var(--dim);cursor:pointer;padding:4px 0;
    font-family:'Space Mono',monospace;font-size:.72rem;letter-spacing:.08em;
    text-transform:uppercase;text-decoration:underline;text-underline-offset:3px;
    position:relative;
  }
  /* 25px padding box. Expanded downward only: the daybar sits directly above with no gap, so a
     symmetric overhang would swallow taps meant for the bottom row of day buttons. 25 + 19 =
     44px exactly, and the 20px margin above `.grid` absorbs the 19px with 1px to spare. */
  .today-reset::after{content:'';position:absolute;inset:0 0 -19px}
  .today-reset:hover{color:var(--ball)}
  .today-reset[hidden]{display:none}

  @media (max-width:760px){
    /* `.wrap` becomes a flex column at this width (app.css) — today jumps to the top. */
    .today{order:-1;margin-top:0}
  }

  /* Scoped for the same specificity reason as DrillCard. Colour still changes on hover;
     only the easing is removed. */
  @media (prefers-reduced-motion:reduce){
    .daybar button{transition:none}
  }
</style>
