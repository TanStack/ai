import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  trace,
  context,
  SpanKind,
  SpanStatusCode,
  type Span,
  type Tracer,
} from '@opentelemetry/api'
import { aiEventClient } from '@tanstack/ai/event-client'
import {
  TanStackAIInstrumentation,
  enableOpenTelemetry,
  disableOpenTelemetry,
  GenAIAttributes,
} from '../src'

// Mock span
function createMockSpan(): Span & {
  attributes: Record<string, unknown>
  status: { code: SpanStatusCode; message?: string }
  ended: boolean
  endTime?: Date
  exceptions: Array<Error>
} {
  const mock_span = {
    attributes: {} as Record<string, unknown>,
    status: { code: SpanStatusCode.UNSET } as { code: SpanStatusCode; message?: string },
    ended: false,
    endTime: undefined as Date | undefined,
    exceptions: [] as Array<Error>,

    setAttribute(key: string, value: unknown) {
      this.attributes[key] = value
      return this
    },
    setAttributes(attrs: Record<string, unknown>) {
      Object.assign(this.attributes, attrs)
      return this
    },
    setStatus(status: { code: SpanStatusCode; message?: string }) {
      this.status = status
      return this
    },
    end(time?: Date) {
      this.ended = true
      this.endTime = time
    },
    recordException(error: Error) {
      this.exceptions.push(error)
    },
    addEvent: vi.fn(),
    isRecording: () => true,
    updateName: vi.fn(),
    spanContext: () => ({
      traceId: 'test-trace-id',
      spanId: 'test-span-id',
      traceFlags: 1,
    }),
    addLink: vi.fn(),
    addLinks: vi.fn(),
  }
  return mock_span
}

// Mock tracer
function createMockTracer(): Tracer & { spans: Array<ReturnType<typeof createMockSpan>> } {
  const spans: Array<ReturnType<typeof createMockSpan>> = []

  return {
    spans,
    startSpan(name: string, options?: any) {
      const span = createMockSpan()
      span.setAttribute('span.name', name)
      if (options?.attributes) {
        span.setAttributes(options.attributes)
      }
      spans.push(span)
      return span
    },
    startActiveSpan: vi.fn(),
  }
}

