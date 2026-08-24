<script lang="ts">
  import type { Map as LeafletMap, Marker } from 'leaflet'
  import {
    DESTINATION_TAGS,
    clusterProjected,
    type MapPin,
    type ProjectedPin,
  } from '../domain/destinations'
  import type { DestinationNotes, DestinationStatus } from '../domain/types'
  import { router } from '../stores/router.svelte'

  let { pins, marks }: { pins: MapPin[]; marks: DestinationNotes } = $props()

  /**
   * The map is drawn **over** a list that already works. Nothing here may block or blank the
   * page — the same rule as `sync()` never being awaited and `StaleNotice` existing, applied to
   * the first third-party network request this site has ever made on load.
   *
   * `failed` hides the container and leaves the list. It is set by three different failures:
   * Leaflet's chunk not arriving, the constructor throwing, and the tile host being unreachable.
   * A map with no basemap is not a degraded map — it is a scatter of dots on a blank rectangle,
   * which says less than the list does — so a dead tile host hides it too.
   */
  let failed = $state(false)
  let container = $state<HTMLDivElement>()

  /**
   * Expanded fills the viewport with CSS rather than through the Fullscreen API.
   *
   * **iOS Safari does not support the Fullscreen API on a `<div>`** — only on `<video>`. A native
   * implementation would have to hide its own button on the iPhone, which is the device most
   * likely to be holding this map. One code path that behaves identically on desktop, Android and
   * iPhone is worth more than true fullscreen on the two platforms that already have room.
   */
  let expanded = $state(false)
  let expandButton = $state<HTMLButtonElement>()

  /** Australia, whole. Authored, not fitted: a domain derived from the data is a moving target. */
  const CENTRE: [number, number] = [-27.5, 134]
  const ZOOM = 4

  /** Grid cell for clustering, in pixels. A little wider than the 44px chip, so two chips only
   *  merge once they would actually overlap. */
  const CELL_PX = 56

  const TILES = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
  const ATTRIBUTION =
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors ' +
    '&copy; <a href="https://carto.com/attributions">CARTO</a>'

  /**
   * The chip.
   *
   * Built as a real element rather than an HTML string so the logo's `error` listener is a
   * listener, not an inline attribute. The rank sits underneath the logo **always**: if the image
   * never arrives, removing it uncovers a number. That one path covers both failures — the two
   * courses with no logo at all, and a committed file that fails to decode. A broken-image icon
   * on a map is worse than a number.
   *
   * The `/` is load-bearing. `course.logo` is root-relative without one, and a bare `logos/x.png`
   * on `/destinations/kingston-heath` would resolve against `/destinations/`.
   */
  function chip(pin: MapPin, status: DestinationStatus | undefined): HTMLElement {
    const el = document.createElement('span')
    // The ring, and nothing else about the chip changes: a marked course is still the same club
    // in the same place. `--ball` for one you mean to play — the token means the goal — and
    // `--home` for one already behind you. **Never `--flag`**; nothing in a wishlist is a fault.
    el.className = status ? `chip chip-${status}` : 'chip'

    const rank = document.createElement('span')
    rank.className = 'chip-rank'
    rank.textContent = String(pin.course.rank)
    el.append(rank)

    if (pin.course.logo) {
      const img = document.createElement('img')
      img.src = `/${pin.course.logo}`
      img.alt = ''
      img.addEventListener('error', () => img.remove())
      el.append(img)
    }
    return el
  }

  function countChip(count: number): HTMLElement {
    const el = document.createElement('span')
    el.className = 'chip chip-cluster'
    const n = document.createElement('span')
    n.className = 'chip-rank'
    n.textContent = String(count)
    el.append(n)
    return el
  }

  /**
   * Everything the drawing effect needs, published once the map is alive.
   *
   * `$state.raw` on purpose: this holds a Leaflet `Map`, a `LayerGroup` and the Leaflet module
   * itself. A deep proxy over that wrapper buys nothing and the objects inside it are not plain,
   * so the reactivity that matters is the whole-value reassignment — which is exactly what raw
   * state gives.
   */
  interface Live {
    L: typeof import('leaflet')
    map: LeafletMap
    layer: import('leaflet').LayerGroup
    /** `prefers-reduced-motion`, read once with `matchMedia` and reused by `setView`. */
    still: boolean
  }
  let live = $state.raw<Live | undefined>(undefined)

  /**
   * **Build the map once.** This effect reads `container` and nothing else, so it does not re-run
   * when the filter changes the pins.
   *
   * That separation is the whole point of splitting it from the drawing effect below. A single
   * effect reading `pins` would tear the map down and rebuild it on every filter toggle, throwing
   * away the reader's zoom and pan — zoom into the Sandbelt, untick a state, and you are looking
   * at the whole continent again.
   */
  $effect(() => {
    const target = container
    if (!target) return

    let map: LeafletMap | undefined
    let cancelled = false

    /** Nothing has painted yet and tiles are erroring: the host is unreachable, not patchy. */
    let tilesLoaded = 0
    let tileErrors = 0

    const build = async () => {
      // Dynamic, and this is the point rather than a size optimisation: a static import puts
      // Leaflet in the bundle that renders the list, so a Leaflet that failed to parse would
      // take the list down with it. Split, the list is already on screen when this resolves.
      const L = await import('leaflet')
      await import('leaflet/dist/leaflet.css')
      if (cancelled) return

      // Leaflet animates pan and zoom from JS options, so a stylesheet media query cannot reach
      // it. Read the query here and hand the answer to the constructor.
      const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches

      map = L.map(target, {
        center: CENTRE,
        zoom: ZOOM,
        zoomAnimation: !still,
        fadeAnimation: !still,
        markerZoomAnimation: !still,
        attributionControl: true,
      })

      L.tileLayer(TILES, {
        attribution: ATTRIBUTION,
        maxZoom: 18,
        // CARTO's `{r}` placeholder, filled only where the screen can use the larger tile.
        detectRetina: false,
      })
        .on('tileload', () => {
          tilesLoaded += 1
        })
        .on('tileerror', () => {
          tileErrors += 1
          // Four failures with nothing ever painted is a dead host, not a missing tile at the
          // edge of the world. Hide the map; the list below has lost nothing.
          if (tilesLoaded === 0 && tileErrors >= 4) {
            failed = true
            // Cleared before the map is removed, so the drawing effect stops before its `map`
            // becomes a corpse rather than after.
            live = undefined
            map?.remove()
            map = undefined
          }
        })
        .addTo(map)

      live = { L, map, layer: L.layerGroup().addTo(map), still }
    }

    build().catch((error) => {
      // Never rethrow. A third-party script that did not arrive is not a reason to blank a page
      // whose primary content is already rendered underneath.
      console.error('Could not build the destinations map:', error)
      failed = true
    })

    return () => {
      cancelled = true
      live = undefined
      map?.remove()
      map = undefined
    }
  })

  /**
   * **Draw the markers.** Re-runs when the pins change, when the marks arrive, and when the map
   * is first built — never rebuilding the map itself, so a filter toggle leaves the view where
   * the reader put it.
   *
   * `pins` and `marks` are read synchronously at the top so the effect actually depends on them.
   * Reading either inside `draw()` would silently not track: `draw` runs from a Leaflet event,
   * long after this function returned.
   */
  $effect(() => {
    const current = pins
    const currentMarks = marks
    const active = live
    if (!active) return
    const { L, map, layer, still } = active

    const draw = () => {
      const projected: ProjectedPin[] = current.map((pin) => {
        const point = map.latLngToContainerPoint([pin.lat, pin.lon])
        return { pin, x: point.x, y: point.y }
      })

      layer.clearLayers()
      for (const cluster of clusterProjected(projected, CELL_PX)) {
        const at = map.containerPointToLatLng([cluster.x, cluster.y])
        const single = cluster.pins.length === 1 ? cluster.pins[0] : undefined
        const status = single ? currentMarks[single.course.slug]?.status : undefined
        // The mark is in the name as well as in the ring. A ring is colour alone, and colour is
        // never the only signal — design.md §6. A cluster carries no ring: which of the courses
        // under it is marked is a question only opening it can answer.
        const label = single
          ? `${single.course.name}, ${single.course.suburb}${
              status ? ` · ${DESTINATION_TAGS[status]}` : ''
            }`
          : `${cluster.pins.length} courses`

        const marker: Marker = L.marker(at, {
          icon: L.divIcon({
            html: single ? chip(single, status) : countChip(cluster.pins.length),
            className: 'chip-wrap',
            iconSize: [44, 44],
            iconAnchor: [22, 22],
          }),
          // Focusable, and Enter fires the click. Leaflet gives this for free; the accessible
          // name does not come free, so it is set on the element below.
          keyboard: true,
          title: label,
        })

        marker.on('click', () => {
          if (single) router.go('course', single.course.slug)
          // A cluster is a request to see what is under it. `animate` off under reduced
          // motion for the same reason the constructor options are.
          else map.setView(at, Math.min(map.getZoom() + 2, 14), { animate: !still })
        })

        marker.addTo(layer)
        const element = marker.getElement()
        if (element) {
          element.setAttribute('role', 'button')
          element.setAttribute('aria-label', label)
        }
      }
    }

    draw()
    map.on('moveend zoomend resize', draw)
    // Only the listener is removed. The map and its layer outlive this effect — they belong to
    // the effect above, and tearing them down here is what would reset the view.
    return () => {
      map.off('moveend zoomend resize', draw)
    }
  })

  /**
   * Escape collapses, and the body cannot scroll underneath while expanded.
   *
   * Both are torn down by the same cleanup, so there is no state in which the listener outlives
   * the expansion — a stray Escape handler that collapses an already-collapsed map is harmless,
   * but a body left permanently unscrollable is not.
   */
  $effect(() => {
    if (!expanded) return

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      expanded = false
      // Focus would otherwise be left on whichever marker the reader tabbed to, somewhere in a
      // map that just shrank. Put it back on the control that did it.
      expandButton?.focus()
    }
    window.addEventListener('keydown', onKey)

    // Restored rather than cleared: something else may own it by the time this unwinds.
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  })

  /**
   * Tell Leaflet the box changed.
   *
   * Without this the map keeps rendering tiles for its old size and expanding leaves a grey band
   * where the new space is. `requestAnimationFrame` so the measurement happens after the browser
   * has applied the class, not in the same frame that set it.
   */
  $effect(() => {
    const isExpanded = expanded
    const active = live
    if (!active) return

    const frame = requestAnimationFrame(() => {
      // `void` marks the read as deliberate: the effect depends on `expanded`, but the value is
      // not needed here — only the fact that it changed.
      void isExpanded
      active.map.invalidateSize({ animate: false })
    })
    return () => cancelAnimationFrame(frame)
  })

