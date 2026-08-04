import { compareClubs, normaliseClub, type Club } from '../domain/clubs'
import { resolveISODate } from '../domain/today'
import type { ClubPath, TrackmanSession } from '../domain/types'

/**
 * The shape the GraphQL query returns.
 *
 * Every field is optional because this API is undocumented and we do not control it. Anything
 * missing is treated as absent, never as zero.
 */
export interface RawStroke {
  club?: string | null
  time?: string | null
  measurement?: { clubPath?: number | null } | null
}

export interface RawActivity {
  id: string
  /** UTC instant. Converted to the Sydney date below — they differ for 11% of real sessions. */
  time: string
  strokes?: RawStroke[] | null
}

/** Called with the exact display string for a club the mapping does not cover. */
export type UnknownClubReporter = (displayName: string) => void

/** Two decimals is the precision Trackman reports at; more is float noise in a committed file. */
function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * Turn one activity into one session, or `null` if nothing in it was measured.
 *
 * **The filter is the point of this function.** In the 13-month backfill, 976 of 5,877 strokes
 * carry a `null` club path and 3 carry no club — 16.6% unusable. They are not zeros, and letting
 * them through would drag every average toward neutral and fake progress.
 *
 * Note where the `null` actually sits: `measurement` itself was never null across all 5,877
 * strokes, only `measurement.clubPath`. Both are guarded anyway, because that is an observation
 * about today's data rather than a guarantee about tomorrow's.
 */
export function aggregateActivity(
  activity: RawActivity,
  onUnknownClub?: UnknownClubReporter,
): TrackmanSession | null {
  const byClub = new Map<Club, number[]>()

  for (const stroke of activity.strokes ?? []) {
    const path = stroke?.measurement?.clubPath
    if (path === null || path === undefined || !Number.isFinite(path)) continue
    if (!stroke.club) continue

    const club = normaliseClub(stroke.club)
    if (club === null) {
      // Reported rather than dropped in silence: `normaliseClub` refuses to guess at a spelling
      // it has never seen, so this is the only chance to learn that a new club is in the bag.
      onUnknownClub?.(stroke.club)
      continue
    }

    const values = byClub.get(club)
    if (values) values.push(path)
    else byClub.set(club, [path])
  }

  if (byClub.size === 0) return null

  const clubs: ClubPath[] = [...byClub.entries()]
    .map(([club, values]) => ({
      club,
      typical: round2(values.reduce((a, b) => a + b, 0) / values.length),
      // Closest to neutral. The target is a band centred on zero, so overshooting counts against
      // you — `+5` must lose to `+1`. A `Math.max` "best" would reward the fault instead.
      best: round2(values.reduce((a, b) => (Math.abs(b) < Math.abs(a) ? b : a))),
      n: values.length,
    }))
    .sort((a, b) => compareClubs(a.club, b.club))

  return {
    id: activity.id,
    type: 'trackman',
    // The Sydney date, reusing the plan's own rule. 10 of 91 real sessions fall on a different
    // UTC date, so `time.slice(0, 10)` would misfile one session in ten.
    date: resolveISODate(new Date(activity.time)),
    clubs,
    source: 'api',
  }
}

/**
 * Oldest first, tie-broken by id, so the committed file reads as a timeline and a new pull
 * appends at the end rather than reshuffling the diff.
 */
export function aggregateActivities(
  activities: RawActivity[],
  onUnknownClub?: UnknownClubReporter,
): TrackmanSession[] {
  return activities
    .map((a) => aggregateActivity(a, onUnknownClub))
    .filter((s): s is TrackmanSession => s !== null)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
}
