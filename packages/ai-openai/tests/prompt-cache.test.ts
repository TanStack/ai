import { describe, expect, it, vi } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { OpenAITextAdapter } from '../src/adapters/text'
import { OpenAIChatCompletionsTextAdapter } from '../src/adapters/text-chat-completions'
import { openAIModelUsesExplicitPromptCache } from '../src/model-meta'
import {
  chatPromptCacheFields,
  clampPromptCacheKey,
  responsesPromptCacheFields,
} from '../src/prompt-cache'
import type { ResolvedPromptCache } from '@tanstack/ai'
import type { OpenAITextProviderOptions } from '../src/adapters/text'
import type { OpenAIChatModel } from '../src/model-meta'

const logger = resolveDebugOption(false)
const messages = [{ role: 'user' as const, content: 'hi' }]
const CUSTOM_URL = 'https://llm.example.com/v1'

async function* noEvents() {}

/** The Responses adapter, with its SDK client in reach so a test can stub it. */
class ResponsesAdapter<
  TModel extends OpenAIChatModel,
> extends OpenAITextAdapter<TModel> {
  get sdk() {
    return this.client
  }
}

/** The Chat Completions adapter, with its SDK client in reach. */
class ChatAdapter<
  TModel extends OpenAIChatModel,
> extends OpenAIChatCompletionsTextAdapter<TModel> {
  get sdk() {
    return this.client
  }
}

async function drain(stream: AsyncIterable<unknown>) {
  for await (const _chunk of stream) {
    // Drain the stream.
  }
}

/** Only the `prompt_cache*` fields of a request body. */
function promptCacheFieldsOf(body: object) {
  return Object.fromEntries(
    Object.entries(body).filter(([key]) => key.startsWith('prompt_cache')),
  )
}

/** Run one Responses call and return the cache fields it sent. */
async function sendResponses(
  model: OpenAIChatModel,
  promptCache: ResolvedPromptCache | undefined,
  modelOptions?: OpenAITextProviderOptions,
) {
  const adapter = new ResponsesAdapter({ apiKey: 'test' }, model)
  // The SDK `create` returns an APIPromise, which a mock cannot build.
  const create = vi.fn().mockResolvedValue(noEvents())
  adapter.sdk.responses.create = create as typeof adapter.sdk.responses.create
  await drain(
    adapter.chatStream({
      logger,
      model,
      messages,
      ...(promptCache ? { promptCache } : {}),
      ...(modelOptions ? { modelOptions } : {}),
    }),
  )
  return promptCacheFieldsOf(create.mock.calls[0]?.[0])
}

/** Run one Chat Completions call and return the cache fields it sent. */
async function sendChat(
  promptCache: ResolvedPromptCache | undefined,
  options: { baseURL?: string; modelOptions?: OpenAITextProviderOptions } = {},
) {
  const adapter = new ChatAdapter(
    {
      apiKey: 'test',
      ...(options.baseURL ? { baseURL: options.baseURL } : {}),
    },
    'gpt-4.1',
  )
  // The SDK `create` returns an APIPromise, which a mock cannot build.
  const create = vi.fn().mockResolvedValue(noEvents())
  adapter.sdk.chat.completions.create =
    create as typeof adapter.sdk.chat.completions.create
  await drain(
    adapter.chatStream({
      logger,
      model: 'gpt-4.1',
      messages,
      ...(promptCache ? { promptCache } : {}),
      ...(options.modelOptions ? { modelOptions: options.modelOptions } : {}),
    }),
  )
  return promptCacheFieldsOf(create.mock.calls[0]?.[0])
}

describe('clampPromptCacheKey', () => {
  it('keeps a short key as it is', () => {
    expect(clampPromptCacheKey('thread-1')).toBe('thread-1')
  })

  it('keeps no key as no key', () => {
    expect(clampPromptCacheKey(undefined)).toBeUndefined()
  })

  it('cuts at 64 characters and never splits an emoji or a CJK character', () => {
    // 2 + 20 + 60 = 82 characters. A cut by UTF-16 units splits the emoji run.
    const key = `k-${'缓存'.repeat(10)}${'😀'.repeat(60)}`

    expect(clampPromptCacheKey(key)).toBe(
      `k-${'缓存'.repeat(10)}${'😀'.repeat(42)}`,
    )
  })
})

