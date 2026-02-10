import { describe, expect, it, vi } from 'vitest'
import { chat, createChatOptions } from '../src/activities/chat/index'
import type { AnyTextAdapter } from '../src/activities/chat/adapter'
import type { StreamChunk, Tool } from '../src/types'

// ============================================================================
// Helpers
// ============================================================================

/** Create a typed StreamChunk with minimal boilerplate. */
function chunk<T extends StreamChunk['type']>(
  type: T,
  fields: Omit<Extract<StreamChunk, { type: T }>, 'type' | 'timestamp'>,
): StreamChunk {
  return { type, timestamp: Date.now(), ...fields } as unknown as StreamChunk
}

/** Shorthand chunk factories for common AG-UI events. */
const ev = {
  runStarted: (runId = 'run-1') => chunk('RUN_STARTED', { runId }),
  textStart: (messageId = 'msg-1') =>
    chunk('TEXT_MESSAGE_START', { messageId, role: 'assistant' as const }),
  textContent: (delta: string, messageId = 'msg-1') =>
    chunk('TEXT_MESSAGE_CONTENT', { messageId, delta }),
  textEnd: (messageId = 'msg-1') => chunk('TEXT_MESSAGE_END', { messageId }),
  toolStart: (toolCallId: string, toolName: string, index?: number) =>
    chunk('TOOL_CALL_START', {
      toolCallId,
      toolName,
      ...(index !== undefined ? { index } : {}),
    }),
  toolArgs: (toolCallId: string, delta: string) =>
    chunk('TOOL_CALL_ARGS', { toolCallId, delta }),
  toolEnd: (
    toolCallId: string,
    toolName: string,
    opts?: { input?: unknown; result?: string },
  ) => chunk('TOOL_CALL_END', { toolCallId, toolName, ...opts }),
  runFinished: (
    finishReason:
      | 'stop'
      | 'length'
      | 'content_filter'
      | 'tool_calls'
      | null = 'stop',
    runId = 'run-1',
  ) => chunk('RUN_FINISHED', { runId, finishReason }),
  runError: (message: string, runId = 'run-1') =>
    chunk('RUN_ERROR', { runId, error: { message } }),
  stepFinished: (delta: string, stepId = 'step-1') =>
    chunk('STEP_FINISHED', { stepId, delta }),
}

/**
 * Create a mock adapter that satisfies AnyTextAdapter.
 * `chatStreamFn` receives the options and returns an AsyncIterable of chunks.
 * Multiple invocations can be tracked via the returned `calls` array.
 */
function createMockAdapter(options: {
  chatStreamFn?: (opts: any) => AsyncIterable<StreamChunk>
  /** Array of chunk sequences: chatStream returns iterations[0] on first call, iterations[1] on second, etc. */
  iterations?: Array<Array<StreamChunk>>
  structuredOutput?: (opts: any) => Promise<{ data: unknown; rawText: string }>
}) {
  const calls: Array<any> = []
  let callIndex = 0

  const adapter: AnyTextAdapter = {
    kind: 'text' as const,
    name: 'mock',
    model: 'test-model' as const,
    '~types': {
      providerOptions: {} as Record<string, any>,
      inputModalities: ['text'] as readonly ['text'],
      messageMetadataByModality: {
        text: undefined as unknown,
        image: undefined as unknown,
        audio: undefined as unknown,
        video: undefined as unknown,
        document: undefined as unknown,
      },
    },
    chatStream: (opts: any) => {
      calls.push(opts)

      if (options.chatStreamFn) {
        return options.chatStreamFn(opts)
      }

      if (options.iterations) {
        const chunks = options.iterations[callIndex] || []
        callIndex++
        return (async function* () {
          for (const c of chunks) yield c
        })()
      }

      return (async function* () {})()
    },
    structuredOutput:
      options.structuredOutput ?? (async () => ({ data: {}, rawText: '{}' })),
  }

  return { adapter, calls }
}

/** Collect all chunks from an async iterable. */
async function collectChunks(
  stream: AsyncIterable<StreamChunk>,
): Promise<Array<StreamChunk>> {
  const chunks: Array<StreamChunk> = []
  for await (const c of stream) {
    chunks.push(c)
  }
  return chunks
}

