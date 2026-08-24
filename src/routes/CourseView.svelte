<script lang="ts">
  import AccessTag from '../lib/components/AccessTag.svelte'
  import SiteFooter from '../lib/components/SiteFooter.svelte'
  import { RANKING_SOURCE } from '../lib/domain/courses'
  import { DESTINATION_ACTIONS, courseBySlug, feeLabel } from '../lib/domain/destinations'
  import type { DestinationStatus } from '../lib/domain/types'
  import { router } from '../lib/stores/router.svelte'
  import { sessions } from '../lib/stores/sessions.svelte'

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

  /**
   * The mark on this course, or `undefined` for no opinion. Read through the store, which owns
   * the app's only `Repository` — no component reaches `localStorage` or `fetch` itself.
   */
  const marked = $derived(sessions.destinationStatus(slug))

  let saving = $state(false)
  let saveError = $state<string | null>(null)

  /**
   * Pressing the status a course already has removes the mark: un-marking **deletes the key**,
   * rather than storing a third "none" status that would then have to be kept in step with it.
   *
   * The failure is shown, never swallowed. A write that silently did nothing is the failure mode
   * this whole storage layer exists to prevent, and between merging this and redeploying
   * `infra/` by hand it is exactly what `PUT /destinations` does — so the message has to reach
   * the person tapping the button.
   */
  async function toggle(status: DestinationStatus): Promise<void> {
    if (saving) return
    saving = true
    saveError = null
    try {
      await sessions.setDestination(slug, marked === status ? null : status)
    } catch (error) {
      saveError =
        error instanceof Error
          ? `That mark did not save. ${error.message}`
          : 'That mark did not save.'
    } finally {
      saving = false
    }
  }
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

    <div class="mark" role="group" aria-label="Your mark on this course">
      {#each ['want', 'played'] as const as status (status)}
        <button
          type="button"
          class="mark-btn"
          data-status={status}
          aria-pressed={marked === status}
          disabled={saving}
          onclick={() => toggle(status)}
        >
          {DESTINATION_ACTIONS[status]}
        </button>
      {/each}
    </div>
    {#if saveError}
      <p class="mark-error" role="alert">{saveError}</p>
    {/if}

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
  /* Nothing here is a fault, so `--flag` appears nowhere. `--ball` means the goal, and a course
     you intend to play is exactly that; `--home` is the one green that carries meaning rather
     than depth. The pressed state is a fill, not a tint — colour is never the only signal, and
     `aria-pressed` carries it for anyone not seeing either. */
  .mark{display:flex;flex-wrap:wrap;gap:10px;margin-top:20px}
  .mark-btn{
    font-family:'Space Mono',monospace;font-size:.66rem;letter-spacing:.16em;
    text-transform:uppercase;cursor:pointer;
    display:flex;align-items:center;justify-content:center;
    /* 44px, because this gets used outdoors, one-handed — design.md §6. */
    min-height:44px;padding:0 20px;border-radius:100px;
    background:transparent;color:var(--dim);border:1px solid var(--line);
    transition:color .18s ease,border-color .18s ease,background-color .18s ease;
  }
  .mark-btn:hover:not(:disabled){color:var(--chalk);border-color:var(--line-hover)}
  .mark-btn:disabled{opacity:.6;cursor:default}
  .mark-btn[data-status='want'][aria-pressed='true']{
    background:var(--ball);border-color:var(--ball);color:var(--bg);
  }
  .mark-btn[data-status='played'][aria-pressed='true']{
    background:var(--home);border-color:var(--home);color:var(--bg);
  }
  /* `--flag` here and nowhere else on this page: a save that did not happen IS a fault. */
  .mark-error{margin-top:10px;font-size:.88rem;color:var(--flag);max-width:60ch}

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
    .links a,.mark-btn{transition:none}
  }
</style>
