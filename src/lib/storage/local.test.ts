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
    expect(stored[0].location).toBe('course')
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
