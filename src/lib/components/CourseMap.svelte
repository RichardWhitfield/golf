<script lang="ts">
  import type { Map as LeafletMap, Marker } from 'leaflet'
  import {
    DESTINATION_TAGS,
    clusterProjected,
    courseInitials,
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
   * listener, not an inline attribute.
   *
   * **A chip shows a logo or two initials — never both.** The two are mutually exclusive, and
   * that is the whole fix here. This element used to hold the course's *rank* layered
   * permanently underneath the logo, which was wrong twice over. Ninety-eight of the hundred
   * logos are transparent PNGs, so the number showed straight through the club's mark. And a
   * bare rank is the same shape as a cluster count, so a chip reading `12` was either the
   * 12th-ranked course or twelve courses stacked, with nothing on the marker to say which.
   *
   * Layering initials underneath instead would fix only the second half: `links-lady-bay-resort`
   * is a dark mark on a transparent ground, and letters bleed through it exactly as digits did.
   * So the fallback is *appended when the logo gives up*, not hidden behind it.
   *
   * Both failures still run through one path. The two courses with no logo committed take the
   * early return; a committed file that fails to decode takes the `error` listener, which swaps
   * the broken image for the same letters. A broken-image icon on a map says less than nothing.
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

    const initials = () => {
      const span = document.createElement('span')
      span.className = 'chip-initials'
      // The letters come from the domain, never from markup.
      span.textContent = courseInitials(pin.course.name)
      return span
    }

    if (!pin.course.logo) {
      el.append(initials())
      return el
    }

    const img = document.createElement('img')
    img.alt = ''
    // Listener before `src`: an image error is queued as a task rather than thrown inline, so
    // the order does not matter today — but it is the order that stays correct if it ever does.
    img.addEventListener('error', () => {
      img.remove()
      el.append(initials())
    })
    img.src = `/${pin.course.logo}`
    el.append(img)
    return el
  }

  function countChip(count: number): HTMLElement {
    const el = document.createElement('span')
    el.className = 'chip chip-cluster'
    const n = document.createElement('span')
    n.className = 'chip-count'
    n.textContent = String(count)
    el.append(n)
    return el
  }

  $effect(() => {
    // `pins` is read here so the effect re-runs if the registry ever becomes reactive.
    const current = pins
    // Read here, synchronously, so the effect depends on it: the marks arrive from the store
    // after first paint, and the map has to be rebuilt once when they do. Reading them inside
    // `draw()` instead would silently not track, because that runs after an `await`.
    const currentMarks = marks
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
            map?.remove()
            map = undefined
          }
        })
        .addTo(map)

      const layer = L.layerGroup().addTo(map)

      const draw = () => {
        if (!map) return
        const projected: ProjectedPin[] = current.map((pin) => {
          const point = map!.latLngToContainerPoint([pin.lat, pin.lon])
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
            else map?.setView(at, Math.min(map.getZoom() + 2, 14), { animate: !still })
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
    }

    build().catch((error) => {
      // Never rethrow. A third-party script that did not arrive is not a reason to blank a page
      // whose primary content is already rendered underneath.
      console.error('Could not build the destinations map:', error)
      failed = true
    })

    return () => {
      cancelled = true
      map?.remove()
      map = undefined
    }
  })
</script>

{#if !failed}
  <!-- Deliberately not `aria-hidden`. Leaflet gives every marker `tabindex="0"`, and a focusable
       control inside a hidden subtree is the worst of both: keyboard focus lands somewhere a
       screen reader has been told does not exist. The markers carry their own names instead, and
       clustering keeps the tab stops to the low dozens rather than a hundred. -->
  <div class="map-frame">
    <div class="map" bind:this={container}></div>
  </div>
{/if}

<style>
  .map-frame{
    border:1px solid var(--line);border-radius:14px;overflow:hidden;
    margin-bottom:26px;background:var(--panel);
  }
  .map{height:clamp(320px,52vh,460px);width:100%}

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

  /* A count is now the only number on the map, so it no longer has to be told apart from a rank.
     The second concentric ring stays anyway: it is a shape signal — several, stacked — and shape
     survives the greyscale test that a background tint does not. */
  .map-frame :global(.chip-cluster){background:var(--panel-2);border-color:var(--ball-dim);position:relative}
  .map-frame :global(.chip-cluster::after){
    content:'';position:absolute;inset:-4px;border-radius:100px;border:1px solid var(--line);
  }
  .map-frame :global(.chip-count){
    grid-area:1/1;font-family:'Space Mono',monospace;font-size:.76rem;color:var(--ball);
  }

  /* Shown only when there is no logo to show — never behind one. `--dim`, not `--ball`: this is a
     fallback for a club whose mark could not be drawn, and `--ball` means the goal. Tighter
     tracking than the count because two letters at .76rem otherwise touch the rim. */
  .map-frame :global(.chip-initials){
    grid-area:1/1;font-family:'Space Mono',monospace;font-size:.72rem;letter-spacing:-.02em;
    color:var(--dim);
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
