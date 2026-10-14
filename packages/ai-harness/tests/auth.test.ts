import { describe, expect, it } from 'vitest'
import { EventType, defineAgent } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  createHarnessHost,
  defineCommand,
  defineHarness,
  definePlugin,
  scrubSecrets,
} from '../src'
import { mockAdapter, text } from './helpers'

describe('scrubSecrets', () => {
  it('removes known secrets from text', () => {
    expect(scrubSecrets('token gh-abcdef1234 failed', ['gh-abcdef1234'])).toBe(
      'token [redacted] failed',
    )
  })
})

describe('errors a session publishes', () => {
  it('redacts a credential the command read, also in its JSON form', async () => {
    const secret = 'sk-"live"-123456'
    const plugin = definePlugin({
      name: 'test/leaky',
      setup: () => ({
        commands: {
          leak: defineCommand({
            description: 'Call the API',
            run: async (_input, { credentials }) => {
              const credential = await credentials.require('acme')
              const value =
                credential.type === 'api_key' ? credential.value : ''
              throw new Error(
                `fetch failed: Bearer ${value} ${JSON.stringify({ value })}`,
              )
            },
          }),
        },
      }),
    })
    const persistence = memoryPersistence()
    await persistence.stores.credentials.set({
      scope: { threadId: 't1' },
      id: 'acme',
      credential: { type: 'api_key', value: secret },
    })
    const { adapter } = mockAdapter(() => text('ok'))
    const host = createHarnessHost({ persistence })
    const session = await host.open(
      defineHarness({ name: 'test/scrub', adapter, plugins: () => [plugin] }),
      { threadId: 't1' },
    )
    const errors: Array<string> = []
    session.onEvent(EventType.RUN_ERROR, ({ event }) => {
      errors.push(event.message)
    })

    await expect(session.command('leak')).rejects.toThrow()

    expect(errors).toEqual([
      'fetch failed: Bearer [redacted] {"value":"[redacted]"}',
    ])
    await host.close()
  })

  it('redacts a key that a background agent read', async () => {
    const secret = 'sk-agent-123456'
    const leaky = defineAgent({
      name: 'leaky',
      description: 'Calls the API',
      run: async (ctx) => {
        const key = await ctx.keys.require('acme')
        throw new Error(`fetch failed: Bearer ${key}`)
      },
    })
    const persistence = memoryPersistence()
    await persistence.stores.credentials.set({
      scope: { threadId: 't1' },
      id: 'acme',
      credential: { type: 'api_key', value: secret },
    })
    const { adapter } = mockAdapter(() => text('ok'))
    const host = createHarnessHost({ persistence })
    const session = await host.open(
      defineHarness({ name: 'test/scrub', adapter, agents: [leaky] }),
      { threadId: 't1' },
    )
    const errors: Array<string> = []
    session.onEvent(EventType.RUN_ERROR, ({ event }) => {
      errors.push(event.message)
    })

    const run = session.agents.leaky.run()
    await expect(run).rejects.toThrow('[redacted]')

    expect(errors).toEqual(['fetch failed: Bearer [redacted]'])
    await host.close()
  })
})
