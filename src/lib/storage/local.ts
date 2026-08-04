import type { PracticeSession } from '../domain/types'
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
 * The `localStorage` implementation of `Repository`.
 *
 * `Storage` is injected so the tests can run in Node against an in-memory fake — no jsdom.
 * Production code writes `new LocalStorageRepo()` and gets the real thing.
 *
 * Read-modify-write on every mutation. At a few sessions a week the cost is irrelevant, and it
 * keeps a second tab from clobbering the first with stale in-memory state.
 */
export class LocalStorageRepo implements Repository {
  private readonly storage: Storage
  private fault: string | null = null

  constructor(storage: Storage = localStorage) {
    this.storage = storage
  }

  get faultMessage(): string | null {
    return this.fault
  }

  async listSessions(): Promise<PracticeSession[]> {
    // Sorted newest first, and structurally cloned — callers must not be able to reach in and
    // mutate the store by editing the array they were handed.
    return this.read()
      .sessions.slice()
      .sort((a, b) => b.date.localeCompare(a.date))
  }

  async saveSession(session: PracticeSession): Promise<void> {
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
    return this.storage.getItem(QUARANTINE_KEY)
  }

  /** Reading also detects and records a fault. It always runs before any write, which is what
   *  guarantees the quarantine copy is taken before anything can overwrite the original. */
  private read(): StoreDocument {
    const raw = this.storage.getItem(STORAGE_KEY)
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
    this.storage.setItem(STORAGE_KEY, JSON.stringify(doc))
  }

  /** Copy the unreadable text aside once. A second failure must not overwrite the first copy —
   *  the earliest one is the one most likely to still hold real sessions. */
  private quarantine(raw: string): void {
    if (this.storage.getItem(QUARANTINE_KEY) !== null) return
    this.storage.setItem(QUARANTINE_KEY, raw)
  }
}
