import { describe, it, expect } from 'vitest'
import {
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

describe('mergeAgentTools', () => {
  const fakeServerTool = (name: string) => ({
    name,
    description: `server ${name}`,
    inputSchema: { type: 'object', properties: {} },
    execute: async () => ({ ok: true }),
  })

  it('returns server tools unchanged when client list is empty', () => {
    const server = { greet: fakeServerTool('greet') }
    const result = mergeAgentTools(server, [])
    expect(Object.keys(result)).toEqual(['greet'])
    expect(result['greet']!.execute).toBeDefined()
  })

  it('adds client-only tools as no-execute stubs', () => {
    const server = {}
    const client = [
      {
        name: 'showToast',
        description: 'render a toast',
        parameters: { type: 'object', properties: {} },
      },
    ]
    const result = mergeAgentTools(server, client)
    expect(Object.keys(result)).toEqual(['showToast'])
    expect(result['showToast']!.execute).toBeUndefined()
    expect(result['showToast']!.inputSchema).toEqual({
      type: 'object',
      properties: {},
    })
    expect(result['showToast']!.description).toBe('render a toast')
  })

  it('server wins on name collision (client declaration ignored)', () => {
    const server = { greet: fakeServerTool('greet') }
    const client = [
      {
        name: 'greet',
        description: 'overridden',
        parameters: { type: 'object', properties: { foo: { type: 'string' } } },
      },
    ]
    const result = mergeAgentTools(server, client)
    expect(result['greet']!.description).toBe('server greet')
    expect(result['greet']!.execute).toBeDefined()
  })

  it('handles empty server and empty client', () => {
    expect(mergeAgentTools({}, [])).toEqual({})
  })
})
