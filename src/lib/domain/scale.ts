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

/**
 * Value → SVG y against **any** authored domain. Clamped, so a wild reading draws at the edge
 * rather than off-panel.
 *
 * The domain is always passed in, never derived from the values: one fitted at render time would
 * move between visits and quietly redefine "good" as "better than recent" rather than "inside
 * the band". Every domain in `domain/metrics.ts` is a frozen constant for exactly this reason.
 */
export function yIn(value: number, domain: { min: number; max: number }): number {
  const clamped = Math.min(domain.max, Math.max(domain.min, value))
  return CHART.padT + ((domain.max - clamped) / (domain.max - domain.min)) * PLOT_H
}

/**
 * Value → SVG x against any authored domain. The horizontal twin of `yIn`, and clamped for the
 * same reason: a wild reading draws at the edge rather than off-panel.
 *
 * Note the inversion difference — y grows downward in SVG, so `yIn` maps `domain.max` to the
 * *smallest* y, while `xIn` maps `domain.min` to the smallest x.
 */
export function xIn(value: number, domain: { min: number; max: number }): number {
  const clamped = Math.min(domain.max, Math.max(domain.min, value))
  return CHART.padL + ((clamped - domain.min) / (domain.max - domain.min)) * PLOT_W
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

/** Inside a band, inclusive of both edges. **Never `Math.abs` on a signed value** — that would
 *  accept a sign flip, the one error that matters most. */
export function inRange(value: number, band: { min: number; max: number }): boolean {
  return value >= band.min && value <= band.max
}

/** Club path against its own domain. The KPI's shorthand for `yIn`. */
export function yFor(degrees: number): number {
  return yIn(degrees, DOMAIN)
}

/** Club path against its own band. The KPI's shorthand for `inRange`. */
export function inBand(degrees: number): boolean {
  return inRange(degrees, BAND)
}
