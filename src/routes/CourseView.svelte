<script lang="ts">
  import AccessTag from '../lib/components/AccessTag.svelte'
  import SiteFooter from '../lib/components/SiteFooter.svelte'
  import { RANKING_SOURCE } from '../lib/domain/courses'
  import { courseBySlug, feeLabel } from '../lib/domain/destinations'
  import { router } from '../lib/stores/router.svelte'

  let { slug }: { slug: string } = $props()

  /**
   * `undefined` for a slug that names no course — never a nearest match.
   *
   * The router resolved this path by *shape*, so an address that looks like a course but names
   * none arrives here rather than being swallowed. It is answered in words below: redirecting
   * would leave someone who typed a real club's name on the plan page wondering what happened,
   * and throwing would blank a page that has something useful to say.
   */
  const course = $derived(courseBySlug(slug))
</script>

{#if course === undefined}
  <section class="missing reveal" aria-labelledby="missing-title">
    <span class="eyebrow">Destinations</span>
    <h1 id="missing-title">Not in the Top 100</h1>
    <p class="sub">
      Nothing in the 2026 ranking has the address <span class="mono">/destinations/{slug}</span>.
      It may be spelled differently, or it may not be on the list.
    </p>
    <p class="sub">
      <a
        href={router.href('destinations')}
        onclick={(event) => router.onNavClick(event, 'destinations')}>Back to all hundred</a
      >
    </p>
  </section>
{:else}
  <section class="course reveal" aria-labelledby="course-title">
    <a
      class="back"
      href={router.href('destinations')}
      onclick={(event) => router.onNavClick(event, 'destinations')}>← All hundred</a
    >
    <span class="eyebrow">No. {course.rank} · {course.state}</span>
    <h1 id="course-title">{course.name}</h1>
    <p class="where">{course.suburb}, {course.state}</p>

    <p class="summary">{course.summary}</p>

    <dl class="facts">
      <div class="fact">
        <dt>Architects</dt>
        <dd>
          {#if course.architects.length > 0}
            <ul class="architects">
              {#each course.architects as architect (architect)}
                <li>{architect}</li>
              {/each}
            </ul>
          {:else}
            <span class="none">—</span>
          {/if}
        </dd>
      </div>

      <div class="fact">
        <dt>Access</dt>
        <dd>
          <AccessTag access={course.access} />
          {#if course.accessNote}
            <!-- Always shown, and it is the whole answer where access is `unknown`: it says what
                 is believed and that it could not be confirmed. -->
            <p class="note">{course.accessNote}</p>
          {/if}
        </dd>
      </div>

      <div class="fact">
        <dt>Green fee</dt>
        <dd>
          <!-- Dated, never current. An absent fee is a dash — never "Free", never "$0". -->
          <p class="fee" class:none={course.greenFee === undefined}>{feeLabel(course)}</p>
          {#if course.greenFee?.note}
            <p class="note">{course.greenFee.note}</p>
          {:else if course.greenFee === undefined}
            <p class="note">The club publishes no visitor rate that could be confirmed.</p>
          {/if}
        </dd>
      </div>
    </dl>

    <p class="links">
      {#if course.site}
        <a href={course.site} rel="noreferrer">The club's site</a>
      {/if}
      {#if course.visitorUrl}
        <a href={course.visitorUrl} rel="noreferrer">Visitor rates</a>
      {/if}
      <a href={RANKING_SOURCE} rel="noreferrer">The 2026 ranking</a>
    </p>
  </section>
{/if}

<SiteFooter />

<style>
  .course,.missing{margin-top:40px}
  /* The hero h1 belongs to the plan page. This takes the section h2 scale — design.md §2. */
  .course h1,.missing h1{font-size:clamp(1.5rem,3.6vw,2.15rem);font-weight:800;margin:10px 0 6px}
  .missing .sub{color:var(--dim);font-size:.95rem;max-width:60ch}
  .missing .sub a,.back{color:var(--ball)}
  .mono{font-family:'Space Mono',monospace;color:var(--chalk)}

  /* `block` with a fitted width, not `inline-block`: the eyebrow below is itself inline-block,
     and the two ran together on one line. */
  .back{
    display:block;width:fit-content;margin-bottom:18px;text-decoration:none;
    font-family:'Space Mono',monospace;font-size:.66rem;letter-spacing:.16em;
    text-transform:uppercase;
    /* 44px without changing the layout — design.md §6. The text box is ~17px, so the overhang
       carries the rest. Symmetric is safe here: nothing sits above but the nav's bottom padding
       and this section's 40px top margin. */
    position:relative;
  }
  .back::after{content:'';position:absolute;inset:-14px 0}

  .where{
    font-family:'Space Mono',monospace;font-size:.72rem;letter-spacing:.16em;
    text-transform:uppercase;color:var(--dim);
  }
  .summary{margin-top:18px;max-width:60ch}

  .facts{margin-top:32px;display:grid;gap:16px}
  .fact{
    background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px;
  }
  .fact dt{
    font-family:'Space Mono',monospace;font-size:.66rem;letter-spacing:.16em;
    text-transform:uppercase;color:var(--ball);margin-bottom:10px;
  }
  .architects{list-style:none;display:grid;gap:4px;font-size:.94rem}
  .fee{font-family:'Space Mono',monospace;font-size:1.05rem;color:var(--chalk)}
  .fee.none,.none{color:var(--dim)}
  .note{margin-top:8px;font-size:.88rem;color:var(--dim);max-width:70ch}

  .links{display:flex;flex-wrap:wrap;gap:10px;margin-top:28px}
  .links a{
    font-family:'Space Mono',monospace;font-size:.66rem;letter-spacing:.16em;
    text-transform:uppercase;text-decoration:none;color:var(--dim);
    display:flex;align-items:center;padding:12px 16px;min-height:44px;border-radius:100px;
    border:1px solid var(--line);
    transition:color .18s ease,border-color .18s ease;
  }
  .links a:hover{color:var(--chalk);border-color:var(--line-hover)}

  @media (prefers-reduced-motion:reduce){
    .links a{transition:none}
  }
</style>
