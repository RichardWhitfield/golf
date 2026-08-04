import { describe, expect, it } from 'vitest'
import type { TrackmanSession } from './types'
import {
  draftFromTrackman,
  emptyRow,
  toTrackmanSession,
  trackmanDraft,
  validateTrackmanDraft,
  type TrackmanDraft,
} from './trackman'

const base = (over: Partial<TrackmanDraft> = {}): TrackmanDraft => ({
  ...trackmanDraft('2026-07-27'),
  rows: [{ club: 'DRIVER', best: '-1.2', typical: '-7.5', shots: '26' }],
  ...over,
})

const imported: TrackmanSession = {
  id: 'a',
  type: 'trackman',
  date: '2026-07-27',
  source: 'api',
  clubs: [{ club: 'DRIVER', typical: -7.5, best: -1.2, n: 26 }],
}

describe('trackmanDraft', () => {
  it('starts on the KPI club with one row', () => {
    const d = trackmanDraft('2026-07-27')
    expect(d.rows).toHaveLength(1)
    expect(d.rows[0].club).toBe('DRIVER')
  })

  it('starts with empty numbers rather than a fabricated default', () => {
    expect(trackmanDraft('2026-07-27').rows[0]).toMatchObject({ best: '', typical: '', shots: '' })
  })

  it("pre-ticks Monday's scheduled drills, since Monday is the bay day", () => {
    expect(trackmanDraft('2026-07-27').drills).toEqual(['04', '06', '02'])
  })

  it('gives each draft its own id', () => {
    expect(trackmanDraft('2026-07-27').id).not.toBe(trackmanDraft('2026-07-27').id)
  })
})

describe('emptyRow', () => {
  it('offers the next unused club', () => {
    expect(emptyRow(['DRIVER']).club).toBe('WOOD3')
    expect(emptyRow(['DRIVER', 'WOOD3']).club).toBe('WOOD5')
  })

  it('falls back to the last club when every one is taken', () => {
    expect(emptyRow(['DRIVER']).club).toBeTruthy()
  })
})

describe('toTrackmanSession', () => {
  it('converts a draft', () => {
    const s = toTrackmanSession(base())
    expect(s.type).toBe('trackman')
    expect(s.date).toBe('2026-07-27')
    expect(s.clubs).toEqual([{ club: 'DRIVER', typical: -7.5, best: -1.2, n: 26 }])
  })

  it('omits the shot count when the box was left blank', () => {
    // An absent n is honest: you eyeball a typical figure off the bay screen and have no count.
    // Fabricating one would let a chart weight it as though it were measured.
    const s = toTrackmanSession(
      base({ rows: [{ club: 'DRIVER', best: '-1.2', typical: '-7.5', shots: '' }] }),
    )
    expect(s.clubs[0]).toEqual({ club: 'DRIVER', typical: -7.5, best: -1.2 })
  })

  it('keeps a positive path as typed', () => {
    const s = toTrackmanSession(
      base({ rows: [{ club: 'IRON7', best: '0.4', typical: '3.1', shots: '' }] }),
    )
    expect(s.clubs[0].typical).toBe(3.1)
  })

  it('orders clubs by the bag', () => {
    const s = toTrackmanSession(
      base({
        rows: [
          { club: 'SAND_WEDGE', best: '-1', typical: '-2', shots: '' },
          { club: 'DRIVER', best: '-1', typical: '-2', shots: '' },
        ],
      }),
    )
    expect(s.clubs.map((c) => c.club)).toEqual(['DRIVER', 'SAND_WEDGE'])
  })

  it('drops empty notes rather than storing a blank string', () => {
    expect(toTrackmanSession(base({ notes: '   ' })).notes).toBeUndefined()
    expect(toTrackmanSession(base({ notes: ' worked ' })).notes).toBe('worked')
  })

  it('omits drillsWorked when nothing is ticked', () => {
    expect(toTrackmanSession(base({ drills: [] })).drillsWorked).toBeUndefined()
  })

  it('always records the session as hand-typed', () => {
    expect(toTrackmanSession(base()).source).toBe('manual')
  })
})

