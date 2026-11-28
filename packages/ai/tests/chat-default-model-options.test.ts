import { describe, expect, it } from 'vitest'
import { chat } from '../src/activities/chat/index'
import { defineChatMiddleware } from '../src/activities/chat/middleware/define'
import { collectChunks, createMockAdapter, ev } from './test-utils'
import type { AnyTextAdapter } from '../src/activities/chat/adapter'
import type { StreamChunk } from '../src/types'

const defaults = {
  provider: { sort: 'latency', only: ['a'] },
  temperature: 0.2,
}

async function run(options: {
  modelOptions?: Record<string, unknown>
  defaultModelOptions?: Record<string, unknown>
}) {
  const mock = createMockAdapter({
    iterations: [[ev.runStarted(), ev.runFinished('stop')]],
  })
  const seen: Array<unknown> = []
  const adapter: AnyTextAdapter = {
    ...mock.adapter,
    defaultModelOptions: options.defaultModelOptions,
    supportsCombinedToolsAndSchema: (modelOptions) => {
      seen.push(modelOptions)
      return false
    },
  }
  await collectChunks(
    chat({
      threadId: 'thread-1',
      adapter,
      messages: [{ role: 'user', content: 'go' }],
      modelOptions: options.modelOptions,
      middleware: [
        defineChatMiddleware({
          name: 'test/default-model-options',
          onConfig(_ctx, config) {
            seen.push(config.modelOptions)
            return undefined
          },
        }),
      ],
    }) as AsyncIterable<StreamChunk>,
  )
  return { sent: mock.calls[0]?.modelOptions, seen }
}

describe('chat() with adapter defaultModelOptions', () => {
  it('sends the defaults when the call sets no modelOptions', async () => {
    const { sent } = await run({ defaultModelOptions: defaults })
    expect(sent).toEqual(defaults)
  })

  it('lets a call key replace the default key in full', async () => {
    const { sent } = await run({
      defaultModelOptions: defaults,
      modelOptions: { provider: { only: ['b'] } },
    })
    expect(sent).toEqual({ provider: { only: ['b'] }, temperature: 0.2 })
  })

  it('shows the merged value to the engine and middleware', async () => {
    const { seen } = await run({
      defaultModelOptions: defaults,
      modelOptions: { temperature: 0.9 },
    })
    expect(seen.length).toBeGreaterThan(0)
    for (const value of seen) {
      expect(value).toEqual({ ...defaults, temperature: 0.9 })
    }
  })

  it('sends the call modelOptions unchanged when there are no defaults', async () => {
    const { sent } = await run({ modelOptions: { temperature: 0.9 } })
    expect(sent).toEqual({ temperature: 0.9 })
  })
})
