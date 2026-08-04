import { isPractice, isTrackman, type DrillId, type ISODate, type Session } from './types'
import { DRILLS } from './drills'
import { WEEK } from './plan'
import { dayKeyFor, daysBetween, parseISODate } from './block'

/**
 * `avoided` and `unscheduled` are **not** the same thing and must never render alike.
 *
 * Drill `03` appears in `drills.ts` but in no day's schedule, so it computes to `0 of 0` —
 * identical to a drill asked for six times and skipped. Conflating them would name
 * pause-at-the-top the most avoided drill in the plan: a false finding produced by the chart
 * rather than by the practice.
 */
export type CoverageStatus = 'covered' | 'partial' | 'avoided' | 'unscheduled'

export interface DrillCoverage {
  drillId: DrillId
  /** Times the plan asked for this drill in the window. Zero means never asked. */
  scheduled: number
  /** Times it was actually logged. May exceed `scheduled` — that is diligence, not an error. */
  done: number
  /** Total swings logged. Counted even when the drill was never scheduled. */
  swings: number
  status: CoverageStatus
}

const DAY_MS = 86_400_000

function statusFor(scheduled: number, done: number): CoverageStatus {
  if (scheduled === 0) return 'unscheduled'
  if (done === 0) return 'avoided'
  return done >= scheduled ? 'covered' : 'partial'
}

/**
 * What the plan asked for against what was logged, over `[from, to]` inclusive.
 *
 * Avoidance is only visible against the schedule: a raw count cannot tell a drill asked for
 * twice from one asked for six times. An inverted or malformed window returns empty rather
 * than throwing — the caller is a render path.
 */
export function drillCoverage(sessions: Session[], from: ISODate, to: ISODate): DrillCoverage[] {
  const span = daysBetween(from, to)
  const start = parseISODate(from)
  if (span === null || span < 0 || start === null) return []

  const scheduled = new Map<DrillId, number>()
  for (let offset = 0; offset <= span; offset++) {
    const date = new Date(start + offset * DAY_MS).toISOString().slice(0, 10)
    const day = dayKeyFor(date)
    if (day === null) continue
    for (const drillId of WEEK[day].drills) {
      scheduled.set(drillId, (scheduled.get(drillId) ?? 0) + 1)
    }
  }

  const done = new Map<DrillId, number>()
  const swings = new Map<DrillId, number>()
  const bump = (id: DrillId, count: number) => {
    done.set(id, (done.get(id) ?? 0) + 1)
    swings.set(id, (swings.get(id) ?? 0) + count)
  }

  for (const session of sessions) {
    if (session.date < from || session.date > to) continue
    if (isPractice(session)) {
      for (const entry of session.entries) bump(entry.drillId, entry.swings)
    } else if (isTrackman(session)) {
      // Monday's bay work is scheduled drill work too. Ignoring it would report
      // WEEK.mon's drills as permanently avoided. A Trackman session records no
      // swing count, so it adds to `done` without adding to `swings`.
      for (const drillId of session.drillsWorked ?? []) bump(drillId, 0)
    }
  }

  return DRILLS.map((drill) => {
    const s = scheduled.get(drill.id) ?? 0
    const d = done.get(drill.id) ?? 0
    return {
      drillId: drill.id,
      scheduled: s,
      done: d,
      swings: swings.get(drill.id) ?? 0,
      status: statusFor(s, d),
    }
  })
}
