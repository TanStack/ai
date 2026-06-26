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

  it('drops AG-UI reasoning messages (no ModelMessage equivalent today)', () => {
    const messages = [
      { role: 'reasoning', content: 'thinking...' } as unknown as ModelMessage,
      { role: 'user', content: 'hi' } as ModelMessage,
    ]

    const result = convertMessagesToModelMessages(messages)
    expect(result.find((m) => (m as any).role === 'reasoning')).toBeUndefined()
    expect(result).toHaveLength(1)
    expect(result[0]?.role).toBe('user')
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
})

describe('convertMessagesToModelMessages — MCP Apps ui-resource exclusion', () => {
  // Invariant: a rendered ui:// widget (MCP Apps) is a client-only presentation
  // part and must NEVER round-trip into model input on the next turn. The widget
  // is untrusted, sandboxed HTML — leaking it into conversation history is both
  // token bloat and a prompt-injection vector. messages.ts:`buildAssistantMessages`
  // drops it via an explicit `case 'ui-resource'`; this pins that behavior so a
  // refactor of that switch can't silently start including the widget.
  it('excludes a ui-resource part from the produced model messages', () => {
    const WIDGET_URI = 'ui://weather/widget'
    const WIDGET_HTML = '<script>alert(1)</script><b>72°F</b>'
    const messages = [
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
          {
            type: 'ui-resource',
            resource: {
              uri: WIDGET_URI,
              mimeType: 'text/html',
              text: WIDGET_HTML,
            },
            serverId: 'weather',
            toolCallId: 'tc1',
            toolName: 'getWeather',
          },
        ],
      } as UIMessage,
    ]

    const result = convertMessagesToModelMessages(messages)

    // Nothing the widget carried (its uri OR its HTML body) may appear anywhere
    // in the serialized model messages — neither as a string content nor inside
    // a ContentPart[].
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain(WIDGET_URI)
    expect(serialized).not.toContain(WIDGET_HTML)
    expect(serialized).not.toContain('ui-resource')

    // The legitimate text + tool flow still survives the conversion.
    expect(serialized).toContain('Here is the weather')
    expect(result.some((m) => m.role === 'tool')).toBe(true)
  })
})
