/**
 * The metric vocabulary.
 *
 * The counterpart to `domain/clubs.ts`: that file refuses to guess a club's Trackman spelling,
 * and this one refuses to guess an axis. **Every `field` below was read from the live schema
 * via `npm run introspect`, never written from memory.**
 *
 * Forty-three of the 75 fields on `Measurement` are here: the twelve the Phase 7 spec chose to
 * answer a specific question, plus 31 more carried from Phase 8 once the probe showed they were
 * populated. Carrying is now the default and charting the exception — see `CarriedMetric` and
 * `ChartedMetric` below for the split, and §3 of the Phase 8 spec for why each of the remaining
 * 32 fields still earns no place at all.
 */
import { BAND, DOMAIN } from './scale'
import type { ClubPath } from './types'

export type MetricId =
  // Charted — club delivery
  | 'clubPath' | 'faceAngle' | 'faceToPath' | 'swingPlane' | 'attackAngle' | 'curve'
  | 'clubSpeed' | 'carry' | 'lowPointDistance' | 'lowPointSide' | 'dynamicLoft' | 'spinLoft'
  // Charted — ball flight, added in Phase 8
  | 'ballSpeed' | 'smashFactor' | 'spinRate' | 'launchAngle' | 'total' | 'spinAxis'
  // Carried only
  | 'swingDirection' | 'swingRadius' | 'dPlaneTilt' | 'dynamicLie' | 'impactOffset'
  | 'impactHeight' | 'lowPointHeight' | 'ballSpeedDifference' | 'smashIndex' | 'launchDirection'
  | 'spinRateDifference' | 'spinIndex' | 'carrySide' | 'totalSide' | 'landingAngle'
  | 'hangTime' | 'maxHeight' | 'lastData'
  | 'spinAxisActual' | 'curveActual' | 'carryActual' | 'totalActual'
  | 'carrySideActual' | 'totalSideActual' | 'landingAngleActual'

/**
 * What "best" means, per metric. **It cannot be one rule.**
 *
 * `neutral` — closest to the midpoint of the band wins, because the target is a band and `+5°`
 * is worse than `+1°`. The midpoint is not always zero — `spinRate`'s band is 2,200–2,700 rpm —
 * so the rule is expressed as "closest to the midpoint", never as "closest to zero".
 * `higher`  — the largest reading genuinely is the best one.
 * `none`    — there is no shared target, so no `best` is stored and no band is drawn.
 */
export type Better = 'neutral' | 'higher' | 'none'

export type Unit = '°' | 'm' | 'm/s' | 'rpm' | 's' | ''

/**
 * A metric that is **stored** — per shot and as a session reading — but not plotted.
 *
 * Carrying is the default. It costs a wire name in this registry and nothing else, and the cost
 * of *not* carrying a field is a question that cannot be answered until the next session and
 * never retrospectively. That is the mistake Phase 7 made with `ballSpeed` and `spinRate`.
 */
export interface CarriedMetric {
  id: MetricId
  /** The `Measurement` field name on the wire. Verified by introspection, never guessed. */
  field: string
  /** Monospaced UI label. Short — it sits in a row of numbers. */
  short: string
  /** Prose label. */
  name: string
  unit: Unit
  decimals: 0 | 1 | 2
}

/**
 * A metric that is stored **and plotted**, so it needs a fixed axis.
 *
 * **The axis is authored, driver-scoped, and frozen** — never fitted to the data at render
 * time, which would move between visits and quietly redefine "good" as "better than recent"
 * rather than "inside the band". Several metrics are strongly club-dependent — swing plane runs
 * ~50° on a driver against ~69° on a 4-iron, and dynamic loft reaches 55° across the bag against
 * 25° on the driver. Charting any of these for a second club means **authoring that club's
 * domain first**. It is not a derivation to be automated.
 */
export interface ChartedMetric extends CarriedMetric {
  domain: { min: number; max: number }
  /** The coaching target, where one genuinely exists. Absent whenever `better` is `none`. */
  band?: { min: number; max: number }
  better: Better
}

export type MetricInfo = CarriedMetric | ChartedMetric

/**
 * Ordered as the panels read: the KPI, then what explains it, then what it cost.
 *
 * Club path reuses `scale.ts`'s domain and band rather than restating them — one value, one
 * home, and a second copy would drift silently.
 */