</script>

{#if !failed}
  <!-- Deliberately not `aria-hidden`. Leaflet gives every marker `tabindex="0"`, and a focusable
       control inside a hidden subtree is the worst of both: keyboard focus lands somewhere a
       screen reader has been told does not exist. The markers carry their own names instead, and
       clustering keeps the tab stops to the low dozens rather than a hundred. -->
  <div class="map-frame" class:expanded>
    <div class="map" bind:this={container}></div>
    <!-- A sibling of the map rather than a Leaflet control, so Leaflet's drag and zoom handlers
         never see it and focus management stays in Svelte. The label always names the state the
         button will move *to*, in words — never an icon alone. -->
    <button
      type="button"
      class="expand"
      bind:this={expandButton}
      onclick={() => (expanded = !expanded)}
    >
      {expanded ? 'Collapse map' : 'Expand map'}
    </button>
  </div>
{/if}

<style>
  .map-frame{
    position:relative;
    border:1px solid var(--line);border-radius:14px;overflow:hidden;
    margin-bottom:26px;background:var(--panel);
  }
  .map{height:clamp(320px,52vh,460px);width:100%}

  /* Fills the viewport. No transition anywhere in this block: a `position` change cannot be
     animated meaningfully, so the swap is instant and there is nothing for
     `prefers-reduced-motion` to suppress. */
  .map-frame.expanded{
    position:fixed;inset:0;z-index:900;
    margin:0;border-radius:0;border-width:0;
  }
  .map-frame.expanded .map{height:100%}

  /* Above Leaflet's own controls, which reach z-index 1000 inside the map. `.map-frame` is
     positioned, so this is measured against it and not against the page. */
  .expand{
    position:absolute;top:10px;right:10px;z-index:1100;
    font-family:'Space Mono',monospace;font-size:.6rem;letter-spacing:.14em;
    text-transform:uppercase;cursor:pointer;
    display:inline-flex;align-items:center;
    /* 44px, like every other control on this site. Used outdoors, one-handed — design.md §6. */
    min-height:44px;padding:0 14px;border-radius:100px;
    background:var(--card);color:var(--chalk);border:1px solid var(--line);
  }
  .expand:hover{background:var(--panel-2);color:var(--ball);border-color:var(--line-hover)}

  /* ---- Leaflet's own chrome, which ships light-themed ---- */
  .map-frame :global(.leaflet-container){background:var(--panel);font-family:'Inter',sans-serif}

  .map-frame :global(.leaflet-control-zoom a){
    background:var(--card);color:var(--chalk);border-color:var(--line);
    /* Leaflet's default is 26px. This is used outdoors, one-handed. */
    width:44px;height:44px;line-height:44px;font-size:1.2rem;
  }
  /* `:focus` as well as `:hover`: Leaflet's own `.leaflet-bar a:focus` paints `#f4f4f4`, so a
     keyboard user tabbing to the zoom control gets a light-grey flash without this. */
  .map-frame :global(.leaflet-control-zoom a:hover),
  .map-frame :global(.leaflet-control-zoom a:focus){background:var(--panel-2);color:var(--ball)}
  .map-frame :global(.leaflet-control-zoom a.leaflet-disabled){color:var(--dim);background:var(--bg)}
  .map-frame :global(.leaflet-bar){border-color:var(--line);box-shadow:none}

  /* Required attribution — restyled, never hidden. */
  .map-frame :global(.leaflet-control-attribution){
    background:var(--bg);color:var(--dim);
    font-family:'Space Mono',monospace;font-size:.58rem;letter-spacing:.04em;
    padding:3px 8px;
  }
  .map-frame :global(.leaflet-control-attribution a){color:var(--dim)}
  .map-frame :global(.leaflet-control-attribution a:hover){color:var(--chalk)}

  /* ---- the chip ---- */
  /* Built in JS, so Svelte's scoping class never reaches it: these must be :global. */
  .map-frame :global(.chip-wrap){background:none;border:none}
  .map-frame :global(.chip){
    display:grid;place-items:center;width:44px;height:44px;border-radius:100px;
    background:var(--card);border:1px solid var(--line);padding:4px;
  }
  .map-frame :global(.chip-wrap:hover .chip){border-color:var(--ball-dim)}

  /* A ring outside the chip, so the 44px hit target and the logo inside it are untouched.
     `box-shadow` rather than a wider border for the same reason — a border would eat the padding
     the logo sits in. */
  .map-frame :global(.chip-want){box-shadow:0 0 0 2px var(--ball)}
  .map-frame :global(.chip-played){box-shadow:0 0 0 2px var(--home)}

  /* A cluster count and a rank are both bare numbers, so the difference cannot be carried by a
     background tint alone. The second concentric ring is a shape signal: several, stacked. */
  .map-frame :global(.chip-cluster){background:var(--panel-2);border-color:var(--ball-dim);position:relative}
  .map-frame :global(.chip-cluster::after){
    content:'';position:absolute;inset:-4px;border-radius:100px;border:1px solid var(--line);
  }

  /* The rank sits under the logo and is uncovered when the image is removed. */
  .map-frame :global(.chip-rank){
    grid-area:1/1;font-family:'Space Mono',monospace;font-size:.76rem;color:var(--ball);
  }
  /* Rounded and inset, so a logo drawn on its own white background reads as a chip with a mark
     in it rather than as a white dot. Several of the hundred are exactly that. */
  .map-frame :global(.chip img){
    grid-area:1/1;width:100%;height:100%;object-fit:contain;border-radius:100px;
  }

  @media (max-width:760px){
    /* Taller on a phone: the column is narrow, so the map needs the height to say anything. */
    .map{height:clamp(360px,62vh,520px)}
  }
</style>
