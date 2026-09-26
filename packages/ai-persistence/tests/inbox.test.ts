import { describe, expect, it } from 'vitest'
import {
  defineAIPersistence,
  defineInboxStore,
  memoryPersistence,
} from '../src'

describe('inbox store', () => {
  it('ships in memoryPersistence', () => {
    expect(memoryPersistence().stores.inbox).toBeDefined()
  })

  it('returns a copy, so callers cannot change stored entries', async () => {
    const inbox = memoryPersistence().stores.inbox
    const entry = await inbox.append({
      inputId: 'in-1',
      threadId: 't',
      input: { op: 'prompt' },
      createdAt: 1,
    })
    entry.status = 'applied'

    expect((await inbox.get('in-1'))?.status).toBe('pending')
  })

  it('accepts a user-implemented inbox in defineAIPersistence', () => {
    const inbox = defineInboxStore({
      append: (entry) => Promise.resolve({ ...entry, status: 'pending' }),
      listPending: () => Promise.resolve([]),
      markApplied: () => Promise.resolve(),
      markRejected: () => Promise.resolve(),
      get: () => Promise.resolve(null),
    })

    expect(defineAIPersistence({ stores: { inbox } }).stores.inbox).toBe(inbox)
  })
})
