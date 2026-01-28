import { describe, it, expect, vi } from 'vitest'
import {
  toServerSentEventsStream,
  toServerSentEventsResponse,
} from '../src/stream-to-response'
import type { StreamChunk } from '../src/types'

// Helper to create mock async iterable
async function* createMockStream(
  chunks: Array<StreamChunk>,
): AsyncGenerator<StreamChunk> {
  for (const chunk of chunks) {
    yield chunk
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

describe('toServerSentEventsStream', () => {
  it('should convert chunks to SSE format', async () => {
    const chunks: Array<StreamChunk> = [
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
    expect(output).toContain('data: [DONE]\n\n')
  })

  it('should format each chunk with data: prefix', async () => {
    const chunks: Array<StreamChunk> = [
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
    expect(lines[lines.length - 1]).toBe('data: [DONE]')
  })

  it('should end with [DONE] marker', async () => {
    const chunks: Array<StreamChunk> = [
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

    // Should end with [DONE] marker followed by newlines
    expect(output).toContain('data: [DONE]')
    const doneIndex = output.lastIndexOf('data: [DONE]')
    const afterDone = output.slice(doneIndex)
    expect(afterDone).toBe('data: [DONE]\n\n')
  })

  it('should handle tool call events', async () => {
    const chunks: Array<StreamChunk> = [
      {
        type: 'TOOL_CALL_START',
        toolCallId: 'call-1',
        toolName: 'getWeather',
        model: 'test',
        timestamp: Date.now(),
        index: 0,
      },
    ]

    const stream = createMockStream(chunks)
    const sseStream = toServerSentEventsStream(stream)
    const output = await readStream(sseStream)

    expect(output).toContain('"type":"TOOL_CALL_START"')
    expect(output).toContain('"toolName":"getWeather"')
    expect(output).toContain('data: [DONE]\n\n')
  })

  it('should handle RUN_FINISHED events', async () => {
    const chunks: Array<StreamChunk> = [
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

    expect(output).toContain('"type":"RUN_FINISHED"')
    expect(output).toContain('"finishReason":"stop"')
    expect(output).toContain('data: [DONE]\n\n')
  })

  it('should handle RUN_ERROR events', async () => {
    const chunks: Array<StreamChunk> = [
      {
        type: 'RUN_ERROR',
        runId: 'run-1',
        model: 'test',
        timestamp: Date.now(),
        error: { message: 'Test error' },
      },
    ]

    const stream = createMockStream(chunks)
    const sseStream = toServerSentEventsStream(stream)
    const output = await readStream(sseStream)

    expect(output).toContain('"type":"RUN_ERROR"')
    expect(output).toContain('data: [DONE]\n\n')
  })

  it('should handle empty stream', async () => {
    const stream = createMockStream([])
    const sseStream = toServerSentEventsStream(stream)
    const output = await readStream(sseStream)

    expect(output).toBe('data: [DONE]\n\n')
  })

  it('should abort when abortController signals abort', async () => {
    const abortController = new AbortController()
    const chunks: Array<StreamChunk> = [
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
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: 'Test',
        content: 'Test',
      }
      throw new Error('Stream error')
    }

    const sseStream = toServerSentEventsStream(errorStream())
    const output = await readStream(sseStream)

    expect(output).toContain('"type":"RUN_ERROR"')
    expect(output).toContain('"message":"Stream error"')
  })

  it('should not send error if aborted', async () => {
    const abortController = new AbortController()

    async function* errorStream(): AsyncGenerator<StreamChunk> {
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

    const chunks: Array<StreamChunk> = [
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
    const chunks: Array<StreamChunk> = [
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
        toolName: 'getWeather',
        model: 'test',
        timestamp: Date.now(),
        index: 0,
      },
      {
        type: 'RUN_FINISHED',
        runId: 'run-1',
        model: 'test',
        timestamp: Date.now(),
        finishReason: 'tool_calls',
      },
    ]

    const stream = createMockStream(chunks)
    const sseStream = toServerSentEventsStream(stream)
    const output = await readStream(sseStream)

    const dataLines = output
      .split('\n\n')
      .filter((line) => line.startsWith('data: '))
    expect(dataLines.length).toBeGreaterThanOrEqual(3) // At least 3 chunks + [DONE]
    expect(output).toContain('data: [DONE]\n\n')
  })
})

describe('toServerSentEventsResponse', () => {
  it('should create Response with SSE headers', async () => {
    const chunks: Array<StreamChunk> = [
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
    const chunks: Array<StreamChunk> = []
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
    const chunks: Array<StreamChunk> = []
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
    const chunks: Array<StreamChunk> = [
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
    const chunks: Array<StreamChunk> = []
    const stream = createMockStream(chunks)
    const response = toServerSentEventsResponse(stream, {
      status: 201,
      statusText: 'Created',
    })

    expect(response.status).toBe(201)
    expect(response.statusText).toBe('Created')
  })

  it('should stream chunks correctly through Response', async () => {
    const chunks: Array<StreamChunk> = [
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
    expect(output).toContain('data: [DONE]\n\n')
  })

  it('should handle undefined init parameter', async () => {
    const chunks: Array<StreamChunk> = []
    const stream = createMockStream(chunks)
    const response = toServerSentEventsResponse(stream, undefined)

    expect(response).toBeInstanceOf(Response)
    expect(response.headers.get('Content-Type')).toBe('text/event-stream')
  })

  it('should handle empty init object', async () => {
    const chunks: Array<StreamChunk> = []
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
  ): Promise<Array<StreamChunk>> {
    const reader = sseStream.getReader()
    const decoder = new TextDecoder()
    const chunks: Array<StreamChunk> = []
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
    const originalChunks: Array<StreamChunk> = [
      {
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'msg-1',
        model: 'test-model',
        timestamp: 1234567890,
        delta: 'Hello',
        content: 'Hello',
      },
      {
        type: 'TEXT_MESSAGE_CONTENT',
        messageId: 'msg-1',
        model: 'test-model',
        timestamp: 1234567891,
        delta: ' world',
        content: 'Hello world',
      },
    ]

    const sseStream = toServerSentEventsStream(createMockStream(originalChunks))
    const parsedChunks = await parseSSEStream(sseStream)

    expect(parsedChunks.length).toBe(2)

    for (let i = 0; i < originalChunks.length; i++) {
      const original = originalChunks[i]
      const parsed = parsedChunks[i]

      expect(parsed?.type).toBe(original?.type)
      expect((parsed as any)?.messageId).toBe((original as any)?.messageId)
      expect((parsed as any)?.delta).toBe((original as any)?.delta)
      expect((parsed as any)?.content).toBe((original as any)?.content)
    }
  })

  it('should preserve TOOL_CALL_* events', async () => {
    const originalChunks: Array<StreamChunk> = [
      {
        type: 'TOOL_CALL_START',
        toolCallId: 'tc-1',
        toolName: 'get_weather',
        model: 'test',
        timestamp: Date.now(),
        index: 0,
      },
      {
        type: 'TOOL_CALL_ARGS',
        toolCallId: 'tc-1',
        model: 'test',
        timestamp: Date.now(),
        delta: '{"city":"NYC"}',
      },
      {
        type: 'TOOL_CALL_END',
        toolCallId: 'tc-1',
        toolName: 'get_weather',
        model: 'test',
        timestamp: Date.now(),
      },
    ]

    const sseStream = toServerSentEventsStream(createMockStream(originalChunks))
    const parsedChunks = await parseSSEStream(sseStream)

    expect(parsedChunks.length).toBe(3)

    // Verify TOOL_CALL_START
    expect(parsedChunks[0]?.type).toBe('TOOL_CALL_START')
    expect((parsedChunks[0] as any)?.toolCallId).toBe('tc-1')
    expect((parsedChunks[0] as any)?.toolName).toBe('get_weather')
    expect((parsedChunks[0] as any)?.index).toBe(0)

    // Verify TOOL_CALL_ARGS
    expect(parsedChunks[1]?.type).toBe('TOOL_CALL_ARGS')
    expect((parsedChunks[1] as any)?.toolCallId).toBe('tc-1')
    expect((parsedChunks[1] as any)?.delta).toBe('{"city":"NYC"}')

    // Verify TOOL_CALL_END
    expect(parsedChunks[2]?.type).toBe('TOOL_CALL_END')
    expect((parsedChunks[2] as any)?.toolCallId).toBe('tc-1')
  })

  it('should preserve RUN_* events', async () => {
    const originalChunks: Array<StreamChunk> = [
      {
        type: 'RUN_STARTED',
        runId: 'run-1',
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

    const sseStream = toServerSentEventsStream(createMockStream(originalChunks))
    const parsedChunks = await parseSSEStream(sseStream)

    expect(parsedChunks.length).toBe(2)

    expect(parsedChunks[0]?.type).toBe('RUN_STARTED')
    expect((parsedChunks[0] as any)?.runId).toBe('run-1')

    expect(parsedChunks[1]?.type).toBe('RUN_FINISHED')
    expect((parsedChunks[1] as any)?.finishReason).toBe('stop')
  })

  it('should preserve RUN_ERROR events', async () => {
    const originalChunks: Array<StreamChunk> = [
      {
        type: 'RUN_ERROR',
        runId: 'run-1',
        model: 'test',
        timestamp: Date.now(),
        error: { message: 'Something went wrong', code: 'TEST_ERROR' },
      },
    ]

    const sseStream = toServerSentEventsStream(createMockStream(originalChunks))
    const parsedChunks = await parseSSEStream(sseStream)

    expect(parsedChunks.length).toBe(1)
    expect(parsedChunks[0]?.type).toBe('RUN_ERROR')
    expect((parsedChunks[0] as any)?.error?.message).toBe(
      'Something went wrong',
    )
    expect((parsedChunks[0] as any)?.error?.code).toBe('TEST_ERROR')
  })

  it('should preserve STEP_FINISHED events (thinking)', async () => {
    const originalChunks: Array<StreamChunk> = [
      {
        type: 'STEP_STARTED',
        stepId: 'step-1',
        model: 'test',
        timestamp: Date.now(),
      },
      {
        type: 'STEP_FINISHED',
        stepId: 'step-1',
        model: 'test',
        timestamp: Date.now(),
        delta: 'Let me think...',
        content: 'Let me think...',
      },
    ]

    const sseStream = toServerSentEventsStream(createMockStream(originalChunks))
    const parsedChunks = await parseSSEStream(sseStream)

    expect(parsedChunks.length).toBe(2)

    expect(parsedChunks[0]?.type).toBe('STEP_STARTED')
    expect((parsedChunks[0] as any)?.stepId).toBe('step-1')

    expect(parsedChunks[1]?.type).toBe('STEP_FINISHED')
    expect((parsedChunks[1] as any)?.delta).toBe('Let me think...')
  })

  it('should preserve CUSTOM events', async () => {
    const originalChunks: Array<StreamChunk> = [
      {
        type: 'CUSTOM',
        model: 'test',
        timestamp: Date.now(),
        name: 'tool-input-available',
        data: {
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
        data: {
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
    expect(parsedChunks[0]?.type).toBe('CUSTOM')
    expect((parsedChunks[0] as any)?.name).toBe('tool-input-available')
    expect((parsedChunks[0] as any)?.data?.toolCallId).toBe('tc-1')
    expect((parsedChunks[0] as any)?.data?.input?.city).toBe('NYC')

    // Verify approval-requested
    expect(parsedChunks[1]?.type).toBe('CUSTOM')
    expect((parsedChunks[1] as any)?.name).toBe('approval-requested')
    expect((parsedChunks[1] as any)?.data?.approval?.id).toBe('approval-1')
  })

  it('should preserve TEXT_MESSAGE_START/END events', async () => {
    const originalChunks: Array<StreamChunk> = [
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
    expect(parsedChunks[0]?.type).toBe('TEXT_MESSAGE_START')
    expect(parsedChunks[1]?.type).toBe('TEXT_MESSAGE_CONTENT')
    expect(parsedChunks[2]?.type).toBe('TEXT_MESSAGE_END')
  })

  it('should preserve complex mixed event sequence', async () => {
    const originalChunks: Array<StreamChunk> = [
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
        toolName: 'search',
        model: 'test',
        timestamp: Date.now(),
        index: 0,
      },
      {
        type: 'TOOL_CALL_ARGS',
        toolCallId: 'tc-1',
        model: 'test',
        timestamp: Date.now(),
        delta: '{"query":"test"}',
      },
      {
        type: 'TOOL_CALL_END',
        toolCallId: 'tc-1',
        toolName: 'search',
        model: 'test',
        timestamp: Date.now(),
      },
      {
        type: 'CUSTOM',
        model: 'test',
        timestamp: Date.now(),
        name: 'tool-input-available',
        data: {
          toolCallId: 'tc-1',
          toolName: 'search',
          input: { query: 'test' },
        },
      },
      {
        type: 'RUN_FINISHED',
        runId: 'run-1',
        model: 'test',
        timestamp: Date.now(),
        finishReason: 'tool_calls',
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
      expect(parsedChunks[i]?.type).toBe(expectedTypes[i])
    }
  })

  it('should preserve unicode and special characters', async () => {
    const originalChunks: Array<StreamChunk> = [
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
