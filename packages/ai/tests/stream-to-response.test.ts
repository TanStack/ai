import { describe, it, expect, expectTypeOf, vi } from 'vitest'
import {
  resumeJsonResponse,
  streamToText,
  toHttpResponse,
  toHttpStream,
  toJsonResponse,
  toServerSentEventsStream,
  toServerSentEventsResponse,
} from '../src/stream-to-response'
import { InMemoryRunStore } from '../src/activities/chat/middleware/run-store'
import { publishRunDisconnectHandler } from '../src/delivery-disconnect'
import { InMemoryLockStore } from '../src/locks'
import { memoryStream } from '../src/stream-durability'
import { EventType } from '../src/types'
import { ev } from './test-utils'
import type { ChatResult, RunDriverOptions } from '../src/stream-to-response'
import type { StreamChunk } from '../src/types'

// Helper to create mock async iterable
async function* createMockStream(
  chunks: Array<Record<string, unknown>>,
): AsyncGenerator<StreamChunk> {
  for (const chunk of chunks) {
    yield chunk as StreamChunk
  }
}

// Helper to read ReadableStream
async function readStream(stream: ReadableStream<Uint8Array>): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let result = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      result += decoder.decode(value, { stream: true })
    }
  } finally {
    reader.releaseLock()
  }

  return result
}

async function* streamOf(
  chunks: Array<StreamChunk>,
): AsyncGenerator<StreamChunk> {
  yield* chunks
}

describe('streamToText', () => {
  it('returns the joined text and every chunk in order', async () => {
    const chunks: Array<StreamChunk> = [
      {
        type: EventType.RUN_STARTED,
        threadId: 'thread-1',
        runId: 'run-1',
        timestamp: 1,
      },
      {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'msg-1',
        timestamp: 2,
        delta: 'Hello, ',
      },
      {
        type: EventType.TOOL_CALL_START,
        toolCallId: 'call-1',
        toolCallName: 'lookup',
        toolName: 'lookup',
        timestamp: 3,
      },
      {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'msg-1',
        timestamp: 4,
        delta: 'world',
      },
      {
        type: EventType.RUN_FINISHED,
        threadId: 'thread-1',
        runId: 'run-1',
        timestamp: 5,
      },
    ]

    const result = await streamToText(streamOf(chunks))

    expect(result.text).toBe('Hello, world')
    expect(result.chunks.map((chunk) => chunk.type)).toEqual([
      'RUN_STARTED',
      'TEXT_MESSAGE_CONTENT',
      'TOOL_CALL_START',
      'TEXT_MESSAGE_CONTENT',
      'RUN_FINISHED',
    ])
  })

  it('keeps an interrupt RUN_FINISHED in chunks', async () => {
    const result = await streamToText(
      streamOf([
        {
          type: EventType.RUN_FINISHED,
          threadId: 'thread-1',
          runId: 'run-1',
          timestamp: 1,
          outcome: {
            type: 'interrupt',
            interrupts: [{ id: 'approval-1', reason: 'needs approval' }],
          },
        },
      ]),
    )

    expect(result).toEqual({
      text: '',
      chunks: [
        {
          type: 'RUN_FINISHED',
          threadId: 'thread-1',
          runId: 'run-1',
          timestamp: 1,
          outcome: {
            type: 'interrupt',
            interrupts: [{ id: 'approval-1', reason: 'needs approval' }],
          },
        },
      ],
    })
  })

  it('rejects on RUN_ERROR instead of returning accumulated text', async () => {
    const rawEvent = {
      provider_name: 'test-provider',
      raw: { reason: 'upstream overloaded' },
    }
    const stream = createMockStream([
      {
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'msg-1',
        timestamp: Date.now(),
        delta: 'partial text',
      },
      {
        type: 'RUN_ERROR',
        timestamp: Date.now(),
        message: 'Provider request failed',
        code: 'rate_limit_exceeded',
        rawEvent,
      },
    ])

    await expect(streamToText(stream)).rejects.toMatchObject({
      message: 'Provider request failed',
      code: 'rate_limit_exceeded',
      rawEvent,
    })
  })
})

describe.each([
  ['SSE', toServerSentEventsStream],
  ['NDJSON', toHttpStream],
] as const)('%s response backpressure', (_format, encode) => {
  it('pauses the source while the response is not being read', async () => {
    let produced = 0
    let cleanedUp = false
    async function* source(): AsyncGenerator<StreamChunk> {
      try {
        for (let i = 0; i < 100; i++) {
          produced++
          yield {
            type: EventType.TEXT_MESSAGE_CONTENT,
            messageId: 'msg-1',
            timestamp: Date.now(),
            delta: String(i),
          }
        }
      } finally {
        cleanedUp = true
      }
    }

    const stream = encode(source())
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(produced).toBe(1)

    const reader = stream.getReader()
    await reader.read()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(produced).toBe(2)

    await reader.cancel()
    expect(cleanedUp).toBe(true)
    expect(produced).toBe(2)
  })

  it('delivers a source error after a slow reader resumes', async () => {
    let reachedError = false
    async function* source(): AsyncGenerator<StreamChunk> {
      yield {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'msg-1',
        timestamp: Date.now(),
        delta: 'first',
      }
      reachedError = true
      throw new Error('source failed')
    }

    const reader = encode(source()).getReader()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(reachedError).toBe(false)

    await reader.read()
    const error = await reader.read()
    expect(new TextDecoder().decode(error.value)).toContain('source failed')
    expect(reachedError).toBe(true)
    expect((await reader.read()).done).toBe(true)
  })
})

