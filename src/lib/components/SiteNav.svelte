<script lang="ts">
  import { router, type Route } from '../stores/router.svelte'

  interface Item {
    route: Route
    label: string
  }

  interface Section extends Item {
    /** Every route that counts as "inside" this section, including the section's own. */
    routes: Route[]
    /** The second row, shown only while this section is current. Empty means it has none. */
    sub: Item[]
  }

  const SECTIONS: Section[] = [
    {
      route: 'plan',
      label: 'Practice',
      routes: ['plan', 'log', 'progress'],
      sub: [
        { route: 'plan', label: 'Plan' },
        { route: 'log', label: 'Log' },
        { route: 'progress', label: 'Progress' },
      ],
    },
    {
      route: 'destinations',
      label: 'Destinations',
      // A course detail is inside Destinations, so the primary link stays lit on the way down.
      routes: ['destinations', 'course'],
      sub: [],
    },
  ]

  const active = $derived(SECTIONS.find((s) => s.routes.includes(router.current)))

  /**
   * `aria-current="page"` belongs to the **deepest** link pointing at the current address, and
   * exactly one link may claim it. Inside Practice that is the sub-nav below, so the primary row
   * says `true` — current section, not current page — even on `/practice` where both links share
   * an href. Destinations has no second row, so its own link carries `page`.
   */
  function marker(section: Section): 'page' | 'true' | undefined {
    if (!section.routes.includes(router.current)) return undefined
    return section.sub.length === 0 && router.current === section.route ? 'page' : 'true'
  }
</script>

<nav class="sitenav" aria-label="Sections">
  <div class="row primary">
    {#each SECTIONS as section (section.route)}
      <a
        href={router.href(section.route)}
        aria-current={marker(section)}
        onclick={(event) => router.onNavClick(event, section.route)}
      >{section.label}</a>
    {/each}
  </div>

  {#if active && active.sub.length > 0}
    <!-- Only rendered inside its own section. A second row is a second thing competing for the
         top of a phone screen, above the Today panel that is why the site gets opened daily. -->
    <div class="row sub" aria-label={active.label}>
      {#each active.sub as item (item.route)}
        <a
          href={router.href(item.route)}
          aria-current={router.current === item.route ? 'page' : undefined}
          onclick={(event) => router.onNavClick(event, item.route)}
        >{item.label}</a>
      {/each}
    </div>
  {/if}
</nav>

<style>
  .sitenav{
    display:flex;flex-direction:column;align-items:flex-start;gap:2px;
    padding-bottom:20px;border-bottom:1px solid var(--line);
  }
  .row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}

  .sitenav a{
    font-family:'Space Mono',monospace;letter-spacing:.16em;
    text-transform:uppercase;text-decoration:none;
    display:flex;align-items:center;gap:8px;
    padding:12px 16px;min-height:44px;border-radius:100px;
    border:1px solid transparent;color:var(--dim);
    transition:color .18s ease,border-color .18s ease;
  }
  .primary a{font-size:.72rem}
  /* The tag scale — the smallest mono on the page — so the second row reads as subordinate
     without inventing a type size. The 44px target is unchanged; only the glyphs shrink. */
  .sub a{font-size:.62rem}

  .sitenav a:hover{color:var(--chalk);border-color:var(--line-hover)}
  .sitenav a[aria-current]{color:var(--ball)}
  /* The border marks the page you are on. The section link above it is lit but not outlined,
     so at a glance the outline still says "this one" rather than "one of these two". */
  .sitenav a[aria-current="page"]{border-color:var(--ball-dim)}

  @media (max-width:760px){
    /* `.wrap` is a flex column here and `.today` claims order:-1, so the nav must outrank it.
       Both rows live inside this one element, so the sub-nav sits under the primary row and
       above the Today panel rather than competing with it for the top of the screen. */
    .sitenav{order:-2;padding-bottom:14px}
  }

  @media (prefers-reduced-motion:reduce){
    .sitenav a{transition:none}
  }
</style>