describe('openAIModelUsesExplicitPromptCache', () => {
  it('is true for gpt-5.6 and later, and for gpt-6 and later', () => {
    for (const model of [
      'gpt-5.6',
      'gpt-5.6-sol',
      'gpt-5.6-luna-pro',
      'gpt-5.10',
      'gpt-6-sol',
      'gpt-6.1-sol',
    ]) {
      expect(openAIModelUsesExplicitPromptCache(model), model).toBe(true)
    }
  })

  it('is false for older models', () => {
    for (const model of [
      'gpt-5.5',
      'gpt-5.5-pro',
      'gpt-5.2',
      'gpt-5',
      'gpt-4.1',
      'gpt-4o',
      'o3',
      'gpt-chat-latest',
    ]) {
      expect(openAIModelUsesExplicitPromptCache(model), model).toBe(false)
    }
  })
})

describe('responsesPromptCacheFields', () => {
  const classic = { explicitMode: false, longRetention: true }
  const explicit = { explicitMode: true, longRetention: true }

  it('sends nothing without the option', () => {
    expect(responsesPromptCacheFields(undefined, explicit)).toEqual({})
  })

  it('sends the key for a short retention', () => {
    expect(
      responsesPromptCacheFields({ retention: 'short', key: 'k-1' }, classic),
    ).toEqual({ prompt_cache_key: 'k-1' })
  })

  it('sends no key when there is none', () => {
    expect(responsesPromptCacheFields({ retention: 'short' }, classic)).toEqual(
      {},
    )
  })

  it('sends nothing for none on an older model', () => {
    expect(
      responsesPromptCacheFields({ retention: 'none', key: 'k-1' }, classic),
    ).toEqual({})
  })

  it('sends 24h for a long retention on an older model', () => {
    expect(
      responsesPromptCacheFields({ retention: 'long', key: 'k-1' }, classic),
    ).toEqual({ prompt_cache_key: 'k-1', prompt_cache_retention: '24h' })
  })

  it('sends no 24h when the endpoint has no long retention', () => {
    expect(
      responsesPromptCacheFields(
        { retention: 'long', key: 'k-1' },
        { explicitMode: false, longRetention: false },
      ),
    ).toEqual({ prompt_cache_key: 'k-1' })
  })

  it('turns automatic caching off for none on an explicit-mode model', () => {
    expect(
      responsesPromptCacheFields({ retention: 'none', key: 'k-1' }, explicit),
    ).toEqual({ prompt_cache_options: { mode: 'explicit' } })
  })

  it('sends a 30m ttl, not 24h, for a long retention on an explicit-mode model', () => {
    expect(
      responsesPromptCacheFields({ retention: 'long', key: 'k-1' }, explicit),
    ).toEqual({ prompt_cache_key: 'k-1', prompt_cache_options: { ttl: '30m' } })
  })

  it('sends only the key for a short retention on an explicit-mode model', () => {
    expect(
      responsesPromptCacheFields({ retention: 'short', key: 'k-1' }, explicit),
    ).toEqual({ prompt_cache_key: 'k-1' })
  })
})

