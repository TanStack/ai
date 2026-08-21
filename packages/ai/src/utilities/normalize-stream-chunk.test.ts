import { describe, expect, it } from 'vitest'
import type { InterruptSubmissionError } from '../interrupts'
import { EventType } from '../types'
import type { StreamChunk } from '../types'
import type { AdapterYieldChunk } from './adapter-yield-chunk'
import { tanstackMetadata } from './merge-metadata'
import { normalizeStreamChunk } from './normalize-stream-chunk'
import { isSpecTopLevelKey } from './spec-event-keys'

function assertSpec(chunk: { type: string }) {
  for (const key of Object.keys(chunk)) {
    expect(isSpecTopLevelKey(chunk.type, key), key).toBe(true)
  }
}

function normalizeAll(chunk: AdapterYieldChunk) {
  const out = normalizeStreamChunk(chunk)
  for (const specChunk of out) {
    assertSpec(specChunk)
  }
  return out
}

function chunkAt(out: Array<StreamChunk>, index: number) {
  const chunk = out[index]
  if (chunk === undefined) {
    throw new Error(`expected stream chunk at ${String(index)}`)
  }
  return chunk
}

function normalizeOne(chunk: AdapterYieldChunk) {
  const out = normalizeAll(chunk)
  expect(out).toHaveLength(1)
  return chunkAt(out, 0)
}

