/**
 * The metric vocabulary.
 *
 * The counterpart to `domain/clubs.ts`: that file refuses to guess a club's Trackman spelling,
 * and this one refuses to guess an axis. **Every `field` below was read from the live schema
 * via `npm run introspect`, never written from memory.**
 *
 * Twelve of the 75 fields on `Measurement` are here. The test applied was *does this answer a
 * question that is being asked*, not *is it available* — see §3 of the Phase 7 spec for why
 * each one earns its place and why the rest do not.
 */
import { BAND, DOMAIN } from './scale'

export type MetricId =
  | 'clubPath'
  | 'faceAngle'
  | 'faceToPath'
  | 'swingPlane'
  | 'attackAngle'
  | 'curve'
  | 'clubSpeed'
  | 'carry'
  | 'lowPointDistance'
  | 'lowPointSide'
  | 'dynamicLoft'
  | 'spinLoft'

/**
 * What "best" means, per metric. **It cannot be one rule.**
 *
 * `neutral` — closest to zero wins, because the target is a band and `+5°` is worse than `+1°`.
 * `higher`  — the largest reading genuinely is the best one.
 * `none`    — there is no shared target, so no `best` is stored and no band is drawn.
 */
export type Better = 'neutral' | 'higher' | 'none'

export interface MetricInfo {
  id: MetricId
  /** The `Measurement` field name on the wire. Verified by introspection, never guessed. */
  field: string
  /** Monospaced UI label. Short — it sits in a row of numbers. */
  short: string
  /** Prose label. */
  name: string
  unit: '°' | 'm' | 'm/s'
  /**
   * The fixed y-domain. **Authored from real driver session means with headroom, then frozen.**
   *
   * A domain fitted to the data at render time would move between visits and quietly redefine
   * "good" as "better than recent" rather than "inside the band".
   *
   * **These are scoped to the driver**, the only club these are charted for in this phase.
   * Several are strongly club-dependent — swing plane runs ~50° on a driver against ~69° on a
   * 4-iron, and dynamic loft reaches 55° across the bag against 25° on the driver. Charting any
   * of these for a second club means **authoring that club's domain first**. It is not a
   * derivation to be automated.
   */
  domain: { min: number; max: number }
  /** The coaching target, where one genuinely exists. Absent whenever `better` is `none`. */
  band?: { min: number; max: number }
  better: Better
  decimals: 0 | 1 | 2
}

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

/**
 * The single best reading among `values`, or `undefined` where the metric has no target.
 *
 * **Never `Math.max` for a `neutral` metric** — that reports the worst overshoot as the best
 * strike. **Never `Math.abs` on the stored value** either: the comparison uses magnitude, but
 * the value returned keeps its sign, because a sign flip is the one error that matters most.
 */
export function bestOf(values: number[], better: Better): number | undefined {
  if (values.length === 0 || better === 'none') return undefined
  if (better === 'higher') return values.reduce((a, b) => (b > a ? b : a))
  return values.reduce((a, b) => (Math.abs(b) < Math.abs(a) ? b : a))
}
