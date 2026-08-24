import { COURSES, type Access, type AusState, type Course, type CourseSlug } from './courses'
import type { DestinationStatus, ISODate } from './types'

/**
 * Course lookups, the coordinate sanity check, and the maths the map is drawn from.
 *
 * Everything here is pure and takes plain numbers, because *components render; they never
 * calculate* (Phase 4). The clustering in particular takes already-projected pixels rather than a
 * Leaflet map, so it is tested without a browser and without a tile server.
 *
 * The list stays in rank order as `courses.ts` authored it — no sorting or grouping helper exists
 * because no view has asked for one.
 */

/** A latitude/longitude box, in the sign convention the data uses: southern latitudes negative. */
export interface Bounds {
  minLat: number
  maxLat: number
  minLon: number
  maxLon: number
}

/**
 * Per-state bounding boxes.
 *
 * **These exist to catch a research error, not to adjudicate a border.** A course sitting in the
 * wrong state — or, with a dropped minus sign, the wrong hemisphere — is invisible on a map to
 * anyone who does not already know where the course is. The boxes are therefore loose: they
 * overlap at the borders and enclose water, because a false failure here is worse than a coarse
 * one that still catches the error that matters.
 *
 * TAS reaches north to `-39.4` so that it covers King Island, where Cape Wickham sits at `-39.59`
 * and Ocean Dunes at `-39.90` — well clear of the Tasmanian mainland.
 */
export const STATE_BOUNDS: Record<AusState, Bounds> = {
  NSW: { minLat: -37.55, maxLat: -28.15, minLon: 140.95, maxLon: 153.7 },
  VIC: { minLat: -39.2, maxLat: -33.95, minLon: 140.95, maxLon: 150.05 },
  QLD: { minLat: -29.2, maxLat: -9.1, minLon: 137.95, maxLon: 153.6 },
  SA: { minLat: -38.1, maxLat: -25.95, minLon: 128.95, maxLon: 141.05 },
  WA: { minLat: -35.2, maxLat: -13.5, minLon: 112.8, maxLon: 129.05 },
  TAS: { minLat: -43.7, maxLat: -39.4, minLon: 143.75, maxLon: 148.6 },
  NT: { minLat: -26.05, maxLat: -10.95, minLon: 128.95, maxLon: 138.05 },
  ACT: { minLat: -35.95, maxLat: -35.1, minLon: 148.7, maxLon: 149.45 },
}

/** Whether a course's coordinates fall inside its own state's box. */
export function isWithinState(course: Course): boolean {
  const b = STATE_BOUNDS[course.state]
  return (
    course.lat >= b.minLat &&
    course.lat <= b.maxLat &&
    course.lon >= b.minLon &&
    course.lon <= b.maxLon
  )
}

const BY_SLUG = new Map<CourseSlug, Course>(COURSES.map((c) => [c.slug, c]))

/** `undefined` for an unknown slug — never a nearest match. */
export function courseBySlug(slug: CourseSlug): Course | undefined {
  return BY_SLUG.get(slug)
}

/**
 * A course's position **as drawn**. `lat`/`lon` here are display coordinates: equal to the
 * researched pair on `course` unless the course shares a point with another one, in which case
 * `spreadCoincident` has nudged it.
 *
 * The two are kept apart deliberately. `courses.ts` holds what was researched and is never
 * edited to make a map look right — a fabricated latitude sitting beside verified ones is
 * indistinguishable from them six months later, and the dataset's whole credibility rests on
 * nothing being guessed. The nudge is derived, lives here, and is recomputed every render.
 */
export interface MapPin {
  course: Course
  lat: number
  lon: number
}

/** The circle a coincident group is arranged on. Small enough to read as one place. */
const COINCIDENT_RADIUS_M = 40

/** Metres per degree of latitude. Constant enough at this scale; longitude is not (see below). */
const METRES_PER_DEGREE_LAT = 111_320

const coordKey = (course: Course): string => `${course.lat},${course.lon}`

/**
 * Display positions for a list of courses, separating those that sit on the same point.
 *
 * Seven courses share three coordinates — Royal Melbourne's West and East, The National's
 * Gunnamatta, Moonah and Old, and 13th Beach's two. Each pair or trio is one clubhouse with
 * several courses, so the shared coordinate is correct research, not an error; it just means the
 * chips land exactly on top of each other and the ones underneath cannot be clicked.
 *
 * A group is arranged on a small circle around its true point, first member due north and the
 * rest spaced evenly clockwise. A course that shares its point with nobody is returned untouched.
 *
 * A degree of longitude shrinks towards the poles, so the east/west component is divided by
 * `cos(latitude)`. Without that, a 40 m circle at −38° comes out visibly elliptical.
 */
