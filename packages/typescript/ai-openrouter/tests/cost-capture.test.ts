import { describe, expect, it, vi } from 'vitest'
import { HTTPClient } from '@openrouter/sdk'
import {
  CostStore,
  attachCostCapture,
  createCostCaptureHook,
} from '../src/adapters/cost-capture'
import type { CostInfo } from '../src/adapters/cost-capture'
import type { Fetcher } from '@openrouter/sdk'

function makeSseResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  })
}

function makeJsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

const fakeFetcher = (response: Response): Fetcher => async () => response

async function readAll(stream: ReadableStream<Uint8Array> | null): Promise<string> {
  if (!stream) return ''
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let out = ''
  while (true) {
    const { value, done } = await reader.read()
    if (value) out += decoder.decode(value, { stream: true })
    if (done) break
  }
  return out
}

const chatUrl = 'https://openrouter.ai/api/v1/chat/completions'

function makeChatRequest(url = chatUrl): Request {
  return new Request(url, { method: 'POST' })
}

function buildClient(
  response: Response,
  store: CostStore = new CostStore(),
): { client: HTTPClient; store: CostStore } {
  const client = new HTTPClient({ fetcher: fakeFetcher(response) })
  client.addHook('response', createCostCaptureHook(store))
  return { client, store }
}

describe('createCostCaptureHook — SSE chat-completion responses', () => {
  it('extracts cost and cost_details from the trailing usage chunk', async () => {
    const body =
      `data: ${JSON.stringify({ id: 'gen-1', choices: [{ delta: { content: 'Hi' }, index: 0 }] })}\n\n` +
      `data: ${JSON.stringify({
        id: 'gen-1',
        choices: [],
        usage: {
          prompt_tokens: 5,
          completion_tokens: 2,
          total_tokens: 7,
          cost: 0.001234,
          cost_details: {
            upstream_inference_cost: 0.001,
            cache_discount: -0.0001,
          },
        },
      })}\n\n` +
      `data: [DONE]\n\n`

    const { client, store } = buildClient(makeSseResponse(body))
    const res = await client.request(makeChatRequest())

    expect(await readAll(res.body)).toBe(body)
    expect(await store.take('gen-1')).toEqual({
      cost: 0.001234,
      costDetails: {
        upstreamInferenceCost: 0.001,
        cacheDiscount: -0.0001,
      },
    })
  })

  it('handles cost without cost_details', async () => {
    const body =
      `data: ${JSON.stringify({
        id: 'gen-2',
        choices: [],
        usage: {
          prompt_tokens: 1,
          completion_tokens: 1,
          total_tokens: 2,
          cost: 0.5,
        },
      })}\n\ndata: [DONE]\n\n`

    const { client, store } = buildClient(makeSseResponse(body))
    const res = await client.request(makeChatRequest())
    await readAll(res.body)

    expect(await store.take('gen-2')).toEqual({ cost: 0.5 })
  })

  it('does nothing when the response has no cost field', async () => {
    const body =
      `data: ${JSON.stringify({
        id: 'gen-3',
        choices: [],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      })}\n\ndata: [DONE]\n\n`

    const { client, store } = buildClient(makeSseResponse(body))
    const res = await client.request(makeChatRequest())
    await readAll(res.body)

    expect(await store.take('gen-3')).toBeUndefined()
  })
})

describe('createCostCaptureHook — non-streaming JSON responses', () => {
  it('extracts cost from a single JSON response body', async () => {
    const payload = {
      id: 'gen-json-1',
      choices: [{ message: { content: '{}' } }],
      usage: {
        prompt_tokens: 4,
        completion_tokens: 2,
        total_tokens: 6,
        cost: 0.0008,
        cost_details: { upstream_inference_cost: 0.0005 },
      },
    }

    const { client, store } = buildClient(makeJsonResponse(payload))
    const res = await client.request(makeChatRequest())
    await readAll(res.body)

    expect(await store.take('gen-json-1')).toEqual({
      cost: 0.0008,
      costDetails: { upstreamInferenceCost: 0.0005 },
    })
  })
})

describe('createCostCaptureHook — passes through unrelated requests', () => {
  it('does not parse non-chat responses', async () => {
    const body = JSON.stringify({ data: { id: 'x', total_cost: 5 } })
    const passed = new Response(body, {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })

    const { client, store } = buildClient(passed)
    const res = await client.request(
      new Request('https://openrouter.ai/api/v1/generation?id=x'),
    )

    expect(await res.text()).toBe(body)
    expect(await store.take('x')).toBeUndefined()
  })
})

