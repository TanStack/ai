import { describe, expect, it, vi } from 'vitest'
import { generateWorld } from '@tanstack/ai'
import { worldlabsWorld } from '../src'

describe('generated World Labs client', () => {
  it('posts worlds:generate, then polls the operation with a GET', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({ operation_id: 'op-1', done: false }),
      )
      .mockResolvedValueOnce(
        Response.json({
          operation_id: 'op-1',
          done: true,
          response: {
            world_id: 'w-1',
            world_marble_url: 'https://marble.worldlabs.ai/world/w-1',
          },
        }),
      )

    const result = await generateWorld({
      threadId: 'thread-1',
      adapter: worldlabsWorld('marble-1.1', {
        apiKey: 'wlt_test',
        baseUrl: 'https://gw.example/worldlabs/',
        defaultHeaders: { 'x-team': 'a', 'WLT-Api-Key': 'ignored' },
        fetch: fetcher,
      }),
      prompt: 'a forest',
      modelOptions: { seed: 7, pollIntervalMs: 1 },
      debug: false,
    })

    const [generateUrl, generateInit = {}] = fetcher.mock.calls[0]!
    expect(generateUrl).toBe(
      'https://gw.example/worldlabs/marble/v1/worlds:generate',
    )
    expect(generateInit.method).toBe('POST')
    const generateHeaders = new Headers(generateInit.headers)
    expect(generateHeaders.get('wlt-api-key')).toBe('wlt_test')
    expect(generateHeaders.get('content-type')).toBe('application/json')
    expect(generateHeaders.get('x-team')).toBe('a')
    expect(JSON.parse(String(generateInit.body))).toEqual({
      model: 'marble-1.1',
      world_prompt: { type: 'text', text_prompt: 'a forest' },
      seed: 7,
    })

    const [pollUrl, pollInit = {}] = fetcher.mock.calls[1]!
    expect(pollUrl).toBe(
      'https://gw.example/worldlabs/marble/v1/operations/op-1',
    )
    expect(pollInit.method).toBe('GET')
    expect(pollInit.body).toBeUndefined()
    const pollHeaders = new Headers(pollInit.headers)
    expect(pollHeaders.get('wlt-api-key')).toBe('wlt_test')
    expect(pollHeaders.get('content-type')).toBeNull()
    expect(pollHeaders.get('x-team')).toBe('a')

    expect(result.status).toBe('ready')
    expect(result.worldId).toBe('w-1')
  })
})
