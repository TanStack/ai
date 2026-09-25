import { describe, expect, it } from 'vitest'
import { convertMessagesToModelMessages } from '../src/activities/chat/messages'
import type { ModelMessage, UIMessage } from '../src/types'

describe('convertMessagesToModelMessages — AG-UI dedup pre-pass', () => {
  it('drops fan-out tool message when an anchor UIMessage already represents the tool result', () => {
    const messages = [
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          { type: 'text', content: 'calling' },
          {
            type: 'tool-call',
            id: 'tc1',
            name: 'getTodos',
            arguments: '{}',
            state: 'input-complete',
          },
          {
            type: 'tool-result',
            toolCallId: 'tc1',
            content: '[]',
            state: 'complete',
          },
        ],
      } as UIMessage,
      // AG-UI fan-out duplicate — should be dropped
      {
        role: 'tool',
        toolCallId: 'tc1',
        content: '[]',
      } as ModelMessage,
    ]

    const result = convertMessagesToModelMessages(messages)
    const toolMessages = result.filter((m) => m.role === 'tool')
    expect(toolMessages).toHaveLength(1)
    expect(toolMessages[0]?.toolCallId).toBe('tc1')
  })

  it('keeps tool messages from a foreign AG-UI client (no anchor parts)', () => {
    const messages = [
      // No UIMessage with parts; this is what a foreign AG-UI client sends.
      {
        role: 'assistant',
        content: 'calling',
        toolCalls: [
          {
            id: 'tc1',
            type: 'function',
            function: { name: 'getTodos', arguments: '{}' },
          },
        ],
      } as ModelMessage,
      { role: 'tool', toolCallId: 'tc1', content: '[]' } as ModelMessage,
    ]

    const result = convertMessagesToModelMessages(messages)
    const toolMessages = result.filter((m) => m.role === 'tool')
    expect(toolMessages).toHaveLength(1)
    expect(toolMessages[0]?.toolCallId).toBe('tc1')
  })

  it('drops a lone AG-UI reasoning row that is not followed by an assistant', () => {
    const messages = [
      { role: 'reasoning', content: 'thinking...' } as unknown as ModelMessage,
      { role: 'user', content: 'hi' } as ModelMessage,
    ]

    const result = convertMessagesToModelMessages(messages)
    expect(result).toHaveLength(1)
    expect(result[0]?.role).toBe('user')
  })

  it('keeps reasoning encryptedValue when content is empty', () => {
    const result = convertMessagesToModelMessages([
      {
        role: 'reasoning',
        content: '',
        encryptedValue: 'sig-empty',
      } as unknown as ModelMessage,
      {
        role: 'assistant',
        content: null,
        toolCalls: [
          {
            id: 'call_1',
            type: 'function',
            function: { name: 'lookup', arguments: '{}' },
          },
        ],
      },
    ])
    expect(result[0]?.thinking).toEqual([
      { content: '', signature: 'sig-empty' },
    ])
  })

  it('attaches reasoning encryptedValue as thinking signature on the next assistant', () => {
    const result = convertMessagesToModelMessages([
      {
        role: 'reasoning',
        content: 'pondering',
        encryptedValue: 'sig-1',
      } as unknown as ModelMessage,
      { role: 'assistant', content: 'answer' },
    ])
    expect(result).toHaveLength(1)
    expect(result[0]?.thinking).toEqual([
      { content: 'pondering', signature: 'sig-1' },
    ])
  })

  it('reads tanstack.signature when encryptedValue is missing', () => {
    const result = convertMessagesToModelMessages([
      {
        role: 'reasoning',
        content: 'pondering',
        metadata: { tanstack: { signature: 'sig-old' } },
      } as unknown as ModelMessage,
      { role: 'assistant', content: 'answer' },
    ])
    expect(result[0]?.thinking).toEqual([
      { content: 'pondering', signature: 'sig-old' },
    ])
  })

  it('drops AG-UI activity messages', () => {
    const messages = [
      { role: 'activity', content: 'event' } as unknown as ModelMessage,
      { role: 'user', content: 'hi' } as ModelMessage,
    ]

    const result = convertMessagesToModelMessages(messages)
    expect(result).toHaveLength(1)
    expect(result[0]?.role).toBe('user')
  })

  it('keeps TanStack user content parts and their metadata identity', () => {
    const metadata = new Map([['kind', 'typed']])
    const providerBytes = new Uint8Array([1, 2, 3])
    const part = {
      type: 'text' as const,
      content: 'hi',
      metadata: { metadata, providerBytes },
    }
    const result = convertMessagesToModelMessages([
      { role: 'user', content: [part] },
    ])
    expect(result).toHaveLength(1)
    expect(result[0]?.content).toEqual([part])
    const content = result[0]?.content
    if (!Array.isArray(content)) throw new Error('expected content parts')
    expect(content[0]).toBe(part)
  })

  it('rewrites AG-UI user `{ text }` parts to TanStack `{ content }`', () => {
    const result = convertMessagesToModelMessages([
      {
        role: 'user',
        content: [{ type: 'text', text: 'hello' }],
      } as unknown as ModelMessage,
    ])
    expect(result[0]?.content).toBe('hello')
  })

  it('collapses AG-UI developer messages to system role', () => {
    const messages = [
      {
        role: 'developer',
        content: 'You are helpful',
      } as unknown as ModelMessage,
      { role: 'user', content: 'hi' } as ModelMessage,
    ]

    const result = convertMessagesToModelMessages(messages)
    expect(result).toHaveLength(2)
    expect(result[0]?.role).toBe('system')
    expect(result[0]?.content).toBe('You are helpful')
  })

  it('round-trips a provider-executed tool call without emitting a tool result (issue #839)', () => {
    const metadata = {
      providerExecuted: true,
      anthropic: {
        serverToolType: 'web_search',
        resultBlockType: 'web_search_tool_result',
        result: [{ type: 'web_search_result', url: 'https://example.com' }],
      },
    }
    const messages = [
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          {
            type: 'tool-call',
            id: 'srv_search',
            name: 'web_search',
            arguments: '{"query":"drones"}',
            state: 'input-complete',
            metadata,
          },
          { type: 'text', content: 'Found a source.' },
        ],
      } as UIMessage,
    ]

    const result = convertMessagesToModelMessages(messages)

    // No tool result message — the provider executed the call, there is no
    // client output to deliver.
    expect(result.some((m) => m.role === 'tool')).toBe(false)

    const assistant = result.find((m) => m.role === 'assistant')
    expect(assistant?.toolCalls).toHaveLength(1)
    // Metadata round-trips so the adapter can replay the server tool blocks.
    expect(assistant?.toolCalls?.[0]?.metadata).toMatchObject(metadata)
  })

  it('preserves approval-requested tool calls as assistant toolCalls', () => {
    const messages: Array<UIMessage> = [
      {
        id: 'assistant-approval',
        role: 'assistant',
        parts: [
          {
            type: 'tool-call',
            id: 'call_1',
            name: 'dangerousTool',
            arguments: '{"action":"delete"}',
            input: { action: 'delete' },
            state: 'approval-requested',
            approval: {
              id: 'approval_call_1',
              needsApproval: true,
            },
          },
        ],
      },
    ]

    expect(convertMessagesToModelMessages(messages)).toEqual([
      {
        id: 'assistant-approval',
        role: 'assistant',
        content: null,
        toolCalls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'dangerousTool',
              arguments: '{"action":"delete"}',
            },
          },
        ],
      },
    ])
  })
})

