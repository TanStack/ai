import { describe, it, expect } from 'vitest'
import {
  scopeMatches,
  cosine,
  lexicalOverlap,
  recencyScore,
  defaultRenderMemory,
  defaultScoreHit,
  isExpired,
} from '../../src/memory/helpers'
import type { MemoryRecord } from '../../src/memory/types'

describe('scopeMatches', () => {
  it('rejects empty query scope (strict-by-default cross-tenant guard)', () => {
    // An empty query scope ({}) intentionally matches NOTHING — see JSDoc on
    // scopeMatches. This prevents `clear({})` / `search({ scope: {} })` from
    // wiping or leaking every tenant's records.
    expect(scopeMatches({ tenantId: 'a' }, {})).toBe(false)
  })
  it('rejects query scope with only nullish values', () => {
    expect(
      scopeMatches(
        { tenantId: 'a' },
        { tenantId: undefined, userId: undefined },
      ),
    ).toBe(false)
  })
  it('matches when all query keys are equal', () => {
    expect(
      scopeMatches({ tenantId: 'a', userId: 'u' }, { tenantId: 'a' }),
    ).toBe(true)
  })
  it('rejects when any provided key differs', () => {
    expect(scopeMatches({ tenantId: 'a' }, { tenantId: 'b' })).toBe(false)
  })
})

describe('cosine', () => {
  it('returns 0 for missing vectors or mismatched length', () => {
    expect(cosine(undefined, [1])).toBe(0)
    expect(cosine([1, 2], [1])).toBe(0)
  })
  it('returns 1 for identical unit-length vectors', () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1, 5)
  })
  it('returns 0 for orthogonal vectors', () => {
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0, 5)
  })
})

describe('lexicalOverlap', () => {
  it('returns 0 when query has no tokens', () => {
    expect(lexicalOverlap('', 'anything')).toBe(0)
  })
  it('returns fraction of query tokens present in text', () => {
    expect(lexicalOverlap('foo bar baz', 'foo bar')).toBeCloseTo(2 / 3, 5)
  })
})

describe('recencyScore', () => {
  it('returns ~1 for now', () => {
    expect(recencyScore(Date.now())).toBeGreaterThan(0.99)
  })
  it('halves at one half-life', () => {
    const halfLife = 1000
    const now = Date.now()
    const t = now - halfLife
    expect(recencyScore(t, halfLife, now)).toBeCloseTo(0.5, 5)
  })
})

describe('isExpired', () => {
  it('false when expiresAt is unset', () => {
    expect(isExpired({ expiresAt: undefined } as MemoryRecord)).toBe(false)
  })
  it('true when expiresAt < now', () => {
    expect(isExpired({ expiresAt: Date.now() - 1 } as MemoryRecord)).toBe(true)
  })
  it('false when expiresAt > now', () => {
    expect(isExpired({ expiresAt: Date.now() + 10000 } as MemoryRecord)).toBe(
      false,
    )
  })
})

describe('defaultRenderMemory', () => {
  it('renders empty hits as empty string-ish', () => {
    expect(defaultRenderMemory([])).toBe('')
  })
  it('renders kinds and text in numbered list', () => {
    const out = defaultRenderMemory([
      {
        score: 1,
        record: {
          id: '1',
          scope: {},
          kind: 'fact',
          text: 'User is on Windows.',
          createdAt: 0,
        },
      },
    ])
    expect(out).toContain('Relevant memory:')
    expect(out).toContain('1. [fact] User is on Windows.')
  })
})

describe('defaultScoreHit', () => {
  it('weighted sum stays in [0,1] for in-range inputs', () => {
    const score = defaultScoreHit({
      record: {
        id: 'r',
        scope: {},
        kind: 'fact',
        text: 'foo bar',
        createdAt: Date.now(),
        embedding: [1, 0],
        importance: 1,
      },
      query: { scope: {}, text: 'foo bar', embedding: [1, 0] },
    })
    expect(score).toBeGreaterThan(0)
    expect(score).toBeLessThanOrEqual(1)
  })

  it('threads `now` through to recencyScore for deterministic scoring', () => {
    // Fixed-timestamps regression test: passing `now` MUST make the score
    // independent of wall-clock time. Two calls with the same `now` must
    // return exactly the same score even if `Date.now()` has advanced
    // between them.
    const record: MemoryRecord = {
      id: 'r',
      scope: {},
      kind: 'fact',
      text: 'foo bar',
      createdAt: 1000,
      embedding: [1, 0],
      importance: 1,
    }
    const query = { scope: {}, text: 'foo bar', embedding: [1, 0] }
    const a = defaultScoreHit({ record, query, now: 2000 })
    const b = defaultScoreHit({ record, query, now: 2000 })
    expect(a).toBe(b)
    // And a different `now` must produce a (lower) recency contribution —
    // the older effective age means recencyScore drops, so the total drops.
    const c = defaultScoreHit({
      record,
      query,
      now: 2000 + 1000 * 60 * 60 * 24 * 30, // +1 half-life
    })
    expect(c).toBeLessThan(a)
  })

  it('unset importance contributes 0 (record with no relevance scores below default minScore)', () => {
    // Default ranking floor regression test. With the previous default of
    // `importance ?? 0.5`, a recent record with zero semantic + zero lexical
    // match scored ~0.20 — over the default minScore floor of 0.15, so
    // every recent irrelevant record leaked into retrieval. The new default
    // (no fallback) keeps the score below the floor.
    //
    // We use `now` slightly ahead of `createdAt` so recency decays a hair
    // below 1.0; the score is then strictly < 0.15 (the default minScore).
    const createdAt = 1000
    const now = createdAt + 1000 * 60 * 60 * 24 // one day later
    const score = defaultScoreHit({
      record: {
        id: 'r',
        scope: {},
        kind: 'fact',
        text: 'completely unrelated content', // no overlap with query
        createdAt,
        // no embedding, no importance
      },
      query: { scope: {}, text: 'foo bar' },
      now,
    })
    expect(score).toBeLessThan(0.15)

    // Sanity-check the converse: the OLD default of importance=0.5 would
    // have pushed the same record above the 0.15 floor.
    expect(score + 0.5 * 0.1).toBeGreaterThan(0.15)
  })
})
