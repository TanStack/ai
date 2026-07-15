import { describe, expect, it, vi } from 'vitest'
import { chat, createChatOptions } from '../src/activities/chat/index'
import { defineChatMiddleware } from '../src/activities/chat/middleware/define'
import { DISCOVERY_TOOL_NAME } from '../src/activities/chat/tools/lazy-tool-manager'
import {
  InterruptPersistenceCapability,
  provideInterruptPersistence,
} from '../src/interrupts'
import { EventType } from '../src/types'
import type { StreamChunk, Tool } from '../src/types'
import type { InterruptPersistenceGateway } from '../src/interrupts'
import type { ChatResumeToolState } from '../src/activities/chat/middleware/types'
import {
  chunk,
  ev,
  createMockAdapter,
  collectChunks,
  serverTool,
  clientTool,
} from './test-utils'

/** Lazy server tool (has execute, lazy: true). */
function lazyServerTool(name: string, executeFn: (args: any) => any): Tool {
  return {
    name,
    description: `Lazy tool: ${name}`,
    execute: executeFn,
    lazy: true,
  }
}

function expectSingleRunFinished(
  chunks: Array<StreamChunk>,
): Extract<StreamChunk, { type: 'RUN_FINISHED' }> {
  const terminals = chunks.filter(
    (chunk): chunk is Extract<StreamChunk, { type: 'RUN_FINISHED' }> =>
      chunk.type === 'RUN_FINISHED',
  )
  expect(terminals).toHaveLength(1)
  return terminals[0]!
}

function interruptPersistenceMiddleware(sequence?: string[]) {
  const gateway: InterruptPersistenceGateway = {
    openInterruptBatch: async (input) => {
      sequence?.push('persist')
      return { generation: 1, descriptors: input.descriptors }
    },
    commitInterruptResolutions: async (input) => ({
      status: 'committed',
      continuationRunId: input.continuationRunId,
    }),
    getInterruptRecoveryState: async (input) => ({
      schemaVersion: 1,
      state: 'missing',
      threadId: input.threadId,
      interruptedRunId: input.interruptedRunId,
      generation: input.knownGeneration,
      pendingInterrupts: [],
    }),
  }
  return defineChatMiddleware({
    name: 'test-interrupt-persistence',
    provides: [InterruptPersistenceCapability],
    setup(ctx) {
      provideInterruptPersistence(ctx, gateway)
    },
    async onChunk(_ctx, value) {
      if (
        value.type === EventType.RUN_FINISHED &&
        value.outcome?.type === 'interrupt'
      ) {
        await gateway.openInterruptBatch({
          threadId: value.threadId,
          interruptedRunId: value.runId,
          descriptors: value.outcome.interrupts,
          bindings: [],
        })
      } else if (value.type === EventType.MESSAGES_SNAPSHOT) {
        sequence?.push('messages')
      } else if (value.type === EventType.STATE_SNAPSHOT) {
        sequence?.push('state')
      }
    },
  })
}

function resumeStateMiddleware(resumeToolState: ChatResumeToolState) {
  return defineChatMiddleware({
    name: 'test-interrupt-resume-state',
    onConfig() {
      return { resumeToolState }
    },
  })
}

// ============================================================================
// Tests
// ============================================================================