describe('convertMessagesToModelMessages — MCP Apps ui-resource exclusion', () => {
  // Invariant: a rendered ui:// widget (MCP Apps) is untrusted sandboxed HTML.
  // It must never enter model *content* or toolCalls (next-turn LLM input).
  // Persistence still needs the widget, so it lives only under
  // metadata.tanstack.uiResources and is lifted back into UI parts on hydrate.
  it('excludes a ui-resource part from model content', () => {
    const WIDGET_URI = 'ui://weather/widget'
    const WIDGET_HTML = '<script>alert(1)</script><b>72°F</b>'
    const uiResource = {
      type: 'ui-resource' as const,
      resource: {
        uri: WIDGET_URI,
        mimeType: 'text/html',
        text: WIDGET_HTML,
      },
      serverId: 'weather',
      toolCallId: 'tc1',
      toolName: 'getWeather',
    }
    const messages: Array<UIMessage> = [
      {
        id: 'a1',
        role: 'assistant',
        parts: [
          { type: 'text', content: 'Here is the weather' },
          {
            type: 'tool-call',
            id: 'tc1',
            name: 'getWeather',
            arguments: '{}',
            state: 'input-complete',
          },
          {
            type: 'tool-result',
            toolCallId: 'tc1',
            content: '{"tempF":72}',
            state: 'complete',
          },
          uiResource,
        ],
      },
    ]

    const result = convertMessagesToModelMessages(messages)
    const assistant = result.find((msg) => msg.role === 'assistant')
    const content = JSON.stringify(assistant?.content ?? null)
    const toolCalls = JSON.stringify(assistant?.toolCalls ?? [])

    expect(content).not.toContain(WIDGET_URI)
    expect(content).not.toContain(WIDGET_HTML)
    expect(toolCalls).not.toContain(WIDGET_URI)
    expect(toolCalls).not.toContain(WIDGET_HTML)
    expect(assistant?.metadata).toMatchObject({
      tanstack: { uiResources: [uiResource] },
    })
    expect(content).toContain('Here is the weather')
    expect(result.some((msg) => msg.role === 'tool')).toBe(true)
  })
})