export const METRICS: MetricInfo[] = [
  { id: 'clubPath', field: 'clubPath', short: 'PATH', name: 'Club path', unit: '°',
    domain: DOMAIN, band: BAND, better: 'neutral', decimals: 2 },
  { id: 'faceAngle', field: 'faceAngle', short: 'FACE', name: 'Face angle', unit: '°',
    domain: { min: -8, max: 6 }, band: { min: -2, max: 2 }, better: 'neutral', decimals: 2 },
  { id: 'faceToPath', field: 'faceToPath', short: 'FACE→PATH', name: 'Face to path', unit: '°',
    domain: { min: -4, max: 12 }, band: { min: -2, max: 2 }, better: 'neutral', decimals: 2 },
  { id: 'swingPlane', field: 'swingPlane', short: 'PLANE', name: 'Swing plane', unit: '°',
    domain: { min: 40, max: 66 }, better: 'none', decimals: 1 },
  { id: 'attackAngle', field: 'attackAngle', short: 'ATTACK', name: 'Attack angle', unit: '°',
    domain: { min: -10, max: 4 }, better: 'none', decimals: 2 },
  { id: 'curve', field: 'curve', short: 'CURVE', name: 'Curve', unit: 'm',
    domain: { min: -8, max: 48 }, band: { min: -5, max: 5 }, better: 'neutral', decimals: 1 },
  { id: 'clubSpeed', field: 'clubSpeed', short: 'SPEED', name: 'Club speed', unit: 'm/s',
    domain: { min: 36, max: 48 }, better: 'higher', decimals: 1 },
  { id: 'carry', field: 'carry', short: 'CARRY', name: 'Carry', unit: 'm',
    domain: { min: 80, max: 200 }, better: 'higher', decimals: 0 },
  { id: 'lowPointDistance', field: 'lowPointDistance', short: 'LOW PT', name: 'Low point', unit: 'm',
    domain: { min: -0.1, max: 0.3 }, better: 'none', decimals: 2 },
  { id: 'lowPointSide', field: 'lowPointSide', short: 'LOW SIDE', name: 'Low point side', unit: 'm',
    domain: { min: -0.08, max: 0.04 }, band: { min: -0.02, max: 0.02 }, better: 'neutral', decimals: 2 },
  { id: 'dynamicLoft', field: 'dynamicLoft', short: 'DYN LOFT', name: 'Dynamic loft', unit: '°',
    domain: { min: 8, max: 28 }, better: 'none', decimals: 1 },
  { id: 'spinLoft', field: 'spinLoft', short: 'SPIN LOFT', name: 'Spin loft', unit: '°',
    domain: { min: 12, max: 34 }, better: 'none', decimals: 1 },
  // Ball flight. Added in Phase 8: these are 0% null on the driver, better populated than
  // `clubPath` itself at 14.5%, and they are what answers a question about distance.
  { id: 'ballSpeed', field: 'ballSpeed', short: 'BALL', name: 'Ball speed', unit: 'm/s',
    domain: { min: 38, max: 64 }, better: 'higher', decimals: 1 },
  // `higher`, not `neutral`, and the exception that proves the band rule: ~1.50 is a physical
  // ceiling rather than the centre of a range, so "closest to the midpoint" would rank a 1.475
  // strike above a 1.50 one. The band is drawn as a target region and never used to pick `best`.
  { id: 'smashFactor', field: 'smashFactor', short: 'SMASH', name: 'Smash factor', unit: '',
    domain: { min: 1.05, max: 1.55 }, band: { min: 1.45, max: 1.5 }, better: 'higher', decimals: 2 },
  { id: 'spinRate', field: 'spinRate', short: 'SPIN', name: 'Spin rate', unit: 'rpm',
    domain: { min: 2000, max: 8000 }, band: { min: 2200, max: 2700 }, better: 'neutral', decimals: 0 },
  { id: 'launchAngle', field: 'launchAngle', short: 'LAUNCH', name: 'Launch angle', unit: '°',
    domain: { min: 6, max: 22 }, band: { min: 13, max: 15 }, better: 'neutral', decimals: 1 },
  { id: 'total', field: 'total', short: 'TOTAL', name: 'Total distance', unit: 'm',
    domain: { min: 90, max: 210 }, better: 'higher', decimals: 0 },
  { id: 'spinAxis', field: 'spinAxis', short: 'AXIS', name: 'Spin axis', unit: '°',
    domain: { min: -10, max: 32 }, band: { min: -5, max: 5 }, better: 'neutral', decimals: 1 },
  // Carried, never charted. Stored per shot and as a session reading; no authored axis.
  //
  // `swingDirection` is the clearest case for the split: Phase 7 excluded it as near-collinear
  // with `clubPath` (r = 0.866 on the driver), which is a reason not to draw a second panel
  // saying the same thing — and no reason at all to discard the reading.
  { id: 'swingDirection', field: 'swingDirection', short: 'SWING DIR', name: 'Swing direction', unit: '°', decimals: 2 },
  { id: 'swingRadius', field: 'swingRadius', short: 'RADIUS', name: 'Swing radius', unit: 'm', decimals: 2 },
  { id: 'dPlaneTilt', field: 'dPlaneTilt', short: 'D-PLANE', name: 'D-plane tilt', unit: '°', decimals: 1 },
  { id: 'dynamicLie', field: 'dynamicLie', short: 'LIE', name: 'Dynamic lie', unit: '°', decimals: 1 },
  { id: 'impactOffset', field: 'impactOffset', short: 'OFFSET', name: 'Impact offset', unit: 'm', decimals: 2 },
  { id: 'impactHeight', field: 'impactHeight', short: 'IMP HT', name: 'Impact height', unit: 'm', decimals: 2 },
  { id: 'lowPointHeight', field: 'lowPointHeight', short: 'LOW HT', name: 'Low point height', unit: 'm', decimals: 2 },
  { id: 'ballSpeedDifference', field: 'ballSpeedDifference', short: 'BALL Δ', name: 'Ball speed difference', unit: 'm/s', decimals: 2 },
  { id: 'smashIndex', field: 'smashIndex', short: 'SMASH IX', name: 'Smash index', unit: '', decimals: 2 },
  { id: 'launchDirection', field: 'launchDirection', short: 'LAUNCH DIR', name: 'Launch direction', unit: '°', decimals: 2 },
  { id: 'spinRateDifference', field: 'spinRateDifference', short: 'SPIN Δ', name: 'Spin rate difference', unit: 'rpm', decimals: 0 },
  { id: 'spinIndex', field: 'spinIndex', short: 'SPIN IX', name: 'Spin index', unit: '', decimals: 2 },
  { id: 'carrySide', field: 'carrySide', short: 'CARRY SIDE', name: 'Carry side', unit: 'm', decimals: 1 },
  { id: 'totalSide', field: 'totalSide', short: 'TOTAL SIDE', name: 'Total side', unit: 'm', decimals: 1 },
  { id: 'landingAngle', field: 'landingAngle', short: 'LANDING', name: 'Landing angle', unit: '°', decimals: 1 },
  { id: 'hangTime', field: 'hangTime', short: 'HANG', name: 'Hang time', unit: 's', decimals: 2 },
  { id: 'maxHeight', field: 'maxHeight', short: 'APEX', name: 'Max height', unit: 'm', decimals: 1 },
  { id: 'lastData', field: 'lastData', short: 'LAST', name: 'Last data', unit: '', decimals: 2 },
  // The `*Actual` variants are the unnormalised readings. They earn their place on evidence:
  // 2.1% null on the driver against 14.2% for `curve`, and they differ from the normalised
  // values (`curveActual` p50 18.51 against `curve` 22.05), so they are a second, denser view
  // of the same shot rather than a duplicate.
  { id: 'spinAxisActual', field: 'spinAxisActual', short: 'AXIS ACT', name: 'Spin axis, actual', unit: '°', decimals: 1 },
  { id: 'curveActual', field: 'curveActual', short: 'CURVE ACT', name: 'Curve, actual', unit: 'm', decimals: 1 },
  { id: 'carryActual', field: 'carryActual', short: 'CARRY ACT', name: 'Carry, actual', unit: 'm', decimals: 0 },
  { id: 'totalActual', field: 'totalActual', short: 'TOTAL ACT', name: 'Total, actual', unit: 'm', decimals: 0 },
  { id: 'carrySideActual', field: 'carrySideActual', short: 'C SIDE ACT', name: 'Carry side, actual', unit: 'm', decimals: 1 },
  { id: 'totalSideActual', field: 'totalSideActual', short: 'T SIDE ACT', name: 'Total side, actual', unit: 'm', decimals: 1 },
  { id: 'landingAngleActual', field: 'landingAngleActual', short: 'LAND ACT', name: 'Landing angle, actual', unit: '°', decimals: 1 },
]

