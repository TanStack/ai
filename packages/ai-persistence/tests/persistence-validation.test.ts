import { describe, expect, it } from 'vitest'
import {
  withChatPersistence,
  withGenerationPersistence,
} from '../src/middleware'
import type { AIPersistence } from '../src'
import {
  InterruptPersistenceCapability,
  InterruptsCapability,
  getInterruptPersistence,
  getInterrupts,
  provideInterruptPersistence,
  provideInterrupts,
} from '../src'
import {
  createArtifactStore,
  createBlobStore,
  createInterruptStore,
  createMessageStore,
  createRunStore,
} from './persistence-fixtures'

describe('persistence store dependency validation', () => {
  it('keeps deprecated interrupt capability names as exact core aliases', () => {
    expect(InterruptsCapability).toBe(InterruptPersistenceCapability)
    expect(getInterrupts).toBe(getInterruptPersistence)
    expect(provideInterrupts).toBe(provideInterruptPersistence)
  })
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

  it('rejects a sequential interrupt store without the atomic gateway', () => {
    const interrupts = createInterruptStore()
    Reflect.deleteProperty(interrupts, 'commitInterruptResolutions')
    const persistence: AIPersistence = {
      stores: { runs: createRunStore(), interrupts },
    }

    expect(() => withChatPersistence(persistence)).toThrow(
      /atomic-commit-unsupported/,
    )
  })

  it.each([
    ['artifacts', { artifacts: createArtifactStore() }],
    ['blobs', { blobs: createBlobStore() }],
  ])(
    'rejects dynamic generation persistence with only the %s store',
    (_name, stores) => {
      const persistence: AIPersistence = { stores }

      expect(() => withGenerationPersistence(persistence)).toThrow(
        /requires both stores\.artifacts and stores\.blobs/i,
      )
    },
  )

  it('allows dynamic generation persistence with paired artifact and blob stores', () => {
    const persistence: AIPersistence = {
      stores: {
        artifacts: createArtifactStore(),
        blobs: createBlobStore(),
      },
    }

    expect(() => withGenerationPersistence(persistence)).not.toThrow()
  })
})
