/**
 * Report statistics on the per-stroke metrics the schema exposes, over real history.
 *
 * Introspection says which fields *exist*; only real data says which are *populated*, what range
 * they occupy, and whether they carry any signal about club path. All three decide the Phase 7
 * design (#25), and none can be guessed — `clubPath` alone is null on 976 of 5,877 strokes.
 *
 * **Aggregates only, never a reading.** This output is a public workflow log. Null rates and
 * ranges are the same class of figure `docs/architecture.md` already publishes; a shot-by-shot
 * record is not, and keeping it off a public channel is what Phase 6 was for.
 *
 * The token is read from `TRACKMAN_REFRESH_TOKEN` and never printed, never written to a file,
 * and never included in an error message.
 *
 * Diagnostic, not production. It duplicates the token grant and paging from
 * `src/lib/ingest/api.ts` rather than widening that class's private surface for a one-off.
 */
export {}

const TOKEN_URL = 'https://login.trackmangolf.com/connect/token'
const GRAPHQL_URL = 'https://api.trackmangolf.com/graphql'
const CLIENT_ID = 'old-golf-app.c686e909-5102-45ac-9860-8d0b789073ae'
const PAGE_SIZE = 50

/**
 * The shortlist, read from the introspection output and narrowed to what could bear on an
 * out-to-in path. The putting-green fields (`break`, `effectiveStimp`, `bounces`, `rollSpeed`)
 * and the per-shot trajectory arrays are deliberately absent — a range session has no use for
 * the first, and the second would dwarf everything else stored.
 */
const METRICS = [
  // Club delivery. `swingPlane` is the motivating question of the whole phase.
  'clubPath',
  'swingPlane',
  'swingDirection',
  'attackAngle',
  'faceAngle',
  'faceToPath',
  'dynamicLoft',
  'spinLoft',
  'dynamicLie',
  'clubSpeed',
  // Strike. Where on the face, and where the arc bottoms out.
  'impactOffset',
  'impactHeight',
  'lowPointDistance',
  'lowPointSide',
  // Tempo, in case a steep plane tracks a rushed transition.
  'strokeLength',
  'backswingTime',
  'forwardswingTime',
  'tempo',
  // Outcome. What the miss actually cost.
  'ballSpeed',
  'smashFactor',
  'launchAngle',
  'launchDirection',
  'spinRate',
  'spinAxis',
  'curve',
  'carry',
  'total',
  'carrySide',
  'totalSide',
] as const

/**
 * Fields whose *type* is not a plain `Float`, probed alongside the metrics because each would
 * change the design if it were readable: `reducedAccuracy` is Trackman's own quality flag,
 * `normalizedMeasurement` is a second reading of the same shot.
 */
const EXTRAS = [
  'kind',
  'detectedClubCategory',
  'reducedAccuracy',
  '__normalizedMeasurement',
] as const

/**
 * A selection set over just `fields`. `__normalizedMeasurement` is a sentinel rather than a real
 * field name: it sits on `Stroke`, not on `Measurement`, and needs a sub-selection of its own.
 */
function query(fields: string[]): string {
  const onMeasurement = fields.filter((f) => f !== '__normalizedMeasurement')
  const normalized = fields.includes('__normalizedMeasurement')
    ? 'normalizedMeasurement { clubPath swingPlane }'
    : ''
  const measurement = onMeasurement.length > 0 ? `measurement { ${onMeasurement.join(' ')} }` : ''
  return `
query Probe($from: DateTime!, $to: DateTime!, $take: Int!, $skip: Int!) {
  me {
    activities(kinds: [VIRTUAL_RANGE], timeFrom: $from, timeTo: $to, take: $take, skip: $skip) {
      totalCount
      pageInfo { hasNextPage }
      items {
        id
        time
        ... on VirtualRangeSessionActivity {
          strokeCount
          strokes { club ${measurement} ${normalized} }
        }
      }
    }
  }
}`
}

interface RawMeasurement {
  kind?: string | null
  detectedClubCategory?: string | null
  reducedAccuracy?: (string | null)[] | null
  [metric: string]: unknown
}

