<script lang="ts">
  import AccessTag from '../lib/components/AccessTag.svelte'
  import CourseMap from '../lib/components/CourseMap.svelte'
  import SectionHead from '../lib/components/SectionHead.svelte'
  import SiteFooter from '../lib/components/SiteFooter.svelte'
  import { COURSES, RANKING_SOURCE } from '../lib/domain/courses'
  import { feeLabel, spreadCoincident } from '../lib/domain/destinations'
  import { router } from '../lib/stores/router.svelte'

  // `COURSES` is authored in rank order, so there is nothing to sort. The fee wording — and in
  // particular the dash that an absent fee renders as — comes from `feeLabel`, not from here.

  /**
   * Display positions, derived every render. Seven courses share three coordinates, so without
   * this the chips underneath cannot be clicked. `courses.ts` is never edited to fix that — a
   * fabricated latitude beside researched ones is indistinguishable from them six months later.
   */
  const pins = spreadCoincident(COURSES)
</script>

<section class="dest reveal" aria-labelledby="dest-title">
  <span class="eyebrow">Destinations</span>
  <h1 id="dest-title">Australia's Top 100</h1>
  <p class="sub">
    Golf Australia's 2026 ranking, with what it costs to play each one and whether a visitor can.
    Access and fees are a dated snapshot, checked by hand — never a live feed.
  </p>
</section>

<section id="courses">
  <SectionHead idx="01" title="The hundred" />

  <!-- Drawn over the list, and it hides itself if Leaflet or the tile host fails. The list below
       is the primary content and does not know or care whether the map arrived. -->
  <CourseMap {pins} />

  <ol class="courses">
    {#each COURSES as course (course.slug)}
      <li>
        <a
          class="course"
          href={router.href('course', course.slug)}
          onclick={(event) => router.onNavClick(event, 'course', course.slug)}
        >
          <span class="rank">{course.rank}</span>
          <span class="who">
            <span class="name">{course.name}</span>
            <span class="where">{course.suburb} · {course.state}</span>
          </span>
          <AccessTag access={course.access} />
          <!-- A dash, never "Free" and never "$0" — 40 of the hundred publish no visitor rate. -->
          <span class="fee" class:none={course.greenFee === undefined}>{feeLabel(course)}</span>
        </a>
      </li>
    {/each}
  </ol>

  <p class="aid-note">
    Ranking from <a href={RANKING_SOURCE} rel="noreferrer">Golf Australia's Top 100 for 2026</a>.
    Summaries are written for this site; the panel's own commentary is not reproduced.
  </p>
</section>

<SiteFooter />

<style>
  .dest{margin-top:40px}
  /* The hero h1 belongs to the plan page. This takes the section h2 scale — design.md §2. */
  .dest h1{font-size:clamp(1.5rem,3.6vw,2.15rem);font-weight:800;margin:10px 0 6px}
  .dest .sub{color:var(--dim);font-size:.95rem;max-width:60ch}

  .courses{list-style:none;display:grid;gap:8px}
  .course{
    display:grid;grid-template-columns:34px 1fr auto auto;align-items:center;gap:14px;
    background:var(--card);border:1px solid var(--line);border-radius:12px;padding:12px 14px;
    text-decoration:none;color:var(--chalk);
    transition:border-color .18s ease,transform .18s ease;
  }
  .course:hover{border-color:var(--line-hover);transform:translateY(-2px)}

  .rank{font-family:'Space Mono',monospace;font-size:.8rem;color:var(--ball);text-align:right}
  .who{display:flex;flex-direction:column;gap:2px;min-width:0}
  .name{font-size:.98rem;line-height:1.25}
  .where{
    font-family:'Space Mono',monospace;font-size:.66rem;letter-spacing:.08em;
    text-transform:uppercase;color:var(--dim);
  }
  .fee{
    font-family:'Space Mono',monospace;font-size:.72rem;color:var(--chalk);
    text-align:right;line-height:1.35;
  }
  /* The dash is an absence, not a price. It should not read with the weight of one. */
  .fee.none{color:var(--dim)}

  .aid-note a{color:var(--ball)}

  @media (max-width:760px){
    .course{
      grid-template-columns:34px 1fr;
      grid-template-areas:'rank who' '. access' '. fee';
      row-gap:8px;
    }
    .rank{grid-area:rank;align-self:start;padding-top:2px}
    .who{grid-area:who}
    .course :global(.access){grid-area:access;justify-self:start}
    .fee{grid-area:fee;text-align:left}
  }

  @media (prefers-reduced-motion:reduce){
    /* Suppress the movement, not the feedback: the border still brightens on hover. */
    .course{transition:border-color .18s ease}
    .course:hover{transform:none}
  }
</style>