describe('chatPromptCacheFields', () => {
  const openai = { baseURL: 'https://api.openai.com/v1', longRetention: true }
  const custom = { baseURL: CUSTOM_URL, longRetention: true }

  it('sends nothing without the option, or for none', () => {
    expect(chatPromptCacheFields(undefined, openai)).toEqual({})
    expect(
      chatPromptCacheFields({ retention: 'none', key: 'k-1' }, openai),
    ).toEqual({})
  })

  it('sends the key to api.openai.com for a short retention', () => {
    expect(
      chatPromptCacheFields({ retention: 'short', key: 'k-1' }, openai),
    ).toEqual({ prompt_cache_key: 'k-1' })
  })

  it('sends no key to another server for a short retention', () => {
    expect(
      chatPromptCacheFields({ retention: 'short', key: 'k-1' }, custom),
    ).toEqual({})
  })

  it('sends the key and 24h to another server for a long retention', () => {
    expect(
      chatPromptCacheFields({ retention: 'long', key: 'k-1' }, custom),
    ).toEqual({ prompt_cache_key: 'k-1', prompt_cache_retention: '24h' })
  })

  it('sends 24h but no key when there is none', () => {
    expect(chatPromptCacheFields({ retention: 'long' }, custom)).toEqual({
      prompt_cache_retention: '24h',
    })
  })

  it('sends nothing to another server when it has no long retention', () => {
    expect(
      chatPromptCacheFields(
        { retention: 'long', key: 'k-1' },
        { baseURL: CUSTOM_URL, longRetention: false },
      ),
    ).toEqual({})
  })
})

describe('OpenAI Responses adapter: chat({ promptCache })', () => {
  it('sends the clamped key and 24h on an older model', async () => {
    expect(
      await sendResponses('gpt-5.5', {
        retention: 'long',
        key: `k-${'😀'.repeat(70)}`,
      }),
    ).toStrictEqual({
      prompt_cache_key: `k-${'😀'.repeat(62)}`,
      prompt_cache_retention: '24h',
    })
  })

  it('turns automatic caching off for none on gpt-5.6', async () => {
    expect(
      await sendResponses('gpt-5.6', { retention: 'none', key: 'k-1' }),
    ).toStrictEqual({ prompt_cache_options: { mode: 'explicit' } })
  })

  it('sends a 30m ttl and no prompt_cache_retention for long on gpt-6-sol', async () => {
    expect(
      await sendResponses('gpt-6-sol', { retention: 'long', key: 'k-1' }),
    ).toStrictEqual({
      prompt_cache_key: 'k-1',
      prompt_cache_options: { ttl: '30m' },
    })
  })

  it('keeps the values the caller set in modelOptions', async () => {
    // `prompt_cache_options` is not in the typed options, so it comes in as a
    // plain object, the way a JavaScript caller sends it.
    const callerOptions = {
      prompt_cache_key: 'caller-key',
      prompt_cache_options: { ttl: '5m' },
    }

    expect(
      await sendResponses(
        'gpt-5.6',
        { retention: 'long', key: 'k-1' },
        callerOptions,
      ),
    ).toStrictEqual({
      prompt_cache_key: 'caller-key',
      prompt_cache_options: { ttl: '5m' },
    })
  })

  it('sends no cache field without the option', async () => {
    expect(await sendResponses('gpt-5.6', undefined)).toStrictEqual({})
  })
})

describe('OpenAI Chat Completions adapter: chat({ promptCache })', () => {
  it('sends the key to api.openai.com for a short retention', async () => {
    // The base URL is set here, so an OPENAI_BASE_URL env value cannot
    // change the result.
    expect(
      await sendChat(
        { retention: 'short', key: 'k-1' },
        { baseURL: 'https://api.openai.com/v1' },
      ),
    ).toStrictEqual({ prompt_cache_key: 'k-1' })
  })

  it('sends no key to a custom base URL for a short retention', async () => {
    expect(
      await sendChat(
        { retention: 'short', key: 'k-1' },
        { baseURL: CUSTOM_URL },
      ),
    ).toStrictEqual({})
  })

  it('sends the key and 24h to a custom base URL for a long retention', async () => {
    expect(
      await sendChat(
        { retention: 'long', key: 'k-1' },
        { baseURL: CUSTOM_URL },
      ),
    ).toStrictEqual({ prompt_cache_key: 'k-1', prompt_cache_retention: '24h' })
  })

  it('keeps the key the caller set in modelOptions', async () => {
    expect(
      await sendChat(
        { retention: 'short', key: 'k-1' },
        { modelOptions: { prompt_cache_key: 'caller-key' } },
      ),
    ).toStrictEqual({ prompt_cache_key: 'caller-key' })
  })

  it('sends no cache field without the option', async () => {
    expect(await sendChat(undefined)).toStrictEqual({})
  })
})
