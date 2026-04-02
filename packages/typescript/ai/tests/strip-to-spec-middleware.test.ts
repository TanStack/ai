import { describe, it, expect } from 'vitest'
import { stripToSpec } from '../src/strip-to-spec-middleware'
import type { StreamChunk } from '../src/types'

function makeChunk(type: string, fields: Record<string, unknown>): StreamChunk {
  return { type, timestamp: Date.now(), ...fields } as unknown as StreamChunk
}

describe('stripToSpec', () => {
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

  it('passes through all other events unchanged', () => {
    const chunk = makeChunk('TOOL_CALL_START', {
      toolCallId: 'tc-1',
      toolCallName: 'getTodos',
      toolName: 'getTodos',
      index: 0,
      providerMetadata: { foo: 'bar' },
      model: 'gpt-4o',
    })
    const result = stripToSpec(chunk)
    expect(result).toBe(chunk) // same reference, no copy
  })

  it('keeps model, content, finishReason, usage, result, etc.', () => {
    const chunk = makeChunk('RUN_FINISHED', {
      runId: 'run-1',
      threadId: 'thread-1',
      model: 'gpt-4o',
      finishReason: 'stop',
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
    })
    const result = stripToSpec(chunk) as Record<string, unknown>
    expect(result).toHaveProperty('model', 'gpt-4o')
    expect(result).toHaveProperty('finishReason', 'stop')
    expect(result).toHaveProperty('usage')
  })

  it('keeps toolName, stepId, and other deprecated aliases (passthrough)', () => {
    const chunk = makeChunk('TOOL_CALL_END', {
      toolCallId: 'tc-1',
      toolCallName: 'getTodos',
      toolName: 'getTodos',
      input: { userId: '123' },
      result: '{"items":[]}',
      model: 'gpt-4o',
    })
    const result = stripToSpec(chunk) as Record<string, unknown>
    expect(result).toHaveProperty('toolName', 'getTodos')
    expect(result).toHaveProperty('toolCallName', 'getTodos')
    expect(result).toHaveProperty('input')
    expect(result).toHaveProperty('result')
    expect(result).toHaveProperty('model', 'gpt-4o')
  })
})
