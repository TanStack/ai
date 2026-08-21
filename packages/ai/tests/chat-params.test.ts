import { describe, expect, it } from 'vitest'
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
    resume: [
      {
        interruptId: 'interrupt-1',
        status: 'resolved',
        payload: { approved: true },
      },
      {
        interruptId: 'interrupt-2',
        status: 'cancelled',
      },
    ],
  }

  it('returns parsed fields verbatim on a valid body', async () => {
    const result = await chatParamsFromRequestBody(validBody)
    expect(result.threadId).toBe('thread-1')
    expect(result.runId).toBe('run-1')
    expect(result.messages).toHaveLength(1)
    expect(result.tools).toEqual([])
    expect(result.forwardedProps).toEqual({ temperature: 0.7 })
    expect(result.aguiContext).toEqual([])
    expect(result.context).toBe(result.aguiContext)
    // Delivery cursor is gone — request parsing never surfaces a `cursor`.
    expect('cursor' in result).toBe(false)
    expect(result.resume).toEqual(validBody.resume)
  })

  it('ignores any `cursor` field on the body (delivery cursor removed)', async () => {
    const result = await chatParamsFromRequestBody({
      ...validBody,
      cursor: 'cursor-1',
    })
    expect('cursor' in result).toBe(false)
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

// The AG-UI `RunAgentInput` contract is validated structurally rather than by a
// schema library, so the accept/reject boundary is covered explicitly here.
describe('chatParamsFromRequestBody — RunAgentInput validation', () => {
  const base = {
    threadId: 'thread-1',
    runId: 'run-1',
    tools: [],
    context: [],
  }
  const withMessages = (messages: Array<unknown>) => ({ ...base, messages })

  it.each([
    ['a non-object body', 'not-an-object'],
    ['a null body', null],
    ['an array body', []],
  ])('rejects %s', async (_label, body) => {
    await expect(chatParamsFromRequestBody(body)).rejects.toThrow(/AG-UI/i)
  })

  it.each([
    ['tools', { ...base, tools: undefined, messages: [] }],
    ['context', { ...base, context: undefined, messages: [] }],
  ])('rejects a missing required `%s` array', async (_label, body) => {
    await expect(chatParamsFromRequestBody(body)).rejects.toThrow(/AG-UI/i)
  })

  it('rejects a non-array `messages`', async () => {
    await expect(
      chatParamsFromRequestBody({ ...base, messages: {} }),
    ).rejects.toThrow(/messages must be an array/)
  })

  it('reports the offending index and field in the error', async () => {
    await expect(
      chatParamsFromRequestBody(
        withMessages([
          { id: 'm1', role: 'user', content: 'ok' },
          { id: 'm2', role: 'user' },
        ]),
      ),
    ).rejects.toThrow(/messages\[1\]\.content/)
  })

  it('rejects an unknown role', async () => {
    await expect(
      chatParamsFromRequestBody(
        withMessages([{ id: 'm1', role: 'wizard', content: 'hi' }]),
      ),
    ).rejects.toThrow(/messages\[0\]\.role/)
  })

  it('rejects a message without a string id', async () => {
    await expect(
      chatParamsFromRequestBody(
        withMessages([{ id: 7, role: 'user', content: 'hi' }]),
      ),
    ).rejects.toThrow(/messages\[0\]\.id/)
  })

  it.each(['developer', 'system', 'reasoning', 'user'] as const)(
    'requires string content on a %s message',
    async (role) => {
      await expect(
        chatParamsFromRequestBody(withMessages([{ id: 'm1', role }])),
      ).rejects.toThrow(/messages\[0\]\.content/)
    },
  )

  it('accepts an assistant message with no content (tool-calling turn)', async () => {
    const result = await chatParamsFromRequestBody(
      withMessages([
        {
          id: 'm1',
          role: 'assistant',
          toolCalls: [
            {
              id: 'tc1',
              type: 'function',
              function: { name: 'greet', arguments: '{}' },
            },
          ],
        },
      ]),
    )
    expect(result.messages).toHaveLength(1)
  })

  it('accepts multimodal user content as an array', async () => {
    const result = await chatParamsFromRequestBody(
      withMessages([
        {
          id: 'm1',
          role: 'user',
          content: [{ type: 'text', text: 'describe this' }],
        },
      ]),
    )
    expect(result.messages).toHaveLength(1)
  })

  it('requires toolCallId on a tool message', async () => {
    await expect(
      chatParamsFromRequestBody(
        withMessages([{ id: 'm1', role: 'tool', content: 'result' }]),
      ),
    ).rejects.toThrow(/messages\[0\]\.toolCallId/)
  })

  it('requires activityType and object content on an activity message', async () => {
    await expect(
      chatParamsFromRequestBody(
        withMessages([{ id: 'm1', role: 'activity', content: {} }]),
      ),
    ).rejects.toThrow(/messages\[0\]\.activityType/)

    await expect(
      chatParamsFromRequestBody(
        withMessages([
          { id: 'm1', role: 'activity', activityType: 'search', content: 'no' },
        ]),
      ),
    ).rejects.toThrow(/messages\[0\]\.content/)
  })

  it('drops `parts` that contain unrecognized part types', async () => {
    const result = await chatParamsFromRequestBody(
      withMessages([
        {
          id: 'm1',
          role: 'user',
          content: 'hi',
          parts: [{ type: 'not-a-real-part' }],
        },
      ]),
    )
    expect('parts' in result.messages[0]!).toBe(false)
  })

  it('preserves structured-output parts', async () => {
    const structuredOutput = {
      type: 'structured-output',
      status: 'complete',
      raw: '{"name":"Ada"}',
      data: { name: 'Ada' },
    }
    const result = await chatParamsFromRequestBody(
      withMessages([
        {
          id: 'm1',
          role: 'assistant',
          content: structuredOutput.raw,
          parts: [structuredOutput],
        },
      ]),
    )
    expect(result.messages[0]).toMatchObject({ parts: [structuredOutput] })
  })

  it('drops structured-output parts when raw is not a string', async () => {
    const result = await chatParamsFromRequestBody(
      withMessages([
        {
          id: 'm1',
          role: 'assistant',
          content: '{"name":"Ada"}',
          parts: [
            {
              type: 'structured-output',
              status: 'complete',
              raw: { name: 'Ada' },
              data: { name: 'Ada' },
            },
          ],
        },
      ]),
    )
    expect('parts' in result.messages[0]!).toBe(false)
  })

  it('rejects a malformed tool declaration', async () => {
    await expect(
      chatParamsFromRequestBody({
        ...base,
        messages: [],
        tools: [{ name: 'greet' }],
      }),
    ).rejects.toThrow(/tools\[0\]\.description/)
  })

  it('rejects a malformed context entry', async () => {
    await expect(
      chatParamsFromRequestBody({
        ...base,
        messages: [],
        context: [{ description: 'user tz', value: 5 }],
      }),
    ).rejects.toThrow(/context\[0\]\.value/)
  })

  it('rejects an unknown resume status', async () => {
    await expect(
      chatParamsFromRequestBody({
        ...base,
        messages: [],
        resume: [{ interruptId: 'i1', status: 'maybe' }],
      }),
    ).rejects.toThrow(/resume\[0\]\.status/)
  })

  it('omits `payload` on resume entries that carry none', async () => {
    const result = await chatParamsFromRequestBody({
      ...base,
      messages: [],
      resume: [{ interruptId: 'i1', status: 'cancelled' }],
    })
    expect(result.resume).toEqual([{ interruptId: 'i1', status: 'cancelled' }])
    expect('payload' in result.resume![0]!).toBe(false)
  })

  it('keeps resume metadata for generic continuation', async () => {
    const metadata = {
      'tanstack:interruptContinuation': {
        v: 1,
        definitionId: 'review',
        key: 'one',
        batchIndex: 0,
        reason: 'review',
        message: 'Review',
      },
    }
    const result = await chatParamsFromRequestBody({
      ...base,
      messages: [],
      resume: [
        {
          interruptId: 'i1',
          status: 'resolved',
          payload: { approved: true },
          metadata,
        },
      ],
    })
    expect(result.resume).toEqual([
      {
        interruptId: 'i1',
        status: 'resolved',
        payload: { approved: true },
        metadata,
      },
    ])
  })

  it('rejects non-object resume metadata', async () => {
    await expect(
      chatParamsFromRequestBody({
        ...base,
        messages: [],
        resume: [{ interruptId: 'i1', status: 'cancelled', metadata: 'nope' }],
      }),
    ).rejects.toThrow(/resume\[0\]\.metadata/)
  })

  it('defaults forwardedProps to {} and rejects a non-object one', async () => {
    const result = await chatParamsFromRequestBody(withMessages([]))
    expect(result.forwardedProps).toEqual({})

    await expect(
      chatParamsFromRequestBody({
        ...withMessages([]),
        forwardedProps: 'nope',
      }),
    ).rejects.toThrow(/forwardedProps/)
  })

  it('passes `state` through untouched without validating it', async () => {
    const state = { nested: { count: 1 } }
    const result = await chatParamsFromRequestBody({
      ...withMessages([]),
      state,
    })
    expect(result.state).toEqual(state)
  })

  it('accepts an optional parentRunId and rejects a non-string one', async () => {
    const result = await chatParamsFromRequestBody({
      ...withMessages([]),
      parentRunId: 'parent-1',
    })
    expect(result.parentRunId).toBe('parent-1')

    await expect(
      chatParamsFromRequestBody({ ...withMessages([]), parentRunId: 3 }),
    ).rejects.toThrow(/parentRunId/)
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
    expect(
      'execute' in result[0]! ? result[0]!.execute : undefined,
    ).toBeUndefined()
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
    expect('execute' in result[0]! && result[0]!.execute).toBeTruthy()
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
