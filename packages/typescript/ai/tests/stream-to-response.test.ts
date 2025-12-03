import { describe, it, expect, vi } from 'vitest'
import {
  toServerSentEventsStream,
  toStreamResponse,
} from '../src/utilities/stream-to-response'
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
        type: 'content',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: 'Hello',
        content: 'Hello',
        role: 'assistant',
      },
      {
        type: 'content',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: ' world',
        content: 'Hello world',
        role: 'assistant',
      },
    ]

    const stream = createMockStream(chunks)
    const sseStream = toServerSentEventsStream(stream)
    const output = await readStream(sseStream)

    expect(output).toContain('data: ')
    expect(output).toContain('"type":"content"')
    expect(output).toContain('\n\n')
    expect(output).toContain('data: [DONE]\n\n')
  })

  it('should format each chunk with data: prefix', async () => {
    const chunks: Array<StreamChunk> = [
      {
        type: 'content',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: 'Test',
        content: 'Test',
        role: 'assistant',
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
        type: 'content',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: 'Test',
        content: 'Test',
        role: 'assistant',
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

  it('should handle tool call chunks', async () => {
    const chunks: Array<StreamChunk> = [
      {
        type: 'tool_call',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        toolCall: {
          id: 'call-1',
          type: 'function',
          function: { name: 'getWeather', arguments: '{}' },
        },
        index: 0,
      },
    ]

    const stream = createMockStream(chunks)
    const sseStream = toServerSentEventsStream(stream)
    const output = await readStream(sseStream)

    expect(output).toContain('"type":"tool_call"')
    expect(output).toContain('"name":"getWeather"')
    expect(output).toContain('data: [DONE]\n\n')
  })

  it('should handle done chunks', async () => {
    const chunks: Array<StreamChunk> = [
      {
        type: 'done',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        finishReason: 'stop',
      },
    ]

    const stream = createMockStream(chunks)
    const sseStream = toServerSentEventsStream(stream)
    const output = await readStream(sseStream)

    expect(output).toContain('"type":"done"')
    expect(output).toContain('"finishReason":"stop"')
    expect(output).toContain('data: [DONE]\n\n')
  })

  it('should handle error chunks', async () => {
    const chunks: Array<StreamChunk> = [
      {
        type: 'error',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        error: { message: 'Test error' },
      },
    ]

    const stream = createMockStream(chunks)
    const sseStream = toServerSentEventsStream(stream)
    const output = await readStream(sseStream)

    expect(output).toContain('"type":"error"')
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
        type: 'content',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: 'Test',
        content: 'Test',
        role: 'assistant',
      },
    ]

    const stream = createMockStream(chunks)
    const sseStream = toServerSentEventsStream(stream, abortController)

    // Abort immediately
    abortController.abort()

    const output = await readStream(sseStream)

    // Should not have processed chunks after abort
    expect(output).not.toContain('"type":"content"')
  })

  it('should handle stream errors and send error chunk', async () => {
    async function* errorStream(): AsyncGenerator<StreamChunk> {
      yield {
        type: 'content',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: 'Test',
        content: 'Test',
        role: 'assistant',
      }
      throw new Error('Stream error')
    }

    const sseStream = toServerSentEventsStream(errorStream())
    const output = await readStream(sseStream)

    expect(output).toContain('"type":"error"')
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
    expect(output).not.toContain('"type":"error"')
  })

  it('should handle cancel and abort underlying stream', async () => {
    const abortController = new AbortController()
    const abortSpy = vi.spyOn(abortController, 'abort')

    const chunks: Array<StreamChunk> = [
      {
        type: 'content',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: 'Test',
        content: 'Test',
        role: 'assistant',
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
        type: 'content',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: 'Hello',
        content: 'Hello',
        role: 'assistant',
      },
      {
        type: 'tool_call',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        toolCall: {
          id: 'call-1',
          type: 'function',
          function: { name: 'getWeather', arguments: '{}' },
        },
        index: 0,
      },
      {
        type: 'done',
        id: 'msg-1',
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

describe('toStreamResponse', () => {
  it('should create Response with SSE headers', async () => {
    const chunks: Array<StreamChunk> = [
      {
        type: 'content',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: 'Test',
        content: 'Test',
        role: 'assistant',
      },
    ]

    const stream = createMockStream(chunks)
    const response = toStreamResponse(stream)

    expect(response).toBeInstanceOf(Response)
    expect(response.headers.get('Content-Type')).toBe('text/event-stream')
    expect(response.headers.get('Cache-Control')).toBe('no-cache')
    expect(response.headers.get('Connection')).toBe('keep-alive')
  })

  it('should allow custom headers', async () => {
    const chunks: Array<StreamChunk> = []
    const stream = createMockStream(chunks)
    const response = toStreamResponse(stream, {
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
    const response = toStreamResponse(stream, {
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
        type: 'content',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: 'Test',
        content: 'Test',
        role: 'assistant',
      },
    ]

    const stream = createMockStream(chunks)
    const response = toStreamResponse(stream, {
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
    const response = toStreamResponse(stream, {
      status: 201,
      statusText: 'Created',
    })

    expect(response.status).toBe(201)
    expect(response.statusText).toBe('Created')
  })

  it('should stream chunks correctly through Response', async () => {
    const chunks: Array<StreamChunk> = [
      {
        type: 'content',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: 'Hello',
        content: 'Hello',
        role: 'assistant',
      },
      {
        type: 'content',
        id: 'msg-1',
        model: 'test',
        timestamp: Date.now(),
        delta: ' world',
        content: 'Hello world',
        role: 'assistant',
      },
    ]

    const stream = createMockStream(chunks)
    const response = toStreamResponse(stream)

    if (!response.body) {
      throw new Error('Response body is null')
    }

    const output = await readStream(response.body)

    expect(output).toContain('data: ')
    expect(output).toContain('"type":"content"')
    expect(output).toContain('"delta":"Hello"')
    expect(output).toContain('"delta":" world"')
    expect(output).toContain('data: [DONE]\n\n')
  })

  it('should handle undefined init parameter', async () => {
    const chunks: Array<StreamChunk> = []
    const stream = createMockStream(chunks)
    const response = toStreamResponse(stream, undefined)

    expect(response).toBeInstanceOf(Response)
    expect(response.headers.get('Content-Type')).toBe('text/event-stream')
  })

  it('should handle empty init object', async () => {
    const chunks: Array<StreamChunk> = []
    const stream = createMockStream(chunks)
    const response = toStreamResponse(stream, {})

    expect(response).toBeInstanceOf(Response)
    expect(response.headers.get('Content-Type')).toBe('text/event-stream')
  })
})
