/**
 * Read the Trackman GraphQL schema and report the per-stroke measurement surface.
 *
 * Run by `.github/workflows/trackman-introspect.yml`, which holds the credential. The point is
 * the standing rule in `CLAUDE.md`: **field names are read from the live schema, never written
 * from memory.** Guessing at this API's shapes has cost the project twice.
 *
 * The token is read from `TRACKMAN_REFRESH_TOKEN` and never printed, never written to a file,
 * and never included in an error message. This output is a public workflow log.
 *
 * **No stroke data is fetched here.** Only the schema, which is public surface on an API with
 * introspection enabled. Per-shot readings are the user's own and have no business in a public
 * artifact — that is the whole reason Phase 6 moved storage off a public repo.
 */
const TOKEN_URL = 'https://login.trackmangolf.com/connect/token'
const GRAPHQL_URL = 'https://api.trackmangolf.com/graphql'

/** The public mobile OAuth client, as used by the ingest. No client secret. */
const CLIENT_ID = 'old-golf-app.c686e909-5102-45ac-9860-8d0b789073ae'

/**
 * The two field names this script is allowed to assume, and it assumes them only because the
 * shipping query in `src/lib/ingest/api.ts` proves they resolve. Everything else is reached by
 * walking the schema from here, so no type name is ever invented.
 */
const ROOT_TYPE = 'VirtualRangeSessionActivity'
const STROKES_FIELD = 'strokes'
const MEASUREMENT_FIELD = 'measurement'

const OUT_FILE = 'introspection.json'

interface TypeRef {
  kind: string
  name: string | null
  ofType: TypeRef | null
}

interface Field {
  name: string
  description: string | null
  type: TypeRef
  isDeprecated: boolean
  deprecationReason: string | null
}

interface FullType {
  kind: string
  name: string | null
  description: string | null
  fields: Field[] | null
  enumValues: { name: string }[] | null
}

const TYPE_REF = `
fragment ref on __Type {
  kind name
  ofType { kind name ofType { kind name ofType { kind name } } }
}`

const QUERY = `
query Introspect {
  __schema {
    types {
      kind
      name
      description
      fields(includeDeprecated: true) {
        name
        description
        isDeprecated
        deprecationReason
        type { ...ref }
      }
      enumValues(includeDeprecated: true) { name }
    }
  }
}
${TYPE_REF}`

function fail(message: string): never {
  console.error(`::error::${message}`)
  process.exit(1)
}

/**
 * Refresh-token grant. Mirrors `ApiSource`, deliberately duplicated rather than exported from it:
 * that class's token handling is private, and widening its surface for a diagnostic would be the
 * tail wagging the dog.
 */
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
  // Status only. The response body of a failed grant can echo the grant back, and this message
  // ends up in a public workflow log.
  if (!res.ok) fail(`The token exchange failed with HTTP ${res.status}.`)

  const body = (await res.json()) as { access_token?: unknown }
  if (typeof body.access_token !== 'string' || body.access_token === '') {
    fail('The token endpoint returned no access token.')
  }
  return body.access_token
}

async function introspect(token: string): Promise<FullType[]> {
  let res: Response
  try {
    res = await fetch(GRAPHQL_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ query: QUERY }),
    })
  } catch (error) {
    fail(`Could not reach the API: ${error instanceof Error ? error.message : 'unknown'}`)
  }
  if (!res.ok) fail(`The API returned HTTP ${res.status}.`)

  const body = (await res.json()) as {
    data?: { __schema?: { types?: FullType[] } }
    errors?: { message?: string }[]
  }
  // GraphQL reports failures inside a 200. An ignored `errors` array would look like an empty
  // schema, which is indistinguishable from introspection having been switched off.
  if (body.errors?.length) {
    fail(`The API reported errors: ${body.errors.map((e) => e.message ?? 'unknown').join('; ')}`)
  }
  const types = body.data?.__schema?.types
  if (!Array.isArray(types)) fail('The API returned no schema.')
  return types
}

/** `[Stroke!]!` → `Stroke`. Wrappers carry no name; only the innermost named type does. */
function unwrap(ref: TypeRef): string | null {
  let at: TypeRef | null = ref
  while (at) {
    if (at.name) return at.name
    at = at.ofType
  }
  return null
}

