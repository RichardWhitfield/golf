import type { ArcPhase, DayKey, ISODate } from './types'
import { ARC, DAY_ORDER } from './plan'

/** The plan is three weeks. Day 0 is the start date; day 20 is the last day. */
const BLOCK_DAYS = 21
const DAY_MS = 86_400_000
const ISO_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

export interface BlockPosition {
  week: 1 | 2 | 3
  /** 1-based day within the block, so the first day reads as day 1. */
  dayOfBlock: number
  phase: ArcPhase
}

/** Parsed as **UTC** midnight, deliberately. Local midnights are 23 or 25 hours apart across a
 *  daylight-saving change, which silently shifts a week boundary by a day. UTC has no such thing. */
export function parseISODate(iso: ISODate): number | null {
  const match = ISO_PATTERN.exec(iso)
  if (!match) return null
  const [, year, month, day] = match.map(Number)
  const ms = Date.UTC(year, month - 1, day)
  // `Date.UTC(2026, 1, 30)` quietly becomes 2 March. Round-trip to reject dates that don't exist.
  const back = new Date(ms)
  if (back.getUTCFullYear() !== year || back.getUTCMonth() !== month - 1 || back.getUTCDate() !== day) {
    return null
  }
  return ms
}

/**
 * Which weekday a date falls on.
 *
 * Read off the **UTC** timestamp with `getUTCDay()`, never `getDay()`. The value parsed above is
 * UTC midnight, so reading a *local* weekday from it lands on the previous day for anyone east
 * of UTC+12. `getUTCDay()` is Sunday-first, hence the shift onto the Monday-first `DAY_ORDER`.
 */
export function dayKeyFor(iso: ISODate): DayKey | null {
  const ms = parseISODate(iso)
  if (ms === null) return null
  return DAY_ORDER[(new Date(ms).getUTCDay() + 6) % 7]
}

/** Whole days from `from` to `to`. Negative if `to` is earlier. `null` if either is malformed. */
export function daysBetween(from: ISODate, to: ISODate): number | null {
  const a = parseISODate(from)
  const b = parseISODate(to)
  if (a === null || b === null) return null
  return Math.round((b - a) / DAY_MS)
}

/** Where `on` sits in the three-week arc, or `null` if it falls outside the block entirely.
 *  Outside is a real answer, not an error — a plan that has ended should say nothing rather
 *  than claim "week 7". */
export function blockPosition(start: ISODate, on: ISODate): BlockPosition | null {
  const offset = daysBetween(start, on)
  if (offset === null || offset < 0 || offset >= BLOCK_DAYS) return null
  const week = (Math.floor(offset / 7) + 1) as 1 | 2 | 3
  return { week, dayOfBlock: offset + 1, phase: ARC[week - 1] }
}
