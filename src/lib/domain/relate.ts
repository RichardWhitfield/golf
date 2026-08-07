import type { Club } from './clubs'
import { readingFor, type MetricId } from './metrics'
import { isTrackman, type ISODate, type Session } from './types'

/** One session's pair of readings for one club. */
export interface RelationPoint {
  date: ISODate
  x: number
  y: number
  /**
   * The smaller of the two metrics' counts — a pair is only as measured as its thinner half.
   *
   * **Absent, never zero**, when either side has no count: a hand-typed club-path row carries
   * none, and `Reading.n` says so. An absent count must stay absent — a `0` or a `NaN` here
   * would reach the dot-sizing maths and draw a guess as though it were measured.
   */
  n?: number
}

export interface Relation {
  club: Club
  x: MetricId
  y: MetricId
  /** Date-ascending. */
  points: RelationPoint[]
  /** Pearson r, or `null` with fewer than two points or no variation in either metric. */
  r: number | null
  /** Sessions holding this club but missing one of the metrics. Rendered, never hidden. */
  skipped: number
}

/**
 * Two metrics against each other, for **one club**.
 *
 * **Structurally incapable of blending.** It takes a single `Club` and never looks at another,
 * so there is no code path producing a cross-club pairing (OQ-7, issue #14) — the same guarantee
 * `series.ts` provides by keying on `Club` and never reducing across keys.
 *
 * **Computed from session aggregates, never from per-shot data.** 44 driver session means, not
 * 618 strokes. That is what keeps `/progress` clear of the per-shot download D24 forbids — and
 * it is a genuinely different number: aggregating strips per-shot scatter, so a per-shot r
 * systematically understates these.
 *
 * **The correlation is computed here, never hardcoded anywhere.** A component quoting a figure
 * from the design notes would be quoting a number the page cannot reproduce, and would keep
 * quoting it long after the swing had changed.
 */
export function relate(sessions: Session[], club: Club, x: MetricId, y: MetricId): Relation {
  const points: RelationPoint[] = []
  let skipped = 0

  for (const session of sessions) {
    if (!isTrackman(session)) continue
    const row = session.clubs.find((c) => c.club === club)
    if (!row) continue

    const a = readingFor(row, x)
    const b = readingFor(row, y)
    // Counted rather than dropped in silence: a relation drawn from four of forty sessions must
    // be able to say so, or a thin finding reads as a strong one.
    if (!a || !b) {
      skipped += 1
      continue
    }
    const point: RelationPoint = { date: session.date, x: a.typical, y: b.typical }
    // The thinner half. A pair backed by 618 path readings and 12 plane readings is a
    // 12-reading pair, and sizing it by the larger count would overstate it. Assigned
    // conditionally, exactly as `series.ts` does for `n`: a hand-typed club-path row has no
    // count, and an absent one must stay absent rather than becoming `0`.
    if (a.n !== undefined && b.n !== undefined) point.n = Math.min(a.n, b.n)
    points.push(point)
  }

  points.sort((p, q) => p.date.localeCompare(q.date))
  return { club, x, y, points, r: pearson(points), skipped }
}

/** `null` rather than `0` when there is nothing to measure: no relationship is not "no correlation". */
function pearson(points: RelationPoint[]): number | null {
  const n = points.length
  if (n < 2) return null

  let sx = 0
  let sy = 0
  for (const p of points) {
    sx += p.x
    sy += p.y
  }
  const mx = sx / n
  const my = sy / n

  let sxy = 0
  let sxx = 0
  let syy = 0
  for (const p of points) {
    sxy += (p.x - mx) * (p.y - my)
    sxx += (p.x - mx) ** 2
    syy += (p.y - my) ** 2
  }
  const denom = Math.sqrt(sxx * syy)
  // A metric that never varied has no relationship to anything, which is not r = 0.
  return denom === 0 ? null : sxy / denom
}