/** `[Stroke!]!` rendered back out, so the report shows nullability rather than hiding it. */
function render(ref: TypeRef | null): string {
  if (!ref) return '?'
  if (ref.kind === 'NON_NULL') return `${render(ref.ofType)}!`
  if (ref.kind === 'LIST') return `[${render(ref.ofType)}]`
  return ref.name ?? '?'
}

function main(types: FullType[], byName: Map<string, FullType>): void {
  const root = byName.get(ROOT_TYPE)
  if (!root) fail(`The schema has no type ${ROOT_TYPE}. The API's shape has changed.`)

  const strokes = root.fields?.find((f) => f.name === STROKES_FIELD)
  if (!strokes) fail(`${ROOT_TYPE} has no ${STROKES_FIELD} field. The API's shape has changed.`)

  const strokeTypeName = unwrap(strokes.type)
  const strokeType = strokeTypeName ? byName.get(strokeTypeName) : undefined
  if (!strokeType) fail(`Could not resolve the element type of ${ROOT_TYPE}.${STROKES_FIELD}.`)

  console.log(`\n=== ${strokeType.name} (${ROOT_TYPE}.${STROKES_FIELD}) ===`)
  for (const f of strokeType.fields ?? []) {
    console.log(`  ${f.name}: ${render(f.type)}${f.isDeprecated ? '  [DEPRECATED]' : ''}`)
  }

  const measurement = strokeType.fields?.find((f) => f.name === MEASUREMENT_FIELD)
  if (!measurement) {
    fail(`${strokeType.name} has no ${MEASUREMENT_FIELD} field. The API's shape has changed.`)
  }

  const measurementTypeName = unwrap(measurement.type)
  const measurementType = measurementTypeName ? byName.get(measurementTypeName) : undefined
  if (!measurementType) fail(`Could not resolve ${strokeType.name}.${MEASUREMENT_FIELD}.`)

  const fields = measurementType.fields ?? []
  console.log(`\n=== ${measurementType.name} — ${fields.length} fields ===`)
  console.log(`(${strokeType.name}.${MEASUREMENT_FIELD}: ${render(measurement.type)})\n`)
  for (const f of fields) {
    const flag = f.isDeprecated ? `  [DEPRECATED${f.deprecationReason ? `: ${f.deprecationReason}` : ''}]` : ''
    const doc = f.description ? `\n      ${f.description.replace(/\s+/g, ' ')}` : ''
    console.log(`  ${f.name}: ${render(f.type)}${flag}${doc}`)
  }

  // Enums reachable from the measurement type. A field typed as an enum needs its members known
  // before anything can be stored against it.
  const enums = new Set<string>()
  for (const f of fields) {
    const name = unwrap(f.type)
    const type = name ? byName.get(name) : undefined
    if (type?.kind === 'ENUM' && type.name) enums.add(type.name)
  }
  for (const name of enums) {
    const values = byName.get(name)?.enumValues ?? []
    console.log(`\n=== enum ${name} ===\n  ${values.map((v) => v.name).join(', ')}`)
  }

  // Neighbouring shapes worth seeing whole. `aggregatedMeasurement` is rejected for storage
  // (it cannot report `n`), but its field list is the clearest statement of what Trackman
  // considers a measurement, so it is reported for comparison rather than used.
  const related = types
    .filter((t) => t.name && /measurement/i.test(t.name) && t.name !== measurementType.name)
    .map((t) => `${t.name} (${t.kind}, ${t.fields?.length ?? 0} fields)`)
  console.log(`\n=== other *Measurement* types ===\n  ${related.join('\n  ') || '(none)'}`)

  console.log(`\nFull schema written to ${OUT_FILE} — ${types.length} types.`)
}

const token = process.env.TRACKMAN_REFRESH_TOKEN
if (!token) fail('Set TRACKMAN_REFRESH_TOKEN.')

const types = await introspect(await accessToken(token))
const byName = new Map(types.filter((t) => t.name).map((t) => [t.name as string, t]))

const { writeFile } = await import('node:fs/promises')
await writeFile(OUT_FILE, JSON.stringify(types, null, 2))

main(types, byName)
