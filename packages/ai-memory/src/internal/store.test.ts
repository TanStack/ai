import { describe, expect, it } from 'vitest'
import { sameScope } from './store'

describe('sameScope', () => {
  const full = {
    threadId: 's',
    userId: 'u',
    tenantId: 'a',
  }

  it('matches when threadId and optional dims agree', () => {
    expect(sameScope(full, full)).toBe(true)
    expect(sameScope(full, { threadId: 's', userId: 'u', tenantId: 'a' })).toBe(
      true,
    )
  })

  it('rejects different threadId', () => {
    expect(sameScope(full, { ...full, threadId: 'other' })).toBe(false)
  })

  it('rejects different userId', () => {
    expect(
      sameScope(full, { threadId: 's', userId: 'other', tenantId: 'a' }),
    ).toBe(false)
  })

  it('rejects different tenantId', () => {
    expect(sameScope(full, { ...full, tenantId: 'b' })).toBe(false)
  })

  it('treats omitted optional dims as exact (not wildcards)', () => {
    // A query without tenant/user must not match a record that has them —
    // same isolation model as Redis composite index keys.
    expect(sameScope(full, { threadId: 's', userId: 'u' })).toBe(false)
    expect(sameScope(full, { threadId: 's' })).toBe(false)
    expect(sameScope(full, { threadId: 's', userId: '', tenantId: '' })).toBe(
      false,
    )
  })

  it('matches when both sides omit the same optional dims', () => {
    expect(sameScope({ threadId: 's' }, { threadId: 's' })).toBe(true)
    expect(
      sameScope({ threadId: 's', userId: 'u' }, { threadId: 's', userId: 'u' }),
    ).toBe(true)
  })

  it('treats empty string as unset for optional dims', () => {
    expect(sameScope({ threadId: 's', userId: '' }, { threadId: 's' })).toBe(
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
})