/** Simple server tool for testing. */
function serverTool(name: string, executeFn: (args: any) => any): Tool {
  return {
    name,
    description: `Test tool: ${name}`,
    execute: executeFn,
  }
}

/** Client tool (no execute function). */
function clientTool(name: string, opts?: { needsApproval?: boolean }): Tool {
  return {
    name,
    description: `Client tool: ${name}`,
    needsApproval: opts?.needsApproval,
  }
}

// ============================================================================
// Tests
// ============================================================================

describe('chat()', () => {
  // ==========================================================================
  // Streaming text (no tools)
  // ==========================================================================
  describe('streaming text (no tools)', () => {
    it('should return an async iterable that yields all adapter chunks', async () => {
      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.textStart(),
            ev.textContent('Hello'),
            ev.textContent(' world!'),
            ev.textEnd(),
            ev.runFinished('stop'),
          ],
        ],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
      })

      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)

      expect(chunks.length).toBe(6)
      expect(chunks[0]!.type).toBe('RUN_STARTED')
      expect(chunks[1]!.type).toBe('TEXT_MESSAGE_START')
      expect(chunks[2]!.type).toBe('TEXT_MESSAGE_CONTENT')
      expect(chunks[3]!.type).toBe('TEXT_MESSAGE_CONTENT')
      expect(chunks[4]!.type).toBe('TEXT_MESSAGE_END')
      expect(chunks[5]!.type).toBe('RUN_FINISHED')
    })

    it('should pass messages to the adapter', async () => {
      const { adapter, calls } = createMockAdapter({
        iterations: [
          [ev.runStarted(), ev.textContent('Hi'), ev.runFinished('stop')],
        ],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hello' }],
      })

      await collectChunks(stream as AsyncIterable<StreamChunk>)

      expect(calls).toHaveLength(1)
      expect(calls[0].messages).toBeDefined()
      expect(calls[0].messages[0].role).toBe('user')
    })

    it('should pass systemPrompts to the adapter', async () => {
      const { adapter, calls } = createMockAdapter({
        iterations: [[ev.runStarted(), ev.runFinished('stop')]],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hello' }],
        systemPrompts: ['You are a helpful assistant'],
      })

      await collectChunks(stream as AsyncIterable<StreamChunk>)

      expect(calls[0].systemPrompts).toEqual(['You are a helpful assistant'])
    })

    it('should pass temperature, topP, maxTokens to the adapter', async () => {
      const { adapter, calls } = createMockAdapter({
        iterations: [[ev.runStarted(), ev.runFinished('stop')]],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.5,
        topP: 0.9,
        maxTokens: 100,
      })

      await collectChunks(stream as AsyncIterable<StreamChunk>)

      expect(calls[0].temperature).toBe(0.5)
      expect(calls[0].topP).toBe(0.9)
      expect(calls[0].maxTokens).toBe(100)
    })
  })

  // ==========================================================================
  // Non-streaming text (stream: false)
  // ==========================================================================
  describe('non-streaming text (stream: false)', () => {
    it('should return a Promise<string> with collected text content', async () => {
      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.textStart(),
            ev.textContent('Hello'),
            ev.textContent(' world!'),
            ev.textEnd(),
            ev.runFinished('stop'),
          ],
        ],
      })

      const result = await chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        stream: false,
      })

      expect(result).toBe('Hello world!')
    })

    it('should still execute tools under the hood when stream: false', async () => {
      const executeSpy = vi.fn().mockReturnValue({ temp: 72 })

      const { adapter } = createMockAdapter({
        iterations: [
          // First call: tool call
          [
            ev.runStarted(),
            ev.toolStart('call_1', 'getWeather'),
            ev.toolArgs('call_1', '{"city":"NYC"}'),
            ev.runFinished('tool_calls'),
          ],
          // Second call: final text
          [
            ev.runStarted(),
            ev.textStart(),
            ev.textContent('72F in NYC'),
            ev.textEnd(),
            ev.runFinished('stop'),
          ],
        ],
      })

      const result = await chat({
        adapter,
        messages: [{ role: 'user', content: 'Weather in NYC?' }],
        tools: [serverTool('getWeather', executeSpy)],
        stream: false,
      })

      expect(executeSpy).toHaveBeenCalledTimes(1)
      expect(result).toBe('72F in NYC')
    })
  })

  // ==========================================================================
  // Server tool execution
  // ==========================================================================
  describe('server tool execution', () => {
    it('should execute server tools and yield TOOL_CALL_END with result', async () => {
      const executeSpy = vi.fn().mockReturnValue({ temp: 72 })

      const { adapter, calls } = createMockAdapter({
        iterations: [
          // First adapter call: model requests tool
          [
            ev.runStarted(),
            ev.textStart(),
            ev.textContent('Let me check.'),
            ev.textEnd(),
            ev.toolStart('call_1', 'getWeather'),
            ev.toolArgs('call_1', '{"city":"NYC"}'),
            ev.runFinished('tool_calls'),
          ],
          // Second adapter call: model produces final text
          [
            ev.runStarted(),
            ev.textStart(),
            ev.textContent('72F in NYC.'),
            ev.textEnd(),
            ev.runFinished('stop'),
          ],
        ],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Weather?' }],
        tools: [serverTool('getWeather', executeSpy)],
      })

      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)

      // Tool was executed
      expect(executeSpy).toHaveBeenCalledTimes(1)
      expect(executeSpy).toHaveBeenCalledWith({ city: 'NYC' })

      // A TOOL_CALL_END chunk with result should have been yielded
      const toolEndChunks = chunks.filter(
        (c) => c.type === 'TOOL_CALL_END' && 'result' in c && c.result,
      )
      expect(toolEndChunks.length).toBeGreaterThanOrEqual(1)

      // Adapter was called twice (tool call iteration + final text)
      expect(calls).toHaveLength(2)

      // Second call should have tool result in messages
      const secondCallMessages = calls[1].messages
      const toolResultMsg = secondCallMessages.find(
        (m: any) => m.role === 'tool',
      )
      expect(toolResultMsg).toBeDefined()
    })

    it('should handle tool execution errors gracefully', async () => {
      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.toolStart('call_1', 'failTool'),
            ev.toolArgs('call_1', '{}'),
            ev.runFinished('tool_calls'),
          ],
          [
            ev.runStarted(),
            ev.textStart(),
            ev.textContent('Error happened.'),
            ev.textEnd(),
            ev.runFinished('stop'),
          ],
        ],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Do something' }],
        tools: [
          serverTool('failTool', () => {
            throw new Error('Tool broke')
          }),
        ],
      })

      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)

      // Should still complete and yield the error result
      const toolEndChunks = chunks.filter(
        (c) => c.type === 'TOOL_CALL_END' && 'result' in c,
      )
      expect(toolEndChunks.length).toBeGreaterThanOrEqual(1)
      // Error should be in the result
      const resultStr = (toolEndChunks[0] as any).result
      expect(resultStr).toContain('error')
    })
  })

  // ==========================================================================
  // Parallel tool calls
  // ==========================================================================
  describe('parallel tool calls', () => {
    it('should execute multiple tool calls and yield all results', async () => {
      const weatherSpy = vi.fn().mockReturnValue({ temp: 72 })
      const timeSpy = vi.fn().mockReturnValue({ time: '3pm' })

      const { adapter, calls } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.toolStart('call_1', 'getWeather', 0),
            ev.toolStart('call_2', 'getTime', 1),
            ev.toolArgs('call_1', '{"city":"NYC"}'),
            ev.toolArgs('call_2', '{"tz":"EST"}'),
            ev.runFinished('tool_calls'),
          ],
          [
            ev.runStarted(),
            ev.textStart(),
            ev.textContent('72F, 3pm EST'),
            ev.textEnd(),
            ev.runFinished('stop'),
          ],
        ],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Weather and time?' }],
        tools: [
          serverTool('getWeather', weatherSpy),
          serverTool('getTime', timeSpy),
        ],
      })

      await collectChunks(stream as AsyncIterable<StreamChunk>)

      expect(weatherSpy).toHaveBeenCalledTimes(1)
      expect(timeSpy).toHaveBeenCalledTimes(1)

      // Second adapter call should have both tool results
      const secondCallMessages = calls[1].messages
      const toolResultMsgs = secondCallMessages.filter(
        (m: any) => m.role === 'tool',
      )
      expect(toolResultMsgs).toHaveLength(2)
    })
  })

  // ==========================================================================
  // Client tools (no execute)
  // ==========================================================================
  describe('client tools (no execute)', () => {
    it('should yield CUSTOM tool-input-available event for client tools', async () => {
      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.toolStart('call_1', 'clientSearch'),
            ev.toolArgs('call_1', '{"query":"test"}'),
            ev.runFinished('tool_calls'),
          ],
        ],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Search for test' }],
        tools: [clientTool('clientSearch')],
      })

      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)

      // Should yield a CUSTOM event for tool-input-available
      const customChunks = chunks.filter(
        (c) =>
          c.type === 'CUSTOM' && (c as any).name === 'tool-input-available',
      )
      expect(customChunks).toHaveLength(1)

      const data = (customChunks[0] as any).data
      expect(data.toolCallId).toBe('call_1')
      expect(data.toolName).toBe('clientSearch')
      expect(data.input).toEqual({ query: 'test' })
    })
  })

  // ==========================================================================
  // Approval flow
  // ==========================================================================
  describe('approval flow', () => {
    it('should yield CUSTOM approval-requested event for tools with needsApproval', async () => {
      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.toolStart('call_1', 'dangerousTool'),
            ev.toolArgs('call_1', '{"action":"delete"}'),
            ev.runFinished('tool_calls'),
          ],
        ],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Delete something' }],
        tools: [serverTool('dangerousTool', () => ({ ok: true }))].map((t) => ({
          ...t,
          needsApproval: true,
        })),
      })

      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)

      const approvalChunks = chunks.filter(
        (c) => c.type === 'CUSTOM' && (c as any).name === 'approval-requested',
      )
      expect(approvalChunks).toHaveLength(1)

      const data = (approvalChunks[0] as any).data
      expect(data.toolCallId).toBe('call_1')
      expect(data.toolName).toBe('dangerousTool')
      expect(data.approval.needsApproval).toBe(true)
    })

    it('should yield CUSTOM approval-requested for client tools with needsApproval', async () => {
      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.toolStart('call_1', 'clientDanger'),
            ev.toolArgs('call_1', '{}'),
            ev.runFinished('tool_calls'),
          ],
        ],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Do something' }],
        tools: [clientTool('clientDanger', { needsApproval: true })],
      })

      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)

      const approvalChunks = chunks.filter(
        (c) => c.type === 'CUSTOM' && (c as any).name === 'approval-requested',
      )
      expect(approvalChunks).toHaveLength(1)
    })
  })

  // ==========================================================================
  // Pending tool calls from messages
  // ==========================================================================
  describe('pending tool calls from messages', () => {
    it('should detect and execute pending tool calls from initial messages', async () => {
      const executeSpy = vi.fn().mockReturnValue({ temp: 72 })

      const { adapter, calls } = createMockAdapter({
        iterations: [
          // After pending tool is executed, the engine calls the adapter for the next response
          [
            ev.runStarted(),
            ev.textStart(),
            ev.textContent('72F in NYC'),
            ev.textEnd(),
            ev.runFinished('stop'),
          ],
        ],
      })

      const stream = chat({
        adapter,
        messages: [
          { role: 'user', content: 'Weather?' },
          {
            role: 'assistant',
            content: 'Let me check.',
            toolCalls: [
              {
                id: 'call_1',
                type: 'function' as const,
                function: { name: 'getWeather', arguments: '{"city":"NYC"}' },
              },
            ],
          },
          // No tool result message -> pending!
        ],
        tools: [serverTool('getWeather', executeSpy)],
      })

      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)

      // Tool should have been executed as pending
      expect(executeSpy).toHaveBeenCalledTimes(1)

      // TOOL_CALL_END with result should be in the stream
      const toolEndChunks = chunks.filter(
        (c) => c.type === 'TOOL_CALL_END' && 'result' in c && c.result,
      )
      expect(toolEndChunks.length).toBeGreaterThanOrEqual(1)

      // Adapter should have been called with the tool result in messages
      expect(calls).toHaveLength(1)
      const adapterMessages = calls[0].messages
      const toolMsg = adapterMessages.find((m: any) => m.role === 'tool')
      expect(toolMsg).toBeDefined()
    })

    it('should skip pending tool calls that already have results', async () => {
      const executeSpy = vi.fn().mockReturnValue({ temp: 72 })

      const { adapter, calls } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.textStart(),
            ev.textContent('Already answered.'),
            ev.textEnd(),
            ev.runFinished('stop'),
          ],
        ],
      })

      const stream = chat({
        adapter,
        messages: [
          { role: 'user', content: 'Weather?' },
          {
            role: 'assistant',
            content: 'Let me check.',
            toolCalls: [
              {
                id: 'call_1',
                type: 'function' as const,
                function: { name: 'getWeather', arguments: '{"city":"NYC"}' },
              },
            ],
          },
          // Tool result IS present -> not pending
          { role: 'tool', content: '{"temp":72}', toolCallId: 'call_1' },
        ],
        tools: [serverTool('getWeather', executeSpy)],
      })

      await collectChunks(stream as AsyncIterable<StreamChunk>)

      // Tool should NOT have been executed again
      expect(executeSpy).not.toHaveBeenCalled()
      expect(calls).toHaveLength(1)
    })
  })

  // ==========================================================================
  // Agent loop strategy
  // ==========================================================================
  describe('agent loop strategy', () => {
    it('should stop after custom strategy says stop', async () => {
      const executeSpy = vi.fn().mockReturnValue({ temp: 72 })

      const { adapter, calls } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.toolStart('call_1', 'getWeather'),
            ev.toolArgs('call_1', '{"city":"NYC"}'),
            ev.runFinished('tool_calls'),
          ],
          // This second iteration should NOT be reached
          [
            ev.runStarted(),
            ev.textContent('Should not see this'),
            ev.runFinished('stop'),
          ],
        ],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Weather?' }],
        tools: [serverTool('getWeather', executeSpy)],
        // Strategy that stops immediately (no iterations)
        agentLoopStrategy: () => false,
      })

      await collectChunks(stream as AsyncIterable<StreamChunk>)

      // Only first adapter call (tool call) should happen
      // The tool is executed but the loop doesn't continue to a second model call
      expect(calls).toHaveLength(1)
    })

    it('should respect maxIterations strategy', async () => {
      const executeSpy = vi.fn().mockReturnValue({ data: 'result' })

      let callCount = 0
      const { adapter, calls } = createMockAdapter({
        chatStreamFn: () => {
          callCount++
          // Always return tool calls to test max iteration limit
          return (async function* () {
            yield ev.runStarted()
            yield ev.toolStart(`call_${callCount}`, 'repeater')
            yield ev.toolArgs(`call_${callCount}`, '{}')
            yield ev.runFinished('tool_calls')
          })()
        },
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Repeat' }],
        tools: [serverTool('repeater', executeSpy)],
        // maxIterations(2): allows iteration 0 and 1
        agentLoopStrategy: (state) => state.iterationCount < 2,
      })

      await collectChunks(stream as AsyncIterable<StreamChunk>)

      // Should have called the adapter 2 times (iterations 0 and 1)
      // Each iteration has processText + executeToolCalls phases
      expect(calls.length).toBe(2)
    })
  })

  // ==========================================================================
  // Abort handling
  // ==========================================================================
  describe('abort handling', () => {
    it('should stop streaming when abort is called', async () => {
      const abortController = new AbortController()
      let chunkCount = 0

      const { adapter } = createMockAdapter({
        chatStreamFn: () => {
          return (async function* () {
            yield ev.runStarted()
            yield ev.textStart()
            yield ev.textContent('Hello')
            // Abort after first content chunk is consumed
            yield ev.textContent(' world')
            yield ev.textContent(' more')
            yield ev.textEnd()
            yield ev.runFinished('stop')
          })()
        },
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        abortController,
      })

      const chunks: Array<StreamChunk> = []
      for await (const c of stream as AsyncIterable<StreamChunk>) {
        chunks.push(c)
        chunkCount++
        if (chunkCount === 3) {
          // Abort after receiving RUN_STARTED, TEXT_MESSAGE_START, first TEXT_MESSAGE_CONTENT
          abortController.abort()
        }
      }

      // Should have stopped early - not all 7 chunks received
      expect(chunks.length).toBeLessThan(7)
    })
  })

  // ==========================================================================
  // Error handling
  // ==========================================================================
  describe('error handling', () => {
    it('should yield RUN_ERROR and stop the loop', async () => {
      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.textStart(),
            ev.textContent('Starting...'),
            ev.runError('API rate limited'),
          ],
        ],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
      })

      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)

      // RUN_ERROR should be in the chunks
      const errorChunks = chunks.filter((c) => c.type === 'RUN_ERROR')
      expect(errorChunks).toHaveLength(1)
      expect((errorChunks[0] as any).error.message).toBe('API rate limited')
    })

    it('should not continue the agent loop after RUN_ERROR', async () => {
      const { adapter, calls } = createMockAdapter({
        iterations: [
          [ev.runStarted(), ev.runError('Fatal error')],
          // This should never be called
          [
            ev.runStarted(),
            ev.textContent('Should not happen'),
            ev.runFinished('stop'),
          ],
        ],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
      })

      await collectChunks(stream as AsyncIterable<StreamChunk>)

      // Only first adapter call should happen
      expect(calls).toHaveLength(1)
    })
  })

  // ==========================================================================
  // Structured output
  // ==========================================================================
  describe('structured output', () => {
    it('should run agentic loop then call adapter.structuredOutput', async () => {
      const structuredOutputSpy = vi.fn().mockResolvedValue({
        data: { name: 'Alice', age: 30 },
        rawText: '{"name":"Alice","age":30}',
      })

      const { adapter } = createMockAdapter({
        iterations: [
          // Agentic loop runs first
          [
            ev.runStarted(),
            ev.textStart(),
            ev.textContent('Generating...'),
            ev.textEnd(),
            ev.runFinished('stop'),
          ],
        ],
        structuredOutput: structuredOutputSpy,
      })

      // Use a plain JSON Schema (not Standard Schema) so no validation step
      const result = await chat({
        adapter,
        messages: [{ role: 'user', content: 'Generate a person' }],
        outputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            age: { type: 'number' },
          },
        } as any,
      })

      expect(structuredOutputSpy).toHaveBeenCalledTimes(1)
      expect(result).toEqual({ name: 'Alice', age: 30 })
    })

    it('should pass final messages to structuredOutput after tool execution', async () => {
      const structuredOutputSpy = vi.fn().mockResolvedValue({
        data: { summary: 'Weather is 72F' },
        rawText: '{"summary":"Weather is 72F"}',
      })

      const { adapter } = createMockAdapter({
        iterations: [
          // First: tool call
          [
            ev.runStarted(),
            ev.toolStart('call_1', 'getWeather'),
            ev.toolArgs('call_1', '{"city":"NYC"}'),
            ev.runFinished('tool_calls'),
          ],
          // Second: final text
          [ev.runStarted(), ev.textContent('Done.'), ev.runFinished('stop')],
        ],
        structuredOutput: structuredOutputSpy,
      })

      await chat({
        adapter,
        messages: [{ role: 'user', content: 'Summarize weather' }],
        tools: [serverTool('getWeather', () => ({ temp: 72 }))],
        outputSchema: {
          type: 'object',
          properties: { summary: { type: 'string' } },
        } as any,
      })

      // structuredOutput should have been called with messages that include tool results
      const structuredCall = structuredOutputSpy.mock.calls[0]![0]
      const messages = structuredCall.chatOptions.messages
      const toolMsg = messages.find((m: any) => m.role === 'tool')
      expect(toolMsg).toBeDefined()
    })
  })

  // ==========================================================================
  // Thinking/step events
  // ==========================================================================
  describe('thinking/step events', () => {
    it('should yield STEP_FINISHED chunks through', async () => {
      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.stepFinished('Let me think'),
            ev.stepFinished(' about this...'),
            ev.textStart(),
            ev.textContent('Answer!'),
            ev.textEnd(),
            ev.runFinished('stop'),
          ],
        ],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Think about it' }],
      })

      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)

      const stepChunks = chunks.filter((c) => c.type === 'STEP_FINISHED')
      expect(stepChunks).toHaveLength(2)
      expect((stepChunks[0] as any).delta).toBe('Let me think')
      expect((stepChunks[1] as any).delta).toBe(' about this...')
    })
  })

  // ==========================================================================
  // createChatOptions helper
  // ==========================================================================
  describe('createChatOptions', () => {
    it('should return the same options object (passthrough)', () => {
      const { adapter } = createMockAdapter({})

      const options = createChatOptions({
        adapter,
        messages: [{ role: 'user', content: 'Hello' }],
        temperature: 0.7,
      })

      expect(options.adapter).toBe(adapter)
      expect(options.temperature).toBe(0.7)
      expect(options.messages).toEqual([{ role: 'user', content: 'Hello' }])
    })
  })

  // ==========================================================================
  // Multi-iteration agent loop
  // ==========================================================================
  describe('multi-iteration agent loop', () => {
    it('should handle two sequential tool call iterations', async () => {
      const tool1Spy = vi.fn().mockReturnValue({ result: 'data1' })
      const tool2Spy = vi.fn().mockReturnValue({ result: 'data2' })

      const { adapter, calls } = createMockAdapter({
        iterations: [
          // Iteration 1: first tool call
          [
            ev.runStarted(),
            ev.toolStart('call_1', 'tool1'),
            ev.toolArgs('call_1', '{}'),
            ev.runFinished('tool_calls'),
          ],
          // Iteration 2: second tool call
          [
            ev.runStarted(),
            ev.toolStart('call_2', 'tool2'),
            ev.toolArgs('call_2', '{}'),
            ev.runFinished('tool_calls'),
          ],
          // Iteration 3: final text
          [
            ev.runStarted(),
            ev.textStart(),
            ev.textContent('All done.'),
            ev.textEnd(),
            ev.runFinished('stop'),
          ],
        ],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Do two things' }],
        tools: [serverTool('tool1', tool1Spy), serverTool('tool2', tool2Spy)],
      })

      await collectChunks(stream as AsyncIterable<StreamChunk>)

      expect(tool1Spy).toHaveBeenCalledTimes(1)
      expect(tool2Spy).toHaveBeenCalledTimes(1)
      expect(calls).toHaveLength(3)
    })
  })

  // ==========================================================================
  // Edge cases
  // ==========================================================================
  describe('edge cases', () => {
    it('should handle empty messages array', async () => {
      const { adapter } = createMockAdapter({
        iterations: [
          [ev.runStarted(), ev.textContent('Hello'), ev.runFinished('stop')],
        ],
      })

      const stream = chat({
        adapter,
        messages: [],
      })

      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)
      expect(chunks.length).toBeGreaterThan(0)
    })

    it('should handle adapter yielding no chunks', async () => {
      const { adapter } = createMockAdapter({
        iterations: [[]],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
      })

      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)
      // Should complete without error even with empty stream
      expect(chunks).toHaveLength(0)
    })

    it('should pass modelOptions through to adapter', async () => {
      const { adapter, calls } = createMockAdapter({
        iterations: [[ev.runStarted(), ev.runFinished('stop')]],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        modelOptions: { customParam: 'value' } as any,
      })

      await collectChunks(stream as AsyncIterable<StreamChunk>)
      expect(calls[0].modelOptions).toEqual({ customParam: 'value' })
    })

    it('should handle TEXT_MESSAGE_CONTENT with content field', async () => {
      const { adapter } = createMockAdapter({
        chatStreamFn: () => {
          return (async function* () {
            yield ev.runStarted()
            yield ev.textStart()
            // Include the optional content field
            yield {
              type: 'TEXT_MESSAGE_CONTENT',
              messageId: 'msg-1',
              delta: 'Hello',
              content: 'Hello',
              timestamp: Date.now(),
            } as StreamChunk
            yield ev.textEnd()
            yield ev.runFinished('stop')
          })()
        },
      })

      const result = await chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        stream: false,
      })

      expect(result).toBe('Hello')
    })
  })
})
