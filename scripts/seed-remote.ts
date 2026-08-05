/**
 * One-off: push the committed Trackman history into the remote store.
 *
 * **The file being retired is the migration source.** `public/trackman.json` is already in the
 * right shape, needs no refresh token, and exercises none of the undocumented API — so the seed
 * is verifiable by comparing counts against a file that can simply be read.
 *
 *   API_URL=https://xxxx.lambda-url.ap-southeast-2.on.aws npm run seed
 *
 * Idempotent: `mergeTrackman` is keyed on the activity id, so a second run adds nothing.
 */
import { readFileSync } from 'node:fs'
import { RemoteRepo } from '../src/lib/storage/remote'
import { parsePublished } from '../src/lib/ingest/published'

const IN = 'public/trackman.json'

function fail(message: string): never {
  console.error(`::error::${message}`)
  process.exit(1)
}

const url = process.env.API_URL
if (!url) fail('Set API_URL to the Function URL.')

const sessions = parsePublished(JSON.parse(readFileSync(IN, 'utf8')))
console.log(`${IN} holds ${sessions.length} session(s).`)

const result = await new RemoteRepo(url).mergeTrackman(sessions)
console.log(`Seeded: ${result.added} added · ${result.updated} updated · ${result.skipped} skipped.`)

// Read back through a fresh repo, so the check exercises the store rather than trusting the
// merge's own account of what it did.
const stored = await new RemoteRepo(url).listSessions()
const trackman = stored.filter((s) => s.type === 'trackman')
if (trackman.length !== sessions.length) {
  fail(
    `Seeded ${trackman.length} but the file holds ${sessions.length}. Investigate before continuing.`,
  )
}
console.log(`Verified: ${trackman.length} Trackman session(s) in the store.`)
