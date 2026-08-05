import { describe, expect, it } from 'vitest'
import type { Session } from '../domain/types'
import { CachedRepo } from './cached'
import { LocalStorageRepo } from './local'
import type { Repository } from './repository'

const CACHED: Session = {
  id: 'c1',
  type: 'practice',
  date: '2026-08-01',
  location: 'home',
  entries: [],
}
const FRESH: Session = {
  id: 'r1',
  type: 'practice',
  date: '2026-08-05',
  location: 'home',
  entries: [],
}

/** In-memory Storage, so the tests run in Node with no jsdom. */
function fakeStorage(): Storage {
  const map = new Map<string, string>()
  return {
    get length() {
      return map.size
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  } as Storage
}

function fakeRemote(sessions: Session[], failing = false): Repository & { saved: Session[] } {
  const saved: Session[] = []
  return {
    saved,
    faultMessage: null,
    listSessions: async () => {
      if (failing) throw new Error('offline')
      return sessions
    },
    saveSession: async (s: Session) => void saved.push(s),
    deleteSession: async () => {},
    getSettings: async () => ({}),
    saveSettings: async () => {},
    exportDocument: async () => ({ schemaVersion: 2, sessions, settings: {} }),
    importDocument: async () => ({ added: 0, updated: 0 }),
    mergeTrackman: async () => ({ sessions, added: 0, updated: 0, skipped: 0, changed: false }),
    readQuarantine: async () => null,
  }
}

describe('CachedRepo', () => {
  it('returns the cache immediately, then the remote after a refresh', async () => {
    const cache = new LocalStorageRepo(fakeStorage())
    await cache.saveSession(CACHED)
    const repo = new CachedRepo(fakeRemote([FRESH]), cache)

    expect(await repo.listSessions()).toEqual([CACHED])
    await repo.refresh()
    expect(await repo.listSessions()).toEqual([FRESH])
  })

  it('drops from the cache what the remote no longer has', async () => {
    // A session deleted on the laptop must not survive in the phone's cache. Saving the remote
    // over the cache without dropping the difference leaves the stale copy reappearing after
    // every refresh, which reads as a deletion that would not stick.
    const cache = new LocalStorageRepo(fakeStorage())
    await cache.saveSession(CACHED)
    await cache.saveSession(FRESH)
    await new CachedRepo(fakeRemote([FRESH]), cache).refresh()
    expect(await cache.listSessions()).toEqual([FRESH])
  })

  it('writes to the remote first, then mirrors into the cache', async () => {
    const cache = new LocalStorageRepo(fakeStorage())
    const remote = fakeRemote([])
    const repo = new CachedRepo(remote, cache)

    await repo.saveSession(FRESH)
    expect(remote.saved).toEqual([FRESH])
    expect(await cache.listSessions()).toEqual([FRESH])
  })

  it('serves the cache and reports staleness when the remote read fails', async () => {
    const cache = new LocalStorageRepo(fakeStorage())
    await cache.saveSession(CACHED)
    const repo = new CachedRepo(fakeRemote([], true), cache)

    await repo.refresh()
    expect(await repo.listSessions()).toEqual([CACHED])
    expect(repo.stale).toBe(true)
  })

  it('seeds the remote from the cache when a successful read finds it empty', async () => {
    const cache = new LocalStorageRepo(fakeStorage())
    await cache.saveSession(CACHED)
    const remote = fakeRemote([])
    await new CachedRepo(remote, cache).refresh()
    expect(remote.saved).toEqual([CACHED])
  })

  it('never seeds after a failed read, however empty the result looks', async () => {
    const cache = new LocalStorageRepo(fakeStorage())
    await cache.saveSession(CACHED)
    const remote = fakeRemote([], true)
    await new CachedRepo(remote, cache).refresh()
    expect(remote.saved).toEqual([])
  })

  it('does not let an unreadable cache block a write', async () => {
    const storage = fakeStorage()
    storage.setItem('golf:store', '{ not json')
    const remote = fakeRemote([])
    const repo = new CachedRepo(remote, new LocalStorageRepo(storage))

    await repo.saveSession(FRESH)
    expect(remote.saved).toEqual([FRESH])
    expect(repo.faultMessage).toBeNull()
  })
})
