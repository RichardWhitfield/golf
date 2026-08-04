/**
 * Pull Trackman sessions and write them to the published data file.
 *
 * Run by `.github/workflows/trackman.yml`; also runnable locally against a token in the
 * environment. **Argument parsing, fetching and file writing only** — every rule about what a
 * reading means lives in `src/lib/ingest/`, where Vitest covers it and the browser shares it.
 *
 *   npm run ingest -- --since 2025-06-01 --out public/trackman.json
 *
 * The token is read from `TRACKMAN_REFRESH_TOKEN` and never printed, never written to a file,
 * and never included in an error message. This output is a public workflow log.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { ApiSource } from '../src/lib/ingest/api'
import { mergeTrackmanSessions } from '../src/lib/ingest/merge'
import { PUBLISHED_FORMAT_VERSION, parsePublished } from '../src/lib/ingest/published'
import { resolveISODate } from '../src/lib/domain/today'
import type { ISODate, TrackmanSession } from '../src/lib/domain/types'

const DEFAULT_OUT = 'public/trackman.json'

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

/** What is already published, so a short window never truncates the history. */
function existing(path: string): TrackmanSession[] {
  if (!existsSync(path)) return []
  try {
    return parsePublished(JSON.parse(readFileSync(path, 'utf8')))
  } catch (error) {
    // Refuse rather than overwrite. The file is in git, so a bad one is recoverable — but only
    // if this job does not replace it with a partial rewrite first.
    fail(
      `${path} exists but could not be read: ${error instanceof Error ? error.message : 'unknown'}`,
    )
  }
}

async function main(): Promise<void> {
  const token = process.env.TRACKMAN_REFRESH_TOKEN
  if (!token) fail('Set TRACKMAN_REFRESH_TOKEN.')

  const out = arg('out') ?? DEFAULT_OUT
  const from = since()

  const unknownClubs = new Set<string>()
  const source = new ApiSource(token)

  let fetched: TrackmanSession[]
  try {
    fetched = await source.fetchSince(from, (name) => unknownClubs.add(name))
  } catch (error) {
    fail(error instanceof Error ? error.message : 'The pull failed for an unknown reason.')
  }

  for (const name of unknownClubs) {
    // Named exactly as the API spells it, so adding it to the mapping is a one-line change with
    // the real string in hand. `normaliseClub` refuses to guess, so this is the only signal.
    console.log(`::warning::Unmapped club "${name}" — its strokes were skipped. Add it to src/lib/domain/clubs.ts.`)
  }

  const before = existing(out)
  const result = mergeTrackmanSessions(before, fetched)
  const sessions = result.sessions.filter((s): s is TrackmanSession => s.type === 'trackman')
  sessions.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))

  // No `generated` timestamp: it would change on every run and force a commit even when no golf
  // happened. Git already records when.
  writeFileSync(out, `${JSON.stringify({ version: PUBLISHED_FORMAT_VERSION, sessions }, null, 2)}\n`)

  console.log(
    `Pulled from ${from}: ${fetched.length} session(s) measured · ` +
      `${result.added} new · ${result.updated} updated · ${sessions.length} in ${out}.`,
  )
}

await main()
