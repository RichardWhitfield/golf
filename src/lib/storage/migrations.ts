import type { Session } from '../domain/types'
import type { Settings, StoreDocument } from './repository'

/** Bump this and add a migration below for **any** change to the stored shape. */
export const SCHEMA_VERSION = 2

/** Stable across schema versions — the version lives inside the document, not in the key. */
export const STORAGE_KEY = 'golf:store'

/** Where an unreadable document is copied before anything else happens. */
export const QUARANTINE_KEY = 'golf:store.unreadable'

/** The stored data is not in a shape this build understands. */
export class UnreadableStoreError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UnreadableStoreError'
  }
}

/** The stored data was written by a newer build. Older code must not touch it. */
export class FutureSchemaError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FutureSchemaError'
  }
}

type Migration = (doc: Record<string, unknown>) => Record<string, unknown>

/**
 * Keyed by the version being migrated **from**.
 *
 * A migration must be pure and total: given any document at version N, return one at N+1.
 */
const MIGRATIONS: Record<number, Migration> = {
  /**
   * v1 → v2: Trackman sessions join the document. **Identity, deliberately.** Every v1 document
   * is already a valid v2 one — v1 held only `type: 'practice'` sessions, and those are unchanged.
   *
   * The bump is not for the data. It is so the **build currently deployed** refuses to touch a
   * document containing Trackman sessions, which its `checkSession()` would reject as corrupt.
   * `FutureSchemaError` then does exactly the right thing: refuse, don't quarantine, and say
   * "update the site".
   */
  1: (doc) => doc,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Bring a parsed document up to `SCHEMA_VERSION`.
 *
 * Throws rather than returning a default, because the caller's response differs: an unreadable
 * document must be quarantined and writing refused, while an absent one is simply a first run.
 * Silently substituting an empty document here would be a data-loss bug.
 */
export function migrate(raw: unknown): StoreDocument {
  if (!isRecord(raw)) {
    throw new UnreadableStoreError('The stored data is not an object.')
  }

  const version = raw.schemaVersion
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) {
    throw new UnreadableStoreError('The stored data has no usable schemaVersion.')
  }

  if (version > SCHEMA_VERSION) {
    throw new FutureSchemaError(
      `The stored data is version ${version}; this build understands ${SCHEMA_VERSION}. ` +
        'Refusing to touch it — update the site, or export from the newer one first.',
    )
  }

  let doc = raw
  for (let v = version; v < SCHEMA_VERSION; v++) {
    const step = MIGRATIONS[v]
    if (!step) {
      throw new UnreadableStoreError(`No migration from version ${v} to ${v + 1}.`)
    }
    doc = step(doc)
  }

  // `undefined` means the field was never written — fill it in, that's a first run. A field that
  // is *present but the wrong shape* is corruption, and must throw so the caller quarantines the
  // document instead of silently zeroing it. `sessions: "corrupt"` is not `sessions: []`: the
  // first is damage worth recovering, the second is an empty log. Collapsing them would lose
  // months of practice data without a word, which is the exact failure this function exists to
  // prevent — the same bug the comment above warns about, one level down.
  if (doc.sessions !== undefined && !Array.isArray(doc.sessions)) {
    throw new UnreadableStoreError('The stored data has a malformed "sessions" field.')
  }
  if (doc.settings !== undefined && !isRecord(doc.settings)) {
    throw new UnreadableStoreError('The stored data has a malformed "settings" field.')
  }

  return {
    schemaVersion: SCHEMA_VERSION,
    sessions: (doc.sessions as Session[] | undefined) ?? [],
    settings: (doc.settings as Settings | undefined) ?? {},
  }
}
