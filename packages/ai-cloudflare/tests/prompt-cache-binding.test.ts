import { describe, expect, it, vi } from 'vitest'
import { cloudflareBindingFetch } from '../src/index'
import type { CloudflareBindingFetchOptions } from '../src/index'
import type { Ai } from '@cloudflare/workers-types'

/**
 * Sends one request through `cloudflareBindingFetch` and returns the
 * arguments that `env.AI.run` got.
 */
async function runArgs(
  vendor: CloudflareBindingFetchOptions['vendor'],
  body: object,
  headers: Record<string, string> = {},
) {
  const run = vi.fn((..._args: Array<unknown>) => new Response('{}'))
  // `Ai` is a large abstract class with a generic, overloaded `run`. A fake
  // that only records calls cannot match that type, so we cast it.
  const binding = { run } as unknown as Ai
  const fetchImpl = cloudflareBindingFetch({ binding, vendor })
  await fetchImpl('https://api.example.com/v1/messages', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  return run.mock.calls[0]
}

// The parts of an Anthropic request that carry prompt cache markers.
const anthropicCachedParts = {
  stream: true,
  system: [
    {
      type: 'text',
      text: 'x',
      cache_control: { type: 'ephemeral', ttl: '1h' },
    },
  ],
  tools: [
    {
      name: 'lookup',
      input_schema: { type: 'object' },
      cache_control: { type: 'ephemeral' },
    },
  ],
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'Hi' },
        {
          type: 'text',
          text: 'What changed?',
          cache_control: { type: 'ephemeral' },
        },
      ],
    },
  ],
}

describe('cloudflareBindingFetch prompt caching', () => {
  it('passes Anthropic cache_control markers to env.AI.run unchanged', async () => {
    const args = await runArgs('anthropic', {
      model: 'claude-opus-5-5',
      ...anthropicCachedParts,
    })

    expect(args).toStrictEqual([
      'anthropic/claude-opus-5-5',
      anthropicCachedParts,
      { returnRawResponse: true },
    ])
  })

  it('passes the OpenAI prompt cache key and retention to env.AI.run unchanged', async () => {
    const args = await runArgs('openai', {
      model: 'gpt-6.1-sol',
      input: 'Hi',
      prompt_cache_key: 'thread-1',
      prompt_cache_retention: '24h',
    })

    expect(args).toStrictEqual([
      'openai/gpt-6.1-sol',
      {
        input: 'Hi',
        prompt_cache_key: 'thread-1',
        prompt_cache_retention: '24h',
      },
      { returnRawResponse: true },
    ])
  })

  it('forwards session headers as extraHeaders and drops the auth header', async () => {
    const args = await runArgs(
      'openai',
      { model: 'gpt-6.1-sol', input: 'Hi' },
      {
        authorization: 'Bearer cloudflare-binding',
        'content-type': 'application/json',
        'x-stainless-os': 'Windows',
        'x-session-affinity': 'thread-1',
        'x-client-request-id': 'request-1',
        session_id: 'thread-1',
      },
    )

    expect(args).toStrictEqual([
      'openai/gpt-6.1-sol',
      { input: 'Hi' },
      {
        returnRawResponse: true,
        extraHeaders: {
          'x-session-affinity': 'thread-1',
          'x-client-request-id': 'request-1',
          session_id: 'thread-1',
        },
      },
    ])
  })
})
