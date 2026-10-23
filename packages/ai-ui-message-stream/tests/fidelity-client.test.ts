import { describe, expect, it, vi } from 'vitest'
import { EventType } from '@tanstack/ai'
import { toolDefinition } from '@tanstack/ai/client'
import { ChatClient } from '@tanstack/ai-client'
import { convertToModelMessages } from 'ai'
import { z } from 'zod'
import { fromChatTransport, fromUIMessageStream, toAISDKMessages } from '../src'
import type { StreamChunk } from '@tanstack/ai'
import type { ChatTransport, UIMessage, UIMessageChunk } from 'ai'

function chunkStream(
  list: Array<UIMessageChunk>,
): ReadableStream<UIMessageChunk> {
  return new ReadableStream({
    start(controller) {
      for (const chunk of list) controller.enqueue(chunk)
      controller.close()
    },
  })
}

/** A transport that answers request N with `turns[N]`. */
function fakeTransport(turns: Array<Array<UIMessageChunk>>) {
  const requests: Array<Array<UIMessage>> = []
  const transport: ChatTransport<UIMessage> = {
    sendMessages({ messages }) {
      requests.push(messages)
      return Promise.resolve(chunkStream(turns[requests.length - 1] ?? []))
    },
    reconnectToStream: () => Promise.resolve(null),
  }
  return { requests, transport }
}

async function collect(list: Array<UIMessageChunk>) {
  const out: Array<StreamChunk> = []
  for await (const event of fromUIMessageStream(chunkStream(list), {
    threadId: 't',
    runId: 'r',
  }))
    out.push(event)
  return out
}