interface RawStroke {
  club?: string | null
  measurement?: RawMeasurement | null
  normalizedMeasurement?: { clubPath?: number | null; swingPlane?: number | null } | null
}

interface RawActivity {
  id: string
  time: string
  strokeCount?: number | null
  strokes?: RawStroke[] | null
}

function fail(message: string): never {
  console.error(`::error::${message}`)
  process.exit(1)
}

async function accessToken(refreshToken: string): Promise<string> {
  let res: Response
  try {
    res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: CLIENT_ID,
        refresh_token: refreshToken,
      }),
    })
  } catch (error) {
    fail(`Could not reach the token endpoint: ${error instanceof Error ? error.message : 'unknown'}`)
  }
  // Status only — the body of a failed grant can echo the grant back into a public log.
  if (!res.ok) fail(`The token exchange failed with HTTP ${res.status}.`)
  const body = (await res.json()) as { access_token?: unknown }
  if (typeof body.access_token !== 'string' || body.access_token === '') {
    fail('The token endpoint returned no access token.')
  }
  return body.access_token
}

interface Page {
  totalCount: number
  pageInfo: { hasNextPage: boolean }
  items: RawActivity[]
}

/**
 * One page. Returns the GraphQL `errors` rather than failing on them, because for this script an
 * error **is** the finding: a field the schema exposes but the player's own token cannot read
 * comes back exactly this way, inside a 200.
 */
async function page(
  token: string,
  fields: string[],
  from: string,
  take: number,
  skip: number,
): Promise<{ page?: Page; errors?: string[] }> {
  let res: Response
  try {
    res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        query: query(fields),
        variables: { from, to: '2100-01-01T00:00:00Z', take, skip },
      }),
    })
  } catch (error) {
    fail(`Could not reach the API: ${error instanceof Error ? error.message : 'unknown'}`)
  }
  if (!res.ok) fail(`The API returned HTTP ${res.status}.`)

  const body = (await res.json()) as {
    data?: { me?: { activities?: Page } }
    errors?: { message?: string }[]
  }
  if (body.errors?.length) return { errors: body.errors.map((e) => e.message ?? 'unknown') }
  const node = body.data?.me?.activities
  if (!node || !Array.isArray(node.items)) fail('The API returned no activities node.')
  return { page: node }
}

/**
 * Which fields this token may actually read, one query each.
 *
 * Every field has been readable every time it has been run, so this is a guard rather than a
 * filter. It is kept for two reasons. A single unreadable field fails the **whole request**
 * rather than nulling itself, so one silent revocation would take the daily ingest down
 * including `clubPath`; and this API is assumed to break without notice, so the readable set is
 * worth establishing rather than assuming.
 *
 * **It is not evidence that the schema over-promises.** The first run of this script reported
 * every field as unauthorized, and the cause was local: it sent the *refresh* token as the
 * bearer, having defined the token exchange and never called it. A bad credential surfaces here
 * as a field-level "not authorized to access this resource" inside a 200, not as a 401 — which
 * is worth knowing, and is exactly why the ingest is not made to interpret this error.
 */
async function authorized(token: string, from: string, candidates: string[]): Promise<string[]> {
  const allowed: string[] = []
  const denied: [string, string][] = []
  for (const field of candidates) {
    const { errors } = await page(token, [field], from, 1, 0)
    if (errors) denied.push([field, errors.join('; ')])
    else allowed.push(field)
  }
  console.log(`\n=== authorization — ${allowed.length} of ${candidates.length} readable ===`)
  console.log(`  readable: ${allowed.join(', ') || '(none)'}`)
  for (const [field, message] of denied) console.log(`  DENIED ${field}: ${message}`)
  return allowed
}

async function fetchAll(token: string, fields: string[], from: string): Promise<RawActivity[]> {
  const items: RawActivity[] = []
  for (let skip = 0; ; skip += PAGE_SIZE) {
    const { page: node, errors } = await page(token, fields, from, PAGE_SIZE, skip)
    if (errors) fail(`The API reported errors: ${errors.join('; ')}`)
    if (!node) fail('The API returned no activities node.')
    items.push(...node.items)
    if (!node.pageInfo.hasNextPage) break
    if (items.length >= node.totalCount) break
  }
  return items
}