describe('createCostCaptureHook — robustness', () => {
  it('survives malformed SSE payloads without breaking the SDK stream', async () => {
    const body =
      `data: not-json\n\n` +
      `data: ${JSON.stringify({
        id: 'gen-mix',
        choices: [],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, cost: 0.1 },
      })}\n\ndata: [DONE]\n\n`

    const { client, store } = buildClient(makeSseResponse(body))
    const res = await client.request(makeChatRequest())

    expect(await readAll(res.body)).toBe(body)
    expect(await store.take('gen-mix')).toEqual({ cost: 0.1 })
  })

  it('returns the original response unchanged when there is no body', async () => {
    const { client } = buildClient(new Response(null, { status: 204 }))
    const res = await client.request(makeChatRequest())
    expect(res.status).toBe(204)
  })
})

describe('attachCostCapture', () => {
  const costBody = `data: ${JSON.stringify({
    id: 'gen-attach',
    choices: [],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2, cost: 0.25 },
  })}\n\ndata: [DONE]\n\n`

  it('returns a fresh HTTPClient when no caller client is supplied', () => {
    const store = new CostStore()
    const wrapped = attachCostCapture(store)
    expect(wrapped).toBeInstanceOf(HTTPClient)
  })

  it('clones the caller-supplied HTTPClient rather than mutating it', async () => {
    const callerClient = new HTTPClient({
      fetcher: fakeFetcher(makeSseResponse(costBody)),
    })

    const store = new CostStore()
    const wrapped = attachCostCapture(store, callerClient)

    expect(wrapped).not.toBe(callerClient)

    // Calling the caller's original client must not populate our store —
    // proves we did not mutate it.
    const direct = await callerClient.request(makeChatRequest())
    await readAll(direct.body)
    expect(await store.take('gen-attach')).toBeUndefined()
  })

  it('preserves hooks registered on the caller before wrapping', async () => {
    const callerClient = new HTTPClient({
      fetcher: fakeFetcher(makeSseResponse(costBody)),
    })
    const callerHook = vi.fn()
    callerClient.addHook('response', callerHook)

    const store = new CostStore()
    const wrapped = attachCostCapture(store, callerClient)

    const res = await wrapped.request(makeChatRequest())
    await readAll(res.body)

    expect(callerHook).toHaveBeenCalledTimes(1)
    expect(await store.take('gen-attach')).toEqual({ cost: 0.25 })
  })

  it('inherits the caller fetcher (proxies, tracing, retries, etc.)', async () => {
    const callerFetcher = vi.fn(fakeFetcher(makeSseResponse(costBody)))
    const callerClient = new HTTPClient({ fetcher: callerFetcher })

    const store = new CostStore()
    const wrapped = attachCostCapture(store, callerClient)

    const res = await wrapped.request(makeChatRequest())
    await readAll(res.body)

    expect(callerFetcher).toHaveBeenCalledTimes(1)
    expect(await store.take('gen-attach')).toEqual({ cost: 0.25 })
  })
})

describe('CostStore', () => {
  it('take() removes the entry after reading', async () => {
    const store = new CostStore()
    store.set('a', { cost: 1 })
    expect(await store.take('a')).toEqual({ cost: 1 })
    expect(await store.take('a')).toBeUndefined()
  })

  it('overwrites entries with the same id', async () => {
    const store = new CostStore()
    store.set('a', { cost: 1 })
    store.set('a', { cost: 2 })
    expect(await store.take('a')).toEqual({ cost: 2 })
  })

  // Regression: the tee'd parse is fire-and-forget, so the adapter can
  // reach `take(id)` before `store.set(id, ...)` has run. `take` must
  // await outstanding parses to keep cost capture deterministic.
  it('take() awaits an in-flight parse before reading', async () => {
    const store = new CostStore()
    let resolveParse!: () => void
    const parse = new Promise<void>((resolve) => {
      resolveParse = resolve
    }).then(() => {
      store.set('racey', { cost: 7 })
    })
    store.recordParse(parse)

    let taken: CostInfo | undefined
    const takePromise = store.take('racey').then((info) => {
      taken = info
    })

    expect(taken).toBeUndefined()
    resolveParse()
    await takePromise

    expect(taken).toEqual({ cost: 7 })
  })
})

describe('createCostCaptureHook — resilience to preceding hooks', () => {
  it('does not fail the request when a preceding hook consumed the body', async () => {
    const body =
      `data: ${JSON.stringify({
        id: 'gen-disturbed',
        choices: [],
        usage: {
          prompt_tokens: 1,
          completion_tokens: 1,
          total_tokens: 2,
          cost: 0.9,
        },
      })}\n\ndata: [DONE]\n\n`

    const client = new HTTPClient({
      fetcher: fakeFetcher(makeSseResponse(body)),
    })
    // A preceding caller hook reads the body directly; this disturbs `res`
    // so that subsequent `res.clone()` throws. We must not surface that as
    // a request failure.
    client.addHook('response', async (res) => {
      await res.text()
    })
    const store = new CostStore()
    client.addHook('response', createCostCaptureHook(store))

    await expect(client.request(makeChatRequest())).resolves.toBeDefined()
    expect(await store.take('gen-disturbed')).toBeUndefined()
  })
})
