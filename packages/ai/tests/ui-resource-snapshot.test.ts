import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { chat } from '../src/activities/chat/index'
import { toolDefinition } from '../src/activities/chat/tools/tool-definition'
import {
  appendUiResourceToModelMessages,
  uiResourcePartFromCustomValue,
} from '../src/activities/chat/messages'
import { EventType } from '../src/types'
import type { ModelMessage, StreamChunk } from '../src/types'
import { clientTool, collectChunks, createMockAdapter, ev } from './test-utils'

/** Server tool that renders an MCP Apps `ui://` widget (MCP Apps protocol). */
function presentWidgetTool() {
  return toolDefinition({
    name: 'present_widget',
    description: 'Present a ui:// widget to the user',
    inputSchema: z.object({ title: z.string() }),
  }).server(async (args, context) => {
    context?.emitCustomEvent('ui-resource', {
      resource: {
        uri: 'ui://test/widget',
        mimeType: 'text/html',
        text: `<b>${args.title}</b>`,
      },
      serverId: 'test-server',
      toolName: 'present_widget',
    })
    return { ok: true }
  })
}

describe('ui-resource persistence across MESSAGES_SNAPSHOT', () => {
  it('keeps ui-resources emitted during the run on the interrupt MESSAGES_SNAPSHOT (#1397)', async () => {
    const { adapter } = createMockAdapter({
      iterations: [
        [
          ev.runStarted(),
          ev.toolStart('call_1', 'present_widget'),
          ev.toolArgs('call_1', '{"title":"Hello"}'),
          ev.toolEnd('call_1'),
          ev.toolStart('call_2', 'await_result'),
          ev.toolArgs('call_2', '{}'),
          ev.runFinished('tool_calls'),
        ],
      ],
    })

    const chunks = await collectChunks(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'Show the widget' }],
        tools: [presentWidgetTool(), clientTool('await_result')],
      }) as AsyncIterable<StreamChunk>,
    )

    // The CUSTOM ui-resource chunk must be emitted before the snapshot.
    const customIndex = chunks.findIndex(
      (chunk) =>
        chunk.type === EventType.CUSTOM && chunk.name === 'ui-resource',
    )
    const snapshotIndex = chunks.findIndex(
      (chunk) => chunk.type === EventType.MESSAGES_SNAPSHOT,
    )
    expect(customIndex).toBeGreaterThanOrEqual(0)
    expect(snapshotIndex).toBeGreaterThan(customIndex)

    // The snapshot must carry the ui-resource on the anchor assistant message
    // (the one owning the `present_widget` tool call), via
    // metadata.tanstack.uiResources — exactly what the client rehydrates parts
    // from when it replaces its state with the snapshot.
    const snapshot = chunks[snapshotIndex] as Extract<
      StreamChunk,
      { messages: Array<unknown> }
    >
    const anchor = snapshot.messages.find(
      (message) =>
        typeof message === 'object' &&
        message !== null &&
        Array.isArray(
          (message as { toolCalls?: Array<{ id?: string }> }).toolCalls,
        ) &&
        (message as { toolCalls: Array<{ id?: string }> }).toolCalls.some(
          (toolCall) => toolCall.id === 'call_1',
        ),
    ) as
      | {
          metadata?: {
            tanstack?: {
              uiResources?: Array<Record<string, unknown>>
            }
          }
        }
      | undefined

    expect(anchor).toBeDefined()
    expect(anchor?.metadata?.tanstack?.uiResources?.[0]).toMatchObject({
      type: 'ui-resource',
      toolCallId: 'call_1',
      toolName: 'present_widget',
      resource: { uri: 'ui://test/widget', mimeType: 'text/html' },
    })
  })
})

describe('appendUiResourceToModelMessages', () => {
  const part = {
    type: 'ui-resource' as const,
    toolCallId: 'call_1',
    toolName: 'present_widget',
    resource: { uri: 'ui://test/widget', mimeType: 'text/html' },
  }

  function anchorMessage(metadata?: ModelMessage['metadata']): ModelMessage {
    return {
      id: 'assistant-1',
      role: 'assistant',
      content: 'Showing widget',
      toolCalls: [
        {
          id: 'call_1',
          type: 'function',
          function: { name: 'present_widget', arguments: '{}' },
        },
      ],
      metadata,
    }
  }

  it('stores the part on the anchor message metadata', () => {
    const messages: Array<ModelMessage> = [
      { id: 'user-1', role: 'user', content: 'Show the widget' },
      anchorMessage({ tanstack: { createdAt: '2026-09-16T00:00:00.000Z' } }),
    ]

    const next = appendUiResourceToModelMessages(messages, part)

    expect(next).not.toBe(messages)
    expect(next[0]).toBe(messages[0])
    const anchor = next[1]!
    expect(anchor.metadata?.tanstack?.uiResources).toEqual([part])
    // Pre-existing tanstack metadata is preserved.
    expect(anchor.metadata?.tanstack?.createdAt).toBe(
      '2026-09-16T00:00:00.000Z',
    )
    // Input messages are not mutated.
    expect(messages[1]!.metadata?.tanstack?.uiResources).toBeUndefined()
  })

  it('is idempotent when the resource is already stored', () => {
    const messages: Array<ModelMessage> = [
      anchorMessage({ tanstack: { uiResources: [part] } }),
    ]

    expect(appendUiResourceToModelMessages(messages, part)).toBe(messages)
  })

  it('returns the same reference when no anchor owns the tool call', () => {
    const messages: Array<ModelMessage> = [
      { id: 'user-1', role: 'user', content: 'Show the widget' },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'No tool call',
        toolCalls: [
          {
            id: 'other',
            type: 'function',
            function: { name: 'present_widget', arguments: '{}' },
          },
        ],
      },
    ]

    expect(appendUiResourceToModelMessages(messages, part)).toBe(messages)
  })
})

describe('uiResourcePartFromCustomValue', () => {
  it('stamps the type discriminator on a valid emission value', () => {
    expect(
      uiResourcePartFromCustomValue({
        resource: { uri: 'ui://test/widget', mimeType: 'text/html', text: 'x' },
        serverId: 'test-server',
        toolName: 'present_widget',
        toolCallId: 'call_1',
      }),
    ).toEqual({
      type: 'ui-resource',
      resource: { uri: 'ui://test/widget', mimeType: 'text/html', text: 'x' },
      serverId: 'test-server',
      toolName: 'present_widget',
      toolCallId: 'call_1',
    })
  })

  it('rejects values missing required fields', () => {
    expect(uiResourcePartFromCustomValue(null)).toBeUndefined()
    expect(uiResourcePartFromCustomValue('nope')).toBeUndefined()
    expect(
      uiResourcePartFromCustomValue({
        resource: { uri: 'ui://test/widget', mimeType: 'text/html' },
        // missing toolName
        toolCallId: 'call_1',
      }),
    ).toBeUndefined()
  })
})