describe('normalizeStreamChunk', () => {
  it('maps RUN_FINISHED TokenUsage onto spec usage[] and leftover metadata', () => {
    const chunk = {
      type: EventType.RUN_FINISHED,
      threadId: 't1',
      runId: 'r1',
      model: 'gpt-5.5',
      finishReason: 'stop',
      usage: {
        promptTokens: 10,
        completionTokens: 5,
        totalTokens: 15,
        cost: 0.02,
        promptTokensDetails: { cachedTokens: 3, audioTokens: 1 },
        completionTokensDetails: { reasoningTokens: 2 },
      },
    } as AdapterYieldChunk

    const out = normalizeOne(chunk)

    expect(out).toEqual({
      type: EventType.RUN_FINISHED,
      threadId: 't1',
      runId: 'r1',
      usage: [
        {
          model: 'gpt-5.5',
          inputTokens: 10,
          outputTokens: 5,
          totalTokens: 15,
          cachedInputTokens: 3,
          reasoningTokens: 2,
        },
      ],
      metadata: {
        tanstack: {
          model: 'gpt-5.5',
          finishReason: 'stop',
          usage: {
            cost: 0.02,
            promptTokensDetails: { audioTokens: 1 },
          },
        },
      },
    })
    expect(out).not.toHaveProperty('model')
    expect(out).not.toHaveProperty('finishReason')
  })

  it('moves RUN_STARTED model into metadata.tanstack.model only', () => {
    const out = normalizeOne({
      type: EventType.RUN_STARTED,
      threadId: 't1',
      runId: 'r1',
      model: 'gpt-5.5',
    } as AdapterYieldChunk)

    expect(out).toEqual({
      type: EventType.RUN_STARTED,
      threadId: 't1',
      runId: 'r1',
      metadata: { tanstack: { model: 'gpt-5.5' } },
    })
    expect(out).not.toHaveProperty('model')
    expect(tanstackMetadata(out)).toEqual({ model: 'gpt-5.5' })
  })

  it('puts TEXT_MESSAGE_START model in metadata and drops TEXT_MESSAGE_CONTENT extras', () => {
    const start = normalizeOne({
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'm1',
      role: 'assistant',
      model: 'gpt-5.5',
    } as AdapterYieldChunk)

    expect(start).toEqual({
      type: EventType.TEXT_MESSAGE_START,
      messageId: 'm1',
      role: 'assistant',
      metadata: { tanstack: { model: 'gpt-5.5' } },
    })

    const content = normalizeOne({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'm1',
      delta: 'Hi',
      content: 'Hello Hi',
      model: 'gpt-5.5',
    } as AdapterYieldChunk)

    expect(content).toEqual({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: 'm1',
      delta: 'Hi',
      metadata: { tanstack: { content: 'Hello Hi' } },
    })
    expect(content).not.toHaveProperty('content')
    expect(content).not.toHaveProperty('model')
  })

  it('strips RUN_ERROR nested error and moves interruptErrors + ids into metadata.tanstack', () => {
    const interruptError: InterruptSubmissionError = {
      scope: 'batch',
      code: 'server',
      message: 'Interrupt persistence failed.',
      threadId: 't1',
      interruptedRunId: 'r1',
      generation: 0,
      source: 'server',
      retryable: false,
      interruptIds: [],
    }
    const interruptErrors = [interruptError]

    const out = normalizeOne({
      type: EventType.RUN_ERROR,
      message: 'Interrupt persistence failed.',
      code: 'server',
      error: {
        message: 'Interrupt persistence failed.',
        code: 'server',
      },
      'tanstack:interruptErrors': interruptErrors,
      threadId: 't1',
      runId: 'r1',
    } as AdapterYieldChunk)

    expect(out).not.toHaveProperty('error')
    expect(out).not.toHaveProperty('tanstack:interruptErrors')
    expect(out).not.toHaveProperty('threadId')
    expect(out).not.toHaveProperty('runId')
    expect(out).toEqual({
      type: EventType.RUN_ERROR,
      message: 'Interrupt persistence failed.',
      code: 'server',
      metadata: {
        tanstack: {
          interruptErrors,
          threadId: 't1',
          runId: 'r1',
        },
      },
    })
    expect(tanstackMetadata(out)?.interruptErrors).toBe(interruptErrors)
    expect(tanstackMetadata(out)?.interruptErrors?.[0]).toBe(interruptError)
  })

  it('keeps STATE_SNAPSHOT snapshot and drops the state alias and model', () => {
    const snapshot = { count: 1 }
    const out = normalizeOne({
      type: EventType.STATE_SNAPSHOT,
      snapshot,
      state: { count: 2 },
      model: 'gpt-5.5',
    } as AdapterYieldChunk)

    expect(out).toMatchObject({
      type: EventType.STATE_SNAPSHOT,
      snapshot,
    })
    expect(out).not.toHaveProperty('state')
    expect(out).not.toHaveProperty('model')
  })

  it('moves CUSTOM generation:result threadId/runId/model into metadata.tanstack', () => {
    const value = { url: 'https://example.com/img.png' }
    const out = normalizeOne({
      type: EventType.CUSTOM,
      name: 'generation:result',
      value,
      threadId: 't1',
      runId: 'r1',
      model: 'gpt-5.5',
    } as AdapterYieldChunk)

    expect(out).toEqual({
      type: EventType.CUSTOM,
      name: 'generation:result',
      value,
      metadata: {
        tanstack: {
          model: 'gpt-5.5',
          threadId: 't1',
          runId: 'r1',
        },
      },
    })
    expect(out).not.toHaveProperty('threadId')
    expect(out).not.toHaveProperty('runId')
    expect(out).not.toHaveProperty('model')
  })

  it('returns an already-spec TEXT_MESSAGE_END chunk unchanged', () => {
    const chunk = {
      type: EventType.TEXT_MESSAGE_END,
      messageId: 'm1',
      timestamp: 1,
    } as AdapterYieldChunk

    const out = normalizeStreamChunk(chunk)
    expect(out).toHaveLength(1)
    assertSpec(chunkAt(out, 0))
    expect(out[0]).toEqual(chunk)
    expect(out[0]).not.toHaveProperty('metadata')
  })

  it('keeps TOOL_CALL_START toolName alias and emits REASONING_ENCRYPTED_VALUE for thoughtSignature', () => {
    const out = normalizeAll({
      type: EventType.TOOL_CALL_START,
      toolCallId: 'tc1',
      toolCallName: 'get_weather',
      toolName: 'get_weather',
      index: 0,
      parentMessageId: 'm1',
      metadata: { thoughtSignature: 'sig-1' },
    } as AdapterYieldChunk)

    expect(out).toHaveLength(2)
    expect(out[0]).toEqual({
      type: EventType.TOOL_CALL_START,
      toolCallId: 'tc1',
      toolCallName: 'get_weather',
      toolName: 'get_weather',
      parentMessageId: 'm1',
      metadata: {
        thoughtSignature: 'sig-1',
        tanstack: { index: 0 },
      },
    })
    expect(out[0]).not.toHaveProperty('index')
    expect(out[1]).toEqual({
      type: EventType.REASONING_ENCRYPTED_VALUE,
      subtype: 'tool-call',
      entityId: 'tc1',
      encryptedValue: 'sig-1',
    })
  })

  it('drops TOOL_CALL_ARGS accumulated args', () => {
    const out = normalizeOne({
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'tc1',
      delta: '{"q":',
      args: '{"q":',
      model: 'gpt-5.5',
    } as AdapterYieldChunk)

    expect(out).toEqual({
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'tc1',
      delta: '{"q":',
      metadata: { tanstack: { args: '{"q":' } },
    })
    expect(out).not.toHaveProperty('args')
    expect(out).not.toHaveProperty('model')
  })

  it('splits TOOL_CALL_END with result into spec END then RESULT', () => {
    const out = normalizeAll({
      type: EventType.TOOL_CALL_END,
      toolCallId: 'tc1',
      toolCallName: 'get_weather',
      toolName: 'get_weather',
      parentMessageId: 'm1',
      result: '{"temp":72}',
      input: { q: 'sf' },
      output: { temp: 72 },
    } as AdapterYieldChunk)

    expect(out).toHaveLength(2)
    expect(out[0]).toEqual({
      type: EventType.TOOL_CALL_END,
      toolCallId: 'tc1',
      input: { q: 'sf' },
      metadata: {
        tanstack: {
          toolCallName: 'get_weather',
          toolName: 'get_weather',
          parentMessageId: 'm1',
          output: { temp: 72 },
        },
      },
    })
    expect(out[1]).toEqual({
      type: EventType.TOOL_CALL_RESULT,
      toolCallId: 'tc1',
      content: '{"temp":72}',
      messageId: 'm1',
    })
  })

  it('returns one spec TOOL_CALL_END when result is missing', () => {
    const out = normalizeOne({
      type: EventType.TOOL_CALL_END,
      toolCallId: 'tc1',
      toolCallName: 'get_weather',
    } as AdapterYieldChunk)

    expect(out).toEqual({
      type: EventType.TOOL_CALL_END,
      toolCallId: 'tc1',
      metadata: { tanstack: { toolCallName: 'get_weather' } },
    })
    expect(out).not.toHaveProperty('result')
    expect(out).not.toHaveProperty('toolCallName')
  })

  it('stringifies an array TOOL_CALL_END result onto RESULT content', () => {
    const parts = [{ type: 'text', content: 'hello' }]
    const out = normalizeAll({
      type: EventType.TOOL_CALL_END,
      toolCallId: 'tc1',
      result: parts,
    } as AdapterYieldChunk)

    expect(out).toHaveLength(2)
    expect(out[1]).toEqual({
      type: EventType.TOOL_CALL_RESULT,
      toolCallId: 'tc1',
      content: JSON.stringify(parts),
      messageId: 'tc1',
    })
  })

  it('copies TOOL_CALL_END output-error state onto RESULT metadata.tanstack.state', () => {
    const out = normalizeAll({
      type: EventType.TOOL_CALL_END,
      toolCallId: 'tc1',
      result: 'Error executing tool: boom',
      state: 'output-error',
    } as AdapterYieldChunk)

    expect(out).toHaveLength(2)
    expect(out[0]).toEqual({
      type: EventType.TOOL_CALL_END,
      toolCallId: 'tc1',
      metadata: { tanstack: { state: 'output-error' } },
    })
    expect(out[1]).toEqual({
      type: EventType.TOOL_CALL_RESULT,
      toolCallId: 'tc1',
      content: 'Error executing tool: boom',
      messageId: 'tc1',
      metadata: { tanstack: { state: 'output-error' } },
    })
    expect(tanstackMetadata(chunkAt(out, 1))).toEqual({
      state: 'output-error',
    })
  })

  it('strips STEP_FINISHED thinking extras and emits REASONING_ENCRYPTED_VALUE for the signature', () => {
    const out = normalizeAll({
      type: EventType.STEP_FINISHED,
      stepName: 'thinking',
      stepId: 's1',
      delta: 'hmm',
      content: 'hmm full',
      signature: 'sig',
    } as AdapterYieldChunk)

    expect(out).toHaveLength(2)
    expect(out[0]).toEqual({
      type: EventType.STEP_FINISHED,
      stepName: 'thinking',
      metadata: {
        tanstack: {
          content: 'hmm full',
          delta: 'hmm',
          signature: 'sig',
          stepId: 's1',
        },
      },
    })
    expect(out[0]).not.toHaveProperty('delta')
    expect(out[0]).not.toHaveProperty('content')
    expect(out[0]).not.toHaveProperty('signature')
    expect(out[0]).not.toHaveProperty('stepId')
    expect(out[1]).toEqual({
      type: EventType.REASONING_ENCRYPTED_VALUE,
      subtype: 'message',
      entityId: 's1',
      encryptedValue: 'sig',
    })
  })
})
