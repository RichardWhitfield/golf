import { compareClubs, normaliseClub, type Club } from '../domain/clubs'
import { METRICS, bestOf, type MetricId } from '../domain/metrics'
import { resolveISODate } from '../domain/today'
import type { ClubPath, ExtraMetricId, MetricReading, Shot, TrackmanSession } from '../domain/types'

/**
 * The shape the GraphQL query returns.
 *
 * Every field is optional because this API is undocumented and we do not control it. Anything
 * missing is treated as absent, never as zero.
 *
 * Widened to the whole measurement object: the registry decides which keys are read.
 */
export interface RawStroke {
  club?: string | null
  time?: string | null
  measurement?: Record<string, unknown> | null
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

/** Finite numbers only. `null` is absence, and a `NaN` is not a reading either. */
function reading(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/**
 * Turn one activity into one session plus its shots, or `null` if nothing in it was measured.
 *
 * **The per-metric filter is the point of this function.** Each metric aggregates only the
 * strokes where *that* metric is present, and reports its own count. In the real backfill the
 * driver has 666 plane readings against 618 path readings — filtering every stroke on a null
 * club path would have thrown 48 good plane readings away, and sharing one count would have
 * overstated the sparser metric on every chart.
 *
 * A club still needs at least one **club path** reading to appear: it is the KPI and the reason
 * `TrackmanSession` exists, so a club row without one would be a row with no KPI in it.
 */
export function aggregateActivity(
  activity: RawActivity,
  onUnknownClub?: UnknownClubReporter,
): { session: TrackmanSession; shots: Shot[] } | null {
  const byClub = new Map<Club, Map<MetricId, number[]>>()
  const shots: Shot[] = []

  for (const stroke of activity.strokes ?? []) {
    if (!stroke?.club) continue

    const club = normaliseClub(stroke.club)
    if (club === null) {
      // Reported rather than dropped in silence: `normaliseClub` refuses to guess at a spelling
      // it has never seen, so this is the only chance to learn a new club is in the bag.
      onUnknownClub?.(stroke.club)
      continue
    }

    const measured: Partial<Record<MetricId, number>> = {}
    for (const metric of METRICS) {
      const value = reading(stroke.measurement?.[metric.field])
      // Assigned conditionally, always: an absent reading must stay absent, never become 0.
      if (value !== null) measured[metric.id] = value
    }
    if (Object.keys(measured).length === 0) continue

    const shot: Shot = { club, metrics: measured }
    if (stroke.time) shot.time = stroke.time
    shots.push(shot)

    let values = byClub.get(club)
    if (!values) {
      values = new Map()
      byClub.set(club, values)
    }
    for (const [id, value] of Object.entries(measured) as [MetricId, number][]) {
      const list = values.get(id)
      if (list) list.push(value)
      else values.set(id, [value])
    }
  }

  const clubs: ClubPath[] = [...byClub.entries()]
    .flatMap(([club, values]) => {
      const paths = values.get('clubPath')
      if (!paths || paths.length === 0) return []

      const metrics: Partial<Record<ExtraMetricId, MetricReading>> = {}
      for (const metric of METRICS) {
        if (metric.id === 'clubPath') continue
        const list = values.get(metric.id)
        if (!list || list.length === 0) continue
        const entry: MetricReading = {
          typical: round2(list.reduce((a, b) => a + b, 0) / list.length),
          n: list.length,
        }
        const best = bestOf(list, metric.better)
        // Assigned conditionally: `better: 'none'` metrics carry no `best` at all.
        if (best !== undefined) entry.best = round2(best)
        metrics[metric.id as ExtraMetricId] = entry
      }

      return [{
        club,
        typical: round2(paths.reduce((a, b) => a + b, 0) / paths.length),
        // Closest to neutral. The target is a band centred on zero, so overshooting counts
        // against you — `+5` must lose to `+1`. A `Math.max` "best" would reward the fault.
        best: round2(bestOf(paths, 'neutral') as number),
        n: paths.length,
        metrics,
      }]
    })
    .sort((a, b) => compareClubs(a.club, b.club))

  if (clubs.length === 0) return null

  return {
    session: {
      id: activity.id,
      type: 'trackman',
      // The Sydney date, reusing the plan's own rule. 10 of 91 real sessions fall on a different
      // UTC date, so `time.slice(0, 10)` would misfile one session in ten.
      date: resolveISODate(new Date(activity.time)),
      clubs,
      source: 'api',
    },
    // Only the clubs that made it into the aggregates, so the two can never disagree.
    shots: shots.filter((s) => clubs.some((c) => c.club === s.club)),
  }
}

/**
 * Oldest first, tie-broken by id, so a new pull appends rather than reshuffling.
 *
 * Shots come back keyed by session id, which is what the ingest needs to address `SHOTS#<id>`.
 */
export function aggregateActivities(
  activities: RawActivity[],
  onUnknownClub?: UnknownClubReporter,
): { sessions: TrackmanSession[]; shots: Map<string, Shot[]> } {
  const shots = new Map<string, Shot[]>()
  const sessions = activities
    .map((a) => aggregateActivity(a, onUnknownClub))
    .filter((r): r is NonNullable<typeof r> => r !== null)
    .map((r) => {
      shots.set(r.session.id, r.shots)
      return r.session
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
  return { sessions, shots }
}
