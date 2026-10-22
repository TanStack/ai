import { describe, expect, it } from 'vitest'
import { EventType } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  createHarnessHost,
  defineCommand,
  defineHarness,
  definePlugin,
} from '../src'
import { mockAdapter, text } from './helpers'
import type { StreamChunk } from '@tanstack/ai'
import type { AuthRequest, UsageUpdate } from '../src'

const withUsage = (chunks: Array<StreamChunk>): Array<StreamChunk> =>
  chunks.map((chunk) =>
    chunk.type === EventType.RUN_FINISHED
      ? {
          ...chunk,
          usage: { promptTokens: 3, completionTokens: 2, totalTokens: 5 },
        }
      : chunk,
  )

const asker = definePlugin({
  name: 'test/asker',
  setup: (ctx) => ({
    commands: {
      confirm: defineCommand({
        description: 'Asks, then returns the answer',
        run: (_input, { step }) => step.ask({ name: 'go', message: 'Go on?' }),
      }),
      connect: defineCommand({
        description: 'Needs a sign-in',
        run: () => {
          ctx.session.authRequired({ connector: 'github', userCode: 'AB-12' })
        },
      }),
    },
  }),
})

async function open() {
  const host = createHarnessHost({ persistence: memoryPersistence() })
  const session = await host.open(
    defineHarness({
      name: 'test/hooks',
      adapter: mockAdapter([() => withUsage(text('hi'))]).adapter,
      plugins: () => [asker],
    }),
    {
      threadId: 't',
    },
  )
  return { host, session }
}

describe('session event hooks', () => {
  it('onQuestion gets each question, and its answer settles the ask', async () => {
    const { host, session } = await open()
    const stop = session.onQuestion(({ question, operationId }) => {
      expect(question.message).toBe('Go on?')
      expect(operationId).toBeTruthy()
      return session.answer({ questionId: question.questionId, value: 'yes' })
    })
    await expect(session.runCommand({ name: 'confirm' })).resolves.toBe('yes')
    stop()
    await host.close()
  })

  it('onAuthRequired gets the connector and the device code', async () => {
    const { host, session } = await open()
    const seen: Array<AuthRequest> = []
    session.onAuthRequired(({ operationId: _, ...auth }) => seen.push(auth))
    await session.runCommand({ name: 'connect' })
    expect(seen).toEqual([{ connector: 'github', userCode: 'AB-12' }])
    await host.close()
  })

  it('onUsage gets each model call with the new totals', async () => {
    const { host, session } = await open()
    const seen: Array<UsageUpdate> = []
    const stop = session.onUsage((update) => seen.push(update))
    await session.send('hello')
    expect(seen).toHaveLength(1)
    expect(seen[0]?.usage.totalTokens).toBe(5)
    expect(seen[0]?.total.totalTokens).toBe(5)
    stop()
    await host.close()
  })
})
