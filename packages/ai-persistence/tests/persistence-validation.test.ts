import { describe, expect, it } from 'vitest'
import { withChatPersistence } from '../src/middleware'
import type { AIPersistence } from '../src'
import {
  createInterruptStore,
  createMessageStore,
  createRunStore,
} from './persistence-fixtures'

describe('persistence store dependency validation', () => {
  it('rejects a dynamic chat persistence with interrupts but no runs', () => {
    const persistence: AIPersistence = {
      stores: { interrupts: createInterruptStore() },
    }

    expect(() => withChatPersistence(persistence)).toThrow(
      /interrupts.*stores\.runs/i,
    )
  })

  it('allows independent message and run stores for chat', () => {
    const messages: AIPersistence = {
      stores: { messages: createMessageStore() },
    }
    const runs: AIPersistence = { stores: { runs: createRunStore() } }

    expect(() => withChatPersistence(messages)).not.toThrow()
    expect(() => withChatPersistence(runs)).not.toThrow()
  })

  it('allows a dynamic chat persistence with paired run and interrupt stores', () => {
    const persistence: AIPersistence = {
      stores: {
        runs: createRunStore(),
        interrupts: createInterruptStore(),
      },
    }

    expect(() => withChatPersistence(persistence)).not.toThrow()
  })
})