describe('AI SDK server, TanStack client: fidelity', () => {
  it('keeps provider metadata, provider-executed calls, steps and message metadata', async () => {
    const { requests, transport } = fakeTransport([
      [
        { type: 'start', messageId: 'a-1', messageMetadata: { model: 'm-1' } },
        { type: 'start-step' },
        { type: 'text-start', id: '0' },
        { type: 'text-delta', id: '0', delta: 'Searching.' },
        { type: 'text-end', id: '0' },
        {
          type: 'tool-input-start',
          toolCallId: 'ws-1',
          toolName: 'web_search',
          providerExecuted: true,
          providerMetadata: { openai: { itemId: 'ws_call' } },
        },
        {
          type: 'tool-input-available',
          toolCallId: 'ws-1',
          toolName: 'web_search',
          input: { query: 'tanstack' },
          providerExecuted: true,
          providerMetadata: { openai: { itemId: 'ws_call' } },
        },
        {
          type: 'tool-output-available',
          toolCallId: 'ws-1',
          output: { results: [] },
          providerExecuted: true,
          providerMetadata: { openai: { itemId: 'ws_result' } },
        },
        {
          type: 'tool-input-start',
          toolCallId: 'c-1',
          toolName: 'ping',
        },
        {
          type: 'tool-input-available',
          toolCallId: 'c-1',
          toolName: 'ping',
          input: {},
          // Google sends the signature with the finished call.
          providerMetadata: { google: { thoughtSignature: 'ts-1' } },
        },
        { type: 'finish-step' },
        {
          type: 'finish',
          finishReason: 'tool-calls',
          messageMetadata: { usage: 5 },
        },
      ],
      [
        { type: 'start', messageId: 'a-1' },
        { type: 'start-step' },
        { type: 'text-start', id: '1' },
        { type: 'text-delta', id: '1', delta: 'Done.' },
        { type: 'text-end', id: '1' },
        { type: 'finish-step' },
        { type: 'finish', finishReason: 'stop' },
      ],
      [{ type: 'start' }, { type: 'finish', finishReason: 'stop' }],
    ])
    const ping = vi.fn(() => ({ pong: true }))
    const webSearch = vi.fn(() => ({ results: ['wrong'] }))
    const client = new ChatClient({
      threadId: 'thread-1',
      connection: fromChatTransport(transport),
      tools: [
        toolDefinition({
          name: 'ping',
          description: 'Ping',
          inputSchema: z.object({}),
        }).client(ping),
        toolDefinition({
          name: 'web_search',
          description: 'Search',
          inputSchema: z.object({ query: z.string() }),
        }).client(webSearch),
      ],
    })

    await client.sendMessage('Search, then ping')
    await vi.waitFor(() =>
      expect(JSON.stringify(client.getMessages())).toContain('Done.'),
    )
    expect(ping).toHaveBeenCalledTimes(1)
    // The provider ran the search.
    expect(webSearch).not.toHaveBeenCalled()
    const assistant = client.getMessages().find((m) => m.role === 'assistant')
    expect(assistant?.metadata).toMatchObject({
      aiSdk: { model: 'm-1', usage: 5 },
    })
    expect(
      assistant?.parts.find((p) => p.type === 'tool-call' && p.id === 'ws-1'),
    ).toMatchObject({ metadata: { providerExecuted: true } })

    // Request 2 sends the client tool output back.
    expect(requests[1]!.find((m) => m.role === 'assistant')?.parts).toEqual([
      { type: 'text', text: 'Searching.' },
      {
        type: 'dynamic-tool',
        toolName: 'web_search',
        toolCallId: 'ws-1',
        input: { query: 'tanstack' },
        providerExecuted: true,
        callProviderMetadata: { openai: { itemId: 'ws_call' } },
        resultProviderMetadata: { openai: { itemId: 'ws_result' } },
        state: 'output-available',
        output: { results: [] },
      },
      {
        type: 'dynamic-tool',
        toolName: 'ping',
        toolCallId: 'c-1',
        input: {},
        callProviderMetadata: { google: { thoughtSignature: 'ts-1' } },
        state: 'output-available',
        output: { pong: true },
      },
    ])

    // Request 3: the answer after the tool result is the next step.
    await client.sendMessage('Thanks')
    await vi.waitFor(() => expect(requests).toHaveLength(3))
    const sent = requests[2]!.find((m) => m.role === 'assistant')
    expect(sent?.metadata).toEqual({ model: 'm-1', usage: 5 })
    expect(sent?.parts.map((p) => p.type)).toEqual([
      'text',
      'dynamic-tool',
      'dynamic-tool',
      'step-start',
      'text',
    ])
    expect(await convertToModelMessages(requests[2]!)).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'Search, then ping' }] },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Searching.' },
          {
            type: 'tool-call',
            toolCallId: 'ws-1',
            toolName: 'web_search',
            input: { query: 'tanstack' },
            providerExecuted: true,
            providerOptions: { openai: { itemId: 'ws_call' } },
          },
          {
            type: 'tool-result',
            toolCallId: 'ws-1',
            toolName: 'web_search',
            output: { type: 'json', value: { results: [] } },
            providerOptions: { openai: { itemId: 'ws_result' } },
          },
          {
            type: 'tool-call',
            toolCallId: 'c-1',
            toolName: 'ping',
            input: {},
            providerExecuted: undefined,
            providerOptions: { google: { thoughtSignature: 'ts-1' } },
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'c-1',
            toolName: 'ping',
            output: { type: 'json', value: { pong: true } },
            providerOptions: { google: { thoughtSignature: 'ts-1' } },
          },
        ],
      },
      { role: 'assistant', content: [{ type: 'text', text: 'Done.' }] },
      { role: 'user', content: [{ type: 'text', text: 'Thanks' }] },
    ])
  })

  it('sends the approval signature back and skips automatic approvals', async () => {
    const { requests, transport } = fakeTransport([
      [
        { type: 'start', messageId: 'a-1' },
        {
          type: 'tool-input-available',
          toolCallId: 'c-auto',
          toolName: 'readFile',
          input: { path: 'a.txt' },
        },
        // The route approved this call itself and ran it.
        {
          type: 'tool-approval-request',
          approvalId: 'ap-auto',
          toolCallId: 'c-auto',
          isAutomatic: true,
        },
        {
          type: 'tool-approval-response',
          approvalId: 'ap-auto',
          approved: true,
        },
        {
          type: 'tool-input-available',
          toolCallId: 'c-1',
          toolName: 'deleteFile',
          input: { path: 'a.txt' },
        },
        {
          type: 'tool-approval-request',
          approvalId: 'ap-1',
          toolCallId: 'c-1',
          reason: 'Deletes data',
          signature: 'sig-1',
        },
        {
          type: 'tool-output-available',
          toolCallId: 'c-auto',
          output: 'hello',
        },
        { type: 'finish', finishReason: 'tool-calls' },
      ],
      [{ type: 'start' }, { type: 'finish', finishReason: 'stop' }],
    ])
    const client = new ChatClient({
      threadId: 'thread-1',
      connection: fromChatTransport(transport),
    })

    await client.sendMessage('Read and delete a.txt')
    const interrupts = client.getInterrupts()
    expect(interrupts.map((i) => i.id)).toEqual(['ap-1'])
    const [interrupt] = interrupts
    if (interrupt?.kind !== 'generic') throw new Error('expected generic')
    interrupt.resolveInterrupt({ approved: true })

    await vi.waitFor(() => expect(requests).toHaveLength(2))
    const sent = requests[1]!.find((m) => m.role === 'assistant')
    expect(sent?.parts).toEqual([
      {
        type: 'dynamic-tool',
        toolName: 'readFile',
        toolCallId: 'c-auto',
        input: { path: 'a.txt' },
        state: 'output-available',
        output: 'hello',
      },
      {
        type: 'dynamic-tool',
        toolName: 'deleteFile',
        toolCallId: 'c-1',
        input: { path: 'a.txt' },
        state: 'approval-responded',
        approval: {
          id: 'ap-1',
          approved: true,
          requestReason: 'Deletes data',
          signature: 'sig-1',
        },
      },
    ])
    expect(await convertToModelMessages(requests[1]!)).toContainEqual(
      expect.objectContaining({
        role: 'assistant',
        content: expect.arrayContaining([
          {
            type: 'tool-approval-request',
            approvalId: 'ap-1',
            toolCallId: 'c-1',
            isAutomatic: undefined,
            reason: 'Deletes data',
            signature: 'sig-1',
          },
        ]),
      }),
    )
  })

  it('sends a text-encoded tool input as JSON once', async () => {
    const out = await collect([
      {
        type: 'tool-input-start',
        toolCallId: 'c-1',
        toolName: 'patch',
        inputEncoding: 'text',
      },
      { type: 'tool-input-delta', toolCallId: 'c-1', inputTextDelta: '*** ' },
      { type: 'tool-input-delta', toolCallId: 'c-1', inputTextDelta: 'diff' },
      {
        type: 'tool-input-available',
        toolCallId: 'c-1',
        toolName: 'patch',
        input: '*** diff',
      },
    ])
    expect(
      out.flatMap((e) =>
        e.type === EventType.TOOL_CALL_ARGS ? [e.delta] : [],
      ),
    ).toEqual(['"*** diff"'])
  })

  it('sends sources, files and citations as CUSTOM events', async () => {
    const out = await collect([
      { type: 'source-url', sourceId: 's-1', url: 'https://tanstack.com' },
      {
        type: 'source-document',
        sourceId: 's-2',
        mediaType: 'application/pdf',
        title: 'Spec',
      },
      {
        type: 'file',
        url: 'data:image/png;base64,AA==',
        mediaType: 'image/png',
      },
      { type: 'text-start', id: '0' },
      {
        type: 'text-end',
        id: '0',
        citations: [
          {
            source: {
              type: 'source',
              sourceType: 'url',
              id: 's-1',
              url: 'https://tanstack.com',
            },
            citedText: 'TanStack',
          },
        ],
      },
    ])
    expect(
      out.flatMap((e) =>
        e.type === EventType.CUSTOM ? [{ name: e.name, value: e.value }] : [],
      ),
    ).toEqual([
      {
        name: 'source-url',
        value: { sourceId: 's-1', url: 'https://tanstack.com' },
      },
      {
        name: 'source-document',
        value: { sourceId: 's-2', mediaType: 'application/pdf', title: 'Spec' },
      },
      {
        name: 'file',
        value: { url: 'data:image/png;base64,AA==', mediaType: 'image/png' },
      },
      {
        name: 'citations',
        value: [expect.objectContaining({ citedText: 'TanStack' })],
      },
    ])
  })
})

describe('toAISDKMessages', () => {
  it('drops system messages and sends a structured answer as text', () => {
    expect(
      toAISDKMessages([
        {
          id: 's',
          role: 'system',
          parts: [{ type: 'text', content: 'Be brief.' }],
        },
        {
          id: 'a',
          role: 'assistant',
          parts: [
            {
              type: 'structured-output',
              status: 'complete',
              raw: '{"ok":true}',
              data: { ok: true },
            },
          ],
        },
      ]),
    ).toEqual([
      {
        id: 'a',
        role: 'assistant',
        parts: [{ type: 'text', text: '{"ok":true}' }],
      },
    ])
  })
})