describe('chat()', () => {
  // ==========================================================================
  // Streaming text (no tools)
  // ==========================================================================
  describe('streaming text (no tools)', () => {
    it('turns an exact interrupt replay signal into a successful terminal', async () => {
      const { adapter, calls } = createMockAdapter({
        iterations: [[ev.runStarted(), ev.runFinished('stop')]],
      })
      const replay = defineChatMiddleware({
        name: 'test-interrupt-replay',
        onConfig(ctx) {
          if (ctx.phase !== 'init') return
          const error = new Error('already committed')
          error.name = 'InterruptReplaySignal'
          Object.defineProperty(error, 'continuationRunId', {
            value: 'committed-run',
            enumerable: true,
          })
          throw error
        },
      })

      const chunks = await collectChunks(
        chat({
          adapter,
          messages: [],
          threadId: 'thread-1',
          runId: 'replay-run',
          parentRunId: 'interrupted-run',
          middleware: [replay],
        }) as AsyncIterable<StreamChunk>,
      )

      expect(calls).toHaveLength(0)
      expect(chunks).toEqual([
        expect.objectContaining({
          type: EventType.RUN_FINISHED,
          threadId: 'thread-1',
          runId: 'replay-run',
          outcome: { type: 'success' },
        }),
      ])
    })

    it('turns interrupt validation failures into one structured error terminal', async () => {
      const { adapter, calls } = createMockAdapter({
        iterations: [[ev.runStarted(), ev.runFinished('stop')]],
      })
      const onError = vi.fn()
      const errors = [
        {
          scope: 'item',
          interruptId: 'interrupt-1',
          code: 'invalid-payload',
          message: 'The interrupt payload is invalid.',
          source: 'server',
          retryable: false,
          threadId: 'thread-1',
          interruptedRunId: 'interrupted-run',
          generation: 1,
        },
      ] as const
      const recovery = {
        schemaVersion: 1,
        state: 'pending',
        threadId: 'thread-1',
        interruptedRunId: 'interrupted-run',
        generation: 1,
        pendingInterrupts: [],
      } as const
      const validation = defineChatMiddleware({
        name: 'test-interrupt-validation-failure',
        onConfig(ctx) {
          if (ctx.phase !== 'init') return
          const error = new Error(errors[0].message)
          error.name = 'InterruptResumeValidationError'
          Object.defineProperties(error, {
            errors: { value: errors, enumerable: true },
            recovery: { value: recovery, enumerable: true },
          })
          throw error
        },
        onError(_ctx, info) {
          onError(info.error)
        },
      })

      const chunks = await collectChunks(
        chat({
          adapter,
          messages: [],
          stream: true,
          threadId: 'thread-1',
          runId: 'continuation-run',
          parentRunId: 'interrupted-run',
          middleware: [validation],
        }),
      )

      expect(calls).toHaveLength(0)
      expect(onError).toHaveBeenCalledTimes(1)
      expect(chunks).toEqual([
        expect.objectContaining({
          type: EventType.RUN_ERROR,
          threadId: 'thread-1',
          runId: 'continuation-run',
          message: errors[0].message,
          'tanstack:interruptErrors': errors,
          'tanstack:interruptRecovery': recovery,
        }),
      ])
    })

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
      expect(calls[0]!.messages).toBeDefined()
      expect((calls[0]!.messages as Array<{ role: string }>)[0]!.role).toBe(
        'user',
      )
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

      expect(calls[0]!.systemPrompts).toEqual(['You are a helpful assistant'])
    })

    it('should pass sampling modelOptions (temperature, topP, maxTokens) to the adapter', async () => {
      const { adapter, calls } = createMockAdapter({
        iterations: [[ev.runStarted(), ev.runFinished('stop')]],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hello' }],
        modelOptions: {
          temperature: 0.5,
          topP: 0.9,
          maxTokens: 100,
        },
      })

      await collectChunks(stream as AsyncIterable<StreamChunk>)

      expect(calls[0]!.modelOptions).toMatchObject({
        temperature: 0.5,
        topP: 0.9,
        maxTokens: 100,
      })
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
      expect(executeSpy).toHaveBeenCalledWith(
        { city: 'NYC' },
        expect.objectContaining({ toolCallId: 'call_1' }),
      )

      // A TOOL_CALL_RESULT chunk with content should have been yielded
      // (TOOL_CALL_END is also emitted but `result` is stripped by strip-to-spec middleware)
      const toolResultChunks = chunks.filter(
        (c) => c.type === 'TOOL_CALL_RESULT' && 'content' in c && c.content,
      )
      expect(toolResultChunks.length).toBeGreaterThanOrEqual(1)

      // Adapter was called twice (tool call iteration + final text)
      expect(calls).toHaveLength(2)

      // Second call should have tool result in messages
      const secondCallMessages = calls[1]!.messages as Array<{ role: string }>
      const toolResultMsg = secondCallMessages.find((m) => m.role === 'tool')
      expect(toolResultMsg).toBeDefined()
    })

    it('should handle tool execution errors gracefully', async () => {
      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.toolStart('call_1', 'failTool'),
            ev.toolArgs('call_1', '{}'),
            ev.toolEnd('call_1', 'failTool', { input: {} }),
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

      // Should still complete and yield the error result via TOOL_CALL_RESULT
      // (TOOL_CALL_END's `result` is stripped by strip-to-spec middleware)
      const toolResultChunks = chunks.filter(
        (c) => c.type === 'TOOL_CALL_RESULT' && 'content' in c,
      )
      expect(toolResultChunks.length).toBeGreaterThanOrEqual(1)
      // Error should be in the content
      const contentStr = (toolResultChunks[0] as any).content
      expect(contentStr).toContain('error')

      // Error state rides on TOOL_CALL_RESULT, not the END
      const toolResultErr = chunks.find(
        (c) => c.type === 'TOOL_CALL_RESULT' && c.toolCallId === 'call_1',
      )
      expect(toolResultErr).toMatchObject({ state: 'output-error' })

      // No duplicate END (#519)
      const endChunks = chunks.filter(
        (c) => c.type === 'TOOL_CALL_END' && c.toolCallId === 'call_1',
      )
      expect(endChunks).toHaveLength(1)
    })

    // #519: post-execution must not duplicate the END the adapter already streamed
    it('should emit exactly one TOOL_CALL_END per server-executed tool', async () => {
      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.toolStart('call_1', 'getWeather'),
            ev.toolArgs('call_1', '{"city":"NYC"}'),
            ev.toolEnd('call_1', 'getWeather', { input: { city: 'NYC' } }),
            ev.runFinished('tool_calls'),
          ],
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
        tools: [serverTool('getWeather', () => ({ temp: 72 }))],
      })

      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)

      const starts = chunks.filter(
        (c) => c.type === 'TOOL_CALL_START' && c.toolCallId === 'call_1',
      )
      const ends = chunks.filter(
        (c) => c.type === 'TOOL_CALL_END' && c.toolCallId === 'call_1',
      )
      const results = chunks.filter(
        (c) => c.type === 'TOOL_CALL_RESULT' && c.toolCallId === 'call_1',
      )

      // pre-fix `ends` was 2
      expect(starts).toHaveLength(1)
      expect(ends).toHaveLength(1)
      expect(results).toHaveLength(1)

      // Every END has a matching START (the verifyEvents invariant)
      const open = new Set<string>()
      for (const c of chunks) {
        if (c.type === 'TOOL_CALL_START') open.add(c.toolCallId)
        if (c.type === 'TOOL_CALL_END') {
          expect(open.has(c.toolCallId)).toBe(true)
        }
      }
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
      const secondCallMessages = calls[1]!.messages as Array<{ role: string }>
      const toolResultMsgs = secondCallMessages.filter((m) => m.role === 'tool')
      expect(toolResultMsgs).toHaveLength(2)
    })
  })

  // ==========================================================================
  // Client tools (no execute)
  // ==========================================================================
  describe('client tools (no execute)', () => {
    it('emits an actionable client-tool interrupt without persistence', async () => {
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

      const chunks = await collectChunks(
        chat({
          adapter,
          messages: [{ role: 'user', content: 'Search' }],
          tools: [clientTool('clientSearch')],
          threadId: 'thread-1',
          runId: 'interrupted-run',
        }) as AsyncIterable<StreamChunk>,
      )

      expect(chunks.some((value) => value.type === EventType.RUN_ERROR)).toBe(
        false,
      )
      expect(expectSingleRunFinished(chunks)).toMatchObject({
        outcome: {
          type: 'interrupt',
          interrupts: [
            {
              id: 'client_tool_call_1',
              metadata: {
                'tanstack:interruptBinding': {
                  kind: 'client-tool-execution',
                  interruptId: 'client_tool_call_1',
                  interruptedRunId: 'interrupted-run',
                  generation: 0,
                },
              },
            },
          ],
        },
      })
    })

    it('persists before ordered snapshots and emits canonical bound interrupts', async () => {
      const sequence: string[] = []
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

      const chunks = await collectChunks(
        chat({
          adapter,
          messages: [{ role: 'user', content: 'Search' }],
          tools: [clientTool('clientSearch')],
          state: { screen: 'search' },
          middleware: [interruptPersistenceMiddleware(sequence)],
        }) as AsyncIterable<StreamChunk>,
      )

      expect(sequence).toEqual(['persist', 'messages', 'state'])
      expect(chunks.slice(-3).map((value) => value.type)).toEqual([
        EventType.MESSAGES_SNAPSHOT,
        EventType.STATE_SNAPSHOT,
        EventType.RUN_FINISHED,
      ])
      const terminal = expectSingleRunFinished(chunks)
      expect(terminal).toMatchObject({
        outcome: {
          type: 'interrupt',
          interrupts: [
            {
              id: 'client_tool_call_1',
              reason: 'tanstack:client_tool_execution',
              toolCallId: 'call_1',
              responseSchema: {},
            },
          ],
        },
      })
    })

    it('should yield an interrupt outcome for client tools', async () => {
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
        middleware: [interruptPersistenceMiddleware()],
      })

      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)

      const runFinished = expectSingleRunFinished(chunks)
      expect(runFinished).toMatchObject({
        type: 'RUN_FINISHED',
        finishReason: 'tool_calls',
        outcome: {
          type: 'interrupt',
          interrupts: [
            {
              id: 'client_tool_call_1',
              reason: 'tanstack:client_tool_execution',
              toolCallId: 'call_1',
              metadata: {
                kind: 'client_tool',
                toolName: 'clientSearch',
                input: { query: 'test' },
              },
            },
          ],
        },
      })
    })

    it('should not run streaming structured-output finalization after a client-tool interrupt', async () => {
      const structuredOutputSpy = vi.fn().mockResolvedValue({
        data: { status: 'done' },
        rawText: '{"status":"done"}',
      })
      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.toolStart('call_1', 'clientSearch'),
            ev.toolArgs('call_1', '{"query":"test"}'),
            ev.runFinished('tool_calls'),
          ],
        ],
        structuredOutput: structuredOutputSpy,
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Search for test' }],
        tools: [clientTool('clientSearch')],
        outputSchema: {
          type: 'object',
          properties: { status: { type: 'string' } },
          required: ['status'],
        },
        stream: true,
        middleware: [interruptPersistenceMiddleware()],
      })

      const chunks = await collectChunks(
        stream as unknown as AsyncIterable<StreamChunk>,
      )

      expect(structuredOutputSpy).not.toHaveBeenCalled()

      const runFinished = expectSingleRunFinished(chunks)
      expect(runFinished.outcome?.type).toBe('interrupt')

      const interruptTerminalIndex = chunks.indexOf(runFinished)
      const chunksAfterInterrupt = chunks.slice(interruptTerminalIndex + 1)
      expect(
        chunksAfterInterrupt.some(
          (chunk) =>
            chunk.type === EventType.CUSTOM &&
            (chunk as { name?: string }).name === 'structured-output.complete',
        ),
      ).toBe(false)
      expect(
        chunksAfterInterrupt.some(
          (chunk) =>
            chunk.type === EventType.CUSTOM &&
            (chunk as { name?: string }).name === 'structured-output.start',
        ),
      ).toBe(false)
      expect(
        chunksAfterInterrupt.some(
          (chunk) =>
            chunk.type === EventType.RUN_STARTED ||
            chunk.type === EventType.RUN_FINISHED,
        ),
      ).toBe(false)
    })
  })

  // ==========================================================================
  // Mixed server + client tools (regression: server results were dropped)
  // ==========================================================================
  describe('mixed server + client tools', () => {
    it('processToolCalls: emits server tool result before waiting for client tool', async () => {
      const searchExecute = vi.fn().mockReturnValue({ results: ['a', 'b'] })

      const { adapter, calls } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.toolStart('call_server', 'searchTools'),
            ev.toolArgs('call_server', '{"query":"hello"}'),
            ev.toolStart('call_client', 'showNotification'),
            ev.toolArgs('call_client', '{"message":"done"}'),
            ev.runFinished('tool_calls'),
          ],
        ],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Search and notify' }],
        tools: [
          serverTool('searchTools', searchExecute),
          clientTool('showNotification'),
        ],
        middleware: [interruptPersistenceMiddleware()],
      })

      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)

      // Server tool should have executed
      expect(searchExecute).toHaveBeenCalledTimes(1)

      // TOOL_CALL_RESULT with content should be emitted for the server tool
      // (TOOL_CALL_END is also emitted but `result`/`toolName` are stripped by strip-to-spec middleware)
      const toolResultChunks = chunks.filter(
        (c) =>
          c.type === 'TOOL_CALL_RESULT' && 'content' in c && (c as any).content,
      )
      expect(toolResultChunks).toHaveLength(1)

      const toolResultIndex = chunks.findIndex(
        (c) =>
          c.type === 'TOOL_CALL_RESULT' && 'content' in c && (c as any).content,
      )
      const runFinished = expectSingleRunFinished(chunks)
      const runFinishedIndex = chunks.indexOf(runFinished)
      expect(runFinishedIndex).toBeGreaterThan(toolResultIndex)
      expect(runFinished).toMatchObject({
        type: 'RUN_FINISHED',
        outcome: {
          type: 'interrupt',
          interrupts: [
            {
              reason: 'tanstack:client_tool_execution',
              toolCallId: 'call_client',
              metadata: {
                kind: 'client_tool',
                toolName: 'showNotification',
                input: { message: 'done' },
              },
            },
          ],
        },
      })
      expect(
        chunks.some(
          (c) =>
            c.type === 'CUSTOM' && (c as any).name === 'tool-input-available',
        ),
      ).toBe(false)

      // Adapter called once (waiting for client result, not looping)
      expect(calls).toHaveLength(1)
    })

    it('checkForPendingToolCalls: emits server result before waiting for pending client tool', async () => {
      const weatherExecute = vi.fn().mockReturnValue({ temp: 72 })

      const { adapter, calls } = createMockAdapter({
        iterations: [
          // This should NOT be called because we're still waiting for the client tool
        ],
      })

      const stream = chat({
        adapter,
        messages: [
          { role: 'user', content: 'Weather and notify?' },
          {
            role: 'assistant',
            content: '',
            toolCalls: [
              {
                id: 'call_server',
                type: 'function' as const,
                function: { name: 'getWeather', arguments: '{"city":"NYC"}' },
              },
              {
                id: 'call_client',
                type: 'function' as const,
                function: {
                  name: 'showNotification',
                  arguments: '{"message":"done"}',
                },
              },
            ],
          },
          // No tool result messages -> both are pending
        ],
        tools: [
          serverTool('getWeather', weatherExecute),
          clientTool('showNotification'),
        ],
        middleware: [interruptPersistenceMiddleware()],
      })

      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)

      // Server tool should have executed
      expect(weatherExecute).toHaveBeenCalledTimes(1)

      // TOOL_CALL_RESULT with content should be emitted for the server tool
      // (TOOL_CALL_END is also emitted but `result`/`toolName` are stripped by strip-to-spec middleware)
      const toolResultChunks = chunks.filter(
        (c) =>
          c.type === 'TOOL_CALL_RESULT' && 'content' in c && (c as any).content,
      )
      expect(toolResultChunks).toHaveLength(1)

      const toolResultIndex = chunks.findIndex(
        (c) =>
          c.type === 'TOOL_CALL_RESULT' && 'content' in c && (c as any).content,
      )
      const runFinished = expectSingleRunFinished(chunks)
      const runFinishedIndex = chunks.indexOf(runFinished)
      expect(runFinishedIndex).toBeGreaterThan(toolResultIndex)
      expect(runFinished).toMatchObject({
        type: 'RUN_FINISHED',
        outcome: {
          type: 'interrupt',
          interrupts: [
            {
              reason: 'tanstack:client_tool_execution',
              toolCallId: 'call_client',
              metadata: {
                kind: 'client_tool',
                toolName: 'showNotification',
                input: { message: 'done' },
              },
            },
          ],
        },
      })
      expect(
        chunks.some(
          (c) =>
            c.type === 'CUSTOM' && (c as any).name === 'tool-input-available',
        ),
      ).toBe(false)

      // Adapter should NOT be called (still waiting for client result)
      expect(calls).toHaveLength(0)
    })
  })

  // ==========================================================================
  // Approval flow
  // ==========================================================================
  describe('approval flow', () => {
    it('applies approved argument edits and emits only a result for a resumed tool call', async () => {
      const execute = vi.fn().mockImplementation((input) => input)
      const { adapter } = createMockAdapter({
        iterations: [[ev.runStarted(), ev.runFinished('stop')]],
      })
      const stream = chat({
        adapter,
        messages: [
          { role: 'user', content: 'Change it' },
          {
            role: 'assistant',
            content: '',
            toolCalls: [
              {
                id: 'call_1',
                type: 'function',
                function: {
                  name: 'dangerousTool',
                  arguments: '{"action":"original"}',
                },
              },
            ],
          },
        ],
        tools: [
          {
            ...serverTool('dangerousTool', execute),
            needsApproval: true,
            inputSchema: {
              type: 'object',
              properties: { action: { type: 'string' } },
              required: ['action'],
            },
          },
        ],
        middleware: [
          interruptPersistenceMiddleware(),
          resumeStateMiddleware({
            approvals: new Map([
              ['call_1', { approved: true, editedArgs: { action: 'edited' } }],
            ]),
          }),
        ],
      })

      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)
      expect(execute).toHaveBeenCalledWith(
        { action: 'edited' },
        expect.any(Object),
      )
      expect(
        chunks
          .filter(
            (value) => 'toolCallId' in value && value.toolCallId === 'call_1',
          )
          .map((value) => value.type),
      ).toEqual([EventType.TOOL_CALL_RESULT])
    })

    it('should end with an interrupt outcome for tools with needsApproval without persistence', async () => {
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
        threadId: 'thread-1',
        runId: 'interrupted-run',
        tools: [serverTool('dangerousTool', () => ({ ok: true }))].map((t) => ({
          ...t,
          needsApproval: true,
        })),
      })

      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)

      const runFinished = expectSingleRunFinished(chunks)
      expect(runFinished).toBeDefined()
      expect(runFinished).toMatchObject({
        type: 'RUN_FINISHED',
        finishReason: 'tool_calls',
        outcome: {
          type: 'interrupt',
          interrupts: [
            {
              id: 'approval_call_1',
              reason: 'tool_call',
              message: 'Approval required to run dangerousTool',
              toolCallId: 'call_1',
              responseSchema: { oneOf: expect.any(Array) },
              metadata: {
                kind: 'approval',
                toolName: 'dangerousTool',
                input: { action: 'delete' },
                'tanstack:interruptBinding': {
                  kind: 'tool-approval',
                  interruptId: 'approval_call_1',
                  interruptedRunId: 'interrupted-run',
                  generation: 0,
                },
              },
            },
          ],
        },
      })

      expect(
        chunks.some(
          (c) =>
            c.type === 'CUSTOM' && (c as any).name === 'approval-requested',
        ),
      ).toBe(false)
    })

    it('validates an entire ephemeral batch before executing any tool', async () => {
      const firstExecute = vi.fn().mockReturnValue({ ok: true })
      const secondExecute = vi.fn().mockReturnValue({ ok: true })
      const { adapter, calls } = createMockAdapter({
        iterations: [[ev.runStarted(), ev.runFinished('stop')]],
      })
      const inputSchema = {
        type: 'object',
        properties: { action: { type: 'string' } },
        required: ['action'],
        additionalProperties: false,
      }

      const chunks = await collectChunks(
        chat({
          adapter,
          threadId: 'thread-1',
          runId: 'continuation-run',
          parentRunId: 'interrupted-run',
          messages: [
            { role: 'user', content: 'Do both' },
            {
              role: 'assistant',
              content: '',
              toolCalls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: {
                    name: 'firstTool',
                    arguments: '{"action":"one"}',
                  },
                },
                {
                  id: 'call_2',
                  type: 'function',
                  function: {
                    name: 'secondTool',
                    arguments: '{"action":"two"}',
                  },
                },
              ],
            },
          ],
          tools: [
            {
              ...serverTool('firstTool', firstExecute),
              needsApproval: true,
              inputSchema,
            },
            {
              ...serverTool('secondTool', secondExecute),
              needsApproval: true,
              inputSchema,
            },
          ],
          resume: [
            {
              interruptId: 'approval_call_1',
              status: 'resolved',
              payload: {
                approved: true,
                editedArgs: { action: 1 },
              },
            },
            {
              interruptId: 'approval_call_2',
              status: 'resolved',
              payload: {
                approved: true,
                editedArgs: { action: 2 },
              },
            },
          ],
        }) as AsyncIterable<StreamChunk>,
      )

      expect(firstExecute).not.toHaveBeenCalled()
      expect(secondExecute).not.toHaveBeenCalled()
      expect(calls).toHaveLength(0)
      expect(chunks).toEqual([
        expect.objectContaining({
          type: EventType.RUN_ERROR,
          'tanstack:interruptErrors': expect.arrayContaining([
            expect.objectContaining({
              interruptId: 'approval_call_1',
              code: 'invalid-edited-args',
            }),
            expect.objectContaining({
              interruptId: 'approval_call_2',
              code: 'invalid-edited-args',
            }),
            expect.objectContaining({
              scope: 'batch',
              code: 'item-validation-failed',
            }),
          ]),
        }),
      ])
    })

    it('translates ephemeral approve, reject, cancel, edits, and payloads before continuing', async () => {
      const approvedExecute = vi.fn().mockImplementation((input) => input)
      const rejectedExecute = vi.fn()
      const cancelledExecute = vi.fn()
      const { adapter } = createMockAdapter({
        iterations: [[ev.runStarted(), ev.runFinished('stop')]],
      })
      const inputSchema = {
        type: 'object',
        properties: { action: { type: 'string' } },
        required: ['action'],
        additionalProperties: false,
      }
      const approvalSchema = {
        approve: {
          type: 'object',
          properties: { note: { type: 'string' } },
          required: ['note'],
          additionalProperties: false,
        },
        reject: {
          type: 'object',
          properties: { reason: { type: 'string' } },
          required: ['reason'],
          additionalProperties: false,
        },
      }

      const chunks = await collectChunks(
        chat({
          adapter,
          threadId: 'thread-1',
          runId: 'continuation-run',
          parentRunId: 'interrupted-run',
          messages: [
            { role: 'user', content: 'Do all' },
            {
              role: 'assistant',
              content: '',
              toolCalls: [
                {
                  id: 'call_approve',
                  type: 'function',
                  function: {
                    name: 'approvedTool',
                    arguments: '{"action":"original"}',
                  },
                },
                {
                  id: 'call_reject',
                  type: 'function',
                  function: {
                    name: 'rejectedTool',
                    arguments: '{"action":"reject"}',
                  },
                },
                {
                  id: 'call_cancel',
                  type: 'function',
                  function: {
                    name: 'cancelledTool',
                    arguments: '{"action":"cancel"}',
                  },
                },
              ],
            },
          ],
          tools: [
            {
              ...serverTool('approvedTool', approvedExecute),
              needsApproval: true,
              inputSchema,
              approvalSchema,
            },
            {
              ...serverTool('rejectedTool', rejectedExecute),
              needsApproval: true,
              inputSchema,
              approvalSchema,
            },
            {
              ...serverTool('cancelledTool', cancelledExecute),
              needsApproval: true,
              inputSchema,
              approvalSchema,
            },
          ],
          resume: [
            {
              interruptId: 'approval_call_approve',
              status: 'resolved',
              payload: {
                approved: true,
                editedArgs: { action: 'edited' },
                payload: { note: 'reviewed' },
              },
            },
            {
              interruptId: 'approval_call_reject',
              status: 'resolved',
              payload: {
                approved: false,
                payload: { reason: 'unsafe' },
              },
            },
            {
              interruptId: 'approval_call_cancel',
              status: 'cancelled',
            },
          ],
        }) as AsyncIterable<StreamChunk>,
      )

      expect(chunks.some((chunk) => chunk.type === EventType.RUN_ERROR)).toBe(
        false,
      )
      expect(approvedExecute).toHaveBeenCalledWith(
        { action: 'edited' },
        expect.any(Object),
      )
      expect(rejectedExecute).not.toHaveBeenCalled()
      expect(cancelledExecute).not.toHaveBeenCalled()
      expect(chunks).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: EventType.TOOL_CALL_RESULT,
            toolCallId: 'call_approve',
            content: JSON.stringify({ action: 'edited' }),
          }),
          expect.objectContaining({
            type: EventType.TOOL_CALL_RESULT,
            toolCallId: 'call_reject',
            content: JSON.stringify({ reason: 'unsafe' }),
          }),
          expect.objectContaining({
            type: EventType.TOOL_CALL_RESULT,
            toolCallId: 'call_cancel',
          }),
        ]),
      )
    })

    it('translates a validated ephemeral client-tool output', async () => {
      const { adapter, calls } = createMockAdapter({
        iterations: [[ev.runStarted(), ev.runFinished('stop')]],
      })
      const outputSchema = {
        type: 'object',
        properties: { result: { type: 'string' } },
        required: ['result'],
        additionalProperties: false,
      }

      const chunks = await collectChunks(
        chat({
          adapter,
          threadId: 'thread-1',
          runId: 'continuation-run',
          parentRunId: 'interrupted-run',
          messages: [
            { role: 'user', content: 'Search' },
            {
              role: 'assistant',
              content: '',
              toolCalls: [
                {
                  id: 'call_search',
                  type: 'function',
                  function: {
                    name: 'clientSearch',
                    arguments: '{"query":"test"}',
                  },
                },
              ],
            },
          ],
          tools: [
            {
              ...clientTool('clientSearch'),
              outputSchema,
            },
          ],
          resume: [
            {
              interruptId: 'client_tool_call_search',
              status: 'resolved',
              payload: { result: 'found' },
            },
          ],
        }) as AsyncIterable<StreamChunk>,
      )

      expect(chunks.some((chunk) => chunk.type === EventType.RUN_ERROR)).toBe(
        false,
      )
      expect(calls).toHaveLength(1)
      expect(calls[0]!.messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'tool',
            toolCallId: 'call_search',
            content: JSON.stringify({ result: 'found' }),
          }),
        ]),
      )
    })

    it('continues an approved client tool through its client-execution interrupt', async () => {
      const tool = {
        ...clientTool('clientDanger', { needsApproval: true }),
        outputSchema: {
          type: 'object',
          properties: { result: { type: 'string' } },
          required: ['result'],
          additionalProperties: false,
        },
      }
      const history = [
        { role: 'user' as const, content: 'Run it' },
        {
          role: 'assistant' as const,
          content: '',
          toolCalls: [
            {
              id: 'call_client',
              type: 'function' as const,
              function: { name: 'clientDanger', arguments: '{}' },
            },
          ],
        },
      ]

      const approvalAdapter = createMockAdapter({ iterations: [] })
      const approvalChunks = await collectChunks(
        chat({
          adapter: approvalAdapter.adapter,
          messages: history,
          tools: [tool],
          threadId: 'thread-1',
          runId: 'approval-continuation',
          parentRunId: 'approval-run',
          resume: [
            {
              interruptId: 'approval_call_client',
              status: 'resolved',
              payload: true,
            },
          ],
        }) as AsyncIterable<StreamChunk>,
      )
      expect(expectSingleRunFinished(approvalChunks)).toMatchObject({
        outcome: {
          type: 'interrupt',
          interrupts: [
            {
              id: 'client_tool_call_client',
              reason: 'tanstack:client_tool_execution',
            },
          ],
        },
      })

      const outputAdapter = createMockAdapter({
        iterations: [[ev.runStarted(), ev.runFinished('stop')]],
      })
      const outputChunks = await collectChunks(
        chat({
          adapter: outputAdapter.adapter,
          messages: history,
          tools: [tool],
          threadId: 'thread-1',
          runId: 'output-continuation',
          parentRunId: 'approval-continuation',
          resume: [
            {
              interruptId: 'client_tool_call_client',
              status: 'resolved',
              payload: { result: 'done' },
            },
          ],
        }) as AsyncIterable<StreamChunk>,
      )

      expect(
        outputChunks.some((chunk) => chunk.type === EventType.RUN_ERROR),
      ).toBe(false)
      expect(outputAdapter.calls).toHaveLength(1)
      expect(outputAdapter.calls[0]!.messages).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'tool',
            toolCallId: 'call_client',
            content: JSON.stringify({ result: 'done' }),
          }),
        ]),
      )
    })

    it('reconstructs only the approval phase for a mixed approval and plain client-tool batch', async () => {
      const approvedExecute = vi.fn().mockReturnValue({ approved: true })
      const history = [
        { role: 'user' as const, content: 'Run both' },
        {
          role: 'assistant' as const,
          content: '',
          toolCalls: [
            {
              id: 'call_approval',
              type: 'function' as const,
              function: { name: 'approvedTool', arguments: '{}' },
            },
            {
              id: 'call_client',
              type: 'function' as const,
              function: { name: 'plainClient', arguments: '{}' },
            },
          ],
        },
      ]
      const { adapter } = createMockAdapter({ iterations: [] })

      const chunks = await collectChunks(
        chat({
          adapter,
          messages: history,
          tools: [
            {
              ...serverTool('approvedTool', approvedExecute),
              needsApproval: true,
            },
            clientTool('plainClient'),
          ],
          threadId: 'thread-1',
          runId: 'continuation-run',
          parentRunId: 'interrupted-run',
          resume: [
            {
              interruptId: 'approval_call_approval',
              status: 'resolved',
              payload: true,
            },
          ],
        }) as AsyncIterable<StreamChunk>,
      )

      expect(chunks.some((chunk) => chunk.type === EventType.RUN_ERROR)).toBe(
        false,
      )
      expect(approvedExecute).toHaveBeenCalledTimes(1)
      expect(expectSingleRunFinished(chunks)).toMatchObject({
        outcome: {
          type: 'interrupt',
          interrupts: [
            {
              id: 'client_tool_call_client',
              reason: 'tanstack:client_tool_execution',
            },
          ],
        },
      })
    })

    it('should end with an interrupt outcome for client tools with needsApproval', async () => {
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
        middleware: [interruptPersistenceMiddleware()],
      })

      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)

      const runFinished = expectSingleRunFinished(chunks)
      expect(runFinished).toMatchObject({
        type: 'RUN_FINISHED',
        finishReason: 'tool_calls',
        outcome: {
          type: 'interrupt',
          interrupts: [
            {
              id: 'approval_call_1',
              reason: 'tool_call',
              toolCallId: 'call_1',
              metadata: {
                kind: 'approval',
                toolName: 'clientDanger',
                input: {},
              },
            },
          ],
        },
      })
    })

    it('should end with an interrupt outcome for client tool execution waits', async () => {
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
        middleware: [interruptPersistenceMiddleware()],
      })

      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)
      const runFinished = expectSingleRunFinished(chunks)

      expect(runFinished).toMatchObject({
        type: 'RUN_FINISHED',
        finishReason: 'tool_calls',
        outcome: {
          type: 'interrupt',
          interrupts: [
            {
              id: 'client_tool_call_1',
              reason: 'tanstack:client_tool_execution',
              message: 'Client tool clientSearch is ready to run',
              toolCallId: 'call_1',
              metadata: {
                kind: 'client_tool',
                toolName: 'clientSearch',
                input: { query: 'test' },
              },
            },
          ],
        },
      })
      expect(
        chunks.some(
          (c) =>
            c.type === 'CUSTOM' && (c as any).name === 'tool-input-available',
        ),
      ).toBe(false)
    })

    it('should not expose internal lazy-tool waits as interrupts', async () => {
      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.toolStart('call_1', 'missingLazyTool'),
            ev.toolArgs('call_1', '{}'),
            ev.runFinished('tool_calls'),
          ],
          [ev.runStarted(), ev.textContent('done'), ev.runFinished('stop')],
        ],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Use the lazy tool' }],
        tools: [lazyServerTool('missingLazyTool', () => ({ ok: true }))],
      })

      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)
      const runFinished = chunks.findLast((c) => c.type === 'RUN_FINISHED')
      expect((runFinished as any)?.outcome?.type).not.toBe('interrupt')
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

      // TOOL_CALL_RESULT with content should be in the stream
      // (TOOL_CALL_END's `result` is stripped by strip-to-spec middleware)
      const toolResultChunks = chunks.filter(
        (c) => c.type === 'TOOL_CALL_RESULT' && 'content' in c && c.content,
      )
      expect(toolResultChunks.length).toBeGreaterThanOrEqual(1)

      // Adapter should have been called with the tool result in messages
      expect(calls).toHaveLength(1)
      const adapterMessages = calls[0]!.messages as Array<{ role: string }>
      const toolMsg = adapterMessages.find((m) => m.role === 'tool')
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

    it('should emit only TOOL_CALL_RESULT for pending tool calls', async () => {
      const executeSpy = vi.fn().mockReturnValue({ temp: 72 })

      const { adapter } = createMockAdapter({
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

      // Tool should have been executed
      expect(executeSpy).toHaveBeenCalledTimes(1)

      expect(
        chunks
          .filter((c) => 'toolCallId' in c && c.toolCallId === 'call_1')
          .map((c) => c.type),
      ).toEqual([EventType.TOOL_CALL_RESULT])
    })

    it('should emit only TOOL_CALL_RESULT for each pending tool call in a batch', async () => {
      const weatherSpy = vi.fn().mockReturnValue({ temp: 72 })
      const timeSpy = vi.fn().mockReturnValue({ time: '3pm' })

      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.textStart(),
            ev.textContent('Done.'),
            ev.textEnd(),
            ev.runFinished('stop'),
          ],
        ],
      })

      const stream = chat({
        adapter,
        messages: [
          { role: 'user', content: 'Weather and time?' },
          {
            role: 'assistant',
            content: '',
            toolCalls: [
              {
                id: 'call_weather',
                type: 'function' as const,
                function: { name: 'getWeather', arguments: '{"city":"NYC"}' },
              },
              {
                id: 'call_time',
                type: 'function' as const,
                function: { name: 'getTime', arguments: '{"tz":"EST"}' },
              },
            ],
          },
          // No tool results -> both pending
        ],
        tools: [
          serverTool('getWeather', weatherSpy),
          serverTool('getTime', timeSpy),
        ],
      })

      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)

      // Both tools should have been executed
      expect(weatherSpy).toHaveBeenCalledTimes(1)
      expect(timeSpy).toHaveBeenCalledTimes(1)

      for (const id of ['call_weather', 'call_time']) {
        expect(
          chunks
            .filter((c) => 'toolCallId' in c && c.toolCallId === id)
            .map((c) => c.type),
        ).toEqual([EventType.TOOL_CALL_RESULT])
      }
    })

    it('should emit only TOOL_CALL_RESULT for the server tool in a mixed pending batch', async () => {
      const weatherSpy = vi.fn().mockReturnValue({ temp: 72 })

      const { adapter } = createMockAdapter({ iterations: [] })

      const stream = chat({
        adapter,
        messages: [
          { role: 'user', content: 'Weather and notify?' },
          {
            role: 'assistant',
            content: '',
            toolCalls: [
              {
                id: 'call_server',
                type: 'function' as const,
                function: { name: 'getWeather', arguments: '{"city":"NYC"}' },
              },
              {
                id: 'call_client',
                type: 'function' as const,
                function: {
                  name: 'showNotification',
                  arguments: '{"message":"done"}',
                },
              },
            ],
          },
          // No tool results -> both pending
        ],
        tools: [
          serverTool('getWeather', weatherSpy),
          clientTool('showNotification'),
        ],
        middleware: [interruptPersistenceMiddleware()],
      })

      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)

      // Server tool should have executed
      expect(weatherSpy).toHaveBeenCalledTimes(1)

      expect(
        chunks
          .filter((c) => 'toolCallId' in c && c.toolCallId === 'call_server')
          .map((c) => c.type),
      ).toEqual([EventType.TOOL_CALL_RESULT])
    })

    it('should replace pendingExecution placeholder with the real tool result and supply both toolCallName/toolName (issue #532)', async () => {
      const executeSpy = vi.fn().mockReturnValue({ status: 'ok' })

      const { adapter, calls } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.textStart(),
            ev.textContent('Done.'),
            ev.textEnd(),
            ev.runFinished('stop'),
          ],
        ],
      })

      // Simulate the UIMessages a client sends back after approving a tool.
      // The chat activity extracts the approval decision from the
      // `approval-responded` part and converts the rest into ModelMessages,
      // which includes a placeholder `tool` message marked pendingExecution.
      const stream = chat({
        adapter,
        messages: [
          {
            id: 'm-user',
            role: 'user',
            parts: [{ type: 'text', content: 'Run it' }],
          },
          {
            id: 'm-assistant',
            role: 'assistant',
            parts: [
              {
                type: 'tool-call',
                id: 'call_approval',
                name: 'approvedTool',
                arguments: '{"x":1}',
                state: 'approval-responded',
                approval: {
                  id: 'approval_call_approval',
                  needsApproval: true,
                  approved: true,
                },
              },
            ],
          },
        ] as any,
        tools: [
          { ...serverTool('approvedTool', executeSpy), needsApproval: true },
        ],
      })

      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)

      // The tool must have actually executed because the placeholder marks
      // it as pendingExecution.
      expect(executeSpy).toHaveBeenCalledTimes(1)

      expect(
        chunks
          .filter((c) => 'toolCallId' in c && c.toolCallId === 'call_approval')
          .map((c) => c.type),
      ).toEqual([EventType.TOOL_CALL_RESULT])

      // The follow-up adapter call (after the tool ran) must see the real
      // tool result, not the placeholder. With the placeholder still in the
      // messages array, the Anthropic adapter's tool_result de-dup would
      // keep the placeholder and drop the real result.
      expect(calls).toHaveLength(1)
      const adapterMessages = calls[0]!.messages as Array<{
        role: string
        content: unknown
        toolCallId?: string
      }>
      const toolMessages = adapterMessages.filter(
        (m) => m.role === 'tool' && m.toolCallId === 'call_approval',
      )
      expect(toolMessages).toHaveLength(1)
      expect(toolMessages[0]!.content).toBe(JSON.stringify({ status: 'ok' }))
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
      expect((errorChunks[0] as any).message).toBe('API rate limited')
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
      // After strip-to-spec middleware, delta is removed from STEP_FINISHED (internal extension)
      // Verify the events pass through with spec fields
      expect((stepChunks[0] as any).stepName).toBeDefined()
      expect((stepChunks[1] as any).stepName).toBeDefined()
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
        modelOptions: { temperature: 0.7 },
      })

      expect(options.adapter).toBe(adapter)
      expect(options.modelOptions).toEqual({ temperature: 0.7 })
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

    it('should preserve signed thinking in continuation message history after a tool call', async () => {
      const toolSpy = vi.fn().mockReturnValue({ result: 'inventory' })

      const { adapter, calls } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.stepStarted('think-1'),
            {
              ...ev.stepFinished('Need inventory.', 'think-1'),
              signature: 'sig-think-1',
            } as StreamChunk,
            ev.toolStart('call_1', 'getInventory'),
            ev.toolArgs('call_1', '{}'),
            ev.runFinished('tool_calls'),
          ],
          [
            ev.runStarted(),
            ev.textStart(),
            ev.textContent('Inventory loaded.'),
            ev.textEnd(),
            ev.runFinished('stop'),
          ],
        ],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Check inventory' }],
        tools: [serverTool('getInventory', toolSpy)],
      })

      await collectChunks(stream as AsyncIterable<StreamChunk>)

      expect(toolSpy).toHaveBeenCalledTimes(1)
      expect(calls).toHaveLength(2)

      const continuationMessages = calls[1]!.messages as Array<any>
      const assistantToolMessage = continuationMessages.find(
        (message) =>
          message.role === 'assistant' &&
          message.toolCalls?.[0]?.id === 'call_1',
      )

      expect(assistantToolMessage?.thinking).toEqual([
        { content: 'Need inventory.', signature: 'sig-think-1' },
      ])
    })

    it('should execute tool calls that only provide the deprecated toolName field', async () => {
      const toolSpy = vi.fn().mockReturnValue({ result: 'inventory' })

      const { adapter, calls } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            chunk(EventType.TOOL_CALL_START, {
              toolCallId: 'call_1',
              toolName: 'getInventory',
            }),
            ev.toolArgs('call_1', '{}'),
            ev.toolEnd('call_1', 'getInventory'),
            ev.runFinished('tool_calls'),
          ],
          [
            ev.runStarted(),
            ev.textStart(),
            ev.textContent('Inventory loaded.'),
            ev.textEnd(),
            ev.runFinished('stop'),
          ],
        ],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Check inventory' }],
        tools: [serverTool('getInventory', toolSpy)],
      })

      await collectChunks(stream as AsyncIterable<StreamChunk>)

      expect(toolSpy).toHaveBeenCalledTimes(1)
      expect(calls).toHaveLength(2)
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
      expect(calls[0]!.modelOptions).toEqual({ customParam: 'value' })
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

  // ==========================================================================
  // Lazy tool discovery
  // ==========================================================================
  describe('lazy tool discovery', () => {
    it('should create discovery tool when lazy tools are provided', async () => {
      const weatherExecute = vi.fn().mockReturnValue({ temp: 72 })

      let callCount = 0
      const { adapter, calls } = createMockAdapter({
        chatStreamFn: (opts: any) => {
          callCount++
          const toolNames = opts.tools?.map((t: any) => t.name) || []

          if (callCount === 1) {
            // First call: only discovery tool available, LLM discovers getWeather
            return (async function* () {
              yield ev.runStarted()
              yield ev.toolStart('call_disc', '__lazy__tool__discovery__')
              yield ev.toolArgs(
                'call_disc',
                JSON.stringify({ toolNames: ['getWeather'] }),
              )
              yield ev.toolEnd('call_disc', '__lazy__tool__discovery__', {
                input: { toolNames: ['getWeather'] },
              })
              yield ev.runFinished('tool_calls')
            })()
          } else if (callCount === 2 && toolNames.includes('getWeather')) {
            // Second call: getWeather is now available, LLM calls it
            return (async function* () {
              yield ev.runStarted()
              yield ev.toolStart('call_weather', 'getWeather')
              yield ev.toolArgs('call_weather', '{"city":"NYC"}')
              yield ev.toolEnd('call_weather', 'getWeather', {
                input: { city: 'NYC' },
              })
              yield ev.runFinished('tool_calls')
            })()
          } else {
            // Third call: final text after tool execution
            return (async function* () {
              yield ev.runStarted()
              yield ev.textStart()
              yield ev.textContent('It is 72F in NYC.')
              yield ev.textEnd()
              yield ev.runFinished('stop')
            })()
          }
        },
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Weather in NYC?' }],
        tools: [lazyServerTool('getWeather', weatherExecute)],
      })

      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)

      // First adapter call should have __lazy__tool__discovery__ but NOT getWeather
      const firstCallToolNames = (calls[0] as any).tools.map((t: any) => t.name)
      expect(firstCallToolNames).toContain('__lazy__tool__discovery__')
      expect(firstCallToolNames).not.toContain('getWeather')

      // Second adapter call should have getWeather (after discovery)
      const secondCallToolNames = (calls[1] as any).tools.map(
        (t: any) => t.name,
      )
      expect(secondCallToolNames).toContain('getWeather')

      // TOOL_CALL_END chunks should exist for both discovery and getWeather
      const toolEndChunks = chunks.filter((c) => c.type === 'TOOL_CALL_END')
      expect(toolEndChunks.length).toBeGreaterThanOrEqual(2)

      // getWeather should have been executed
      expect(weatherExecute).toHaveBeenCalledTimes(1)
    })

    it('should work with mix of eager and lazy tools', async () => {
      const eagerExecute = vi.fn().mockReturnValue({ result: 'eager' })
      const lazyExecute = vi.fn().mockReturnValue({ result: 'lazy' })

      const { adapter, calls } = createMockAdapter({
        iterations: [
          [ev.runStarted(), ev.textContent('Hello'), ev.runFinished('stop')],
        ],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        tools: [
          serverTool('eagerTool', eagerExecute),
          lazyServerTool('lazyTool', lazyExecute),
        ],
      })

      await collectChunks(stream as AsyncIterable<StreamChunk>)

      // First adapter call should have eager tool + discovery tool, but NOT lazyTool
      const firstCallToolNames = (calls[0] as any).tools.map((t: any) => t.name)
      expect(firstCallToolNames).toContain('eagerTool')
      expect(firstCallToolNames).toContain('__lazy__tool__discovery__')
      expect(firstCallToolNames).not.toContain('lazyTool')
    })

    it('should handle undiscovered lazy tool call with self-correcting error', async () => {
      const weatherExecute = vi.fn().mockReturnValue({ temp: 72 })

      let callCount = 0
      const { adapter } = createMockAdapter({
        chatStreamFn: (opts: any) => {
          callCount++
          const toolNames = opts.tools?.map((t: any) => t.name) || []

          if (callCount === 1) {
            // First call: LLM tries to call getWeather without discovering it
            return (async function* () {
              yield ev.runStarted()
              yield ev.toolStart('call_weather_bad', 'getWeather')
              yield ev.toolArgs('call_weather_bad', '{"city":"NYC"}')
              yield ev.runFinished('tool_calls')
            })()
          } else if (callCount === 2) {
            // Second call: LLM discovers getWeather
            return (async function* () {
              yield ev.runStarted()
              yield ev.toolStart('call_disc', '__lazy__tool__discovery__')
              yield ev.toolArgs(
                'call_disc',
                JSON.stringify({ toolNames: ['getWeather'] }),
              )
              yield ev.runFinished('tool_calls')
            })()
          } else if (callCount === 3 && toolNames.includes('getWeather')) {
            // Third call: LLM now calls getWeather successfully
            return (async function* () {
              yield ev.runStarted()
              yield ev.toolStart('call_weather_ok', 'getWeather')
              yield ev.toolArgs('call_weather_ok', '{"city":"NYC"}')
              yield ev.runFinished('tool_calls')
            })()
          } else {
            // Fourth call: final text
            return (async function* () {
              yield ev.runStarted()
              yield ev.textStart()
              yield ev.textContent('72F in NYC')
              yield ev.textEnd()
              yield ev.runFinished('stop')
            })()
          }
        },
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Weather in NYC?' }],
        tools: [lazyServerTool('getWeather', weatherExecute)],
      })

      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)

      // The first tool call result should contain a "must be discovered first" error
      // TOOL_CALL_RESULT carries the content (TOOL_CALL_END's result is stripped by middleware)
      const toolResultChunks = chunks.filter(
        (c) => c.type === 'TOOL_CALL_RESULT',
      ) as Array<any>
      const errorResult = toolResultChunks.find(
        (c: any) => c.content && c.content.includes('must be discovered first'),
      )
      expect(errorResult).toBeDefined()

      // Eventually getWeather should be executed successfully
      expect(weatherExecute).toHaveBeenCalledTimes(1)
    })

    it('should not create discovery tool when no lazy tools exist', async () => {
      const executeSpy = vi.fn().mockReturnValue({ result: 'ok' })

      const { adapter, calls } = createMockAdapter({
        iterations: [
          [ev.runStarted(), ev.textContent('Hi'), ev.runFinished('stop')],
        ],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hi' }],
        tools: [serverTool('normalTool', executeSpy)],
      })

      await collectChunks(stream as AsyncIterable<StreamChunk>)

      // No __lazy__tool__discovery__ should appear in the tools sent to the adapter
      const toolNames = (calls[0] as any).tools.map((t: any) => t.name)
      expect(toolNames).not.toContain('__lazy__tool__discovery__')
      expect(toolNames).toContain('normalTool')
    })

    it('should not error when the model re-requests discovery after all lazy tools are discovered (#788)', async () => {
      const weatherExecute = vi.fn().mockReturnValue({ temp: 72 })
      const toolNamesPerCall: Array<Array<string>> = []

      let callCount = 0
      const { adapter } = createMockAdapter({
        chatStreamFn: (opts: any) => {
          callCount++
          toolNamesPerCall.push((opts.tools ?? []).map((t: any) => t.name))

          if (callCount === 1) {
            // Discover the only lazy tool -> all discovered, so the discovery
            // tool is dropped from the advertised set.
            return (async function* () {
              yield ev.runStarted()
              yield ev.toolStart('c1', DISCOVERY_TOOL_NAME)
              yield ev.toolArgs(
                'c1',
                JSON.stringify({ toolNames: ['getWeather'] }),
              )
              yield ev.runFinished('tool_calls')
            })()
          } else if (callCount === 2) {
            // Model overlooks that getWeather is already available and asks to
            // discover it again, even though the discovery tool is no longer
            // advertised.
            return (async function* () {
              yield ev.runStarted()
              yield ev.toolStart('c2', DISCOVERY_TOOL_NAME)
              yield ev.toolArgs(
                'c2',
                JSON.stringify({ toolNames: ['getWeather'] }),
              )
              yield ev.runFinished('tool_calls')
            })()
          }
          return (async function* () {
            yield ev.runStarted()
            yield ev.textStart()
            yield ev.textContent('done')
            yield ev.textEnd()
            yield ev.runFinished('stop')
          })()
        },
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Weather?' }],
        tools: [lazyServerTool('getWeather', weatherExecute)],
      })

      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)

      // The discovery tool was removed from the advertised set on the 2nd call,
      // proving we fixed execution without re-advertising it.
      expect(toolNamesPerCall[1]).not.toContain(DISCOVERY_TOOL_NAME)
      expect(toolNamesPerCall[1]).toContain('getWeather')

      // Re-requesting discovery must NOT produce an "Unknown tool" error.
      const toolResults = chunks.filter(
        (c) => c.type === 'TOOL_CALL_RESULT',
      ) as Array<any>
      const unknownToolError = toolResults.find(
        (c: any) =>
          typeof c.content === 'string' && c.content.includes('Unknown tool'),
      )
      expect(unknownToolError).toBeUndefined()

      // The run progressed past the re-discovery turn to the final answer.
      const text = chunks
        .filter((c) => c.type === 'TEXT_MESSAGE_CONTENT')
        .map((c: any) => c.delta)
        .join('')
      expect(text).toContain('done')
    })

    it('should handle a discovery call batched with an already-available tool in one turn', async () => {
      const lazyAExecute = vi.fn().mockReturnValue({ a: 1 })
      const lazyBExecute = vi.fn().mockReturnValue({ b: 2 })
      const toolNamesPerCall: Array<Array<string>> = []

      let callCount = 0
      const { adapter } = createMockAdapter({
        chatStreamFn: (opts: any) => {
          callCount++
          toolNamesPerCall.push((opts.tools ?? []).map((t: any) => t.name))

          if (callCount === 1) {
            // Discover lazyA only (lazyB stays undiscovered).
            return (async function* () {
              yield ev.runStarted()
              yield ev.toolStart('d1', DISCOVERY_TOOL_NAME)
              yield ev.toolArgs('d1', JSON.stringify({ toolNames: ['lazyA'] }))
              yield ev.runFinished('tool_calls')
            })()
          } else if (callCount === 2) {
            // One batch: call the already-discovered lazyA AND discover lazyB.
            return (async function* () {
              yield ev.runStarted()
              yield ev.toolStart('a1', 'lazyA')
              yield ev.toolArgs('a1', '{}')
              yield ev.toolStart('d2', DISCOVERY_TOOL_NAME)
              yield ev.toolArgs('d2', JSON.stringify({ toolNames: ['lazyB'] }))
              yield ev.runFinished('tool_calls')
            })()
          } else if (callCount === 3) {
            // lazyB is now available -> call it.
            return (async function* () {
              yield ev.runStarted()
              yield ev.toolStart('b1', 'lazyB')
              yield ev.toolArgs('b1', '{}')
              yield ev.runFinished('tool_calls')
            })()
          }
          return (async function* () {
            yield ev.runStarted()
            yield ev.textStart()
            yield ev.textContent('ok')
            yield ev.textEnd()
            yield ev.runFinished('stop')
          })()
        },
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'go' }],
        tools: [
          lazyServerTool('lazyA', lazyAExecute),
          lazyServerTool('lazyB', lazyBExecute),
        ],
      })

      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)

      // lazyA executed despite sharing a batch with a discovery call.
      expect(lazyAExecute).toHaveBeenCalledTimes(1)
      // lazyB became available after the batched discovery and executed.
      expect(toolNamesPerCall[2]).toContain('lazyB')
      expect(lazyBExecute).toHaveBeenCalledTimes(1)

      const toolResults = chunks.filter(
        (c) => c.type === 'TOOL_CALL_RESULT',
      ) as Array<any>
      const unknownToolError = toolResults.find(
        (c: any) =>
          typeof c.content === 'string' && c.content.includes('Unknown tool'),
      )
      expect(unknownToolError).toBeUndefined()
    })
  })

  // ==========================================================================
  // AG-UI spec compliance (threadId, strip middleware)
  // ==========================================================================
  describe('AG-UI spec compliance', () => {
    it('should pass through adapter-generated threadId on RUN_STARTED and RUN_FINISHED events', async () => {
      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.textStart(),
            ev.textContent('Hi'),
            ev.textEnd(),
            ev.runFinished('stop'),
          ],
        ],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hello' }],
        threadId: 'my-thread-id',
      })

      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)

      const runStarted = chunks.find((c) => c.type === 'RUN_STARTED')
      expect(runStarted).toBeDefined()
      expect((runStarted as any).threadId).toBe('thread-1')

      const runFinished = chunks.find((c) => c.type === 'RUN_FINISHED')
      expect(runFinished).toBeDefined()
      expect((runFinished as any).threadId).toBe('thread-1')
    })

    it('should include both toolCallName (spec) and toolName (deprecated) on TOOL_CALL_START', async () => {
      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.textStart(),
            ev.toolStart('tc-1', 'get_weather'),
            ev.toolArgs('tc-1', '{}'),
            ev.toolEnd('tc-1', 'get_weather', {
              input: {},
              result: '{}',
            }),
            ev.runFinished('tool_calls'),
          ],
          [
            ev.runStarted(),
            ev.textStart(),
            ev.textContent('Done'),
            ev.textEnd(),
            ev.runFinished('stop'),
          ],
        ],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Weather' }],
        tools: [serverTool('get_weather', () => ({ temp: 72 }))],
      })

      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)

      const toolStartChunks = chunks.filter((c) => c.type === 'TOOL_CALL_START')
      for (const chunk of toolStartChunks) {
        // Both spec and deprecated field present (passthrough)
        expect((chunk as any).toolCallName).toBe('get_weather')
        expect((chunk as any).toolName).toBe('get_weather')
      }
    })

    it('should keep finishReason on RUN_FINISHED events', async () => {
      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.textStart(),
            ev.textContent('Hi'),
            ev.textEnd(),
            ev.runFinished('stop'),
          ],
        ],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Hello' }],
      })

      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)

      const runFinished = chunks.find((c) => c.type === 'RUN_FINISHED')
      expect(runFinished).toBeDefined()
      expect((runFinished as any).finishReason).toBe('stop')
    })

    it('should emit TOOL_CALL_RESULT events during agent loop', async () => {
      const { adapter } = createMockAdapter({
        iterations: [
          [
            ev.runStarted(),
            ev.textStart(),
            ev.toolStart('tc-1', 'get_weather'),
            ev.toolArgs('tc-1', '{}'),
            ev.toolEnd('tc-1', 'get_weather', { input: {} }),
            ev.runFinished('tool_calls'),
          ],
          [
            ev.runStarted(),
            ev.textStart(),
            ev.textContent('72F'),
            ev.textEnd(),
            ev.runFinished('stop'),
          ],
        ],
      })

      const stream = chat({
        adapter,
        messages: [{ role: 'user', content: 'Weather?' }],
        tools: [serverTool('get_weather', () => ({ temp: 72 }))],
      })

      const chunks = await collectChunks(stream as AsyncIterable<StreamChunk>)

      const resultChunks = chunks.filter((c) => c.type === 'TOOL_CALL_RESULT')
      expect(resultChunks.length).toBeGreaterThanOrEqual(1)
      expect((resultChunks[0] as any).toolCallId).toBe('tc-1')
      expect((resultChunks[0] as any).content).toContain('72')
      // model is kept (passthrough allows extra fields)
      expect((resultChunks[0] as any).toolCallId).toBeDefined()
    })
  })
})
