/**
 * Pull Trackman sessions and write them to the practice store.
 *
 * Run by `.github/workflows/trackman.yml`; also runnable locally against a token in the
 * environment. **Argument parsing and fetching only** — every rule about what a reading means
 * lives in `src/lib/ingest/`, where Vitest covers it and the browser shares it.
 *
 *   npm run ingest -- --since 2025-06-01
 *
 * The token is read from `TRACKMAN_REFRESH_TOKEN` and never printed, never written to a file,
 * and never included in an error message. This output is a public workflow log.
 *
 * `API_URL` is the Function URL. It is deliberately **not** a secret — writes are open by
 * decision (D19), so this job needs no AWS credentials of any kind.
 */
import { ApiSource } from '../src/lib/ingest/api'
import { RemoteRepo } from '../src/lib/storage/remote'
import { resolveISODate } from '../src/lib/domain/today'
import type { ISODate, TrackmanSession } from '../src/lib/domain/types'

/** A missed run self-heals: the window overlaps, and the merge is idempotent. */
const DEFAULT_WINDOW_DAYS = 14

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function fail(message: string): never {
  console.error(`::error::${message}`)
  process.exit(1)
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

function since(): ISODate {
  const given = arg('since')
  if (given !== undefined) {
    // A workflow_dispatch input is user-controlled and reaches a URL query. Validate the shape
    // before it goes anywhere near a request.
    if (!ISO_DATE.test(given)) fail(`--since must be YYYY-MM-DD, not "${given}".`)
    return given
  }
  const from = new Date()
  from.setUTCDate(from.getUTCDate() - DEFAULT_WINDOW_DAYS)
  return resolveISODate(from)
}

async function main(): Promise<void> {
  const token = process.env.TRACKMAN_REFRESH_TOKEN
  if (!token) fail('Set TRACKMAN_REFRESH_TOKEN.')

  const url = process.env.API_URL
  if (!url) fail('Set API_URL to the Function URL.')

  const from = since()

  const unknownClubs = new Set<string>()
  const source = new ApiSource(token)

  let fetched: TrackmanSession[]
  try {
    // The per-shot records come back alongside the sessions. Nothing writes them yet — that
    // needs its own key in the store, so it lands with the rest of the shot storage.
    const pulled = await source.fetchSince(from, (name) => unknownClubs.add(name))
    fetched = pulled.sessions
  } catch (error) {
    fail(error instanceof Error ? error.message : 'The pull failed for an unknown reason.')
  }

  for (const name of unknownClubs) {
    // Named exactly as the API spells it, so adding it to the mapping is a one-line change with
    // the real string in hand. `normaliseClub` refuses to guess, so this is the only signal.
    console.log(`::warning::Unmapped club "${name}" — its strokes were skipped. Add it to src/lib/domain/clubs.ts.`)
  }

  // The same merge the browser uses, against the store rather than a file. `mergeTrackman` adds
  // `?ifNotManual=1` per write, so a hand-typed record survives even if a save from the phone
  // lands between this read and its write.
  let result
  try {
    result = await new RemoteRepo(url).mergeTrackman(fetched)
  } catch (error) {
    fail(error instanceof Error ? error.message : 'The store could not be written.')
  }

  console.log(
    `Pulled from ${from}: ${fetched.length} session(s) measured · ` +
      `${result.added} new · ${result.updated} updated · ${result.skipped} skipped.`,
  )
}

await main()
