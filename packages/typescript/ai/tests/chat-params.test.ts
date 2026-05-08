import { describe, it, expect } from 'vitest'
import {
  chatParamsFromRequest,
  chatParamsFromRequestBody,
  mergeAgentTools,
} from '../src/utilities/chat-params'

describe('chatParamsFromRequestBody', () => {
  const validBody = {
    threadId: 'thread-1',
    runId: 'run-1',
    state: {},
    messages: [
      {
        id: 'm1',
        role: 'user',
        content: 'hello',
        // TanStack canonical (extra) — should pass through untouched
        parts: [{ type: 'text', content: 'hello' }],
      },
    ],
    tools: [],
    context: [],
    forwardedProps: { temperature: 0.7 },
  }

  it('returns parsed fields verbatim on a valid body', async () => {
    const result = await chatParamsFromRequestBody(validBody)
    expect(result.threadId).toBe('thread-1')
    expect(result.runId).toBe('run-1')
    expect(result.messages).toHaveLength(1)
    expect(result.tools).toEqual([])
    expect(result.forwardedProps).toEqual({ temperature: 0.7 })
  })

  it('preserves the `parts` field on messages (AG-UI strip mode tolerates extras in raw JSON)', async () => {
    const result = await chatParamsFromRequestBody(validBody)
    const m = result.messages[0] as { parts?: unknown }
    expect(m.parts).toEqual([{ type: 'text', content: 'hello' }])
  })

  it('throws on missing threadId', async () => {
    const { threadId, ...rest } = validBody
    await expect(chatParamsFromRequestBody(rest)).rejects.toThrow()
  })

  it('throws on missing runId', async () => {
    const { runId, ...rest } = validBody
    await expect(chatParamsFromRequestBody(rest)).rejects.toThrow()
  })

  it('throws on missing messages', async () => {
    const { messages, ...rest } = validBody
    await expect(chatParamsFromRequestBody(rest)).rejects.toThrow()
  })

  it('rejects the legacy {messages, data} shape with a migration-pointing error', async () => {
    const oldBody = {
      messages: [
        { id: 'm1', role: 'user', parts: [{ type: 'text', content: 'hi' }] },
      ],
      data: {},
    }
    await expect(chatParamsFromRequestBody(oldBody)).rejects.toThrow(
      /AG-UI|RunAgentInput|migration/i,
    )
  })
})

describe('chatParamsFromRequest', () => {
  const validBody = {
    threadId: 'thread-1',
    runId: 'run-1',
    state: {},
    messages: [
      {
        id: 'm1',
        role: 'user',
        content: 'hello',
        parts: [{ type: 'text', content: 'hello' }],
      },
    ],
    tools: [],
    context: [],
    forwardedProps: {},
  }

  const makeRequest = (body: unknown): Request =>
    new Request('https://example.test/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    })

  it('returns parsed params on a valid body', async () => {
    const params = await chatParamsFromRequest(makeRequest(validBody))
    expect(params.threadId).toBe('thread-1')
    expect(params.runId).toBe('run-1')
    expect(params.messages).toHaveLength(1)
  })

  it('throws a 400 Response when JSON is malformed', async () => {
    // `Request.json()` consumes the body — every call needs a fresh
    // Request so the second invocation actually exercises the parse-failure
    // path rather than the "body already read" branch.
    await expect(
      chatParamsFromRequest(makeRequest('{not-json')),
    ).rejects.toBeInstanceOf(Response)

    try {
      await chatParamsFromRequest(makeRequest('{not-json'))
    } catch (thrown) {
      expect(thrown).toBeInstanceOf(Response)
      const res = thrown as Response
      expect(res.status).toBe(400)
      const body = await res.text()
      // Public message must NOT echo Zod / parser internals.
      expect(body).toMatch(/AG-UI|migration/i)
      // Underlying error is preserved as `cause` for server-side logs.
      expect((res as unknown as { cause?: unknown }).cause).toBeDefined()
    }
  })

  it('throws a 400 Response with a migration-pointing message on invalid AG-UI shape', async () => {
    const req = makeRequest({ messages: [], data: {} })
    try {
      await chatParamsFromRequest(req)
      throw new Error('should have thrown')
    } catch (thrown) {
      expect(thrown).toBeInstanceOf(Response)
      const res = thrown as Response
      expect(res.status).toBe(400)
      const body = await res.text()
      expect(body).toMatch(/AG-UI|migration/i)
      // Original AGUIError is attached as `cause`.
      expect((res as unknown as { cause?: unknown }).cause).toBeDefined()
    }
  })
})

describe('mergeAgentTools', () => {
  const fakeServerTool = (name: string) => ({
    name,
    description: `server ${name}`,
    inputSchema: { type: 'object', properties: {} },
    execute: async () => ({ ok: true }),
  })

  it('returns server tools unchanged when client list is empty', () => {
    const server = [fakeServerTool('greet')]
    const result = mergeAgentTools(server, [])
    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe('greet')
    expect(result[0]!.execute).toBeDefined()
  })

  it('adds client-only tools as no-execute stubs', () => {
    const server: Array<ReturnType<typeof fakeServerTool>> = []
    const client = [
      {
        name: 'showToast',
        description: 'render a toast',
        parameters: { type: 'object', properties: {} },
      },
    ]
    const result = mergeAgentTools(server, client)
    expect(result).toHaveLength(1)
    expect(result[0]!.name).toBe('showToast')
    expect(result[0]!.execute).toBeUndefined()
    expect(result[0]!.inputSchema).toEqual({ type: 'object', properties: {} })
    expect(result[0]!.description).toBe('render a toast')
  })

  it('server wins on name collision (client declaration ignored)', () => {
    const server = [fakeServerTool('greet')]
    const client = [
      {
        name: 'greet',
        description: 'overridden',
        parameters: { type: 'object', properties: { foo: { type: 'string' } } },
      },
    ]
    const result = mergeAgentTools(server, client)
    expect(result).toHaveLength(1)
    expect(result[0]!.description).toBe('server greet')
    expect(result[0]!.execute).toBeDefined()
  })

  it('preserves the order: server tools first, then unique client tools', () => {
    const server = [fakeServerTool('alpha'), fakeServerTool('beta')]
    const client = [
      {
        name: 'beta', // collides — should NOT be added again
        description: 'overridden',
        parameters: { type: 'object', properties: {} },
      },
      {
        name: 'gamma',
        description: 'a client-only tool',
        parameters: { type: 'object', properties: {} },
      },
    ]
    const result = mergeAgentTools(server, client)
    expect(result.map((t) => t.name)).toEqual(['alpha', 'beta', 'gamma'])
  })

  it('handles empty server and empty client', () => {
    expect(mergeAgentTools([], [])).toEqual([])
  })
})
