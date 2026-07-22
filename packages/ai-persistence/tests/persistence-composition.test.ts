import { describe, expect, it } from 'vitest'
import { composePersistence, defineAIPersistence } from '../src'
import {
  createInterruptStore,
  createMessageStore,
  createMetadataStore,
  createRunStore,
} from './persistence-fixtures'

describe('composePersistence', () => {
  it('replaces only the named store', () => {
    const baseMessages = createMessageStore()
    const overrideMessages = createMessageStore()
    const runs = createRunStore()
    const base = defineAIPersistence({
      stores: { messages: baseMessages, runs },
    })

    const composed = composePersistence(base, {
      overrides: { messages: overrideMessages },
    })

    expect(composed.stores.messages).toBe(overrideMessages)
    expect(composed.stores.runs).toBe(runs)
  })

  it('applies multiple overrides independently', () => {
    const base = defineAIPersistence({
      stores: {
        messages: createMessageStore(),
        runs: createRunStore(),
        interrupts: createInterruptStore(),
      },
    })
    const messages = createMessageStore()
    const runs = createRunStore()

    const composed = composePersistence(base, {
      overrides: { messages, runs },
    })

    expect(composed.stores.messages).toBe(messages)
    expect(composed.stores.runs).toBe(runs)
    expect(composed.stores.interrupts).toBe(base.stores.interrupts)
  })

  it('removes each store explicitly overridden with false', () => {
    const base = defineAIPersistence({
      stores: {
        messages: createMessageStore(),
        runs: createRunStore(),
        interrupts: createInterruptStore(),
      },
    })

    const composed = composePersistence(base, {
      overrides: { runs: false, interrupts: false },
    })

    expect('runs' in composed.stores).toBe(false)
    expect('interrupts' in composed.stores).toBe(false)
    expect(composed.stores.messages).toBe(base.stores.messages)
    expect(base.stores.runs).toBeDefined()
    expect(base.stores.interrupts).toBeDefined()
  })

  it('inherits omitted and explicitly undefined stores from the base', () => {
    const messages = createMessageStore()
    const runs = createRunStore()
    const metadata = createMetadataStore()
    const base = defineAIPersistence({ stores: { messages, runs, metadata } })

    const composed = composePersistence(base, {
      overrides: { messages: undefined, metadata: createMetadataStore() },
    })

    expect(composed.stores.messages).toBe(messages)
    expect(composed.stores.runs).toBe(runs)
    expect(composed.stores.metadata).not.toBe(metadata)
  })

  it('does not mutate or assume ownership of base and override resources', () => {
    let baseDisposeCalls = 0
    let overrideDisposeCalls = 0
    const baseMessages = {
      ...createMessageStore(),
      dispose: () => {
        baseDisposeCalls += 1
      },
    }
    const overrideMessages = {
      ...createMessageStore(),
      dispose: () => {
        overrideDisposeCalls += 1
      },
    }
    const base = defineAIPersistence({
      stores: { messages: baseMessages, runs: createRunStore() },
    })
    const overrides = { messages: overrideMessages }
    Object.freeze(base.stores)
    Object.freeze(overrides)

    const composed = composePersistence(base, { overrides })

    expect(composed).not.toBe(base)
    expect(composed.stores).not.toBe(base.stores)
    expect(base.stores.messages).toBe(baseMessages)
    expect(overrides.messages).toBe(overrideMessages)
    expect(baseDisposeCalls).toBe(0)
    expect(overrideDisposeCalls).toBe(0)
  })

  it('rejects unknown override keys received from untyped JavaScript', () => {
    const base = defineAIPersistence({
      stores: { messages: createMessageStore() },
    })
    const overrides = { messages: createMessageStore() }
    Reflect.set(overrides, 'unknownStore', createRunStore())

    expect(() => composePersistence(base, { overrides })).toThrow(
      /unknown.*unknownStore/i,
    )
  })

  it('rejects unknown base store keys received from untyped JavaScript', () => {
    const stores = { messages: createMessageStore() }
    Reflect.set(stores, 'unknownStore', createRunStore())

    expect(() => defineAIPersistence({ stores })).toThrow(
      /unknown.*unknownStore/i,
    )
  })

  it('routes calls only to the selected store', async () => {
    const baseCalls: Array<string> = []
    const overrideCalls: Array<string> = []
    const base = defineAIPersistence({
      stores: {
        messages: createMessageStore((threadId) => baseCalls.push(threadId)),
      },
    })
    const overrideMessages = createMessageStore((threadId) =>
      overrideCalls.push(threadId),
    )
    const composed = composePersistence(base, {
      overrides: { messages: overrideMessages },
    })

    await composed.stores.messages.saveThread('thread-1', [])

    expect(overrideCalls).toEqual(['thread-1'])
    expect(baseCalls).toEqual([])
  })
})