describe('toServerSentEventsStream', () => {
  it('should convert chunks to SSE format', async () => {
    const chunks: Array<Record<string, unknown>> = [
      {
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: 'Hello',
        content: 'Hello',
      },
      {
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: ' world',
        content: 'Hello world',
      },
    ]

    const stream = createMockStream(chunks)
    const sseStream = toServerSentEventsStream(stream)
    const output = await readStream(sseStream)

    expect(output).toContain('data: ')
    expect(output).toContain('"type":"TEXT_MESSAGE_CONTENT"')
    expect(output).toContain('\n\n')
    expect(output).not.toContain('[DONE]')
  })

  it('should format each chunk with data: prefix', async () => {
    const chunks: Array<Record<string, unknown>> = [
      {
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: 'Test',
        content: 'Test',
      },
    ]

    const stream = createMockStream(chunks)
    const sseStream = toServerSentEventsStream(stream)
    const output = await readStream(sseStream)

    const lines = output.split('\n\n').filter((line) => line.trim())
    expect(lines[0]).toMatch(/^data: /)
    expect(lines[lines.length - 1]).toMatch(/^data: \{/)
  })

  it('should handle tool call events', async () => {
    const chunks: Array<Record<string, unknown>> = [
      {
        type: 'TOOL_CALL_START',
        toolCallId: 'call-1',
        toolCallName: 'getWeather',
        timestamp: Date.now(),
      },
    ]

    const stream = createMockStream(chunks)
    const sseStream = toServerSentEventsStream(stream)
    const output = await readStream(sseStream)

    expect(output).toContain('"type":"TOOL_CALL_START"')
    expect(output).toContain('"toolCallName":"getWeather"')
    expect(output).not.toContain('"toolName"')
    expect(output).not.toContain('[DONE]')
  })

  it('should handle RUN_FINISHED events', async () => {
    const chunks: Array<Record<string, unknown>> = [
      {
        type: 'RUN_FINISHED',
        runId: 'run-1',
        threadId: 'thread-1',
        timestamp: Date.now(),
        metadata: { tanstack: { finishReason: 'stop' } },
      },
    ]

    const stream = createMockStream(chunks)
    const sseStream = toServerSentEventsStream(stream)
    const output = await readStream(sseStream)

    expect(output).toContain('"type":"RUN_FINISHED"')
    expect(output).toContain('"tanstack"')
    expect(output).toContain('"finishReason":"stop"')
    expect(output).not.toContain('[DONE]')
  })

  it('should handle RUN_ERROR events', async () => {
    const chunks: Array<Record<string, unknown>> = [
      {
        type: 'RUN_ERROR',
        timestamp: Date.now(),
        message: 'Test error',
      },
    ]

    const stream = createMockStream(chunks)
    const sseStream = toServerSentEventsStream(stream)
    const output = await readStream(sseStream)

    expect(output).toContain('"type":"RUN_ERROR"')
    expect(output).not.toContain('[DONE]')
  })

  it('should handle empty stream', async () => {
    const stream = createMockStream([])
    const sseStream = toServerSentEventsStream(stream)
    const output = await readStream(sseStream)

    expect(output).toBe('')
  })

  it('should not emit [DONE] sentinel — RUN_FINISHED is the stream terminator', async () => {
    const chunks: Array<Record<string, unknown>> = [
      {
        type: 'RUN_STARTED',
        runId: 'run-1',
        model: 'test',
        timestamp: Date.now(),
      },
      {
        type: 'TEXT_MESSAGE_START',
        messageId: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        role: 'assistant',
      },
      {
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: 'Hello',
        content: 'Hello',
      },
      {
        type: 'TEXT_MESSAGE_END',
        messageId: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
      },
      {
        type: 'RUN_FINISHED',
        runId: 'run-1',
        model: 'test',
        timestamp: Date.now(),
        finishReason: 'stop',
      },
    ]

    const stream = createMockStream(chunks)
    const sseStream = toServerSentEventsStream(stream)
    const output = await readStream(sseStream)

    expect(output).not.toContain('[DONE]')
    // Stream should end with the RUN_FINISHED event
    expect(output).toContain('"type":"RUN_FINISHED"')
  })

  it('should abort when abortController signals abort', async () => {
    const abortController = new AbortController()
    const chunks: Array<Record<string, unknown>> = [
      {
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: 'Test',
        content: 'Test',
      },
    ]

    const stream = createMockStream(chunks)
    const sseStream = toServerSentEventsStream(stream, abortController)

    // Abort immediately
    abortController.abort()

    const output = await readStream(sseStream)

    // Should not have processed chunks after abort
    expect(output).not.toContain('"type":"TEXT_MESSAGE_CONTENT"')
  })

  it('should handle stream errors and send error chunk', async () => {
    async function* errorStream(): AsyncGenerator<StreamChunk> {
      yield {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'msg-1',
        timestamp: Date.now(),
        delta: 'Test',
      }
      throw new Error('Stream error')
    }

    const sseStream = toServerSentEventsStream(errorStream())
    const output = await readStream(sseStream)

    expect(output).toContain('"type":"RUN_ERROR"')
    expect(output).toContain('"message":"Stream error"')
    expect(output).not.toContain('"error":')
  })

  it('should not send error if aborted', async () => {
    const abortController = new AbortController()

    async function* errorStream(): AsyncGenerator<any> {
      abortController.abort()
      throw new Error('Stream error')
    }

    const sseStream = toServerSentEventsStream(errorStream(), abortController)
    const output = await readStream(sseStream)

    // Should close without error chunk
    expect(output).not.toContain('"type":"RUN_ERROR"')
  })

  it('should handle cancel and abort underlying stream', async () => {
    const abortController = new AbortController()
    const abortSpy = vi.spyOn(abortController, 'abort')

    const chunks: Array<Record<string, unknown>> = [
      {
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: 'Test',
        content: 'Test',
      },
    ]

    const stream = createMockStream(chunks)
    const sseStream = toServerSentEventsStream(stream, abortController)

    // Cancel the stream
    await sseStream.cancel()

    expect(abortSpy).toHaveBeenCalled()
  })

  it('should handle multiple chunks correctly', async () => {
    const chunks: Array<Record<string, unknown>> = [
      {
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: 'Hello',
        content: 'Hello',
      },
      {
        type: 'TOOL_CALL_START',
        toolCallId: 'call-1',
        toolCallName: 'getWeather',
        timestamp: Date.now(),
      },
      {
        type: 'RUN_FINISHED',
        runId: 'run-1',
        threadId: 'thread-1',
        timestamp: Date.now(),
        metadata: { tanstack: { finishReason: 'tool_calls' } },
      },
    ]

    const stream = createMockStream(chunks)
    const sseStream = toServerSentEventsStream(stream)
    const output = await readStream(sseStream)

    const dataLines = output
      .split('\n\n')
      .filter((line) => line.startsWith('data: '))
    expect(dataLines.length).toBeGreaterThanOrEqual(3) // At least 3 chunks
    expect(output).not.toContain('[DONE]')
  })
})

describe('toServerSentEventsResponse', () => {
  it('should create Response with SSE headers', async () => {
    const chunks: Array<Record<string, unknown>> = [
      {
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: 'Test',
        content: 'Test',
      },
    ]

    const stream = createMockStream(chunks)
    const response = toServerSentEventsResponse(stream)

    expect(response).toBeInstanceOf(Response)
    expect(response.headers.get('Content-Type')).toBe('text/event-stream')
    expect(response.headers.get('Cache-Control')).toBe('no-cache')
    expect(response.headers.get('Connection')).toBe('keep-alive')
  })

  it('should allow custom headers', async () => {
    const chunks: Array<Record<string, unknown>> = []
    const stream = createMockStream(chunks)
    const response = toServerSentEventsResponse(stream, {
      headers: {
        'X-Custom-Header': 'custom-value',
      },
    })

    expect(response.headers.get('X-Custom-Header')).toBe('custom-value')
    expect(response.headers.get('Content-Type')).toBe('text/event-stream')
  })

  it('should merge custom headers with SSE headers', async () => {
    const chunks: Array<Record<string, unknown>> = []
    const stream = createMockStream(chunks)
    const response = toServerSentEventsResponse(stream, {
      headers: {
        'X-Custom-Header': 'custom-value',
        'Cache-Control': 'custom-cache',
      },
    })

    expect(response.headers.get('X-Custom-Header')).toBe('custom-value')
    expect(response.headers.get('Cache-Control')).toBe('custom-cache')
    expect(response.headers.get('Content-Type')).toBe('text/event-stream')
  })

  it('should handle abortController in options', async () => {
    const abortController = new AbortController()
    const chunks: Array<Record<string, unknown>> = [
      {
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: 'Test',
        content: 'Test',
      },
    ]

    const stream = createMockStream(chunks)
    const response = toServerSentEventsResponse(stream, {
      abortController,
    })

    expect(response).toBeInstanceOf(Response)

    // Abort and verify stream handles it
    abortController.abort()
    const reader = response.body?.getReader()
    if (reader) {
      await reader.cancel()
      reader.releaseLock()
    }
  })

  it('should handle status and statusText', async () => {
    const chunks: Array<Record<string, unknown>> = []
    const stream = createMockStream(chunks)
    const response = toServerSentEventsResponse(stream, {
      status: 201,
      statusText: 'Created',
    })

    expect(response.status).toBe(201)
    expect(response.statusText).toBe('Created')
  })

  it('should stream chunks correctly through Response', async () => {
    const chunks: Array<Record<string, unknown>> = [
      {
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: 'Hello',
        content: 'Hello',
      },
      {
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: ' world',
        content: 'Hello world',
      },
    ]

    const stream = createMockStream(chunks)
    const response = toServerSentEventsResponse(stream)

    if (!response.body) {
      throw new Error('Response body is null')
    }

    const output = await readStream(response.body)

    expect(output).toContain('data: ')
    expect(output).toContain('"type":"TEXT_MESSAGE_CONTENT"')
    expect(output).toContain('"delta":"Hello"')
    expect(output).toContain('"delta":" world"')
    expect(output).not.toContain('[DONE]')
  })

  it('should handle undefined init parameter', async () => {
    const chunks: Array<Record<string, unknown>> = []
    const stream = createMockStream(chunks)
    const response = toServerSentEventsResponse(stream, undefined)

    expect(response).toBeInstanceOf(Response)
    expect(response.headers.get('Content-Type')).toBe('text/event-stream')
  })

  it('should handle empty init object', async () => {
    const chunks: Array<Record<string, unknown>> = []
    const stream = createMockStream(chunks)
    const response = toServerSentEventsResponse(stream, {})

    expect(response).toBeInstanceOf(Response)
    expect(response.headers.get('Content-Type')).toBe('text/event-stream')
  })
})

/**
 * SSE Round-Trip Tests
 *
 * These tests verify that all AG-UI event types survive the SSE encoding/decoding cycle.
 * This simulates the full server → client flow.
 */
describe('SSE Round-Trip (Encode → Decode)', () => {
  /**
   * Helper to parse SSE stream back into chunks
   */
  async function parseSSEStream(
    sseStream: ReadableStream<Uint8Array>,
  ): Promise<Array<Record<string, unknown>>> {
    const reader = sseStream.getReader()
    const decoder = new TextDecoder()
    const chunks: Array<Record<string, unknown>> = []
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue
            try {
              chunks.push(JSON.parse(data))
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }

    return chunks
  }

  it('should preserve TEXT_MESSAGE_CONTENT events', async () => {
    const originalChunks: Array<Record<string, unknown>> = [
      {
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'msg-1',
        timestamp: 1234567890,
        delta: 'Hello',
      },
      {
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'msg-1',
        timestamp: 1234567891,
        delta: ' world',
      },
    ]

    const sseStream = toServerSentEventsStream(createMockStream(originalChunks))
    const parsedChunks = await parseSSEStream(sseStream)

    expect(parsedChunks.length).toBe(2)

    for (let i = 0; i < originalChunks.length; i++) {
      const original = originalChunks[i]
      const parsed = parsedChunks[i]

      expect(parsed?.['type']).toBe(original?.['type'])
      expect((parsed as any)?.messageId).toBe((original as any)?.messageId)
      expect((parsed as any)?.delta).toBe((original as any)?.delta)
      expect(parsed).not.toHaveProperty('content')
      expect(parsed).not.toHaveProperty('model')
    }
  })

  it('should preserve TOOL_CALL_* events', async () => {
    const originalChunks: Array<Record<string, unknown>> = [
      {
        type: 'TOOL_CALL_START',
        toolCallId: 'tc-1',
        toolCallName: 'get_weather',
        timestamp: Date.now(),
      },
      {
        type: 'TOOL_CALL_ARGS',
        toolCallId: 'tc-1',
        timestamp: Date.now(),
        delta: '{"city":"NYC"}',
      },
      {
        type: 'TOOL_CALL_END',
        toolCallId: 'tc-1',
        timestamp: Date.now(),
      },
    ]

    const sseStream = toServerSentEventsStream(createMockStream(originalChunks))
    const parsedChunks = await parseSSEStream(sseStream)

    expect(parsedChunks.length).toBe(3)

    // Verify TOOL_CALL_START
    expect(parsedChunks[0]?.['type']).toBe('TOOL_CALL_START')
    expect((parsedChunks[0] as any)?.toolCallId).toBe('tc-1')
    expect((parsedChunks[0] as any)?.toolCallName).toBe('get_weather')
    expect(parsedChunks[0]).not.toHaveProperty('toolName')
    expect(parsedChunks[0]).not.toHaveProperty('index')

    // Verify TOOL_CALL_ARGS
    expect(parsedChunks[1]?.['type']).toBe('TOOL_CALL_ARGS')
    expect((parsedChunks[1] as any)?.toolCallId).toBe('tc-1')
    expect((parsedChunks[1] as any)?.delta).toBe('{"city":"NYC"}')

    // Verify TOOL_CALL_END
    expect(parsedChunks[2]?.['type']).toBe('TOOL_CALL_END')
    expect((parsedChunks[2] as any)?.toolCallId).toBe('tc-1')
  })

  it('should preserve RUN_* events', async () => {
    const originalChunks: Array<Record<string, unknown>> = [
      {
        type: 'RUN_STARTED',
        runId: 'run-1',
        threadId: 'thread-1',
        timestamp: Date.now(),
      },
      {
        type: 'RUN_FINISHED',
        runId: 'run-1',
        threadId: 'thread-1',
        timestamp: Date.now(),
        metadata: { tanstack: { finishReason: 'stop' } },
      },
    ]

    const sseStream = toServerSentEventsStream(createMockStream(originalChunks))
    const parsedChunks = await parseSSEStream(sseStream)

    expect(parsedChunks.length).toBe(2)

    expect(parsedChunks[0]?.['type']).toBe('RUN_STARTED')
    expect((parsedChunks[0] as any)?.runId).toBe('run-1')

    expect(parsedChunks[1]?.['type']).toBe('RUN_FINISHED')
    expect(parsedChunks[1]).not.toHaveProperty('finishReason')
    expect((parsedChunks[1] as any)?.metadata?.tanstack?.finishReason).toBe(
      'stop',
    )
  })

  it('should preserve RUN_ERROR events', async () => {
    const originalChunks: Array<Record<string, unknown>> = [
      {
        type: 'RUN_ERROR',
        timestamp: Date.now(),
        message: 'Something went wrong',
        code: 'TEST_ERROR',
      },
    ]

    const sseStream = toServerSentEventsStream(createMockStream(originalChunks))
    const parsedChunks = await parseSSEStream(sseStream)

    expect(parsedChunks.length).toBe(1)
    expect(parsedChunks[0]?.['type']).toBe('RUN_ERROR')
    expect((parsedChunks[0] as any)?.message).toBe('Something went wrong')
    expect((parsedChunks[0] as any)?.code).toBe('TEST_ERROR')
    expect(parsedChunks[0]).not.toHaveProperty('error')
  })

  it('should preserve STEP_FINISHED events (thinking)', async () => {
    const originalChunks: Array<Record<string, unknown>> = [
      {
        type: 'STEP_STARTED',
        stepName: 'step-1',
        timestamp: Date.now(),
      },
      {
        type: 'STEP_FINISHED',
        stepName: 'step-1',
        timestamp: Date.now(),
      },
    ]

    const sseStream = toServerSentEventsStream(createMockStream(originalChunks))
    const parsedChunks = await parseSSEStream(sseStream)

    expect(parsedChunks.length).toBe(2)

    expect(parsedChunks[0]?.['type']).toBe('STEP_STARTED')
    expect((parsedChunks[0] as any)?.stepName).toBe('step-1')

    expect(parsedChunks[1]?.['type']).toBe('STEP_FINISHED')
    expect((parsedChunks[1] as any)?.stepName).toBe('step-1')
    expect(parsedChunks[1]).not.toHaveProperty('delta')
  })

  it('should preserve CUSTOM events', async () => {
    const originalChunks: Array<Record<string, unknown>> = [
      {
        type: 'CUSTOM',
        model: 'test',
        timestamp: Date.now(),
        name: 'tool-input-available',
        value: {
          toolCallId: 'tc-1',
          toolName: 'get_weather',
          input: { city: 'NYC', units: 'fahrenheit' },
        },
      },
      {
        type: 'CUSTOM',
        model: 'test',
        timestamp: Date.now(),
        name: 'approval-requested',
        value: {
          toolCallId: 'tc-2',
          toolName: 'delete_file',
          input: { path: '/tmp/file.txt' },
          approval: { id: 'approval-1' },
        },
      },
    ]

    const sseStream = toServerSentEventsStream(createMockStream(originalChunks))
    const parsedChunks = await parseSSEStream(sseStream)

    expect(parsedChunks.length).toBe(2)

    // Verify tool-input-available
    expect(parsedChunks[0]?.['type']).toBe('CUSTOM')
    expect((parsedChunks[0] as any)?.name).toBe('tool-input-available')
    expect((parsedChunks[0] as any)?.value?.toolCallId).toBe('tc-1')
    expect((parsedChunks[0] as any)?.value?.input?.city).toBe('NYC')

    // Verify approval-requested
    expect(parsedChunks[1]?.['type']).toBe('CUSTOM')
    expect((parsedChunks[1] as any)?.name).toBe('approval-requested')
    expect((parsedChunks[1] as any)?.value?.approval?.id).toBe('approval-1')
  })

  it('should preserve TEXT_MESSAGE_START/END events', async () => {
    const originalChunks: Array<Record<string, unknown>> = [
      {
        type: 'TEXT_MESSAGE_START',
        messageId: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        role: 'assistant',
      },
      {
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: 'Hello',
      },
      {
        type: 'TEXT_MESSAGE_END',
        messageId: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
      },
    ]

    const sseStream = toServerSentEventsStream(createMockStream(originalChunks))
    const parsedChunks = await parseSSEStream(sseStream)

    expect(parsedChunks.length).toBe(3)
    expect(parsedChunks[0]?.['type']).toBe('TEXT_MESSAGE_START')
    expect(parsedChunks[1]?.['type']).toBe('TEXT_MESSAGE_CONTENT')
    expect(parsedChunks[2]?.['type']).toBe('TEXT_MESSAGE_END')
  })

  it('should preserve complex mixed event sequence', async () => {
    const originalChunks: Array<Record<string, unknown>> = [
      {
        type: 'RUN_STARTED',
        runId: 'run-1',
        model: 'test',
        timestamp: Date.now(),
      },
      {
        type: 'TEXT_MESSAGE_START',
        messageId: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        role: 'assistant',
      },
      {
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: 'Let me help you.',
      },
      {
        type: 'TEXT_MESSAGE_END',
        messageId: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
      },
      {
        type: 'TOOL_CALL_START',
        toolCallId: 'tc-1',
        toolCallName: 'search',
        timestamp: Date.now(),
      },
      {
        type: 'TOOL_CALL_ARGS',
        toolCallId: 'tc-1',
        timestamp: Date.now(),
        delta: '{"query":"test"}',
      },
      {
        type: 'TOOL_CALL_END',
        toolCallId: 'tc-1',
        timestamp: Date.now(),
      },
      {
        type: 'CUSTOM',
        model: 'test',
        timestamp: Date.now(),
        name: 'tool-input-available',
        value: {
          toolCallId: 'tc-1',
          toolName: 'search',
          input: { query: 'test' },
        },
      },
      {
        type: 'RUN_FINISHED',
        runId: 'run-1',
        threadId: 'thread-1',
        timestamp: Date.now(),
        metadata: { tanstack: { finishReason: 'tool_calls' } },
      },
    ]

    const sseStream = toServerSentEventsStream(createMockStream(originalChunks))
    const parsedChunks = await parseSSEStream(sseStream)

    expect(parsedChunks.length).toBe(9)

    // Verify event types in order
    const expectedTypes = [
      'RUN_STARTED',
      'TEXT_MESSAGE_START',
      'TEXT_MESSAGE_CONTENT',
      'TEXT_MESSAGE_END',
      'TOOL_CALL_START',
      'TOOL_CALL_ARGS',
      'TOOL_CALL_END',
      'CUSTOM',
      'RUN_FINISHED',
    ]

    for (let i = 0; i < expectedTypes.length; i++) {
      expect(parsedChunks[i]?.['type']).toBe(expectedTypes[i])
    }
  })

  it('should preserve unicode and special characters', async () => {
    const originalChunks: Array<Record<string, unknown>> = [
      {
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: 'Hello 世界! 🌍 Special chars: <>&"\'\n\t',
        content: 'Hello 世界! 🌍 Special chars: <>&"\'\n\t',
      },
    ]

    const sseStream = toServerSentEventsStream(createMockStream(originalChunks))
    const parsedChunks = await parseSSEStream(sseStream)

    expect(parsedChunks.length).toBe(1)
    expect((parsedChunks[0] as any)?.delta).toBe(
      'Hello 世界! 🌍 Special chars: <>&"\'\n\t',
    )
  })
})

interface ParsedJsonRunBody {
  chunks: Array<Record<string, unknown>>
  offset?: string
  done: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** Parse a `toJsonResponse` body, failing loudly on a bad shape. */
async function readJsonBody(response: Response): Promise<ParsedJsonRunBody> {
  const value: unknown = await response.json()
  if (
    !isRecord(value) ||
    !Array.isArray(value.chunks) ||
    typeof value.done !== 'boolean'
  ) {
    throw new Error(`Not a JSON run body: ${JSON.stringify(value)}`)
  }
  const chunks = value.chunks.filter(isRecord)
  return typeof value.offset === 'string'
    ? { chunks, offset: value.offset, done: value.done }
    : { chunks, done: value.done }
}

/** A text delta as itself, any other chunk as `[TYPE]`. */
function label(chunk: Record<string, unknown> | StreamChunk): string {
  return chunk.type === EventType.TEXT_MESSAGE_CONTENT
    ? String(chunk.delta)
    : `[${String(chunk.type)}]`
}

function uniqueRunId(name: string): string {
  return `${name}-${crypto.randomUUID()}`
}

/** The producer side of a run's memory log (a POST with `?runId`). */
function producerLog(runId: string) {
  return memoryStream(
    new Request(`https://example.test/api/chat?runId=${runId}`, {
      method: 'POST',
    }),
  )
}

/** A resume request for a run's memory log (a GET with `?runId&offset`). */
function resumeLog(runId: string, offset: string) {
  return memoryStream(
    new Request(
      `https://example.test/api/chat?runId=${runId}&offset=${encodeURIComponent(offset)}`,
    ),
  )
}

function gate(): { promise: Promise<void>; release: () => void } {
  let release!: () => void
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  return { promise, release }
}

/** `RUN_STARTED`, `a`, then waits on `opened` before the rest. */
async function* runPausedAfterA(
  opened: Promise<void>,
  rest: { then: Array<StreamChunk>; error?: Error },
): AsyncGenerator<StreamChunk> {
  yield ev.runStarted()
  yield ev.textContent('a')
  await opened
  yield* rest.then
  if (rest.error) throw rest.error
}

async function loggedLabels(
  adapter: ReturnType<typeof producerLog>,
): Promise<Array<string>> {
  return (await adapter.snapshot()).map((entry) => label(entry.chunk))
}

describe('toJsonResponse', () => {
  it('sends a ChatResult as one done body, encoded like the NDJSON stream', async () => {
    const chunks: Array<StreamChunk> = [
      {
        type: EventType.TOOL_CALL_START,
        toolCallId: 'call-1',
        toolCallName: 'lookup',
        toolName: 'lookup',
        timestamp: 1,
      },
      {
        type: EventType.RUN_FINISHED,
        threadId: 'thread-1',
        runId: 'run-1',
        timestamp: 2,
        finishReason: 'stop',
        usage: {
          promptTokens: 3,
          completionTokens: 4,
          totalTokens: 7,
          cost: 0.01,
        },
      },
    ]

    const body = await readJsonBody(await toJsonResponse({ text: '', chunks }))

    expect(body.done).toBe(true)
    expect(body.offset).toBeUndefined()
    expect(body.chunks[0]).toEqual({
      type: 'TOOL_CALL_START',
      toolCallId: 'call-1',
      toolCallName: 'lookup',
      timestamp: 1,
    })
    expect(body.chunks[1]).not.toHaveProperty('finishReason')
    expect(body.chunks[1]).toMatchObject({
      metadata: { tanstack: { finishReason: 'stop', usage: { cost: 0.01 } } },
    })
    const ndjson = (await toHttpResponse(streamOf(chunks)).text())
      .trim()
      .split('\n')
      .map((line): unknown => JSON.parse(line))
    expect(body.chunks).toEqual(ndjson)
  })

  it('sets JSON headers that the caller can override', async () => {
    const response = await toJsonResponse(
      { text: '', chunks: [] },
      {
        status: 201,
        headers: { 'Cache-Control': 'private', 'X-Custom': 'yes' },
      },
    )

    expect(response.status).toBe(201)
    expect(response.headers.get('Content-Type')).toBe('application/json')
    expect(response.headers.get('Cache-Control')).toBe('private')
    expect(response.headers.get('X-Custom')).toBe('yes')
  })

  it('reads a stream to its end without durability', async () => {
    const body = await readJsonBody(
      await toJsonResponse(
        streamOf([ev.textContent('Hello'), ev.runFinished('stop')]),
      ),
    )

    expect(body.chunks.map(label)).toEqual(['Hello', '[RUN_FINISHED]'])
    expect(body.done).toBe(true)
    expect(body.offset).toBeUndefined()
  })

  it('turns a thrown error into a trailing RUN_ERROR', async () => {
    async function* failing(): AsyncGenerator<StreamChunk> {
      yield ev.textContent('partial')
      throw new Error('provider down')
    }

    const body = await readJsonBody(await toJsonResponse(failing()))

    expect(body.chunks.map(label)).toEqual(['partial', '[RUN_ERROR]'])
    expect(body.chunks[1]?.message).toBe('provider down')
    expect(body.done).toBe(true)
  })

  it('stops a run without durability when the request signal aborts', async () => {
    const opened = gate()
    const abortController = new AbortController()
    const request = new AbortController()

    const pending = toJsonResponse(
      runPausedAfterA(opened.promise, { then: [ev.textContent('b')] }),
      { abortController, signal: request.signal },
    )
    await new Promise((resolve) => setTimeout(resolve, 0))
    request.abort()
    const body = await readJsonBody(await pending)
    opened.release()

    expect(abortController.signal.aborted).toBe(true)
    expect(body.chunks.map(label)).toEqual(['[RUN_STARTED]', 'a'])
    expect(body.done).toBe(true)
  })

  it('rejects stream-only options for a ChatResult at compile time', () => {
    const result: ChatResult = { text: '', chunks: [] }
    const adapter = producerLog(uniqueRunId('json-types'))

    expectTypeOf(toJsonResponse(result)).toEqualTypeOf<Promise<Response>>()
    // @ts-expect-error durability needs a stream input
    void toJsonResponse(result, { durability: { adapter } })
  })
})

describe('toJsonResponse with durability', () => {
  it('appends a fresh run to the log and replies with the last offset', async () => {
    const adapter = producerLog(uniqueRunId('json-fresh'))

    const body = await readJsonBody(
      await toJsonResponse(
        streamOf([ev.runStarted(), ev.textContent('Hello'), ev.runFinished()]),
        { durability: { adapter } },
      ),
    )
    const logged = await adapter.snapshot()

    expect(body.chunks.map(label)).toEqual([
      '[CUSTOM]',
      '[RUN_STARTED]',
      'Hello',
      '[RUN_FINISHED]',
    ])
    expect(logged.map((entry) => label(entry.chunk))).toEqual([
      '[CUSTOM]',
      '[RUN_STARTED]',
      'Hello',
      '[RUN_FINISHED]',
    ])
    expect(body.offset).toBe(logged[3]?.offset)
    expect(body.done).toBe(true)
  })

  it('replies early after maxWaitMs, keeps the run going, and a resume returns the rest', async () => {
    const runId = uniqueRunId('json-partial')
    const adapter = producerLog(runId)
    const opened = gate()

    const first = await readJsonBody(
      await toJsonResponse(
        runPausedAfterA(opened.promise, {
          then: [ev.textContent('b')],
          error: new Error('late failure'),
        }),
        { durability: { adapter, batch: 1 }, maxWaitMs: 50 },
      ),
    )
    opened.release()
    await vi.waitFor(async () => {
      expect(await loggedLabels(adapter)).toEqual([
        '[CUSTOM]',
        '[RUN_STARTED]',
        'a',
        'b',
        '[RUN_ERROR]',
      ])
    })
    const logged = await adapter.snapshot()

    expect(first.chunks.map(label)).toEqual(['[CUSTOM]', '[RUN_STARTED]', 'a'])
    expect(first.offset).toBe(logged[2]?.offset)
    expect(first.done).toBe(false)

    const rest = await readJsonBody(
      await resumeJsonResponse({
        adapter: resumeLog(runId, first.offset ?? ''),
      }),
    )

    expect(rest.chunks.map(label)).toEqual(['b', '[RUN_ERROR]'])
    expect(rest.chunks[1]?.message).toBe('late failure')
    expect(rest.offset).toBe(logged[4]?.offset)
    expect(rest.done).toBe(true)
  })

  it('tells the run its viewer left on a signal abort, without stopping it', async () => {
    const adapter = producerLog(uniqueRunId('json-detach'))
    const opened = gate()
    const request = new AbortController()
    let disconnects = 0
    const stream = runPausedAfterA(opened.promise, {
      then: [ev.textContent('b'), ev.runFinished()],
    })
    publishRunDisconnectHandler(stream, () => {
      disconnects += 1
    })

    const pending = toJsonResponse(stream, {
      durability: { adapter, batch: 1 },
      signal: request.signal,
    })
    await vi.waitFor(async () => {
      expect(await loggedLabels(adapter)).toHaveLength(3)
    })
    request.abort()
    const body = await readJsonBody(await pending)
    opened.release()

    expect(body.done).toBe(false)
    expect(disconnects).toBe(1)
    await vi.waitFor(async () => {
      expect(await loggedLabels(adapter)).toEqual([
        '[CUSTOM]',
        '[RUN_STARTED]',
        'a',
        'b',
        '[RUN_FINISHED]',
      ])
    })
  })
})

describe('resumeJsonResponse', () => {
  it('returns 400 when the request has no resume offset', async () => {
    const response = await resumeJsonResponse({
      adapter: producerLog(uniqueRunId('json-no-offset')),
    })

    expect(response.status).toBe(400)
  })

  it('replies done: false after maxWaitMs while the run is still going', async () => {
    const runId = uniqueRunId('json-open')
    const adapter = producerLog(runId)
    const opened = gate()
    const producing = toJsonResponse(
      runPausedAfterA(opened.promise, { then: [ev.runFinished()] }),
      { durability: { adapter, batch: 1 } },
    )
    await vi.waitFor(async () => {
      expect(await loggedLabels(adapter)).toHaveLength(3)
    })
    const lastOffset = (await adapter.snapshot())[2]?.offset ?? ''

    const fromStart = await readJsonBody(
      await resumeJsonResponse({
        adapter: resumeLog(runId, '-1'),
        maxWaitMs: 20,
      }),
    )
    const caughtUp = await readJsonBody(
      await resumeJsonResponse({
        adapter: resumeLog(runId, lastOffset),
        maxWaitMs: 20,
      }),
    )
    opened.release()
    const produced = await readJsonBody(await producing)

    expect(fromStart.offset).toBe(lastOffset)
    expect(fromStart.done).toBe(false)
    expect(fromStart.chunks.map(label)).toEqual([
      '[CUSTOM]',
      '[RUN_STARTED]',
      'a',
    ])
    expect(caughtUp).toEqual({ chunks: [], offset: lastOffset, done: false })
    expect(produced.done).toBe(true)
  })

  it('starts the run driver and keeps it out of the Response init', async () => {
    const runId = uniqueRunId('json-driver')
    const request = new Request(
      `https://example.test/api/chat?runId=${runId}&offset=-1`,
    )
    const waitUntil = vi.fn()
    const driver: RunDriverOptions = {
      request,
      runs: new InMemoryRunStore(),
      locks: new InMemoryLockStore(),
      drive: () => streamOf([]),
      claim: (input, fn) =>
        fn({
          runId: input.runId,
          epoch: 1,
          signal: new AbortController().signal,
        }),
      pipe: () => Promise.resolve(),
      waitUntil,
    }
    const inits: Array<ResponseInit | undefined> = []
    const RealResponse = globalThis.Response
    class SpyResponse extends RealResponse {
      constructor(body?: BodyInit | null, init?: ResponseInit) {
        inits.push(init)
        super(body, init)
      }
    }

    globalThis.Response = SpyResponse
    try {
      await resumeJsonResponse({
        adapter: memoryStream(request),
        driver,
        maxWaitMs: 20,
      })
    } finally {
      globalThis.Response = RealResponse
    }

    expect(waitUntil).toHaveBeenCalledTimes(1)
    expect(inits).toHaveLength(1)
    expect(inits[0]).not.toHaveProperty('driver')
  })
})

describe('JSON maxWaitMs validation', () => {
  it('rejects an invalid maxWaitMs before reading the run', async () => {
    const runId = uniqueRunId('json-invalid-wait')
    let started = false
    async function* run(): AsyncGenerator<StreamChunk> {
      started = true
      yield ev.runFinished()
    }

    await expect(
      toJsonResponse(run(), {
        durability: { adapter: producerLog(runId) },
        maxWaitMs: -1,
      }),
    ).rejects.toThrow(
      'Invalid maxWaitMs: -1. Must be a number from 0 to 2147483647.',
    )
    await expect(
      resumeJsonResponse({
        adapter: resumeLog(runId, '-1'),
        maxWaitMs: Number.POSITIVE_INFINITY,
      }),
    ).rejects.toThrow(
      'Invalid maxWaitMs: Infinity. Must be a number from 0 to 2147483647.',
    )
    expect(started).toBe(false)
  })
})