/**
 * A `Map`, not an object literal, for the same reason `clubs.ts` uses one: `{}['toString']`
 * returns a function rather than `undefined`, so an object-literal lookup would happily
 * "recognise" `toString` as a metric.
 */
const BY_ID = new Map<MetricId, MetricInfo>(METRICS.map((m) => [m.id, m]))

/** The wire field names, in registry order. The GraphQL selection set is built from this. */
export const METRIC_FIELDS: string[] = METRICS.map((m) => m.field)

export function metricInfo(id: MetricId): MetricInfo {
  const info = BY_ID.get(id)
  if (!info) throw new Error(`Unknown metric: ${id}`)
  return info
}

export function isMetricId(value: unknown): value is MetricId {
  return typeof value === 'string' && BY_ID.has(value as MetricId)
}

/** The only route to an axis. A carried-only metric has none, and the compiler enforces it. */
export function isCharted(metric: MetricInfo): metric is ChartedMetric {
  return 'domain' in metric
}

/** Registry order, charted only. What `/progress` iterates. */
export const CHARTED: ChartedMetric[] = METRICS.filter(isCharted)

/**
 * A charted metric by id, or a throw.
 *
 * Panels reach axes through this rather than through `metricInfo`, so asking to plot a
 * carried-only metric fails loudly at the call rather than rendering an undefined domain.
 */
