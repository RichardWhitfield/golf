import { beforeEach, describe, expect, it } from 'vitest'
import { LocalStorageRepo } from './local'
import { QUARANTINE_KEY, SCHEMA_VERSION, STORAGE_KEY } from './migrations'
import type { PracticeSession } from '../domain/types'

/** Enough of the `Storage` interface for the repository. Keeps jsdom out of the dependency list. */
class MemoryStorage implements Storage {
  private map = new Map<string, string>()
  get length() {
    return this.map.size
  }
  clear() {
    this.map.clear()
  }
  getItem(key: string) {
    return this.map.get(key) ?? null
  }
  key(index: number) {
    return [...this.map.keys()][index] ?? null
  }
  removeItem(key: string) {
    this.map.delete(key)
  }
  setItem(key: string, value: string) {
    this.map.set(key, value)
  }
}

const session = (id: string, date = '2026-08-05'): PracticeSession => ({
  id,
  type: 'practice',
  date,
  location: 'home',
  entries: [{ drillId: '01', swings: 12, feel: 3 }],
})

let storage: MemoryStorage
let repo: LocalStorageRepo

beforeEach(() => {
  storage = new MemoryStorage()
  repo = new LocalStorageRepo(storage)
})

describe('an empty store', () => {
  it('lists nothing', async () => {
    expect(await repo.listSessions()).toEqual([])
  })

  it('returns empty settings', async () => {
    expect(await repo.getSettings()).toEqual({})
  })

  it('reports no fault', () => {
    expect(repo.faultMessage).toBeNull()
  })

  it('writes nothing until asked', () => {
    expect(storage.getItem(STORAGE_KEY)).toBeNull()
  })
})

describe('saveSession', () => {
  it('inserts a new session', async () => {
    await repo.saveSession(session('a'))
    expect(await repo.listSessions()).toEqual([session('a')])
  })

  it('updates in place when the id already exists', async () => {
    await repo.saveSession(session('a'))
    await repo.saveSession({ ...session('a'), location: 'course' })
    const stored = await repo.listSessions()
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({ location: 'course' })
  })

  it('survives a new repository over the same storage', async () => {
    await repo.saveSession(session('a'))
    expect(await new LocalStorageRepo(storage).listSessions()).toEqual([session('a')])
  })

  it('stamps the document with the current schema version', async () => {
    await repo.saveSession(session('a'))
    expect(JSON.parse(storage.getItem(STORAGE_KEY)!).schemaVersion).toBe(SCHEMA_VERSION)
  })
})

describe('listSessions', () => {
  it('returns newest first', async () => {
    await repo.saveSession(session('old', '2026-08-01'))
    await repo.saveSession(session('new', '2026-08-09'))
    await repo.saveSession(session('mid', '2026-08-05'))
    expect((await repo.listSessions()).map((s) => s.id)).toEqual(['new', 'mid', 'old'])
  })

  it('does not hand out a reference into the store', async () => {
    await repo.saveSession(session('a'))
    const first = await repo.listSessions()
    first.push(session('b'))
    expect(await repo.listSessions()).toHaveLength(1)
  })
})

describe('deleteSession', () => {
  it('removes only the named session', async () => {
    await repo.saveSession(session('a'))
    await repo.saveSession(session('b'))
    await repo.deleteSession('a')
    expect((await repo.listSessions()).map((s) => s.id)).toEqual(['b'])
  })

  it('is silent about an id that is not there', async () => {
    await expect(repo.deleteSession('ghost')).resolves.toBeUndefined()
  })
})

describe('settings', () => {
  it('round-trips the block start date', async () => {
    await repo.saveSettings({ blockStart: '2026-08-03' })
    expect(await repo.getSettings()).toEqual({ blockStart: '2026-08-03' })
  })

  it('leaves sessions untouched', async () => {
    await repo.saveSession(session('a'))
    await repo.saveSettings({ blockStart: '2026-08-03' })
    expect(await repo.listSessions()).toHaveLength(1)
  })
})

describe('exportDocument', () => {
  it('returns the whole document, sessions and settings together', async () => {
    await repo.saveSession(session('a'))
    await repo.saveSettings({ blockStart: '2026-08-03' })
    const doc = await repo.exportDocument()
    expect(doc.schemaVersion).toBe(SCHEMA_VERSION)
    expect(doc.sessions).toEqual([session('a')])
    expect(doc.settings).toEqual({ blockStart: '2026-08-03' })
  })

  it('exports an empty document from an untouched store', async () => {
    expect(await repo.exportDocument()).toEqual({
      schemaVersion: SCHEMA_VERSION,
      sessions: [],
      settings: {},
    })
  })
})

