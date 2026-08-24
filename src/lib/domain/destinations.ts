import { COURSES, type AusState, type Course, type CourseSlug } from './courses'

/**
 * Course lookups and the coordinate sanity check.
 *
 * Deliberately small. There is no map yet (issue #32), so nothing here filters, sorts or groups —
 * the view will add what it actually needs rather than choosing from machinery built on spec.
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
