import type { TrackmanSession } from '../domain/types'
import { InvalidImportError, checkTrackmanSession } from '../storage/transfer'

/** Same origin — the file ships in `dist/` from `public/`. No external host is involved. */
export const PUBLISHED_URL = '/trackman.json'

/** The *file format*, versioned independently of the store's `schemaVersion`. */
export const PUBLISHED_FORMAT_VERSION = 1

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Validated with the same function `transfer.ts` uses for hand-picked imports: one validator, one
 * voice, and a published file held to exactly the standard an imported one is.
 */
export function parsePublished(raw: unknown): TrackmanSession[] {
  if (!isRecord(raw) || !Array.isArray(raw.sessions)) {
    throw new InvalidImportError('That file is not a Trackman export: it has no sessions.')
  }
  if (raw.version !== PUBLISHED_FORMAT_VERSION) {
    throw new InvalidImportError(
      `That file is not a Trackman export: it is format version ${String(raw.version)}, and ` +
        `this build reads ${PUBLISHED_FORMAT_VERSION}. Update the site.`,
    )
  }
  return raw.sessions.map((session, i) => {
    const where = `Trackman session ${i + 1}`
    if (!isRecord(session)) {
      throw new InvalidImportError(`That file is not a Trackman export: ${where} is not an object.`)
    }
    if (session.type !== 'trackman') {
      throw new InvalidImportError(
        `That file is not a Trackman export: ${where} has type "${String(session.type)}".`,
      )
    }
    return {
      ...checkTrackmanSession(session, where),
      // Provenance is stamped here, never taken from the file. A published record is by
      // definition fetched, and trusting the file's own claim would let it mark itself
      // hand-typed — which under the merge rules makes it permanently unoverwritable.
      source: 'api' as const,
    }
  })
}

/**
 * `null` means "nothing published", which is the normal state before the first workflow run and
 * is never an error.
 *
 * **This must never throw and never block app load.** The plan page needs no Trackman data at
 * all, and the whole integration rests on an undocumented interface that is assumed to break.
 */
export async function fetchPublished(
  fetcher: typeof fetch = globalThis.fetch,
): Promise<TrackmanSession[] | null> {
  try {
    const res = await fetcher(PUBLISHED_URL, { cache: 'no-cache' })
    // Pages serves the SPA 404 shim for an absent path, so a missing file arrives as *HTML with
    // a 404 status*. Checking `res.ok` alone would then hand `JSON.parse` a page of markup and
    // report corruption where the truth is simply "not published yet".
    if (!res.ok) return null
    if (!(res.headers.get('content-type') ?? '').includes('json')) return null
    return parsePublished(await res.json())
  } catch {
    // Offline, blocked, malformed, no `fetch` at all — one answer here: carry on without it.
    return null
  }
}
