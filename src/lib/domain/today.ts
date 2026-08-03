import type { DayKey } from './types'
import { DAY_ORDER } from './plan'

/** The plan is anchored to Sydney, not the visitor's clock, so it stays correct when travelling. */
const TZ = 'Australia/Sydney'

const SHORT_NAMES: Record<string, DayKey> = {
  mon: 'mon',
  tue: 'tue',
  wed: 'wed',
  thu: 'thu',
  fri: 'fri',
  sat: 'sat',
  sun: 'sun',
}

/** Fallback when `Intl` or the timezone database is unavailable. `getDay()` is Sunday-first. */
export function dayKeyFromLocalTime(now: Date): DayKey {
  return DAY_ORDER[(now.getDay() + 6) % 7]
}

/** The current day in Sydney. `Intl` handles NSW daylight saving for us. */
export function resolveDayKey(now: Date = new Date()): DayKey {
  try {
    const short = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(now)
    const key = SHORT_NAMES[short.slice(0, 3).toLowerCase()]
    if (key) return key
  } catch {
    /* fall through to the visitor's clock */
  }
  return dayKeyFromLocalTime(now)
}

/** Day and month in Sydney, e.g. "3 August". Empty string if `Intl` is unavailable. */
export function formatDayLabel(now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-AU', { timeZone: TZ, day: 'numeric', month: 'long' }).format(
      now,
    )
  } catch {
    return ''
  }
}