describe('draftFromTrackman', () => {
  it('loads a stored session back into the form', () => {
    const d = draftFromTrackman(imported)
    expect(d.id).toBe('a')
    expect(d.rows).toEqual([{ club: 'DRIVER', best: '-1.2', typical: '-7.5', shots: '26' }])
  })

  it('flips an imported session to manual once it is edited', () => {
    // This is what makes "never overwrite something typed by hand" hold: without it, the merge
    // rule would only protect records nobody had touched, and the next sync would undo the fix.
    expect(toTrackmanSession(draftFromTrackman(imported)).source).toBe('manual')
  })

  it('keeps a shot count that came off the bay through an edit', () => {
    expect(toTrackmanSession(draftFromTrackman(imported)).clubs[0].n).toBe(26)
  })

  it('round-trips a session with no shot count', () => {
    const bare: TrackmanSession = {
      ...imported,
      clubs: [{ club: 'DRIVER', typical: -7.5, best: -1.2 }],
    }
    expect(toTrackmanSession(draftFromTrackman(bare)).clubs[0].n).toBeUndefined()
  })
})

describe('validateTrackmanDraft', () => {
  it('passes a good draft', () => {
    expect(validateTrackmanDraft(base())).toEqual([])
  })

  it('reports problems in form order', () => {
    const problems = validateTrackmanDraft(base({ date: 'nonsense', rows: [] }))
    expect(problems[0]).toMatch(/date/i)
    expect(problems[1]).toMatch(/club/i)
  })

  it('rejects a duplicate club', () => {
    const problems = validateTrackmanDraft(
      base({
        rows: [
          { club: 'DRIVER', best: '-1', typical: '-2', shots: '' },
          { club: 'DRIVER', best: '-1', typical: '-2', shots: '' },
        ],
      }),
    )
    expect(problems.join(' ')).toMatch(/twice/i)
  })

  it('rejects a blank, non-numeric or implausible path', () => {
    for (const typical of ['', '   ', 'about six', '-400', '25']) {
      const problems = validateTrackmanDraft(
        base({ rows: [{ club: 'DRIVER', best: '-1', typical, shots: '' }] }),
      )
      expect(problems.length, `typical="${typical}"`).toBeGreaterThan(0)
    }
  })

  it('accepts a path typed with a leading plus or a bare minus sign', () => {
    expect(
      validateTrackmanDraft(base({ rows: [{ club: 'IRON7', best: '+0.4', typical: '+3.1', shots: '' }] })),
    ).toEqual([])
  })

  it('rejects a lone minus sign, which is a half-typed number', () => {
    const problems = validateTrackmanDraft(
      base({ rows: [{ club: 'DRIVER', best: '-', typical: '-7', shots: '' }] }),
    )
    expect(problems.length).toBeGreaterThan(0)
  })

  it('accepts a blank shot count but rejects a fractional or zero one', () => {
    expect(
      validateTrackmanDraft(base({ rows: [{ club: 'DRIVER', best: '-1', typical: '-2', shots: '' }] })),
    ).toEqual([])
    for (const shots of ['2.5', '0', '-3', 'lots']) {
      const problems = validateTrackmanDraft(
        base({ rows: [{ club: 'DRIVER', best: '-1', typical: '-2', shots }] }),
      )
      expect(problems.join(' '), `shots="${shots}"`).toMatch(/shot/i)
    }
  })

  it('names the club in a row-level problem, so the form is navigable', () => {
    const problems = validateTrackmanDraft(
      base({ rows: [{ club: 'SAND_WEDGE', best: '-1', typical: '', shots: '' }] }),
    )
    expect(problems.join(' ')).toMatch(/sand wedge/i)
  })
})