export function spreadCoincident(courses: Course[]): MapPin[] {
  const sizes = new Map<string, number>()
  for (const course of courses) {
    const key = coordKey(course)
    sizes.set(key, (sizes.get(key) ?? 0) + 1)
  }

  const placed = new Map<string, number>()
  return courses.map((course) => {
    const key = coordKey(course)
    const size = sizes.get(key) ?? 1
    const index = placed.get(key) ?? 0
    placed.set(key, index + 1)

    if (size === 1) return { course, lat: course.lat, lon: course.lon }

    const angle = (2 * Math.PI * index) / size
    const dLat = (COINCIDENT_RADIUS_M * Math.cos(angle)) / METRES_PER_DEGREE_LAT
    const dLon =
      (COINCIDENT_RADIUS_M * Math.sin(angle)) /
      (METRES_PER_DEGREE_LAT * Math.cos((course.lat * Math.PI) / 180))
    return { course, lat: course.lat + dLat, lon: course.lon + dLon }
  })
}

/** A pin with the map's own projection already applied. Pixels, not degrees. */
export interface ProjectedPin {
  pin: MapPin
  x: number
  y: number
}

/** One occupied grid cell, positioned at the mean of its members. One pin is a cluster of one. */
export interface PinCluster {
  pins: MapPin[]
  x: number
  y: number
}

/**
 * Grid clustering, on coordinates the caller has already projected to pixels.
 *
 * Taking pixels rather than a map instance is what makes this testable: the maths is the maths
 * whether Leaflet, a stub or a test supplied the projection. It is also the reason no clustering
 * plugin is installed — a second runtime dependency to do arithmetic this repo's rules say
 * belongs in `lib/domain/` anyway.
 *
 * A cell holding one pin is returned as a cluster of one rather than as a separate shape. The
 * component decides whether to draw a logo or a count; that is a rendering decision.
 *
 * The output is sorted by cell, top-to-bottom then left-to-right, so the same input always keys
 * the same DOM in the same order. Unsorted, `Map` insertion order would follow whatever order the
 * pins arrived in and Svelte would reshuffle the marker list on every pan.
 */
export function clusterProjected(pins: ProjectedPin[], cellPx: number): PinCluster[] {
  if (!(cellPx > 0)) {
    throw new Error(`clusterProjected needs a positive cell size, got ${cellPx}`)
  }

  const cells = new Map<string, { col: number; row: number; members: ProjectedPin[] }>()
  for (const projected of pins) {
    const col = Math.floor(projected.x / cellPx)
    const row = Math.floor(projected.y / cellPx)
    const key = `${col},${row}`
    const cell = cells.get(key)
    if (cell) cell.members.push(projected)
    else cells.set(key, { col, row, members: [projected] })
  }

  return [...cells.values()]
    .sort((a, b) => a.row - b.row || a.col - b.col)
    .map(({ members }) => ({
      pins: members.map((m) => m.pin),
      x: members.reduce((sum, m) => sum + m.x, 0) / members.length,
      y: members.reduce((sum, m) => sum + m.y, 0) / members.length,
    }))
}

/**
 * How each access value is worded.
 *
 * `'unknown'` gets its own words rather than being folded into one of the other three. A club
 * that could not be confirmed rendering as members-only is inventing a finding — the same rule
 * that keeps `better: 'none'` out of `metrics.ts`'s bands and "never scheduled" apart from
 * "avoided" in `coverage.ts`.
 */
export const ACCESS_LABELS: Record<Access, string> = {
  public: 'Public',
  limited: 'Limited visitor access',
  members: 'Members only',
  unknown: 'Access unknown',
}

/**
 * How a mark is worded, in the two lengths the UI needs and nowhere else.
 *
 * `ACTIONS` is what the buttons on a course say; `TAGS` is what the indicator says beside a name
 * in a hundred-row list, where "Want to play" would crowd out the course it belongs to. Both live
 * here rather than in markup, the same rule that keeps drill copy and `ACCESS_LABELS` out of
 * components.
 *
 * There is no wording for "no opinion" because there is no such status — an absent key is the
 * absence of a mark, and it renders as nothing at all.
 */
export const DESTINATION_ACTIONS: Record<DestinationStatus, string> = {
  want: 'Want to play',
  played: 'Played',
}

export const DESTINATION_TAGS: Record<DestinationStatus, string> = {
  want: 'Want',
  played: 'Played',
}

/** `2026-08-24` as `Aug 2026`. Parsed as UTC so a local timezone cannot roll it back a day. */
export function checkedLabel(checkedOn: ISODate): string {
  return new Intl.DateTimeFormat('en-AU', {
    timeZone: 'UTC',
    month: 'short',
    year: 'numeric',
  }).format(new Date(`${checkedOn}T00:00:00Z`))
}

/**
 * The green fee as it is allowed to be shown: `$395 · checked Aug 2026`.
 *
 * Two rules live here rather than in a template, so neither can be got wrong twice. **An absent
 * fee is a dash** — never "Free" and never `$0`, which would be wrong in the most expensive
 * possible direction. And **a fee always carries its date**, because the figure is a hand-checked
 * snapshot (D37): a stale number that reads as current is the failure mode dating it prevents.
 */
export function feeLabel(course: Course): string {
  if (course.greenFee === undefined) return '—'
  const amount = `$${course.greenFee.amount.toLocaleString('en-AU')}`
  return course.checkedOn ? `${amount} · checked ${checkedLabel(course.checkedOn)}` : amount
}
