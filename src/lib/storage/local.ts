import type { Session } from '../domain/types'
import type { ImportSummary, Repository, Settings, StoreDocument } from './repository'
import { emptyDocument } from './repository'
import {
  FutureSchemaError,
  QUARANTINE_KEY,
  STORAGE_KEY,
  migrate,
} from './migrations'
import { mergeDocuments, parseDocument } from './transfer'

/**
 * Resolved defensively, because **merely reading `globalThis.localStorage` throws** in a browser
 * with site data blocked — private browsing, "block all cookies", an enterprise policy, a
 * sandboxed iframe. This class is constructed at module scope, so an eager read takes the whole
 * app down before Svelte can mount anything, blanking even the plan page, which needs no storage.
 */
function defaultStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

const UNAVAILABLE =
  'This browser is blocking site data, so nothing can be saved here. Your practice log will not ' +
  'persist. Check the browser’s privacy settings, or use a normal (non-private) window.'

/**
 * The `localStorage` implementation of `Repository`.
 *
 * `Storage` is injected so the tests can run in Node against an in-memory fake — no jsdom.
 * Production code writes `new LocalStorageRepo()` and gets the real thing.
 *
 * Read-modify-write on every mutation. At a few sessions a week the cost is irrelevant, and it
 * keeps a second tab from clobbering the first with stale in-memory state.
 */
export class LocalStorageRepo implements Repository {
  private readonly storage: Storage | null
  private fault: string | null = null

  /** Pass `null` explicitly to model unavailable storage; omit it to resolve the real one safely. */
  constructor(storage: Storage | null | undefined = undefined) {
    this.storage = storage === undefined ? defaultStorage() : storage
  }

  get faultMessage(): string | null {
    return this.fault
  }

  async listSessions(): Promise<Session[]> {
    // Sorted newest first, and structurally cloned — callers must not be able to reach in and
    // mutate the store by editing the array they were handed.
    return this.read()
      .sessions.slice()
      .sort((a, b) => b.date.localeCompare(a.date))
  }

  async saveSession(session: Session): Promise<void> {
    const doc = this.read()
    const index = doc.sessions.findIndex((s) => s.id === session.id)
    if (index === -1) doc.sessions.push(session)
    else doc.sessions[index] = session
    this.write(doc)
  }

  async deleteSession(id: string): Promise<void> {
    const doc = this.read()
    doc.sessions = doc.sessions.filter((s) => s.id !== id)
    this.write(doc)
  }

  async getSettings(): Promise<Settings> {
    return { ...this.read().settings }
  }

  async saveSettings(settings: Settings): Promise<void> {
    const doc = this.read()
    doc.settings = { ...settings }
    this.write(doc)
  }

  async exportDocument(): Promise<StoreDocument> {
    // `read()` FIRST — it is what *detects* a fault. Checking `this.fault` beforehand only sees
    // one left behind by an earlier call, so on a fresh instance over corrupt data the guard
    // passes and the empty document `read()` returns is handed back as though it were a
    // successful backup. That failure would land in the one method whose entire job is getting
    // the data out safely. Every other method here already has this order right.
    const doc = this.read()
    if (this.fault) throw new Error(this.fault)
    return doc
  }

  async importDocument(raw: unknown): Promise<ImportSummary> {
    const incoming = parseDocument(raw)
    const { doc, summary } = mergeDocuments(this.read(), incoming)
    this.write(doc)
    return summary
  }

  async readQuarantine(): Promise<string | null> {
    if (!this.storage) return null
    try {
      return this.storage.getItem(QUARANTINE_KEY)
    } catch {
      return null
    }
  }

  /** Reading also detects and records a fault. It always runs before any write, which is what
   *  guarantees the quarantine copy is taken before anything can overwrite the original. */
  private read(): StoreDocument {
    if (!this.storage) {
      this.fault = UNAVAILABLE
      return emptyDocument()
    }

    let raw: string | null
    try {
      raw = this.storage.getItem(STORAGE_KEY)
    } catch {
      // Reachable object, failing operation — treat it as unavailable rather than as corruption.
      // Nothing is quarantined, because nothing was read.
      this.fault = UNAVAILABLE
      return emptyDocument()
    }

    if (raw === null) {
      this.fault = null
      return emptyDocument()
    }

    try {
      const doc = migrate(JSON.parse(raw))
      this.fault = null
      return doc
    } catch (error) {
      if (error instanceof FutureSchemaError) {
        // The data is fine; this build is behind. Don't quarantine — there is nothing wrong
        // with it and moving it would strand the newer build's data.
        this.fault = error.message
      } else {
        this.quarantine(raw)
        this.fault =
          `The stored practice data could not be read. Nothing has been changed — the original ` +
          `is kept under "${QUARANTINE_KEY}" and can be downloaded from the Data panel below.`
      }
      return emptyDocument()
    }
  }

  private write(doc: StoreDocument): void {
    if (this.fault) {
      throw new Error(`Refusing to overwrite the stored data: ${this.fault}`)
    }
    if (!this.storage) throw new Error(UNAVAILABLE)
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(doc))
    } catch (error) {
      // Safari private mode throws QuotaExceededError on setItem even when storage is readable.
      // Surface it: a save that silently did nothing is worse than one that says it failed.
      this.fault = UNAVAILABLE
      throw new Error(UNAVAILABLE, { cause: error })
    }
  }

  /** Copy the unreadable text aside once. A second failure must not overwrite the first copy —
   *  the earliest one is the one most likely to still hold real sessions. */
  private quarantine(raw: string): void {
    if (!this.storage) return
    try {
      if (this.storage.getItem(QUARANTINE_KEY) !== null) return
      this.storage.setItem(QUARANTINE_KEY, raw)
    } catch {
      // Best-effort only — losing the quarantine copy is not worse than the read failure that
      // triggered it, and quarantine() must never itself throw out of read().
    }
  }
}
