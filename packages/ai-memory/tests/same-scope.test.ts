import { describe, expect, it } from 'vitest'
import { sameScope } from '../src/internal/store'

describe('sameScope', () => {
  const full = {
    threadId: 's',
    userId: 'u',
    tenantId: 'a',
  }

  it('matches when threadId and present dims agree', () => {
    expect(sameScope(full, full)).toBe(true)
    expect(sameScope(full, { threadId: 's', userId: 'u', tenantId: 'a' })).toBe(
      true,
    )
  })

  it('rejects different threadId', () => {
    expect(sameScope(full, { ...full, threadId: 'other' })).toBe(false)
  })

  it('rejects different userId when query supplies userId', () => {
    expect(sameScope(full, { threadId: 's', userId: 'other' })).toBe(false)
  })

  it('rejects different tenantId when query supplies tenantId', () => {
    expect(sameScope(full, { ...full, tenantId: 'b' })).toBe(false)
  })

  it('treats omitted / empty query dims as "do not filter"', () => {
    // Filter-when-present: a query without tenantId still matches a
    // tenant-scoped record. Callers must pass the full dims used at write.
    expect(sameScope(full, { threadId: 's', userId: 'u' })).toBe(true)
    expect(sameScope(full, { threadId: 's' })).toBe(true)
    expect(sameScope(full, { threadId: 's', userId: '', tenantId: '' })).toBe(
      true,
    )
  })

  it('ignores namespace (reserved — no subsystem keys on it yet)', () => {
    expect(
      sameScope(
        { ...full, namespace: 'bank-a' },
        { ...full, namespace: 'bank-b' },
      ),
    ).toBe(true)
  })

  it('matches records that also lack optional dims', () => {
    expect(sameScope({ threadId: 's' }, { threadId: 's', userId: 'u' })).toBe(
      false,
    )
    expect(sameScope({ threadId: 's' }, { threadId: 's' })).toBe(true)
  })
})
