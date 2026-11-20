import { describe, expect, it, vi } from 'vitest'
import { toolDefinition } from '@tanstack/ai/client'
import { ChatClient } from '@tanstack/ai-client'
import { convertToModelMessages, streamText, tool } from 'ai'
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test'
import { z } from 'zod'
import { clientToolsFromAISDKBody, fromChatTransport } from '../src'
import type { ChatTransport, UIMessage } from 'ai'

const usage = {
  inputTokens: {
    total: 1,
    noCache: undefined,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 1, text: undefined, reasoning: undefined },
}

describe('client tools over fromChatTransport', () => {
  it('declares the client tools to an AI SDK route, which stops at the call', async () => {
    const model = new MockLanguageModelV4({
      doStream: [
        {
          stream: convertArrayToReadableStream([
            { type: 'stream-start', warnings: [] },
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'getLocation',
              input: '{"precise":true}',
            },
            {
              type: 'finish',
              finishReason: { unified: 'tool-calls', raw: undefined },
              usage,
            },
          ]),
        },
        {
          stream: convertArrayToReadableStream([
            { type: 'stream-start', warnings: [] },
            { type: 'text-start', id: 't' },
            { type: 'text-delta', id: 't', delta: 'You are in Sydney.' },
            { type: 'text-end', id: 't' },
            {
              type: 'finish',
              finishReason: { unified: 'stop', raw: undefined },
              usage,
            },
          ]),
        },
      ],
    })
    const bodies: Array<unknown> = []
    // The AI SDK route, called in process.
    const transport: ChatTransport<UIMessage> = {
      async sendMessages({ messages, body }) {
        bodies.push(body)
        const result = streamText({
          model,
          messages: await convertToModelMessages(messages),
          tools: clientToolsFromAISDKBody(body, {}),
        })
        return result.toUIMessageStream()
      },
      reconnectToStream: () => Promise.resolve(null),
    }
    const getLocation = vi.fn(() => ({ city: 'Sydney' }))
    const client = new ChatClient({
      threadId: 'thread-1',
      connection: fromChatTransport(transport),
      tools: [
        toolDefinition({
          name: 'getLocation',
          description: 'Get the user location',
          inputSchema: z.object({ precise: z.boolean() }),
        }).client(getLocation),
      ],
    })

    await client.sendMessage('Where am I?')
    await vi.waitFor(() =>
      expect(JSON.stringify(client.getMessages())).toContain('Sydney.'),
    )

    expect(bodies[0]).toMatchObject({
      clientTools: [
        {
          name: 'getLocation',
          description: 'Get the user location',
          parameters: { type: 'object' },
        },
      ],
    })
    // The route offered the tool to the model and did not run it.
    expect(model.doStreamCalls[0]?.tools).toMatchObject([
      { type: 'function', name: 'getLocation' },
    ])
    expect(getLocation).toHaveBeenCalledWith(
      { precise: true },
      expect.anything(),
    )
    // The second request carried the client's output to the model.
    expect(JSON.stringify(model.doStreamCalls[1]?.prompt)).toContain('Sydney')
  })

  it('lets a server tool win a name clash and rejects a bad declaration', () => {
    const server = tool({
      description: 'Server weather',
      inputSchema: z.object({}),
      execute: () => 'sunny',
    })
    const declared = (name: string) => ({
      name,
      description: 'Client',
      parameters: { type: 'object' },
    })
    const tools = clientToolsFromAISDKBody(
      { clientTools: [declared('weather'), declared('__proto__')] },
      { weather: server },
    )
    expect(tools.weather).toBe(server)
    expect(Object.keys(tools).sort()).toEqual(['__proto__', 'weather'])
    expect(Object.getPrototypeOf(tools)).toBe(Object.prototype)

    expect(clientToolsFromAISDKBody({ id: 'x' }, { weather: server })).toEqual({
      weather: server,
    })
    expect(() => clientToolsFromAISDKBody({ clientTools: 'all' }, {})).toThrow()
    expect(() =>
      clientToolsFromAISDKBody({ clientTools: [{ name: 'x' }] }, {}),
    ).toThrow()
  })
})
