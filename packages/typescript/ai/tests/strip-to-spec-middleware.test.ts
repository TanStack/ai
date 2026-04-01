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
  it('removes `model` from all event types', () => {
    const chunk = makeChunk('RUN_STARTED', {
      runId: 'run-1',
      model: 'gpt-4o',
    })
    const result = stripToSpec(chunk) as Record<string, unknown>
    expect(result).not.toHaveProperty('model')
    expect(result).toHaveProperty('runId', 'run-1')
    expect(result).toHaveProperty('type', 'RUN_STARTED')
  })

  it('removes `rawEvent` from all event types', () => {
    const chunk = makeChunk('TEXT_MESSAGE_START', {
      messageId: 'msg-1',
      role: 'assistant',
      rawEvent: { some: 'raw data' },
      model: 'gpt-4o',
    })
    const result = stripToSpec(chunk) as Record<string, unknown>
    expect(result).not.toHaveProperty('rawEvent')
    expect(result).not.toHaveProperty('model')
    expect(result).toHaveProperty('messageId', 'msg-1')
  })

  it('removes accumulated `content` from TEXT_MESSAGE_CONTENT, keeps `delta`', () => {
    const chunk = makeChunk('TEXT_MESSAGE_CONTENT', {
      messageId: 'msg-1',
      delta: 'Hello',
      content: 'Hello World',
      model: 'gpt-4o',
    })
    const result = stripToSpec(chunk) as Record<string, unknown>
    expect(result).not.toHaveProperty('content')
    expect(result).not.toHaveProperty('model')
    expect(result).toHaveProperty('delta', 'Hello')
    expect(result).toHaveProperty('messageId', 'msg-1')
    expect(result).toHaveProperty('type', 'TEXT_MESSAGE_CONTENT')
  })

  it('removes `toolName`, `index`, `providerMetadata` from TOOL_CALL_START, keeps `toolCallName`', () => {
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
    expect(result).not.toHaveProperty('index')
    expect(result).not.toHaveProperty('providerMetadata')
    expect(result).not.toHaveProperty('model')
    expect(result).toHaveProperty('toolCallId', 'tc-1')
    expect(result).toHaveProperty('toolCallName', 'getTodos')
    expect(result).toHaveProperty('type', 'TOOL_CALL_START')
  })

  it('removes `args` from TOOL_CALL_ARGS, keeps `delta`', () => {
    const chunk = makeChunk('TOOL_CALL_ARGS', {
      toolCallId: 'tc-1',
      delta: '{"userId":',
      args: '{"userId":',
      model: 'gpt-4o',
    })
    const result = stripToSpec(chunk) as Record<string, unknown>
    expect(result).not.toHaveProperty('args')
    expect(result).not.toHaveProperty('model')
    expect(result).toHaveProperty('delta', '{"userId":')
    expect(result).toHaveProperty('toolCallId', 'tc-1')
    expect(result).toHaveProperty('type', 'TOOL_CALL_ARGS')
  })

  it('strips TOOL_CALL_END to only `toolCallId` + base fields', () => {
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
    expect(result).not.toHaveProperty('toolCallName')
    expect(result).not.toHaveProperty('input')
    expect(result).not.toHaveProperty('result')
    expect(result).not.toHaveProperty('model')
    expect(result).toHaveProperty('toolCallId', 'tc-1')
    expect(result).toHaveProperty('type', 'TOOL_CALL_END')
    expect(result).toHaveProperty('timestamp')
  })

  it('strips RUN_STARTED to spec fields (threadId, runId, type, timestamp)', () => {
    const chunk = makeChunk('RUN_STARTED', {
      runId: 'run-1',
      threadId: 'thread-1',
      model: 'gpt-4o',
    })
    const result = stripToSpec(chunk) as Record<string, unknown>
    expect(result).not.toHaveProperty('model')
    expect(result).toHaveProperty('type', 'RUN_STARTED')
    expect(result).toHaveProperty('runId', 'run-1')
    expect(result).toHaveProperty('threadId', 'thread-1')
    expect(result).toHaveProperty('timestamp')
  })

  it('strips RUN_FINISHED usage but keeps finishReason (needed by client)', () => {
    const chunk = makeChunk('RUN_FINISHED', {
      runId: 'run-1',
      model: 'gpt-4o',
      finishReason: 'stop',
      usage: {
        promptTokens: 100,
        completionTokens: 50,
        totalTokens: 150,
      },
    })
    const result = stripToSpec(chunk) as Record<string, unknown>
    expect(result).not.toHaveProperty('model')
    expect(result).not.toHaveProperty('usage')
    // finishReason is kept — client needs it to detect tool_calls vs stop
    expect(result).toHaveProperty('finishReason', 'stop')
    expect(result).toHaveProperty('type', 'RUN_FINISHED')
    expect(result).toHaveProperty('runId', 'run-1')
    expect(result).toHaveProperty('timestamp')
  })

  it('strips RUN_ERROR deprecated `error` object, keeps flat `message`/`code`', () => {
    const chunk = makeChunk('RUN_ERROR', {
      runId: 'run-1',
      message: 'Something went wrong',
      code: 'INTERNAL_ERROR',
      error: { message: 'Something went wrong' },
      model: 'gpt-4o',
    })
    const result = stripToSpec(chunk) as Record<string, unknown>
    expect(result).not.toHaveProperty('error')
    expect(result).not.toHaveProperty('model')
    expect(result).toHaveProperty('message', 'Something went wrong')
    expect(result).toHaveProperty('code', 'INTERNAL_ERROR')
    expect(result).toHaveProperty('type', 'RUN_ERROR')
  })

  it('strips STEP_STARTED to spec fields (removes stepId, stepType, keeps stepName)', () => {
    const chunk = makeChunk('STEP_STARTED', {
      stepName: 'thinking',
      stepId: 'step-1',
      stepType: 'thinking',
      model: 'gpt-4o',
    })
    const result = stripToSpec(chunk) as Record<string, unknown>
    expect(result).not.toHaveProperty('stepId')
    expect(result).not.toHaveProperty('stepType')
    expect(result).not.toHaveProperty('model')
    expect(result).toHaveProperty('stepName', 'thinking')
    expect(result).toHaveProperty('type', 'STEP_STARTED')
  })

  it('strips STEP_FINISHED to spec fields (removes stepId, delta, content, keeps stepName)', () => {
    const chunk = makeChunk('STEP_FINISHED', {
      stepName: 'thinking',
      stepId: 'step-1',
      delta: 'some thinking',
      content: 'accumulated thinking',
      model: 'gpt-4o',
    })
    const result = stripToSpec(chunk) as Record<string, unknown>
    expect(result).not.toHaveProperty('stepId')
    expect(result).not.toHaveProperty('delta')
    expect(result).not.toHaveProperty('content')
    expect(result).not.toHaveProperty('model')
    expect(result).toHaveProperty('stepName', 'thinking')
    expect(result).toHaveProperty('type', 'STEP_FINISHED')
  })

  it('strips STATE_SNAPSHOT deprecated `state`, keeps `snapshot`', () => {
    const chunk = makeChunk('STATE_SNAPSHOT', {
      snapshot: { count: 42 },
      state: { count: 42 },
      model: 'gpt-4o',
    })
    const result = stripToSpec(chunk) as Record<string, unknown>
    expect(result).not.toHaveProperty('state')
    expect(result).not.toHaveProperty('model')
    expect(result).toHaveProperty('snapshot')
    expect((result.snapshot as Record<string, unknown>).count).toBe(42)
    expect(result).toHaveProperty('type', 'STATE_SNAPSHOT')
  })

  it('passes through REASONING events (only strips model)', () => {
    const chunk = makeChunk('REASONING_MESSAGE_CONTENT', {
      messageId: 'msg-1',
      delta: 'Let me think...',
      model: 'gpt-4o',
    })
    const result = stripToSpec(chunk) as Record<string, unknown>
    expect(result).not.toHaveProperty('model')
    expect(result).toHaveProperty('delta', 'Let me think...')
    expect(result).toHaveProperty('messageId', 'msg-1')
    expect(result).toHaveProperty('type', 'REASONING_MESSAGE_CONTENT')
  })

  it('passes through TOOL_CALL_RESULT (only strips model)', () => {
    const chunk = makeChunk('TOOL_CALL_RESULT', {
      toolCallId: 'tc-1',
      messageId: 'msg-result-1',
      content: '{"items":[]}',
      role: 'tool',
      model: 'gpt-4o',
    })
    const result = stripToSpec(chunk) as Record<string, unknown>
    expect(result).not.toHaveProperty('model')
    expect(result).toHaveProperty('toolCallId', 'tc-1')
    expect(result).toHaveProperty('content', '{"items":[]}')
    expect(result).toHaveProperty('type', 'TOOL_CALL_RESULT')
  })

  it('strips `rawEvent` from events along with other type-specific fields', () => {
    const chunk = makeChunk('RUN_FINISHED', {
      runId: 'run-1',
      rawEvent: { originalPayload: true },
      model: 'gpt-4o',
      finishReason: 'stop',
    })
    const result = stripToSpec(chunk) as Record<string, unknown>
    expect(result).not.toHaveProperty('rawEvent')
    expect(result).not.toHaveProperty('model')
    // finishReason is kept (needed by client)
    expect(result).toHaveProperty('finishReason', 'stop')
    expect(result).toHaveProperty('type', 'RUN_FINISHED')
    expect(result).toHaveProperty('runId', 'run-1')
  })
})