/** Finite numbers only. A null is absence, and a NaN is not a reading either. */
function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function round(value: number, dp = 2): number {
  const f = 10 ** dp
  return Math.round(value * f) / f
}

function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN
  const at = (sorted.length - 1) * q
  const lo = Math.floor(at)
  const hi = Math.ceil(at)
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (at - lo)
}

/** Pearson r over pairs where both values are present. */
function correlate(pairs: [number, number][]): number | null {
  const n = pairs.length
  if (n < 2) return null
  let sx = 0
  let sy = 0
  for (const [x, y] of pairs) {
    sx += x
    sy += y
  }
  const mx = sx / n
  const my = sy / n
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (const [x, y] of pairs) {
    sxy += (x - mx) * (y - my)
    sxx += (x - mx) ** 2
    syy += (y - my) ** 2
  }
  const denom = Math.sqrt(sxx * syy)
  return denom === 0 ? null : sxy / denom
}

function report(label: string, strokes: RawStroke[], metrics: string[]): void {
  console.log(`\n=== ${label} — ${strokes.length} strokes ===`)
  console.log('  metric              present   null%      min      p05      p50      p95      max')
  for (const metric of metrics) {
    const values: number[] = []
    for (const s of strokes) {
      const v = num(s.measurement?.[metric])
      if (v !== null) values.push(v)
    }
    const nullPct = strokes.length === 0 ? 0 : (1 - values.length / strokes.length) * 100
    if (values.length === 0) {
      console.log(`  ${metric.padEnd(18)} ${String(0).padStart(7)}  ${'100.0'.padStart(5)}%`)
      continue
    }
    values.sort((a, b) => a - b)
    const cells = [
      values[0],
      quantile(values, 0.05),
      quantile(values, 0.5),
      quantile(values, 0.95),
      values[values.length - 1],
    ]
      .map((v) => String(round(v)).padStart(9))
      .join('')
    console.log(
      `  ${metric.padEnd(18)} ${String(values.length).padStart(7)}  ${String(round(nullPct, 1)).padStart(5)}%${cells}`,
    )
  }
}

/**
 * Session-mean ranges, per club per metric — **the level the charts actually plot at.**
 *
 * Not the same question as the per-shot spread above, and using the wrong one would misdraw every
 * panel. `scale.ts`'s existing club-path domain is `-14…4`, authored from session means; per-shot
 * club path spans `-18…10.9`. A domain taken from per-shot ranges would leave every plotted point
 * huddled in the middle of its panel.
 *
 * Reported as an observed range so the constant can be **authored** from it with headroom. The
 * domain must stay a frozen constant in source: one fitted at render time would move between
 * visits and quietly redefine "good" as "better than recent".
 */
function aggregateRanges(activities: RawActivity[], metrics: string[], only?: string): void {
  console.log(`\n=== SESSION-MEAN RANGES${only ? ` \u00b7 ${only}` : ''} (what the charts plot) ===`)
  console.log('  metric              means      min      p05      p50      p95      max')

  // One mean per session per club per metric — exactly what `aggregate.ts` will store.
  const means = new Map<string, number[]>()
  for (const activity of activities) {
    const byClub = new Map<string, RawStroke[]>()
    for (const s of activity.strokes ?? []) {
      if (!s?.club) continue
      // Scoped to one club when asked: the new /progress panels are driver-only, and an
      // all-club domain would compress them. Swing plane alone runs ~50 deg on a driver
      // against ~69 on a 4-iron.
      if (only !== undefined && s.club !== only) continue
      const list = byClub.get(s.club)
      if (list) list.push(s)
      else byClub.set(s.club, [s])
    }
    for (const [, list] of byClub) {
      for (const metric of metrics) {
        const values: number[] = []
        for (const s of list) {
          const v = num(s.measurement?.[metric])
          if (v !== null) values.push(v)
        }
        // Absent, never zero: a club with no reading for this metric contributes no point at all.
        if (values.length === 0) continue
        const mean = values.reduce((a, b) => a + b, 0) / values.length
        const into = means.get(metric)
        if (into) into.push(mean)
        else means.set(metric, [mean])
      }
    }
  }

  for (const metric of metrics) {
    const values = (means.get(metric) ?? []).slice().sort((a, b) => a - b)
    if (values.length === 0) {
      console.log(`  ${metric.padEnd(18)} ${String(0).padStart(7)}`)
      continue
    }
    const cells = [
      values[0],
      quantile(values, 0.05),
      quantile(values, 0.5),
      quantile(values, 0.95),
      values[values.length - 1],
    ]
      .map((v) => String(round(v)).padStart(9))
      .join('')
    console.log(`  ${metric.padEnd(18)} ${String(values.length).padStart(7)}${cells}`)
  }
}

