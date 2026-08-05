import { describe, expect, it } from 'vitest'
import type { Session } from '../domain/types'
import { RemoteRepo } from './remote'

const PRACTICE: Session = {
  id: 'a1',
  type: 'practice',
  date: '2026-08-05',
  location: 'home',
  entries: [],
}

/** Records requests and replies from a queue. No network, no AWS. */
function fakeFetch(replies: Array<{ status?: number; body?: unknown; text?: string }>) {
  const calls: Array<{ url: string; init?: RequestInit }> = []
  const fetcher = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init })
    const reply = replies.shift() ?? { body: {} }
    return {
      ok: (reply.status ?? 200) < 400,
      status: reply.status ?? 200,
      text: async () => reply.text ?? JSON.stringify(reply.body ?? {}),
    } as Response
  }) as unknown as typeof fetch
  return { calls, fetcher }
}

describe('RemoteRepo', () => {
  it('lists sessions from the store', async () => {
    const { calls, fetcher } = fakeFetch([{ body: { sessions: [PRACTICE] } }])
    const repo = new RemoteRepo('https://api.example', fetcher)
    expect(await repo.listSessions()).toEqual([PRACTICE])
    expect(calls[0].url).toBe('https://api.example/sessions')
  })

  it('never calls fetch with itself as the receiver', async () => {
    // A browser rejects `window.fetch` invoked on any other receiver — "Illegal invocation" —
    // and holding it as a field makes `this.#fetch(...)` a method call on the repo. **Node's
    // fetch tolerates this**, so nothing else in the suite can reproduce it: the first version
    // shipped, every test passed, and the deployed site silently never synced.
    const receivers: unknown[] = []
    const fetcher = function (this: unknown) {
      receivers.push(this)
      return Promise.resolve({
        ok: true,
        status: 200,
        text: async () => '{"sessions":[],"schemaVersion":2}',
      } as Response)
    } as unknown as typeof fetch

    const repo = new RemoteRepo('https://api.example', fetcher)
    await repo.listSessions()

    expect(receivers).toHaveLength(1)
    expect(receivers[0]).not.toBe(repo)
    expect(receivers[0]).toBe(globalThis)
  })

  it('PUTs a session to its own id', async () => {
    const { calls, fetcher } = fakeFetch([{ body: { ok: true } }])
    await new RemoteRepo('https://api.example', fetcher).saveSession(PRACTICE)
    expect(calls[0].url).toBe('https://api.example/sessions/a1')
    expect(calls[0].init?.method).toBe('PUT')
    expect(JSON.parse(String(calls[0].init?.body))).toEqual(PRACTICE)
  })

  it('throws on a write failure rather than reporting success', async () => {
    const { fetcher } = fakeFetch([{ status: 500, body: { message: 'nope' } }])
    await expect(
      new RemoteRepo('https://api.example', fetcher).saveSession(PRACTICE),
    ).rejects.toThrow(/nope/)
  })

  it('runs the migration chain over what the store reports', async () => {
    // v1 → v2 is an identity migration, so the observable effect is that a v1 document is
    // accepted and normalised rather than rejected. The guard that matters is the next one.
    const { fetcher } = fakeFetch([{ body: { sessions: [PRACTICE], schemaVersion: 1 } }])
    expect(await new RemoteRepo('https://api.example', fetcher).listSessions()).toEqual([PRACTICE])
  })

  it('refuses a document written by a newer build rather than mangling it', async () => {
    const { fetcher } = fakeFetch([{ body: { sessions: [PRACTICE], schemaVersion: 99 } }])
    await expect(new RemoteRepo('https://api.example', fetcher).listSessions()).rejects.toThrow(
      /version 99/,
    )
  })

  it('records a fault and refuses writes when the store returns unparseable JSON', async () => {
    const { fetcher } = fakeFetch([{ text: '<html>gateway</html>' }, { body: { ok: true } }])
    const repo = new RemoteRepo('https://api.example', fetcher)
    await expect(repo.listSessions()).rejects.toThrow()
    expect(repo.faultMessage).not.toBeNull()
    await expect(repo.saveSession(PRACTICE)).rejects.toThrow(/Refusing/)
  })

  it('sets ifNotManual only on the Trackman merge path', async () => {
    const trackman: Session = {
      id: 't1',
      type: 'trackman',
      date: '2026-08-05',
      clubs: [{ club: 'DRIVER', typical: -3.2, best: -1.1, n: 12 }],
      source: 'api',
    }
    const { calls, fetcher } = fakeFetch([{ body: { sessions: [] } }, { body: { ok: true } }])
    const result = await new RemoteRepo('https://api.example', fetcher).mergeTrackman([trackman])
    expect(result.added).toBe(1)
    expect(calls[1].url).toBe('https://api.example/sessions/t1?ifNotManual=1')
  })

  it('reports no change when the merge finds nothing new, and writes nothing', async () => {
    const trackman: Session = {
      id: 't1',
      type: 'trackman',
      date: '2026-08-05',
      clubs: [{ club: 'DRIVER', typical: -3.2, best: -1.1, n: 12 }],
      source: 'api',
    }
    const { calls, fetcher } = fakeFetch([{ body: { sessions: [trackman] } }])
    const result = await new RemoteRepo('https://api.example', fetcher).mergeTrackman([trackman])
    expect(result.changed).toBe(false)
    expect(calls).toHaveLength(1)
  })
})
