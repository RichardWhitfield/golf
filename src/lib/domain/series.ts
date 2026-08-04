import { isTrackman, type ISODate, type Session } from './types'
import { compareClubs, type Club } from './clubs'

/** One club's reading from one session. */
export interface PathPoint {
  date: ISODate
  /** Signed degrees, the session mean for this club. Negative is out-to-in. */
  typical: number
  /** Signed degrees, the stroke closest to neutral. Passed through from storage, never
   *  recomputed — `Math.max` here would report the worst overshoot as the best strike. */
  best: number
  /** Measured strokes. **Absent, never zero,** on a hand-typed reading. */
  n?: number
  /**
   * Which session this was among those sharing its date, from 0.
   *
   * 21 dates in the backfill carry two sessions. Computed here rather than in the component
   * because "which came first" is a data question and must be identical on every render.
   */
  ordinal: number
}

export interface ClubSeries {
  club: Club
  /** Date-ascending. Never empty — a club with no readings produces no series at all. */
  points: PathPoint[]
}

/**
 * Trackman sessions → one series per club, in bag order.
 *
 * **Structurally incapable of blending.** It keys by `Club` and never reduces across keys, so
 * there is no code path that could produce a cross-club mean (OQ-7, issue #14).
 */
export function clubSeries(sessions: Session[]): ClubSeries[] {
  const ordered = sessions
    .filter(isTrackman)
    .slice()
    // Tie-break on id so two sessions on one date always come out the same way round,
    // whatever order the store handed them over in.
    .sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date < b.date ? -1 : 1))

  const seenOnDate = new Map<ISODate, number>()
  const byClub = new Map<Club, PathPoint[]>()

  for (const session of ordered) {
    const ordinal = seenOnDate.get(session.date) ?? 0
    seenOnDate.set(session.date, ordinal + 1)

    for (const row of session.clubs) {
      const point: PathPoint = {
        date: session.date,
        typical: row.typical,
        best: row.best,
        ordinal,
      }
      // Assigned conditionally: an absent n must stay absent, never become 0.
      if (row.n !== undefined) point.n = row.n

      const points = byClub.get(row.club)
      if (points) points.push(point)
      else byClub.set(row.club, [point])
    }
  }

  return [...byClub]
    .map(([club, points]) => ({ club, points }))
    .sort((a, b) => compareClubs(a.club, b.club))
}

/** The overall date span. Every panel is drawn against this, which is what makes the small
 *  multiples share an x axis and therefore be comparable. */
export function dateBounds(series: ClubSeries[]): { first: ISODate; last: ISODate } | null {
  let first: ISODate | null = null
  let last: ISODate | null = null
  for (const s of series) {
    for (const p of s.points) {
      if (first === null || p.date < first) first = p.date
      if (last === null || p.date > last) last = p.date
    }
  }
  return first !== null && last !== null ? { first, last } : null
}