/** How strongly each metric moves with club path. The phase's motivating question in one column. */
function correlations(label: string, strokes: RawStroke[], metrics: string[]): void {
  console.log(`\n=== ${label} — correlation with clubPath (Pearson r) ===`)
  const rows: [string, number, number][] = []
  for (const metric of metrics) {
    if (metric === 'clubPath') continue
    const pairs: [number, number][] = []
    for (const s of strokes) {
      const path = num(s.measurement?.clubPath)
      const other = num(s.measurement?.[metric])
      if (path !== null && other !== null) pairs.push([path, other])
    }
    const r = correlate(pairs)
    if (r !== null && pairs.length >= 30) rows.push([metric, r, pairs.length])
  }
  rows.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
  for (const [metric, r, n] of rows) {
    console.log(`  ${metric.padEnd(18)} r=${String(round(r, 3)).padStart(7)}   n=${n}`)
  }
}

const token = process.env.TRACKMAN_REFRESH_TOKEN
if (!token) fail('Set TRACKMAN_REFRESH_TOKEN.')

const since = process.env.SINCE && /^\d{4}-\d{2}-\d{2}$/.test(process.env.SINCE)
  ? process.env.SINCE
  : '2025-06-01'

const from = `${since}T00:00:00Z`
const access = await accessToken(token)

// Authorization first. The first run of this script asked for everything at once and the API
// refused the entire request — so the readable set has to be established before anything can be
// counted, and it is the readable set, not the schema, that the ingest query is built from.
const readable = await authorized(access, from, [...METRICS, ...EXTRAS])
const metrics = METRICS.filter((m) => readable.includes(m))
const extras = new Set(EXTRAS.filter((e) => readable.includes(e)))

if (!metrics.includes('clubPath')) {
  fail('clubPath is not readable. Nothing below would mean anything.')
}

const activities = await fetchAll(access, readable, from)
const strokes = activities.flatMap((a) => a.strokes ?? []).filter((s): s is RawStroke => !!s)

console.log(`\nSessions: ${activities.length}   Strokes: ${strokes.length}   Since: ${since}`)

// Volume, which decides whether per-shot data can be stored per session at all (D24).
const perSession = activities.map((a) => a.strokes?.length ?? 0).sort((a, b) => a - b)
console.log(
  `Strokes per session: min ${perSession[0]}  p50 ${quantile(perSession, 0.5)}  ` +
    `p95 ${quantile(perSession, 0.95)}  max ${perSession[perSession.length - 1]}`,
)

// `measurement.kind` and `detectedClubCategory` may distinguish a real swing from a putt or a
// misread. Frequencies first — nothing can be filtered on a value nobody has seen.
for (const field of (['kind', 'detectedClubCategory'] as const).filter((f) => extras.has(f))) {
  const counts = new Map<string, number>()
  for (const s of strokes) {
    const key = s.measurement?.[field] ?? '(null)'
    counts.set(String(key), (counts.get(String(key)) ?? 0) + 1)
  }
  const shown = [...counts].sort((a, b) => b[1] - a[1])
  console.log(`\n=== measurement.${field} ===\n  ${shown.map(([k, v]) => `${k}: ${v}`).join('\n  ')}`)
}