describe('unreadable stored data', () => {
  beforeEach(() => {
    storage.setItem(STORAGE_KEY, '{ not json')
    repo = new LocalStorageRepo(storage)
  })

  it('quarantines the raw text before anything else', async () => {
    await repo.listSessions()
    expect(storage.getItem(QUARANTINE_KEY)).toBe('{ not json')
  })

  it('reports a fault', async () => {
    await repo.listSessions()
    expect(repo.faultMessage).toMatch(/could not be read/i)
  })

  it('refuses to write over it', async () => {
    await repo.listSessions()
    await expect(repo.saveSession(session('a'))).rejects.toThrow(/refusing to overwrite/i)
    expect(storage.getItem(STORAGE_KEY)).toBe('{ not json')
  })

  it('offers the quarantined text back for download', async () => {
    await repo.listSessions()
    expect(await repo.readQuarantine()).toBe('{ not json')
  })

  it('refuses to export, even when export is the first call on a fresh repository', async () => {
    // The fault is detected *by* reading, so a fault check placed before `read()` would pass on
    // a fresh instance and hand back an empty document that looks like a successful backup.
    // Export is the safety valve for rescuing data — it must fail loudly, not quietly.
    await expect(new LocalStorageRepo(storage).exportDocument()).rejects.toThrow(/could not be read/i)
  })

  it('does not overwrite an existing quarantine with a second failure', async () => {
    await repo.listSessions()
    storage.setItem(STORAGE_KEY, 'also broken')
    await new LocalStorageRepo(storage).listSessions()
    expect(storage.getItem(QUARANTINE_KEY)).toBe('{ not json')
  })
})

describe('data from a newer build', () => {
  beforeEach(() => {
    storage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: SCHEMA_VERSION + 1, sessions: [] }))
    repo = new LocalStorageRepo(storage)
  })

  it('refuses to write', async () => {
    await repo.listSessions()
    await expect(repo.saveSession(session('a'))).rejects.toThrow(/refusing to overwrite/i)
  })

  it('does not quarantine it — the data is fine, this build is old', async () => {
    await repo.listSessions()
    expect(storage.getItem(QUARANTINE_KEY)).toBeNull()
  })
})

/** A `Storage` whose every operation throws, like a browser with site data blocked. */
class HostileStorage implements Storage {
  get length(): number {
    throw new Error('Access is denied for this document.')
  }
  clear(): void {
    throw new Error('Access is denied for this document.')
  }
  getItem(): string | null {
    throw new Error('Access is denied for this document.')
  }
  key(): string | null {
    throw new Error('Access is denied for this document.')
  }
  removeItem(): void {
    throw new Error('Access is denied for this document.')
  }
  setItem(): void {
    throw new Error('Access is denied for this document.')
  }
}

describe('storage that is unavailable entirely', () => {
  it('constructs without throwing when storage is null', () => {
    expect(() => new LocalStorageRepo(null)).not.toThrow()
  })

  it('lists nothing rather than throwing', async () => {
    expect(await new LocalStorageRepo(null).listSessions()).toEqual([])
  })

  it('returns empty settings rather than throwing', async () => {
    expect(await new LocalStorageRepo(null).getSettings()).toEqual({})
  })

  it('reports a fault explaining that nothing can be saved', async () => {
    const repo = new LocalStorageRepo(null)
    await repo.listSessions()
    expect(repo.faultMessage).toMatch(/blocking site data|cannot be saved/i)
  })

  it('refuses to save rather than pretending it worked', async () => {
    const repo = new LocalStorageRepo(null)
    await repo.listSessions()
    await expect(repo.saveSession(session('a'))).rejects.toThrow()
  })

  it('refuses to export rather than returning an empty document', async () => {
    const repo = new LocalStorageRepo(null)
    await expect(repo.exportDocument()).rejects.toThrow()
  })

  it('has no quarantine to offer', async () => {
    expect(await new LocalStorageRepo(null).readQuarantine()).toBeNull()
  })
})

describe('storage whose every operation throws', () => {
  it('does not let a throwing getItem escape listSessions', async () => {
    const repo = new LocalStorageRepo(new HostileStorage())
    expect(await repo.listSessions()).toEqual([])
    expect(repo.faultMessage).toBeTruthy()
  })

  it('does not let a throwing setItem escape saveSession', async () => {
    const repo = new LocalStorageRepo(new HostileStorage())
    await expect(repo.saveSession(session('a'))).rejects.toThrow()
  })
})