export function chartedInfo(id: MetricId): ChartedMetric {
  const info = metricInfo(id)
  if (!isCharted(info)) {
    throw new Error(`Metric ${id} is not charted: it has no authored domain.`)
  }
  return info
}

/**
 * The single best reading among `values`, or `undefined` where the metric has no target.
 *
 * `neutral` — closest to the **midpoint of the band**. For `clubPath`, `faceAngle`,
 * `faceToPath`, `curve` and `lowPointSide` that midpoint is `0`, so this is exactly the
 * "closest to neutral" rule those metrics have always had. `spinRate` and `launchAngle` are
 * why it is expressed as a midpoint rather than as zero: their targets are 2,200–2,700 rpm and
 * 13–15°, and neither centres on zero.
 *
 * **Never `Math.max` for a `neutral` metric** — that reports the worst overshoot as the best
 * strike. **Never `Math.abs` on the stored value** either: the comparison uses distance, but
 * the value returned keeps its sign, because a sign flip is the one error that matters most.
 *
 * A `neutral` metric with no band is a programming error, not a defaulted-to-zero case: the
 * registry test asserts every `neutral` entry carries one.
 */
export function bestOf(
  values: number[],
  better: Better,
  band?: { min: number; max: number },
): number | undefined {
  if (values.length === 0 || better === 'none') return undefined
  if (better === 'higher') return values.reduce((a, b) => (b > a ? b : a))
  if (!band) throw new Error('A `neutral` metric needs a band: its midpoint is the target.')
  const target = (band.min + band.max) / 2
  return values.reduce((a, b) => (Math.abs(b - target) < Math.abs(a - target) ? b : a))
}

/**
 * A metric's reading as *read back*, where the count may genuinely be absent.
 *
 * Distinct from `MetricReading`, the **stored** shape, whose `n` is required because every
 * stored reading was computed from strokes. Club path is the exception: it keeps its own
 * optional `n` on `ClubPath`, and a hand-typed row has none at all. Widening here rather than
 * casting is what lets the compiler enforce "absent, never zero" — this cast previously
 * produced a `NaN` in a correlation and the literal text "undefined shots" on a panel.
 */
export interface Reading {
  typical: number
  best?: number
  n?: number
}

/**
 * A uniform view of any metric on a club row.
 *
 * Club path lives in `ClubPath`'s own `typical`/`best`/`n` fields and everything else lives in
 * `metrics`. **This function is the one place that knows that**, so no caller has to special-case
 * it and no value has to be stored twice.
 *
 * Returns the widened `Reading`, not the stored `MetricReading`: club path's count is genuinely
 * optional, and saying so in the type is what stops a caller reading it as a number.
 */
export function readingFor(row: ClubPath, id: MetricId): Reading | undefined {
  if (id !== 'clubPath') return row.metrics?.[id]
  return { typical: row.typical, best: row.best, n: row.n }
}