// Trackman's own data-quality flag. If it is populated it is a better filter than a null check,
// because it marks a reading the radar itself distrusts rather than one it never took.
if (extras.has('reducedAccuracy')) {
  const flags = new Map<string, number>()
  let withFlags = 0
  for (const s of strokes) {
    const list = s.measurement?.reducedAccuracy
    if (!Array.isArray(list) || list.length === 0) continue
    withFlags += 1
    for (const f of list) flags.set(String(f), (flags.get(String(f)) ?? 0) + 1)
  }
  console.log(`\n=== measurement.reducedAccuracy — ${withFlags} strokes carry a flag ===`)
  const listed = [...flags].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}: ${v}`)
  console.log(`  ${listed.join('\n  ') || '(none)'}`)
}

// Two readings of the same shot. If they disagree, the phase has to choose one and say why.
if (extras.has('__normalizedMeasurement')) {
  let both = 0
  let differ = 0
  let maxDelta = 0
  let normalisedOnly = 0
  for (const s of strokes) {
    const a = num(s.measurement?.clubPath)
    const b = num(s.normalizedMeasurement?.clubPath)
    if (a === null && b !== null) normalisedOnly += 1
    if (a === null || b === null) continue
    both += 1
    const delta = Math.abs(a - b)
    if (delta > 0.005) differ += 1
    if (delta > maxDelta) maxDelta = delta
  }
  console.log(
    `\n=== measurement vs normalizedMeasurement (clubPath) ===\n` +
      `  both present: ${both}   differing: ${differ}   max delta: ${round(maxDelta, 3)}°\n` +
      `  present only on normalizedMeasurement: ${normalisedOnly}`,
  )
}

aggregateRanges(activities, metrics)
aggregateRanges(activities, metrics, 'Driver')

/**
 * Correlation between two metrics at **session-mean level, within one club** — what `/progress`
 * will compute from stored aggregates.
 *
 * Deliberately separate from the per-shot figure. 618 driver shots become 44 session means, and
 * the two r values are not interchangeable: a per-shot r quoted next to a per-session chart would
 * be a number the page cannot reproduce. Within one club, never across — club selection alone
 * moves every one of these.
 */
function sessionCorrelations(club: string, activities: RawActivity[], metrics: string[]): void {
  console.log(`\n=== ${club} — session-mean correlation with clubPath ===`)
  const rows: [string, number, number][] = []
  for (const metric of metrics) {
    if (metric === 'clubPath') continue
    const pairs: [number, number][] = []
    for (const activity of activities) {
      const list = (activity.strokes ?? []).filter((s) => s?.club === club)
      const mean = (field: string): number | null => {
        const values = list.map((s) => num(s.measurement?.[field])).filter((v) => v !== null)
        return values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length
      }
      const path = mean('clubPath')
      const other = mean(metric)
      if (path !== null && other !== null) pairs.push([path, other])
    }
    const r = correlate(pairs)
    if (r !== null && pairs.length >= 10) rows.push([metric, r, pairs.length])
  }
  rows.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
  for (const [metric, r, n] of rows) {
    console.log(`  ${metric.padEnd(18)} r=${String(round(r, 3)).padStart(7)}   sessions=${n}`)
  }
}

sessionCorrelations('Driver', activities, metrics)

report('ALL CLUBS', strokes, metrics)
correlations('ALL CLUBS', strokes, metrics)

// Per club for the KPI club and the two most-hit others. Never blended: the correlation that
// matters is within one club, since club selection alone moves every one of these numbers.
const byClub = new Map<string, RawStroke[]>()
for (const s of strokes) {
  if (!s.club) continue
  const list = byClub.get(s.club)
  if (list) list.push(s)
  else byClub.set(s.club, [s])
}
console.log(
  `\n=== strokes per club ===\n  ${[...byClub]
    .sort((a, b) => b[1].length - a[1].length)
    .map(([c, l]) => `${c}: ${l.length}`)
    .join('\n  ')}`,
)

const mostHit = [...byClub].sort((a, b) => b[1].length - a[1].length).map(([c]) => c)
// The KPI club first whether or not it is the most hit, then the rest by volume.
for (const club of [...new Set(['Driver', ...mostHit])].slice(0, 4)) {
  const list = byClub.get(club)
  if (!list || list.length < 30) continue
  report(club, list, metrics)
  correlations(club, list, metrics)
}
