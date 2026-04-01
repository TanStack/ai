import { describe, it, expect } from 'vitest'
import { stripToSpec } from '../src/strip-to-spec-middleware'
import type { StreamChunk } from '../src/types'

/**
 * Helper to create a StreamChunk with the given type and fields.
 */
function makeChunk(type: string, fields: Record<string, unknown>): StreamChunk {
  return { type, timestamp: Date.now(), ...fields } as unknown as StreamChunk
}

describe('stripToSpec', () => {
  // =========================================================================
  // Always stripped: rawEvent (debug payload, potentially large)
  // =========================================================================

  it('strips rawEvent from all events', () => {
    const chunk = makeChunk('TEXT_MESSAGE_START', {
      messageId: 'msg-1',
      role: 'assistant',
      rawEvent: { some: 'raw data' },
      model: 'gpt-4o',
    })
    const result = stripToSpec(chunk) as Record<string, unknown>
    expect(result).not.toHaveProperty('rawEvent')
    // model is kept (passthrough)
    expect(result).toHaveProperty('model', 'gpt-4o')
    expect(result).toHaveProperty('messageId', 'msg-1')
  })

  // =========================================================================
  // Deprecated aliases stripped: toolName, stepId, state, error (nested)
  // =========================================================================

  it('strips deprecated toolName from TOOL_CALL_START, keeps toolCallName', () => {
    const chunk = makeChunk('TOOL_CALL_START', {
      toolCallId: 'tc-1',
      toolCallName: 'getTodos',
      toolName: 'getTodos',
      index: 0,
      providerMetadata: { foo: 'bar' },
      model: 'gpt-4o',
    })
    const result = stripToSpec(chunk) as Record<string, unknown>
    expect(result).not.toHaveProperty('toolName')
    // These extras are kept (passthrough)
    expect(result).toHaveProperty('toolCallName', 'getTodos')
    expect(result).toHaveProperty('index', 0)
    expect(result).toHaveProperty('providerMetadata')
    expect(result).toHaveProperty('model', 'gpt-4o')
  })

  it('strips deprecated toolName from TOOL_CALL_END, keeps extras', () => {
    const chunk = makeChunk('TOOL_CALL_END', {
      toolCallId: 'tc-1',
      toolName: 'getTodos',
      toolCallName: 'getTodos',
      input: { userId: '123' },
      result: '[{"id":"1","title":"Buy milk"}]',
      model: 'gpt-4o',
    })
    const result = stripToSpec(chunk) as Record<string, unknown>
    expect(result).not.toHaveProperty('toolName')
    // These extras are kept (passthrough)
    expect(result).toHaveProperty('toolCallName', 'getTodos')
    expect(result).toHaveProperty('input')
    expect(result).toHaveProperty('result')
    expect(result).toHaveProperty('model', 'gpt-4o')
  })

  it('strips deprecated stepId from STEP_STARTED, keeps stepName and extras', () => {
    const chunk = makeChunk('STEP_STARTED', {
      stepName: 'thinking',
      stepId: 'step-1',
      stepType: 'thinking',
      model: 'gpt-4o',
    })
    const result = stripToSpec(chunk) as Record<string, unknown>
    expect(result).not.toHaveProperty('stepId')
    // These extras are kept (passthrough)
    expect(result).toHaveProperty('stepName', 'thinking')
    expect(result).toHaveProperty('stepType', 'thinking')
    expect(result).toHaveProperty('model', 'gpt-4o')
  })

  it('strips deprecated stepId from STEP_FINISHED, keeps extras', () => {
    const chunk = makeChunk('STEP_FINISHED', {
      stepName: 'thinking',
      stepId: 'step-1',
      delta: 'some thinking',
      content: 'accumulated thinking',
      model: 'gpt-4o',
    })
    const result = stripToSpec(chunk) as Record<string, unknown>
    expect(result).not.toHaveProperty('stepId')
    // These extras are kept (passthrough)
    expect(result).toHaveProperty('stepName', 'thinking')
    expect(result).toHaveProperty('delta', 'some thinking')
    expect(result).toHaveProperty('content', 'accumulated thinking')
    expect(result).toHaveProperty('model', 'gpt-4o')
  })

  it('strips deprecated nested error from RUN_ERROR, keeps flat message/code', () => {
    const chunk = makeChunk('RUN_ERROR', {
      message: 'Something went wrong',
      code: 'INTERNAL_ERROR',
      error: { message: 'Something went wrong' },
      model: 'gpt-4o',
    })
    const result = stripToSpec(chunk) as Record<string, unknown>
    expect(result).not.toHaveProperty('error')
    expect(result).toHaveProperty('message', 'Something went wrong')
    expect(result).toHaveProperty('code', 'INTERNAL_ERROR')
    expect(result).toHaveProperty('model', 'gpt-4o')
  })

  it('strips deprecated state from STATE_SNAPSHOT, keeps snapshot', () => {
    const chunk = makeChunk('STATE_SNAPSHOT', {
      snapshot: { count: 42 },
      state: { count: 42 },
      model: 'gpt-4o',
    })
    const result = stripToSpec(chunk) as Record<string, unknown>
    expect(result).not.toHaveProperty('state')
    expect(result).toHaveProperty('snapshot')
    expect(result).toHaveProperty('model', 'gpt-4o')
  })

  // =========================================================================
  // Extras preserved (passthrough allows them)
  // =========================================================================

  it('keeps model, content on TEXT_MESSAGE_CONTENT', () => {
    const chunk = makeChunk('TEXT_MESSAGE_CONTENT', {
      messageId: 'msg-1',
      delta: 'Hello',
      content: 'Hello World',
      model: 'gpt-4o',
    })
    const result = stripToSpec(chunk) as Record<string, unknown>
    expect(result).toHaveProperty('delta', 'Hello')
    expect(result).toHaveProperty('content', 'Hello World')
    expect(result).toHaveProperty('model', 'gpt-4o')
  })

  it('keeps args on TOOL_CALL_ARGS', () => {
    const chunk = makeChunk('TOOL_CALL_ARGS', {
      toolCallId: 'tc-1',
      delta: '{"userId":',
      args: '{"userId":',
      model: 'gpt-4o',
    })
    const result = stripToSpec(chunk) as Record<string, unknown>
    expect(result).toHaveProperty('args', '{"userId":')
    expect(result).toHaveProperty('delta', '{"userId":')
    expect(result).toHaveProperty('model', 'gpt-4o')
  })

  it('keeps finishReason and usage on RUN_FINISHED', () => {
    const chunk = makeChunk('RUN_FINISHED', {
      runId: 'run-1',
      model: 'gpt-4o',
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    })
    const result = stripToSpec(chunk) as Record<string, unknown>
    expect(result).toHaveProperty('finishReason', 'stop')
    expect(result).toHaveProperty('usage')
    expect(result).toHaveProperty('model', 'gpt-4o')
  })

  it('keeps model on RUN_STARTED', () => {
    const chunk = makeChunk('RUN_STARTED', {
      runId: 'run-1',
      threadId: 'thread-1',
      model: 'gpt-4o',
    })
    const result = stripToSpec(chunk) as Record<string, unknown>
    expect(result).toHaveProperty('model', 'gpt-4o')
    expect(result).toHaveProperty('threadId', 'thread-1')
  })

  it('passes through REASONING events unchanged (except rawEvent)', () => {
    const chunk = makeChunk('REASONING_MESSAGE_CONTENT', {
      messageId: 'msg-1',
      delta: 'Let me think...',
      model: 'gpt-4o',
    })
    const result = stripToSpec(chunk) as Record<string, unknown>
    expect(result).toHaveProperty('delta', 'Let me think...')
    expect(result).toHaveProperty('model', 'gpt-4o')
  })

  it('passes through TOOL_CALL_RESULT unchanged (except rawEvent)', () => {
    const chunk = makeChunk('TOOL_CALL_RESULT', {
      toolCallId: 'tc-1',
      messageId: 'msg-result-1',
      content: '{"items":[]}',
      role: 'tool',
      model: 'gpt-4o',
    })
    const result = stripToSpec(chunk) as Record<string, unknown>
    expect(result).toHaveProperty('model', 'gpt-4o')
    expect(result).toHaveProperty('content', '{"items":[]}')
  })

  it('strips rawEvent even when combined with type-specific strips', () => {
    const chunk = makeChunk('TOOL_CALL_START', {
      toolCallId: 'tc-1',
      toolCallName: 'foo',
      toolName: 'foo',
      rawEvent: { originalPayload: true },
    })
    const result = stripToSpec(chunk) as Record<string, unknown>
    expect(result).not.toHaveProperty('rawEvent')
    expect(result).not.toHaveProperty('toolName')
    expect(result).toHaveProperty('toolCallName', 'foo')
  })
})
