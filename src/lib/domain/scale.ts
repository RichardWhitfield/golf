import type { ISODate } from './types'
import { parseISODate } from './block'

/**
 * The shared y-domain, in signed degrees. **Fixed, never derived from the data.**
 *
 * Covers every reading in the 13-month backfill (`-13.76` min) with headroom, and keeps a
 * visible strip above `BAND.max` so overshooting past `+2°` is always on screen as a fault.
 * A domain fitted to the data would move between visits — two viewings of the same page would
 * not be comparable, and "good" would quietly come to mean "better than recent" rather than
 * "inside the band".
 */
export const DOMAIN = { min: -14, max: 4 } as const

/**
 * The coaching target. **A band, not a maximum** — `+5°` is worse than `+1°`.
 *
 * Shared across every club rather than derived per club: deriving one would turn "where you
 * should be" into "where you have been" (OQ-7).
 */
export const BAND = { min: -2, max: 2 } as const

/** SVG user units. Panels scale via `viewBox`, so these never need a media query. */
export const CHART = { w: 300, h: 140, padL: 30, padR: 8, padT: 8, padB: 18 } as const

const PLOT_W = CHART.w - CHART.padL - CHART.padR
const PLOT_H = CHART.h - CHART.padT - CHART.padB

/** Dot radius bounds. The floor keeps a 3-shot reading visible; the ceiling stops a 73-shot
 *  one swamping the panel. */
const R_MIN = 2
const R_MAX = 6.5
/** Where the radius scale saturates. The largest real `n` in the backfill is 73. */
const N_FULL = 75

/** Degrees → SVG y. Clamped, so a wild reading draws at the edge rather than off-panel. */
export function yFor(degrees: number): number {
  const clamped = Math.min(DOMAIN.max, Math.max(DOMAIN.min, degrees))
  return CHART.padT + ((DOMAIN.max - clamped) / (DOMAIN.max - DOMAIN.min)) * PLOT_H
}

/**
 * Date → SVG x, spaced by **real elapsed time**. `null` if any date is malformed.
 *
 * Session index would be wrong: there are 21 sessions in July 2025 and none at all in January
 * 2026, and an index axis would render that two-month silence as a single step.
 */
export function xFor(date: ISODate, first: ISODate, last: ISODate): number | null {
  const at = parseISODate(date)
  const from = parseISODate(first)
  const to = parseISODate(last)
  if (at === null || from === null || to === null) return null
  // A single-date series has no span to divide by. Centre it.
  if (to <= from) return CHART.padL + PLOT_W / 2
  const ratio = Math.min(1, Math.max(0, (at - from) / (to - from)))
  return CHART.padL + ratio * PLOT_W
}

/**
 * Shot count → dot radius, or `null` when there is no count.
 *
 * `null` is the signal to render a hollow ring instead of a filled dot — a hand-typed reading
 * has no `n`, and sizing it would weight a guess as though it were measured (`CLAUDE.md`).
 * The `sqrt` keeps the range honest: 73 shots reads heavier than 3, not 24 times heavier.
 */
export function radiusFor(n: number | undefined): number | null {
  if (n === undefined || !Number.isFinite(n) || n <= 0) return null
  const t = Math.min(1, Math.sqrt(n) / Math.sqrt(N_FULL))
  return R_MIN + t * (R_MAX - R_MIN)
}

/** Inside the target band, inclusive of both edges. **Never `Math.abs` on a signed path** —
 *  that would accept a sign flip, the one error that matters most. */
export function inBand(degrees: number): boolean {
  return degrees >= BAND.min && degrees <= BAND.max
}
