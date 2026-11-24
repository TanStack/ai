import { describe, expect, it } from 'vitest'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { meshy3dModel } from '../src/adapters/model3d'
import { meshy3dMotion } from '../src/adapters/motion'

const logger = resolveDebugOption(false)

/** A fake Meshy API at the `fetch` boundary. It records each request. */
function fakeMeshy() {
  const requests: Array<{ url: string; body: unknown }> = []
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init)
    const text = await request.text()
    requests.push({ url: request.url, body: text ? JSON.parse(text) : null })
    return Response.json({ result: 'task-1' }, { status: 202 })
  }
  return { fetch, requests }
}

describe('Meshy adapters: defaultModelOptions', () => {
  it('3d model adapter stores the defaults and keeps them out of the request', async () => {
    const meshy = fakeMeshy()
    const adapter = meshy3dModel('text-to-3d-preview', 'meshy-7.1', {
      apiKey: 'test-key',
      fetch: meshy.fetch,
      defaultModelOptions: { target_polycount: 20000 },
    })

    await adapter.create3dModelJob({
      model: adapter.model,
      prompt: 'a wooden chest',
      logger,
    })

    expect(adapter.defaultModelOptions).toEqual({ target_polycount: 20000 })
    expect(meshy.requests).toEqual([
      {
        url: 'https://api.meshy.ai/openapi/v2/text-to-3d',
        body: {
          prompt: 'a wooden chest',
          ai_model: 'meshy-7.1',
          mode: 'preview',
        },
      },
    ])
  })

  it('3d motion adapter stores the defaults', () => {
    const adapter = meshy3dMotion('prime', {
      apiKey: 'test-key',
      defaultModelOptions: {},
    })

    expect(adapter.defaultModelOptions).toEqual({})
  })
})
