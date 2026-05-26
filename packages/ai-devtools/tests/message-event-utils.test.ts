import { describe, expect, it } from 'vitest'
import {
  createClientToolCallMessage,
  shouldSkipClientAssistantPlaceholder,
} from '../src/store/message-event-utils'

describe('message event utilities', () => {
  it('skips empty client assistant placeholders', () => {
    expect(
      shouldSkipClientAssistantPlaceholder({
        role: 'assistant',
        source: 'client',
        content: '',
        toolCalls: [],
        parts: [],
      }),
    ).toBe(true)
  })

  it('keeps client assistant messages with renderable parts', () => {
    expect(
      shouldSkipClientAssistantPlaceholder({
        role: 'assistant',
        source: 'client',
        content: '',
        toolCalls: [],
        parts: [{ type: 'tool-call', toolName: 'recommendGuitar' }],
      }),
    ).toBe(false)
  })

  it('keeps client assistant messages with structured-output parts', () => {
    expect(
      shouldSkipClientAssistantPlaceholder({
        role: 'assistant',
        source: 'client',
        content: '',
        toolCalls: [],
        parts: [
          {
            type: 'structured-output',
            status: 'streaming',
            partial: { title: 'Pasta' },
          },
        ],
      }),
    ).toBe(false)
  })

  it('keeps client assistant messages with tool calls', () => {
    expect(
      shouldSkipClientAssistantPlaceholder({
        role: 'assistant',
        source: 'client',
        content: '',
        toolCalls: [{ id: 'tool-call-1' }],
        parts: [],
      }),
    ).toBe(false)
  })

  it('creates an assistant message for a client tool update after an empty placeholder was skipped', () => {
    expect(
      createClientToolCallMessage({
        messageId: 'assistant-1',
        toolCallId: 'tool-call-1',
        toolName: 'getGuitars',
        arguments: '{}',
        state: 'input-complete',
        timestamp: 123,
        source: 'client',
        requestId: 'request-1',
      }),
    ).toEqual({
      id: 'assistant-1',
      role: 'assistant',
      content: '',
      timestamp: 123,
      parts: [],
      toolCalls: [
        {
          id: 'tool-call-1',
          name: 'getGuitars',
          arguments: '{}',
          state: 'input-complete',
        },
      ],
      source: 'client',
      requestId: 'request-1',
    })
  })

  it('preserves approval metadata when creating a client tool-call message', () => {
    expect(
      createClientToolCallMessage({
        messageId: 'assistant-1',
        toolCallId: 'tool-call-1',
        toolName: 'addToCart',
        arguments: '{"guitarId":"6"}',
        state: 'approval-requested',
        timestamp: 123,
        source: 'client',
        approvalRequired: true,
        approvalId: 'approval-tool-call-1',
      }).toolCalls[0],
    ).toEqual({
      id: 'tool-call-1',
      name: 'addToCart',
      arguments: '{"guitarId":"6"}',
      state: 'approval-requested',
      approvalRequired: true,
      approvalId: 'approval-tool-call-1',
    })
  })
})
