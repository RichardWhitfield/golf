import { isPractice, type ArcPhase, type DrillId, type ISODate, type Session } from './types'
import { DRILLS } from './drills'
import { ARC } from './plan'
import { blockPosition, parseISODate } from './block'

export interface PhaseFeel {
  week: 1 | 2 | 3
  /** Carried through from `ARC` so no component restates the phase title. */
  phase: ArcPhase
  /** **Null when nothing was logged — never 0**, which would read as "felt terrible" in the
   *  drill's own 1–5 units. */
  mean: number | null
  /** Entries behind `mean`. Zero exactly when `mean` is null. */
  n: number
}

export interface DrillPhaseFeel {
  drillId: DrillId
  /** Always all three phases, in arc order, so rows never reorder as data arrives. */
  phases: PhaseFeel[]
}

const WEEKS: (1 | 2 | 3)[] = [1, 2, 3]

/**
 * Mean feel per drill per arc phase.
 *
 * Grouped by phase rather than plotted over time because a drill means something different in
 * week 1 (groove) than week 3 (proof) — issue #5. Three buckets are also legible with far less
 * data than a time series needs, which matters when the log holds a handful of sessions.
 */
export function feelByPhase(sessions: Session[], blockStart: ISODate): DrillPhaseFeel[] {
  if (parseISODate(blockStart) === null) return []

  const sums = new Map<string, { total: number; n: number }>()
  const key = (drillId: DrillId, week: number) => `${drillId}:${week}`

  for (const session of sessions) {
    if (!isPractice(session)) continue
    // Outside the block there is no phase. A session from before the start belongs to
    // nothing, and inventing a bucket for it would be a fabricated finding.
    const position = blockPosition(blockStart, session.date)
    if (position === null) continue

    for (const entry of session.entries) {
      const k = key(entry.drillId, position.week)
      const acc = sums.get(k) ?? { total: 0, n: 0 }
      acc.total += entry.feel
      acc.n += 1
      sums.set(k, acc)
    }
  }

  return DRILLS.map((drill) => ({
    drillId: drill.id,
    phases: WEEKS.map((week) => {
      const acc = sums.get(key(drill.id, week))
      return {
        week,
        phase: ARC[week - 1],
        mean: acc && acc.n > 0 ? Math.round((acc.total / acc.n) * 10) / 10 : null,
        n: acc?.n ?? 0,
      }
    }),
  }))
}