describe('TanStackAIInstrumentation', () => {
  let instrumentation: TanStackAIInstrumentation | null = null
  let mock_tracer: ReturnType<typeof createMockTracer>

  beforeEach(() => {
    // Always start with clean state
    disableOpenTelemetry()
    mock_tracer = createMockTracer()
    instrumentation = new TanStackAIInstrumentation({
      tracer: mock_tracer,
      recordContent: true,
      recordToolCalls: true,
    })
  })

  afterEach(() => {
    if (instrumentation) {
      instrumentation.disable()
      instrumentation = null
    }
    disableOpenTelemetry()
  })

  describe('enable/disable', () => {
    it('should not create spans when disabled', () => {
      // Don't enable instrumentation
      aiEventClient.emit('chat:started', {
        requestId: 'req-1',
        streamId: 'stream-1',
        provider: 'openai',
        model: 'gpt-4o',
        messageCount: 1,
        hasTools: false,
        streaming: true,
        timestamp: Date.now(),
      })

      expect(mock_tracer.spans.length).toBe(0)
    })

    it('should create spans when enabled', () => {
      instrumentation.enable()

      aiEventClient.emit('chat:started', {
        requestId: 'req-1',
        streamId: 'stream-1',
        provider: 'openai',
        model: 'gpt-4o',
        messageCount: 1,
        hasTools: false,
        streaming: true,
        timestamp: Date.now(),
      })

      expect(mock_tracer.spans.length).toBe(1)
    })

    it('should be idempotent when enabling multiple times', () => {
      instrumentation!.enable()
      instrumentation!.enable() // Should not throw or double-subscribe

      // Just one span should be created
      aiEventClient.emit('chat:started', {
        requestId: 'req-idempotent',
        streamId: 'stream-idempotent',
        provider: 'openai',
        model: 'gpt-4o',
        messageCount: 1,
        hasTools: false,
        streaming: true,
        timestamp: Date.now(),
      })

      // Only one span from our instrumentation
      expect(mock_tracer.spans.length).toBe(1)
    })
  })

  describe('chat:started event', () => {
    beforeEach(() => {
      instrumentation.enable()
    })

    it('should create a chat span with correct attributes', () => {
      const timestamp = Date.now()

      aiEventClient.emit('chat:started', {
        requestId: 'req-123',
        streamId: 'stream-456',
        provider: 'openai',
        model: 'gpt-4o',
        messageCount: 3,
        hasTools: true,
        streaming: true,
        timestamp,
        clientId: 'client-789',
        toolNames: ['get_weather', 'search'],
      })

      expect(mock_tracer.spans.length).toBe(1)
      const span = mock_tracer.spans[0]!

      expect(span.attributes['span.name']).toBe('chat gpt-4o')
      expect(span.attributes[GenAIAttributes.SYSTEM]).toBe('openai')
      expect(span.attributes[GenAIAttributes.REQUEST_MODEL]).toBe('gpt-4o')
      expect(span.attributes[GenAIAttributes.TANSTACK_REQUEST_ID]).toBe('req-123')
      expect(span.attributes[GenAIAttributes.TANSTACK_STREAM_ID]).toBe('stream-456')
      expect(span.attributes[GenAIAttributes.TANSTACK_MESSAGE_COUNT]).toBe(3)
      expect(span.attributes[GenAIAttributes.TANSTACK_HAS_TOOLS]).toBe(true)
      expect(span.attributes[GenAIAttributes.TANSTACK_STREAMING]).toBe(true)
      expect(span.attributes[GenAIAttributes.TANSTACK_CLIENT_ID]).toBe('client-789')
      expect(span.attributes['gen_ai.request.tool_names']).toBe('get_weather,search')
    })
  })

  describe('chat:completed event', () => {
    beforeEach(() => {
      instrumentation.enable()
    })

    it('should end the chat span with usage data', () => {
      const start_time = Date.now()
      const end_time = start_time + 1000

      // Start chat
      aiEventClient.emit('chat:started', {
        requestId: 'req-123',
        streamId: 'stream-456',
        provider: 'openai',
        model: 'gpt-4o',
        messageCount: 1,
        hasTools: false,
        streaming: true,
        timestamp: start_time,
      })

      // Complete chat
      aiEventClient.emit('chat:completed', {
        requestId: 'req-123',
        streamId: 'stream-456',
        model: 'gpt-4o',
        content: 'Hello! How can I help you?',
        finishReason: 'stop',
        usage: {
          promptTokens: 10,
          completionTokens: 20,
          totalTokens: 30,
        },
        timestamp: end_time,
      })

      const span = mock_tracer.spans[0]!

      expect(span.attributes[GenAIAttributes.RESPONSE_MODEL]).toBe('gpt-4o')
      expect(span.attributes[GenAIAttributes.RESPONSE_FINISH_REASONS]).toBe('stop')
      expect(span.attributes[GenAIAttributes.USAGE_INPUT_TOKENS]).toBe(10)
      expect(span.attributes[GenAIAttributes.USAGE_OUTPUT_TOKENS]).toBe(20)
      expect(span.attributes[GenAIAttributes.USAGE_TOTAL_TOKENS]).toBe(30)
      expect(span.attributes['gen_ai.response.content']).toBe('Hello! How can I help you?')
      expect(span.status.code).toBe(SpanStatusCode.OK)
      expect(span.ended).toBe(true)
    })
  })

  describe('stream events', () => {
    beforeEach(() => {
      instrumentation.enable()
    })

    it('should create and end stream span', () => {
      const start_time = Date.now()
      const end_time = start_time + 500

      aiEventClient.emit('stream:started', {
        streamId: 'stream-123',
        model: 'gpt-4o',
        provider: 'openai',
        timestamp: start_time,
      })

      aiEventClient.emit('stream:ended', {
        requestId: 'req-123',
        streamId: 'stream-123',
        totalChunks: 42,
        duration: 500,
        timestamp: end_time,
      })

      expect(mock_tracer.spans.length).toBe(1)
      const span = mock_tracer.spans[0]!

      expect(span.attributes['span.name']).toBe('stream gpt-4o')
      expect(span.attributes['tanstack_ai.stream.total_chunks']).toBe(42)
      expect(span.attributes['tanstack_ai.stream.duration_ms']).toBe(500)
      expect(span.status.code).toBe(SpanStatusCode.OK)
      expect(span.ended).toBe(true)
    })

    it('should record error on stream:chunk:error', () => {
      aiEventClient.emit('stream:started', {
        streamId: 'stream-123',
        model: 'gpt-4o',
        provider: 'openai',
        timestamp: Date.now(),
      })

      aiEventClient.emit('stream:chunk:error', {
        streamId: 'stream-123',
        error: 'Rate limit exceeded',
        timestamp: Date.now(),
      })

      const span = mock_tracer.spans[0]!

      expect(span.status.code).toBe(SpanStatusCode.ERROR)
      expect(span.status.message).toBe('Rate limit exceeded')
      expect(span.exceptions.length).toBe(1)
      expect(span.exceptions[0]!.message).toBe('Rate limit exceeded')
    })
  })

  describe('tool events', () => {
    beforeEach(() => {
      instrumentation.enable()
    })

    it('should create tool span on tool call', () => {
      // First create a stream span as parent
      aiEventClient.emit('stream:started', {
        streamId: 'stream-123',
        model: 'gpt-4o',
        provider: 'openai',
        timestamp: Date.now(),
      })

      aiEventClient.emit('stream:chunk:tool-call', {
        streamId: 'stream-123',
        toolCallId: 'tool-call-1',
        toolName: 'get_weather',
        index: 0,
        arguments: '{"location": "Tokyo"}',
        timestamp: Date.now(),
      })

      // Should have stream span + tool span
      expect(mock_tracer.spans.length).toBe(2)
      const tool_span = mock_tracer.spans[1]!

      expect(tool_span.attributes['span.name']).toBe('tool get_weather')
      expect(tool_span.attributes[GenAIAttributes.TOOL_NAME]).toBe('get_weather')
      expect(tool_span.attributes[GenAIAttributes.TOOL_CALL_ID]).toBe('tool-call-1')
      expect(tool_span.attributes['gen_ai.tool.index']).toBe(0)
      expect(tool_span.attributes['gen_ai.tool.arguments']).toBe('{"location": "Tokyo"}')
    })

    it('should end tool span on completion', () => {
      aiEventClient.emit('stream:started', {
        streamId: 'stream-123',
        model: 'gpt-4o',
        provider: 'openai',
        timestamp: Date.now(),
      })

      aiEventClient.emit('stream:chunk:tool-call', {
        streamId: 'stream-123',
        toolCallId: 'tool-call-1',
        toolName: 'get_weather',
        index: 0,
        arguments: '{"location": "Tokyo"}',
        timestamp: Date.now(),
      })

      aiEventClient.emit('tool:call-completed', {
        requestId: 'req-123',
        streamId: 'stream-123',
        toolCallId: 'tool-call-1',
        toolName: 'get_weather',
        result: { temperature: 25, condition: 'sunny' },
        duration: 150,
        timestamp: Date.now(),
      })

      const tool_span = mock_tracer.spans[1]!

      expect(tool_span.attributes['gen_ai.tool.duration_ms']).toBe(150)
      expect(tool_span.attributes['gen_ai.tool.result']).toBe(
        '{"temperature":25,"condition":"sunny"}',
      )
      expect(tool_span.status.code).toBe(SpanStatusCode.OK)
      expect(tool_span.ended).toBe(true)
    })
  })

  describe('recordContent option', () => {
    it('should not record content when recordContent is false', () => {
      const no_content_instrumentation = new TanStackAIInstrumentation({
        tracer: mock_tracer,
        recordContent: false,
      })
      no_content_instrumentation.enable()

      aiEventClient.emit('chat:started', {
        requestId: 'req-123',
        streamId: 'stream-456',
        provider: 'openai',
        model: 'gpt-4o',
        messageCount: 1,
        hasTools: false,
        streaming: true,
        timestamp: Date.now(),
      })

      aiEventClient.emit('chat:completed', {
        requestId: 'req-123',
        streamId: 'stream-456',
        model: 'gpt-4o',
        content: 'Secret content',
        timestamp: Date.now(),
      })

      const span = mock_tracer.spans[0]!
      expect(span.attributes['gen_ai.response.content']).toBeUndefined()

      no_content_instrumentation.disable()
    })
  })

  describe('enableOpenTelemetry helper', () => {
    beforeEach(() => {
      // Disable the default instrumentation from the outer beforeEach
      if (instrumentation) {
        instrumentation.disable()
        instrumentation = null
      }
    })

    it('should create and enable instrumentation', () => {
      const local_tracer = createMockTracer()
      const inst = enableOpenTelemetry({ tracer: local_tracer })

      aiEventClient.emit('chat:started', {
        requestId: 'req-helper-1',
        streamId: 'stream-helper-1',
        provider: 'openai',
        model: 'gpt-4o',
        messageCount: 1,
        hasTools: false,
        streaming: true,
        timestamp: Date.now(),
      })

      expect(local_tracer.spans.length).toBe(1)
      inst.disable()
    })

    it('should return an instrumentation instance that can be disabled', () => {
      const local_tracer = createMockTracer()
      const inst = enableOpenTelemetry({ tracer: local_tracer })

      // Verify it returns a valid instrumentation
      expect(inst).toBeInstanceOf(TanStackAIInstrumentation)

      // Disable should not throw
      expect(() => inst.disable()).not.toThrow()
    })
  })
})
