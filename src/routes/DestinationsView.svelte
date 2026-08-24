<script lang="ts">
  import AccessTag from '../lib/components/AccessTag.svelte'
  import CourseMap from '../lib/components/CourseMap.svelte'
  import DestinationFilters from '../lib/components/DestinationFilters.svelte'
  import DestinationMark from '../lib/components/DestinationMark.svelte'
  import SectionHead from '../lib/components/SectionHead.svelte'
  import SiteFooter from '../lib/components/SiteFooter.svelte'
  import { COURSES, RANKING_SOURCE } from '../lib/domain/courses'
  import { countOptions, emptyFilter, filterCourses } from '../lib/domain/courseFilter'
  import { feeLabel, spreadCoincident } from '../lib/domain/destinations'
  import { router } from '../lib/stores/router.svelte'
  import { sessions } from '../lib/stores/sessions.svelte'

  // `COURSES` is authored in rank order and nothing here sorts. The fee wording — and in
  // particular the dash that an absent fee renders as — comes from `feeLabel`, not from here;
  // every filtering decision comes from `courseFilter.ts`. This file renders.

  /**
   * The marks, straight from the store that owns the app's only `Repository` — no component
   * reaches storage itself. Empty until the first load resolves, and empty again if the store
   * could not be asked, so the hundred always render; they simply carry no tags.
   */
  const marks = $derived(sessions.destinations)

  /**
   * Every group starts empty, which means **no constraint** rather than "match nothing", so the
   * page opens on all one hundred. Held here and not in the URL or the store: query parameters
   * would reach `resolvePath()` and the generated `dist/404.html`, which is its own change with
   * its own deploy risk.
   */
  let filter = $state(emptyFilter())

  const visible = $derived(filterCourses(COURSES, marks, filter))

  /**
   * Counted against the **whole** hundred, not against `visible` — each group is blind to its own
   * selection, so picking TAS does not drop every other state to zero.
   */
  const counts = $derived(countOptions(COURSES, marks, filter))

  /**
   * Display positions for whatever survived the filter, so the map and the list can never
   * disagree about which courses exist.
   *
   * Seven courses share three coordinates, so without this the chips underneath cannot be
   * clicked. `courses.ts` is never edited to fix that — a fabricated latitude beside researched
   * ones is indistinguishable from them six months later.
   */
  const pins = $derived(spreadCoincident(visible))
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

  <DestinationFilters bind:filter {counts} shown={visible.length} total={COURSES.length} />

  <!-- Drawn over the list, and it hides itself if Leaflet or the tile host fails. The list below
       is the primary content and does not know or care whether the map arrived. Same `pins` the
       list is built from, so the two can never disagree. -->
  <CourseMap {pins} {marks} />

  <ol class="courses">
    {#each visible as course (course.slug)}
      <li>
        <!-- `data-state` drives both the spine and the tinted code from CSS, so no colour is
             named in markup — the same rule that took the hardcoded hexes out of the hero SVG. -->
        <a
          class="course"
          data-state={course.state}
          href={router.href('course', course.slug)}
          onclick={(event) => router.onNavClick(event, 'course', course.slug)}
        >
          <span class="rank">{course.rank}</span>
          <span class="who">
            <span class="named">
              <span class="name">{course.name}</span>
              <!-- Rendered only where a mark exists. "No opinion" is an absent key, so it has
                   nothing to say and takes no space. -->
              {#if marks[course.slug]}
                <DestinationMark status={marks[course.slug].status} />
              {/if}
            </span>
            <!-- Only the state code takes the hue. Tinting the suburb too would spend `--dim`'s
                 role on decoration, and the suburb is not what the colour encodes. -->
            <span class="where">{course.suburb} · <span class="st">{course.state}</span></span>
          </span>
          <AccessTag access={course.access} />
          <!-- A dash, never "Free" and never "$0" — 40 of the hundred publish no visitor rate. -->
          <span class="fee" class:none={course.greenFee === undefined}>{feeLabel(course)}</span>
        </a>
      </li>
    {/each}
  </ol>

  <!-- An empty result is a real answer, and the filter bar above stays on screen so there is
       always a way back. A blank page with no controls is the failure mode. -->
  {#if visible.length === 0}
    <p class="none">
      No course matches every filter you've set. Loosen one — the number on each option says how
      many you would get back.
    </p>
  {/if}

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
    /* The state spine. A thickened left border rather than a pseudo-element, so it follows the
       card's radius for free and cannot drift out of alignment with it. */
    border-left-width:4px;border-left-color:var(--st,var(--line));
  }
  /* `border-color` is a shorthand and resets all four sides, so the spine has to be restated
     here or hovering a row would grey it out. */
  .course:hover{
    border-color:var(--line-hover);border-left-color:var(--st,var(--line-hover));
    transform:translateY(-2px);
  }

  /* One local custom property per state, read by both the spine and the code below it. Each
     token is defined in app.css and documented in design.md §1 — never a literal here. */
  .course[data-state='NSW']{--st:var(--st-nsw)}
  .course[data-state='VIC']{--st:var(--st-vic)}
  .course[data-state='QLD']{--st:var(--st-qld)}
  .course[data-state='SA']{--st:var(--st-sa)}
  .course[data-state='WA']{--st:var(--st-wa)}
  .course[data-state='TAS']{--st:var(--st-tas)}
  .course[data-state='ACT']{--st:var(--st-act)}
  /* No NT rule and no --st-nt. No NT course is in the Top 100; the fallback above leaves such a
     row with a --line spine and a --dim code, which reads as "no state colour" rather than as a
     wrong one. */

  .rank{font-family:'Space Mono',monospace;font-size:.8rem;color:var(--ball);text-align:right}
  .who{display:flex;flex-direction:column;gap:2px;min-width:0}
  /* Wraps rather than squeezing the name: the tag is the answer to "which ones have I picked",
     and a hundred-row list on a phone has no spare width to give it. */
  .named{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;min-width:0}
  .name{font-size:.98rem;line-height:1.25}
  .where{
    font-family:'Space Mono',monospace;font-size:.66rem;letter-spacing:.08em;
    text-transform:uppercase;color:var(--dim);
  }
  /* Colour is never the only signal — the code still spells the state out, exactly as it did
     before it was tinted. See design.md §6. */
  .st{color:var(--st,var(--dim))}
  .fee{
    font-family:'Space Mono',monospace;font-size:.72rem;color:var(--chalk);
    text-align:right;line-height:1.35;
  }
  /* The dash is an absence, not a price. It should not read with the weight of one. */
  .fee.none{color:var(--dim)}

  /* An absence of results, not an error: `--dim` and the panel surface, never `--flag`. Nothing
     about a narrow filter is a fault. */
  .none{
    background:var(--card);border:1px dashed var(--line);border-radius:12px;
    padding:20px 18px;color:var(--dim);font-size:.92rem;max-width:60ch;
  }

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
