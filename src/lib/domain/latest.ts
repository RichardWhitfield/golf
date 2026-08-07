import type { Club } from './clubs'
import type { Reading } from './metrics'
import { isTrackman, type ClubPath, type ISODate, type Session } from './types'

/** The latest session carrying a club, and that club's row from it. */
export interface LatestReading {
  date: ISODate
  row: ClubPath
}

/**
 * The most recent Trackman session carrying a reading for `club`, or `null`.
 *
 * **Ties break on id, not array order.** 23 dates in the real backfill carry more than one
 * session, so the tie is routine rather than hypothetical, and array order is whatever the store
 * happened to return — the same reading must not become "latest" on one load and not the next.
 *
 * The tie goes to the **larger** id, which is the last of the pair in the ascending order
 * `series.ts` sorts into. One rule, two files, same answer.
 */
export function latestTrackman(sessions: Session[], club: Club): LatestReading | null {
  let best: { date: ISODate; id: string; row: ClubPath } | null = null

  for (const session of sessions) {
    if (!isTrackman(session)) continue
    const row = session.clubs.find((c) => c.club === club)
    if (!row) continue
    if (
      best === null ||
      session.date > best.date ||
      (session.date === best.date && session.id > best.id)
    ) {
      best = { date: session.date, id: session.id, row }
    }
  }

  return best === null ? null : { date: best.date, row: best.row }
}

/**
 * Whether the face was open to the path — which is what actually bends the ball.
 *
 * Positive face-to-path means the face points right of the path, so a right-hander's ball starts
 * left of the path and curves right. `null` when there is no reading: absent is not "closed".
 *
 * **Strictly greater than zero.** A face square to the path is neither open nor closed, and
 * `>= 0` would report a dead-square strike as a fault.
 */
export function faceOpenToPath(reading: Reading | undefined): boolean | null {
  if (!reading) return null
  return reading.typical > 0
}
