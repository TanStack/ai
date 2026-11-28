import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createOpenRouterDecider } from '../src/adapters/evaluate'
import { createOpenRouterImage } from '../src/adapters/image'
import { createOpenRouterRerank } from '../src/adapters/rerank'
import { createOpenRouterVideo } from '../src/adapters/video'
import type * as ClientModule from '../src/client/index'

// Record the config each SDK client gets. The real clients still build.
const clientConfigs = vi.hoisted(() => ({ list: [] as Array<object> }))

vi.mock('../src/client/index', async (importOriginal) => {
  const actual = await importOriginal<typeof ClientModule>()
  return {
    ...actual,
    createOpenRouterChatClient: (
      config: Parameters<typeof actual.createOpenRouterChatClient>[0],
    ) => {
      clientConfigs.list.push(config)
      return actual.createOpenRouterChatClient(config)
    },
    createOpenRouterRerankClient: (
      config: Parameters<typeof actual.createOpenRouterRerankClient>[0],
    ) => {
      clientConfigs.list.push(config)
      return actual.createOpenRouterRerankClient(config)
    },
    createOpenRouterVideoClient: (
      config: Parameters<typeof actual.createOpenRouterVideoClient>[0],
    ) => {
      clientConfigs.list.push(config)
      return actual.createOpenRouterVideoClient(config)
    },
  }
})

const routing = { provider: { sort: 'latency' as const } }

beforeEach(() => {
  clientConfigs.list = []
})

describe('OpenRouter media adapters defaultModelOptions', () => {
  it('evaluate adapter stores the defaults', () => {
    const adapter = createOpenRouterDecider(
      '~typesafe/jev-latest',
      'test-key',
      {
        defaultModelOptions: {},
      },
    )

    expect(adapter.defaultModelOptions).toEqual({})
  })

  it.each([
    {
      name: 'image',
      create: () =>
        createOpenRouterImage('google/gemini-2.5-flash-image', 'test-key', {
          defaultModelOptions: { image_size: '2K' },
        }),
      expected: { image_size: '2K' },
    },
    {
      name: 'rerank',
      create: () =>
        createOpenRouterRerank('cohere/rerank-v3.5', 'test-key', {
          defaultModelOptions: routing,
        }),
      expected: routing,
    },
    {
      name: 'video',
      create: () =>
        createOpenRouterVideo('google/veo-3.1', 'test-key', {
          defaultModelOptions: { callbackUrl: 'https://example.com/hook' },
        }),
      expected: { callbackUrl: 'https://example.com/hook' },
    },
  ])(
    '$name adapter stores the defaults and keeps them out of the SDK client',
    ({ create, expected }) => {
      const adapter = create()

      expect(adapter.defaultModelOptions).toEqual(expected)
      expect(clientConfigs.list).toHaveLength(1)
      expect(clientConfigs.list[0]).not.toHaveProperty('defaultModelOptions')
      expect(clientConfigs.list[0]).toHaveProperty('apiKey', 'test-key')
    },
  )
})
