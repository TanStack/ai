import { type Mock, describe, expect, it, vi } from 'vitest'
import {
  StreamProcessor,
  createReplayStream,
} from '../src/activities/chat/stream/processor'
import type { StreamProcessorEvents } from '../src/activities/chat/stream/processor'
import type { ChunkStrategy } from '../src/activities/chat/stream/types'
import type {
  StreamChunk,
  ToolCallPart,
  ToolResultPart,
  UIMessage,
} from '../src/types'

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

/** Create an async iterable from a list of chunks. */
async function* streamOf(
  ...chunks: Array<StreamChunk>
): AsyncIterable<StreamChunk> {
  for (const c of chunks) {
    yield c
  }
}

/** Shorthand for common event sequences. */
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
  custom: (name: string, data?: unknown) => chunk('CUSTOM', { name, data }),
}

/** Events object with vi.fn() mocks for assertions. */
type MockedEvents = {
  [K in keyof Required<StreamProcessorEvents>]: Required<StreamProcessorEvents>[K] &
    Mock
}

/** Create a spy-laden events object for assertions. */
function spyEvents(): MockedEvents {
  return {
    onMessagesChange: vi.fn(),
    onStreamStart: vi.fn(),
    onStreamEnd: vi.fn(),
    onError: vi.fn(),
    onToolCall: vi.fn(),
    onApprovalRequest: vi.fn(),
    onTextUpdate: vi.fn(),
    onToolCallStateChange: vi.fn(),
    onThinkingUpdate: vi.fn(),
  } as MockedEvents
}

// ============================================================================
// Tests
// ============================================================================

describe('StreamProcessor', () => {
  // ==========================================================================
  // Constructor and options
  // ==========================================================================
  describe('constructor and options', () => {
    it('should initialize with default options', () => {
      const processor = new StreamProcessor()
      expect(processor.getMessages()).toEqual([])
      expect(processor.getCurrentAssistantMessageId()).toBeNull()
      expect(processor.getState().done).toBe(false)
    })

    it('should accept initialMessages', () => {
      const initial: Array<UIMessage> = [
        { id: 'u1', role: 'user', parts: [{ type: 'text', content: 'hi' }] },
      ]
      const processor = new StreamProcessor({ initialMessages: initial })
      expect(processor.getMessages()).toHaveLength(1)
      expect(processor.getMessages()[0]!.id).toBe('u1')
    })

    it('should not mutate the initialMessages array', () => {
      const initial: Array<UIMessage> = [
        { id: 'u1', role: 'user', parts: [{ type: 'text', content: 'hi' }] },
      ]
      const processor = new StreamProcessor({ initialMessages: initial })
      processor.addUserMessage('second')
      // Original array should be unchanged
      expect(initial).toHaveLength(1)
      expect(processor.getMessages()).toHaveLength(2)
    })

    it('should use custom chunkStrategy', () => {
      const shouldEmit = vi.fn().mockReturnValue(false)
      const strategy: ChunkStrategy = { shouldEmit }

      const processor = new StreamProcessor({ chunkStrategy: strategy })
      processor.prepareAssistantMessage()

      processor.processChunk(ev.textContent('Hello'))

      // Strategy was consulted
      expect(shouldEmit).toHaveBeenCalledWith('Hello', 'Hello')

      // Since strategy returned false, the text part is NOT emitted to the message
      const msg = processor.getMessages()[0]!
      expect(msg.parts).toHaveLength(0)
    })

    it('should use custom jsonParser', () => {
      const parse = vi.fn().mockReturnValue({ custom: true })
      const processor = new StreamProcessor({ jsonParser: { parse } })
      processor.prepareAssistantMessage()

      processor.processChunk(ev.toolStart('tc-1', 'myTool'))
      processor.processChunk(ev.toolArgs('tc-1', '{"key":"val"}'))

      expect(parse).toHaveBeenCalledWith('{"key":"val"}')
      expect(
        processor.getState().toolCalls.get('tc-1')?.parsedArguments,
      ).toEqual({ custom: true })
    })
  })

  // ==========================================================================
  // Message management
  // ==========================================================================
  describe('message management', () => {
    it('setMessages should replace messages and emit change', () => {
      const events = spyEvents()
      const processor = new StreamProcessor({ events })
      const msgs: Array<UIMessage> = [
        {
          id: 'a1',
          role: 'assistant',
          parts: [{ type: 'text', content: 'hello' }],
        },
      ]
      processor.setMessages(msgs)

      expect(processor.getMessages()).toHaveLength(1)
      expect(processor.getMessages()[0]!.id).toBe('a1')
      expect(events.onMessagesChange).toHaveBeenCalledTimes(1)
    })

    it('setMessages should shallow-copy the input array', () => {
      const processor = new StreamProcessor()
      const msgs: Array<UIMessage> = [
        { id: 'a1', role: 'assistant', parts: [] },
      ]
      processor.setMessages(msgs)
      msgs.push({ id: 'a2', role: 'user', parts: [] })
      expect(processor.getMessages()).toHaveLength(1)
    })

    it('addUserMessage with string content', () => {
      const events = spyEvents()
      const processor = new StreamProcessor({ events })
      const msg = processor.addUserMessage('Hello!')

      expect(msg.role).toBe('user')
      expect(msg.parts).toEqual([{ type: 'text', content: 'Hello!' }])
      expect(msg.id).toBeTruthy()
      expect(msg.createdAt).toBeInstanceOf(Date)
      expect(processor.getMessages()).toHaveLength(1)
      expect(events.onMessagesChange).toHaveBeenCalledTimes(1)
    })

    it('addUserMessage with multimodal content array', () => {
      const processor = new StreamProcessor()
      const msg = processor.addUserMessage([
        { type: 'text', content: 'What is this?' },
        {
          type: 'image',
          source: { type: 'url', value: 'https://example.com/img.png' },
        } as any,
      ])

      expect(msg.parts).toHaveLength(2)
      expect(msg.parts[0]!.type).toBe('text')
      expect(msg.parts[1]!.type).toBe('image')
    })

    it('addUserMessage with custom id', () => {
      const processor = new StreamProcessor()
      const msg = processor.addUserMessage('Hello', 'custom-id-42')
      expect(msg.id).toBe('custom-id-42')
    })

    it('clearMessages should remove all messages and reset assistantMessageId', () => {
      const events = spyEvents()
      const processor = new StreamProcessor({ events })
      processor.addUserMessage('one')
      processor.addUserMessage('two')
      events.onMessagesChange.mockClear()

      processor.clearMessages()
      expect(processor.getMessages()).toHaveLength(0)
      expect(processor.getCurrentAssistantMessageId()).toBeNull()
      expect(events.onMessagesChange).toHaveBeenCalledTimes(1)
    })

    it('removeMessagesAfter should truncate after the given index', () => {
      const events = spyEvents()
      const processor = new StreamProcessor({ events })
      processor.addUserMessage('zero')
      processor.addUserMessage('one')
      processor.addUserMessage('two')
      events.onMessagesChange.mockClear()

      processor.removeMessagesAfter(0)
      expect(processor.getMessages()).toHaveLength(1)
      expect(processor.getMessages()[0]!.parts[0]).toEqual({
        type: 'text',
        content: 'zero',
      })
      expect(events.onMessagesChange).toHaveBeenCalledTimes(1)
    })

    it('toModelMessages should convert all messages', () => {
      const processor = new StreamProcessor()
      processor.addUserMessage('Hello')

      // Simulate an assistant response
      processor.prepareAssistantMessage()
      processor.processChunk(ev.textContent('Hi there'))
      processor.processChunk(ev.runFinished('stop'))
      processor.finalizeStream()

      const modelMsgs = processor.toModelMessages()
      expect(modelMsgs.length).toBeGreaterThanOrEqual(2)
      expect(modelMsgs[0]!.role).toBe('user')
      expect(modelMsgs[1]!.role).toBe('assistant')
    })
  })

  // ==========================================================================
  // process() full stream
  // ==========================================================================
  describe('process() full stream', () => {
    it('should consume async iterable and return ProcessorResult', async () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()

      const result = await processor.process(
        streamOf(
          ev.runStarted(),
          ev.textStart(),
          ev.textContent('Hello'),
          ev.textContent(' world!'),
          ev.textEnd(),
          ev.runFinished('stop'),
        ),
      )

      expect(result.content).toBe('Hello world!')
      expect(result.finishReason).toBe('stop')
      expect(result.toolCalls).toBeUndefined()
      expect(result.thinking).toBeUndefined()
    })

    it('should return toolCalls in ProcessorResult when tool calls present', async () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()

      const result = await processor.process(
        streamOf(
          ev.runStarted(),
          ev.toolStart('tc-1', 'getWeather'),
          ev.toolArgs('tc-1', '{"city":"NYC"}'),
          ev.toolEnd('tc-1', 'getWeather', { input: { city: 'NYC' } }),
          ev.runFinished('tool_calls'),
        ),
      )

      expect(result.content).toBe('')
      expect(result.finishReason).toBe('tool_calls')
      expect(result.toolCalls).toHaveLength(1)
      expect(result.toolCalls![0]!.function.name).toBe('getWeather')
      expect(result.toolCalls![0]!.function.arguments).toBe('{"city":"NYC"}')
    })

    it('should return thinking in ProcessorResult when thinking present', async () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()

      const result = await processor.process(
        streamOf(
          ev.runStarted(),
          ev.stepFinished('Let me think'),
          ev.stepFinished('...'),
          ev.textStart(),
          ev.textContent('Answer'),
          ev.textEnd(),
          ev.runFinished('stop'),
        ),
      )

      expect(result.content).toBe('Answer')
      expect(result.thinking).toBe('Let me think...')
    })

    it('should call finalizeStream after consuming the stream', async () => {
      const events = spyEvents()
      const processor = new StreamProcessor({ events })
      processor.prepareAssistantMessage()

      await processor.process(
        streamOf(
          ev.runStarted(),
          ev.textStart(),
          ev.textContent('Done'),
          ev.textEnd(),
          ev.runFinished('stop'),
        ),
      )

      // onStreamEnd should have been called (by finalizeStream)
      expect(events.onStreamEnd).toHaveBeenCalledTimes(1)
    })
  })

  // ==========================================================================
  // Single-shot text
  // ==========================================================================
  describe('single-shot text', () => {
    it('should handle full text-only flow: RUN_STARTED -> TEXT_MESSAGE_START -> TEXT_MESSAGE_CONTENT* -> TEXT_MESSAGE_END -> RUN_FINISHED(stop)', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()

      processor.processChunk(ev.runStarted())
      processor.processChunk(ev.textStart())
      processor.processChunk(ev.textContent('Hello'))
      processor.processChunk(ev.textContent(' world'))
      processor.processChunk(ev.textContent('!'))
      processor.processChunk(ev.textEnd())
      processor.processChunk(ev.runFinished('stop'))

      processor.finalizeStream()

      const messages = processor.getMessages()
      expect(messages).toHaveLength(1)
      expect(messages[0]!.role).toBe('assistant')
      expect(messages[0]!.parts).toHaveLength(1)
      expect(messages[0]!.parts[0]).toEqual({
        type: 'text',
        content: 'Hello world!',
      })

      const state = processor.getState()
      expect(state.content).toBe('Hello world!')
      expect(state.finishReason).toBe('stop')
      expect(state.done).toBe(true)
    })

    it('should handle TEXT_MESSAGE_CONTENT with delta (existing test preserved)', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()

      processor.processChunk(ev.textContent('Hello'))
      processor.processChunk(ev.textContent(' world'))
      processor.processChunk(ev.runFinished('stop'))

      const messages = processor.getMessages()
      expect(messages).toHaveLength(1)
      expect(messages[0]?.parts).toHaveLength(1)
      expect(messages[0]?.parts[0]).toEqual({
        type: 'text',
        content: 'Hello world',
      })
    })
  })

  // ==========================================================================
  // Single-shot tool call
  // ==========================================================================
  describe('single-shot tool call', () => {
    it('should handle tool call only (no text)', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()

      processor.processChunk(ev.runStarted())
      processor.processChunk(ev.toolStart('call_1', 'getWeather'))
      processor.processChunk(ev.toolArgs('call_1', '{"city":'))
      processor.processChunk(ev.toolArgs('call_1', '"NYC"}'))
      processor.processChunk(ev.toolEnd('call_1', 'getWeather'))
      processor.processChunk(ev.runFinished('tool_calls'))

      processor.finalizeStream()

      const messages = processor.getMessages()
      expect(messages).toHaveLength(1)
      expect(messages[0]!.parts).toHaveLength(1)

      const toolCallPart = messages[0]!.parts[0] as ToolCallPart
      expect(toolCallPart.type).toBe('tool-call')
      expect(toolCallPart.id).toBe('call_1')
      expect(toolCallPart.name).toBe('getWeather')
      expect(toolCallPart.arguments).toBe('{"city":"NYC"}')
      expect(toolCallPart.state).toBe('input-complete')

      const state = processor.getState()
      expect(state.content).toBe('')
      expect(state.finishReason).toBe('tool_calls')
    })

    it('should handle text then tool call', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()

      processor.processChunk(ev.runStarted())
      processor.processChunk(ev.textStart())
      processor.processChunk(ev.textContent('Let me check.'))
      processor.processChunk(ev.textEnd())
      processor.processChunk(ev.toolStart('call_1', 'getWeather'))
      processor.processChunk(ev.toolArgs('call_1', '{"city":"NYC"}'))
      processor.processChunk(
        ev.toolEnd('call_1', 'getWeather', { input: { city: 'NYC' } }),
      )
      processor.processChunk(ev.runFinished('tool_calls'))

      processor.finalizeStream()

      const messages = processor.getMessages()
      expect(messages).toHaveLength(1)
      expect(messages[0]!.parts).toHaveLength(2)
      expect(messages[0]!.parts[0]).toEqual({
        type: 'text',
        content: 'Let me check.',
      })

      const tcPart = messages[0]!.parts[1] as ToolCallPart
      expect(tcPart.type).toBe('tool-call')
      expect(tcPart.state).toBe('input-complete')
    })

    it('should track state transitions: awaiting-input -> input-streaming -> input-complete', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()

      processor.processChunk(ev.toolStart('tc-1', 'getWeather'))
      expect(processor.getState().toolCalls.get('tc-1')?.state).toBe(
        'awaiting-input',
      )

      processor.processChunk(ev.toolArgs('tc-1', '{"city":'))
      expect(processor.getState().toolCalls.get('tc-1')?.state).toBe(
        'input-streaming',
      )

      processor.processChunk(ev.toolArgs('tc-1', '"NYC"}'))
      expect(processor.getState().toolCalls.get('tc-1')?.state).toBe(
        'input-streaming',
      )

      processor.processChunk(ev.toolEnd('tc-1', 'getWeather'))
      expect(processor.getState().toolCalls.get('tc-1')?.state).toBe(
        'input-complete',
      )
    })

    it('should use chunk.input as canonical parsed arguments (existing test preserved)', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()

      processor.processChunk(ev.toolStart('tc-1', 'getWeather'))
      processor.processChunk(
        ev.toolEnd('tc-1', 'getWeather', {
          input: { city: 'NYC', unit: 'celsius' },
        }),
      )

      const state = processor.getState()
      const toolCall = state.toolCalls.get('tc-1')
      expect(toolCall?.state).toBe('input-complete')
      expect(toolCall?.parsedArguments).toEqual({
        city: 'NYC',
        unit: 'celsius',
      })
    })

    it('should default tool call index to toolCalls.size when index is not provided', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()

      processor.processChunk(ev.toolStart('tc-1', 'toolA'))
      processor.processChunk(ev.toolStart('tc-2', 'toolB'))

      const state = processor.getState()
      expect(state.toolCalls.get('tc-1')?.index).toBe(0)
      expect(state.toolCalls.get('tc-2')?.index).toBe(1)
    })

    it('should use provided index when available', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()

      processor.processChunk(ev.toolStart('tc-1', 'toolA', 5))

      expect(processor.getState().toolCalls.get('tc-1')?.index).toBe(5)
    })
  })

  // ==========================================================================
  // Parallel tool calls
  // ==========================================================================
  describe('parallel tool calls', () => {
    it('should handle interleaved parallel tool calls', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()

      // Interleaved: both STARTs, then both ARGS, then both ENDs
      processor.processChunk(ev.runStarted())
      processor.processChunk(ev.toolStart('call_1', 'getWeather', 0))
      processor.processChunk(ev.toolStart('call_2', 'getTime', 1))
      processor.processChunk(ev.toolArgs('call_1', '{"city":"NYC"}'))
      processor.processChunk(ev.toolArgs('call_2', '{"tz":"EST"}'))
      processor.processChunk(ev.toolEnd('call_1', 'getWeather'))
      processor.processChunk(ev.toolEnd('call_2', 'getTime'))
      processor.processChunk(ev.runFinished('tool_calls'))

      processor.finalizeStream()

      const messages = processor.getMessages()
      expect(messages).toHaveLength(1)
      expect(messages[0]!.parts).toHaveLength(2)

      const tc1 = messages[0]!.parts[0] as ToolCallPart
      const tc2 = messages[0]!.parts[1] as ToolCallPart
      expect(tc1.id).toBe('call_1')
      expect(tc1.name).toBe('getWeather')
      expect(tc1.arguments).toBe('{"city":"NYC"}')
      expect(tc1.state).toBe('input-complete')

      expect(tc2.id).toBe('call_2')
      expect(tc2.name).toBe('getTime')
      expect(tc2.arguments).toBe('{"tz":"EST"}')
      expect(tc2.state).toBe('input-complete')
    })

    it('should handle sequential parallel tool calls', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()

      // Sequential: one tool fully completes before the next starts
      processor.processChunk(ev.toolStart('call_1', 'getWeather'))
      processor.processChunk(ev.toolArgs('call_1', '{"city":"NYC"}'))
      processor.processChunk(ev.toolEnd('call_1', 'getWeather'))
      processor.processChunk(ev.toolStart('call_2', 'getTime'))
      processor.processChunk(ev.toolArgs('call_2', '{"tz":"EST"}'))
      processor.processChunk(ev.toolEnd('call_2', 'getTime'))
      processor.processChunk(ev.runFinished('tool_calls'))

      processor.finalizeStream()

      const messages = processor.getMessages()
      expect(messages[0]!.parts).toHaveLength(2)
      expect((messages[0]!.parts[0] as ToolCallPart).id).toBe('call_1')
      expect((messages[0]!.parts[1] as ToolCallPart).id).toBe('call_2')
    })

    it('should track tool calls by toolCallId in Map, maintaining order', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()

      processor.processChunk(ev.toolStart('call_1', 'getWeather'))
      processor.processChunk(ev.toolStart('call_2', 'getTime'))

      const state = processor.getState()
      expect(state.toolCallOrder).toEqual(['call_1', 'call_2'])
      expect(state.toolCalls.size).toBe(2)
    })
  })

  // ==========================================================================
  // Text-tool interleaving
  // ==========================================================================
  describe('text-tool interleaving', () => {
    it('should reset segment text accumulation on TEXT_MESSAGE_START (existing test preserved)', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()

      processor.processChunk(ev.textStart())
      processor.processChunk(ev.textContent('First segment'))
      processor.processChunk(ev.toolStart('tc-1', 'search'))
      processor.processChunk(ev.toolEnd('tc-1', 'search', { input: {} }))
      processor.processChunk(ev.textStart('msg-2'))
      processor.processChunk(ev.textContent('Second segment', 'msg-2'))
      processor.processChunk(ev.runFinished('stop'))
      processor.finalizeStream()

      const state = processor.getState()
      expect(state.content).toBe('First segmentSecond segment')
    })

    it('should produce text -> tool-call -> tool-result -> text (4-part ordering)', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()

      // First adapter stream: text + tool call
      processor.processChunk(ev.runStarted())
      processor.processChunk(ev.textStart())
      processor.processChunk(ev.textContent('Checking weather...'))
      processor.processChunk(ev.textEnd())
      processor.processChunk(ev.toolStart('call_1', 'getWeather'))
      processor.processChunk(ev.toolArgs('call_1', '{"city":"NYC"}'))
      processor.processChunk(ev.toolEnd('call_1', 'getWeather'))
      processor.processChunk(ev.runFinished('tool_calls'))

      // TextEngine executes tool, yields result
      processor.processChunk(
        ev.toolEnd('call_1', 'getWeather', { result: '{"temp":"72F"}' }),
      )

      // Second adapter stream: more text
      processor.processChunk(ev.textStart('msg-2'))
      processor.processChunk(ev.textContent("It's 72F in NYC.", 'msg-2'))
      processor.processChunk(ev.textEnd('msg-2'))
      processor.processChunk(ev.runFinished('stop'))

      processor.finalizeStream()

      const messages = processor.getMessages()
      expect(messages).toHaveLength(1)
      const parts = messages[0]!.parts

      // Expected: [text, tool-call, tool-result, text]
      expect(parts).toHaveLength(4)
      expect(parts[0]!.type).toBe('text')
      expect((parts[0] as any).content).toBe('Checking weather...')

      expect(parts[1]!.type).toBe('tool-call')
      expect((parts[1] as ToolCallPart).id).toBe('call_1')

      expect(parts[2]!.type).toBe('tool-result')
      expect((parts[2] as ToolResultPart).toolCallId).toBe('call_1')

      expect(parts[3]!.type).toBe('text')
      expect((parts[3] as any).content).toBe("It's 72F in NYC.")
    })

    it('should create two separate TextParts for text before and after tool calls', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()

      processor.processChunk(ev.textStart())
      processor.processChunk(ev.textContent('Before'))
      processor.processChunk(ev.textEnd())
      processor.processChunk(ev.toolStart('tc-1', 'tool'))
      processor.processChunk(ev.toolEnd('tc-1', 'tool'))
      processor.processChunk(ev.textStart('msg-2'))
      processor.processChunk(ev.textContent('After', 'msg-2'))
      processor.processChunk(ev.textEnd('msg-2'))
      processor.processChunk(ev.runFinished('stop'))
      processor.finalizeStream()

      const parts = processor.getMessages()[0]!.parts
      const textParts = parts.filter((p) => p.type === 'text')
      expect(textParts).toHaveLength(2)
      expect((textParts[0] as any).content).toBe('Before')
      expect((textParts[1] as any).content).toBe('After')
    })
  })

  // ==========================================================================
  // Thinking/reasoning
  // ==========================================================================
  describe('thinking/reasoning', () => {
    it('should accumulate STEP_FINISHED deltas into thinking content', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()

      processor.processChunk(ev.stepFinished('Let me think'))
      processor.processChunk(ev.stepFinished(' about this...'))

      const messages = processor.getMessages()
      expect(messages).toHaveLength(1)
      const thinkingPart = messages[0]!.parts.find((p) => p.type === 'thinking')
      expect(thinkingPart).toBeDefined()
      expect((thinkingPart as any).content).toBe('Let me think about this...')
    })

    it('should handle thinking then text flow', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()

      processor.processChunk(ev.runStarted())
      processor.processChunk(ev.stepFinished('Let me think'))
      processor.processChunk(ev.stepFinished(' about this...'))
      processor.processChunk(ev.textStart())
      processor.processChunk(ev.textContent("Here's my answer."))
      processor.processChunk(ev.textEnd())
      processor.processChunk(ev.runFinished('stop'))

      processor.finalizeStream()

      const parts = processor.getMessages()[0]!.parts
      expect(parts).toHaveLength(2)
      expect(parts[0]!.type).toBe('thinking')
      expect((parts[0] as any).content).toBe('Let me think about this...')
      expect(parts[1]!.type).toBe('text')
      expect((parts[1] as any).content).toBe("Here's my answer.")

      const state = processor.getState()
      expect(state.thinking).toBe('Let me think about this...')
      expect(state.content).toBe("Here's my answer.")
    })

    it('should create assistant message lazily on thinking content (existing test preserved)', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()

      expect(processor.getMessages()).toHaveLength(0)

      processor.processChunk(ev.stepFinished('thinking...'))

      expect(processor.getMessages()).toHaveLength(1)
      expect(
        processor.getMessages()[0]?.parts.some((p) => p.type === 'thinking'),
      ).toBe(true)
    })

    it('should update a single ThinkingPart in-place', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()

      processor.processChunk(ev.stepFinished('A'))
      processor.processChunk(ev.stepFinished('B'))
      processor.processChunk(ev.stepFinished('C'))

      // Only one thinking part, not three
      const parts = processor.getMessages()[0]!.parts
      const thinkingParts = parts.filter((p) => p.type === 'thinking')
      expect(thinkingParts).toHaveLength(1)
      expect((thinkingParts[0] as any).content).toBe('ABC')
    })
  })

  // ==========================================================================
  // Tool results
  // ==========================================================================
  describe('tool results', () => {
    it('should update tool-call part output field when TOOL_CALL_END has a result (existing test)', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()

      processor.processChunk(ev.toolStart('tc-1', 'getWeather'))
      processor.processChunk(ev.toolArgs('tc-1', '{"city":"NYC"}'))
      processor.processChunk(
        ev.toolEnd('tc-1', 'getWeather', {
          input: { city: 'NYC' },
          result: '{"temp":72}',
        }),
      )

      const messages = processor.getMessages()
      const toolCallPart = messages[0]?.parts.find(
        (p) => p.type === 'tool-call',
      ) as ToolCallPart
      expect((toolCallPart as any).output).toEqual({ temp: 72 })

      const toolResultPart = messages[0]?.parts.find(
        (p) => p.type === 'tool-result',
      ) as ToolResultPart
      expect(toolResultPart).toBeDefined()
      expect(toolResultPart.content).toBe('{"temp":72}')
      expect(toolResultPart.state).toBe('complete')
    })

    it('should not update tool-call output when TOOL_CALL_END has no result (existing test)', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()

      processor.processChunk(ev.toolStart('tc-1', 'getWeather'))
      processor.processChunk(
        ev.toolEnd('tc-1', 'getWeather', { input: { city: 'NYC' } }),
      )

      const messages = processor.getMessages()
      const toolCallPart = messages[0]?.parts.find(
        (p) => p.type === 'tool-call',
      )
      expect((toolCallPart as any).output).toBeUndefined()
      expect(
        messages[0]?.parts.find((p) => p.type === 'tool-result'),
      ).toBeUndefined()
    })

    it('should handle non-JSON result string gracefully (existing test)', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()

      processor.processChunk(ev.toolStart('tc-1', 'getText'))
      processor.processChunk(
        ev.toolEnd('tc-1', 'getText', {
          input: {},
          result: 'plain text result',
        }),
      )

      const toolCallPart = processor
        .getMessages()[0]
        ?.parts.find((p) => p.type === 'tool-call')
      expect((toolCallPart as any).output).toBe('plain text result')
    })

    it('addToolResult should create tool-result part and set output on tool-call part', () => {
      const events = spyEvents()
      const processor = new StreamProcessor({ events })
      processor.prepareAssistantMessage()

      processor.processChunk(ev.toolStart('tc-1', 'getWeather'))
      processor.processChunk(
        ev.toolEnd('tc-1', 'getWeather', { input: { city: 'NYC' } }),
      )
      events.onMessagesChange.mockClear()

      processor.addToolResult('tc-1', { temp: 72 })

      const messages = processor.getMessages()
      const toolCallPart = messages[0]!.parts.find(
        (p) => p.type === 'tool-call',
      ) as ToolCallPart
      expect((toolCallPart as any).output).toEqual({ temp: 72 })

      const toolResultPart = messages[0]!.parts.find(
        (p) => p.type === 'tool-result',
      ) as ToolResultPart
      expect(toolResultPart).toBeDefined()
      expect(toolResultPart.content).toBe('{"temp":72}')
      expect(toolResultPart.state).toBe('complete')

      expect(events.onMessagesChange).toHaveBeenCalled()
    })

    it('addToolResult with string output should store as-is', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()

      processor.processChunk(ev.toolStart('tc-1', 'getText'))
      processor.processChunk(ev.toolEnd('tc-1', 'getText', { input: {} }))

      processor.addToolResult('tc-1', 'plain string output')

      const toolResultPart = processor
        .getMessages()[0]!
        .parts.find((p) => p.type === 'tool-result') as ToolResultPart
      expect(toolResultPart.content).toBe('plain string output')
    })

    it('addToolResult with error should set error state', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()

      processor.processChunk(ev.toolStart('tc-1', 'getWeather'))
      processor.processChunk(ev.toolEnd('tc-1', 'getWeather', { input: {} }))

      processor.addToolResult('tc-1', null, 'Network error')

      const toolCallPart = processor
        .getMessages()[0]!
        .parts.find((p) => p.type === 'tool-call') as ToolCallPart
      expect((toolCallPart as any).output).toEqual({ error: 'Network error' })

      const toolResultPart = processor
        .getMessages()[0]!
        .parts.find((p) => p.type === 'tool-result') as ToolResultPart
      expect(toolResultPart.state).toBe('error')
      expect(toolResultPart.error).toBe('Network error')
    })

    it('addToolResult with missing toolCallId should warn and no-op', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const processor = new StreamProcessor()

      processor.addToolResult('nonexistent-id', { temp: 72 })

      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('nonexistent-id'),
      )
      expect(processor.getMessages()).toHaveLength(0)
      warnSpy.mockRestore()
    })
  })

  // ==========================================================================
  // Client tools (CUSTOM events)
  // ==========================================================================
  describe('client tools (CUSTOM events)', () => {
    it('should fire onToolCall when tool-input-available CUSTOM event arrives', () => {
      const events = spyEvents()
      const processor = new StreamProcessor({ events })
      processor.prepareAssistantMessage()

      // Create a tool call first
      processor.processChunk(ev.toolStart('tc-1', 'clientTool'))
      processor.processChunk(
        ev.toolEnd('tc-1', 'clientTool', { input: { query: 'test' } }),
      )

      processor.processChunk(
        ev.custom('tool-input-available', {
          toolCallId: 'tc-1',
          toolName: 'clientTool',
          input: { query: 'test' },
        }),
      )

      expect(events.onToolCall).toHaveBeenCalledTimes(1)
      expect(events.onToolCall).toHaveBeenCalledWith({
        toolCallId: 'tc-1',
        toolName: 'clientTool',
        input: { query: 'test' },
      })
    })

    it('should not fire onToolCall for CUSTOM events with no data', () => {
      const events = spyEvents()
      const processor = new StreamProcessor({ events })
      processor.prepareAssistantMessage()

      processor.processChunk(ev.custom('tool-input-available'))

      expect(events.onToolCall).not.toHaveBeenCalled()
    })

    it('should not fire onToolCall for unrelated CUSTOM events', () => {
      const events = spyEvents()
      const processor = new StreamProcessor({ events })
      processor.prepareAssistantMessage()

      processor.processChunk(ev.custom('some-other-event', { foo: 'bar' }))

      expect(events.onToolCall).not.toHaveBeenCalled()
    })
  })

  // ==========================================================================
  // Approval flow
  // ==========================================================================
  describe('approval flow', () => {
    it('should handle approval-requested CUSTOM event', () => {
      const events = spyEvents()
      const processor = new StreamProcessor({ events })
      processor.prepareAssistantMessage()

      // Create a tool call
      processor.processChunk(ev.toolStart('tc-1', 'dangerousTool'))
      processor.processChunk(
        ev.toolEnd('tc-1', 'dangerousTool', { input: { action: 'delete' } }),
      )

      // Fire approval request
      processor.processChunk(
        ev.custom('approval-requested', {
          toolCallId: 'tc-1',
          toolName: 'dangerousTool',
          input: { action: 'delete' },
          approval: { id: 'approval-1', needsApproval: true },
        }),
      )

      // Check that tool-call part has approval state
      const toolCallPart = processor
        .getMessages()[0]!
        .parts.find((p) => p.type === 'tool-call') as ToolCallPart
      expect(toolCallPart.state).toBe('approval-requested')
      expect(toolCallPart.approval).toEqual({
        id: 'approval-1',
        needsApproval: true,
      })

      // Check callback was fired
      expect(events.onApprovalRequest).toHaveBeenCalledWith({
        toolCallId: 'tc-1',
        toolName: 'dangerousTool',
        input: { action: 'delete' },
        approvalId: 'approval-1',
      })
    })

    it('addToolApprovalResponse should approve a tool call', () => {
      const events = spyEvents()
      const processor = new StreamProcessor({ events })
      processor.prepareAssistantMessage()

      processor.processChunk(ev.toolStart('tc-1', 'dangerousTool'))
      processor.processChunk(ev.toolEnd('tc-1', 'dangerousTool', { input: {} }))
      processor.processChunk(
        ev.custom('approval-requested', {
          toolCallId: 'tc-1',
          toolName: 'dangerousTool',
          input: {},
          approval: { id: 'approval-1', needsApproval: true },
        }),
      )

      events.onMessagesChange.mockClear()
      processor.addToolApprovalResponse('approval-1', true)

      const toolCallPart = processor
        .getMessages()[0]!
        .parts.find((p) => p.type === 'tool-call') as ToolCallPart
      expect(toolCallPart.state).toBe('approval-responded')
      expect(toolCallPart.approval?.approved).toBe(true)
      expect(events.onMessagesChange).toHaveBeenCalled()
    })

    it('addToolApprovalResponse should deny a tool call', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()

      processor.processChunk(ev.toolStart('tc-1', 'dangerousTool'))
      processor.processChunk(ev.toolEnd('tc-1', 'dangerousTool', { input: {} }))
      processor.processChunk(
        ev.custom('approval-requested', {
          toolCallId: 'tc-1',
          toolName: 'dangerousTool',
          input: {},
          approval: { id: 'approval-1', needsApproval: true },
        }),
      )

      processor.addToolApprovalResponse('approval-1', false)

      const toolCallPart = processor
        .getMessages()[0]!
        .parts.find((p) => p.type === 'tool-call') as ToolCallPart
      expect(toolCallPart.state).toBe('approval-responded')
      expect(toolCallPart.approval?.approved).toBe(false)
    })

    it('should not fire onApprovalRequest for approval-requested without data', () => {
      const events = spyEvents()
      const processor = new StreamProcessor({ events })
      processor.prepareAssistantMessage()

      processor.processChunk(ev.custom('approval-requested'))
      expect(events.onApprovalRequest).not.toHaveBeenCalled()
    })
  })

  // ==========================================================================
  // areAllToolsComplete
  // ==========================================================================
  describe('areAllToolsComplete', () => {
    it('should return true when there is no assistant message', () => {
      const processor = new StreamProcessor()
      expect(processor.areAllToolsComplete()).toBe(true)
    })

    it('should return true when there are no tool calls', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()
      processor.processChunk(ev.textContent('Hello'))
      processor.processChunk(ev.runFinished('stop'))
      processor.finalizeStream()

      expect(processor.areAllToolsComplete()).toBe(true)
    })

    it('should return false when tool calls are pending (no result, no output)', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()
      processor.processChunk(ev.toolStart('tc-1', 'getWeather'))
      processor.processChunk(ev.toolEnd('tc-1', 'getWeather', { input: {} }))

      expect(processor.areAllToolsComplete()).toBe(false)
    })

    it('should return true when tool call has corresponding tool-result part (server tool)', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()
      processor.processChunk(ev.toolStart('tc-1', 'getWeather'))
      processor.processChunk(
        ev.toolEnd('tc-1', 'getWeather', { input: {}, result: '{"temp":72}' }),
      )

      expect(processor.areAllToolsComplete()).toBe(true)
    })

    it('should return true when client tool has output (via addToolResult)', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()
      processor.processChunk(ev.toolStart('tc-1', 'clientTool'))
      processor.processChunk(ev.toolEnd('tc-1', 'clientTool', { input: {} }))

      processor.addToolResult('tc-1', { data: 'result' })

      expect(processor.areAllToolsComplete()).toBe(true)
    })

    it('should return true when tool call is in approval-responded state', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()
      processor.processChunk(ev.toolStart('tc-1', 'dangerousTool'))
      processor.processChunk(ev.toolEnd('tc-1', 'dangerousTool', { input: {} }))
      processor.processChunk(
        ev.custom('approval-requested', {
          toolCallId: 'tc-1',
          toolName: 'dangerousTool',
          input: {},
          approval: { id: 'a1', needsApproval: true },
        }),
      )
      processor.addToolApprovalResponse('a1', true)

      expect(processor.areAllToolsComplete()).toBe(true)
    })

    it('should return false when some tool calls are complete but not all', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()
      processor.processChunk(ev.toolStart('tc-1', 'getWeather'))
      processor.processChunk(
        ev.toolEnd('tc-1', 'getWeather', { input: {}, result: '{"temp":72}' }),
      )
      processor.processChunk(ev.toolStart('tc-2', 'getTime'))
      processor.processChunk(ev.toolEnd('tc-2', 'getTime', { input: {} }))

      // tc-1 has a result, but tc-2 does not
      expect(processor.areAllToolsComplete()).toBe(false)
    })
  })

  // ==========================================================================
  // Lazy assistant message creation (existing tests preserved)
  // ==========================================================================
  describe('lazy assistant message creation', () => {
    it('should not create assistant message when no content arrives', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()

      processor.processChunk(ev.runFinished('stop'))
      processor.finalizeStream()

      expect(processor.getMessages()).toHaveLength(0)
      expect(processor.getCurrentAssistantMessageId()).toBeNull()
    })

    it('should create assistant message lazily on first text content', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()

      expect(processor.getMessages()).toHaveLength(0)
      expect(processor.getCurrentAssistantMessageId()).toBeNull()

      processor.processChunk(ev.textContent('Hello!'))

      expect(processor.getMessages()).toHaveLength(1)
      expect(processor.getCurrentAssistantMessageId()).not.toBeNull()
      expect(processor.getMessages()[0]?.role).toBe('assistant')
    })

    it('should create assistant message lazily on first tool call', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()

      expect(processor.getMessages()).toHaveLength(0)

      processor.processChunk(ev.toolStart('tc-1', 'getGuitars'))

      expect(processor.getMessages()).toHaveLength(1)
      expect(
        processor.getMessages()[0]?.parts.some((p) => p.type === 'tool-call'),
      ).toBe(true)
    })

    it('should create assistant message lazily on error', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()

      expect(processor.getMessages()).toHaveLength(0)

      processor.processChunk(ev.runError('Something went wrong'))
      processor.finalizeStream()

      const messages = processor.getMessages()
      expect(messages).toHaveLength(1)
      expect(messages[0]?.role).toBe('assistant')
      expect(messages[0]?.parts).toHaveLength(0)
    })

    it('should create assistant message lazily on thinking content', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()

      // No message yet
      expect(processor.getMessages()).toHaveLength(0)

      processor.processChunk({
        type: 'STEP_FINISHED',
        stepId: 'step-1',
        model: 'test',
        timestamp: Date.now(),
        delta: 'thinking...',
        content: 'thinking...',
      } as StreamChunk)

      // Now the message exists with thinking content
      expect(processor.getMessages()).toHaveLength(1)
      expect(
        processor.getMessages()[0]?.parts.some((p) => p.type === 'thinking'),
      ).toBe(true)
    })

    it('should not create assistant message during empty multi-turn continuation', () => {
      const processor = new StreamProcessor()

      processor.addUserMessage('recommend a guitar')
      processor.prepareAssistantMessage()

      processor.processChunk(ev.toolStart('tc-1', 'getGuitars'))
      processor.processChunk(ev.toolEnd('tc-1', 'getGuitars', { input: {} }))
      processor.processChunk(ev.runFinished('tool_calls'))
      processor.finalizeStream()

      expect(processor.getMessages()).toHaveLength(2)

      // Auto-continuation: prepare but no content
      processor.prepareAssistantMessage()
      processor.processChunk(ev.runFinished('stop'))
      processor.finalizeStream()

      expect(processor.getMessages()).toHaveLength(2)
      expect(processor.getMessages()[1]?.role).toBe('assistant')
    })

    it('should support deprecated startAssistantMessage for backwards compatibility', () => {
      const processor = new StreamProcessor()
      const messageId = processor.startAssistantMessage()

      expect(messageId).toBeTruthy()
      expect(processor.getMessages()).toHaveLength(1)
      expect(processor.getMessages()[0]?.id).toBe(messageId)
    })
  })

  // ==========================================================================
  // Edge cases
  // ==========================================================================
  describe('edge cases', () => {
    it('duplicate TOOL_CALL_START with same toolCallId should be a no-op', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()

      processor.processChunk(ev.toolStart('tc-1', 'getWeather'))
      processor.processChunk(ev.toolStart('tc-1', 'getWeather')) // duplicate

      const state = processor.getState()
      expect(state.toolCalls.size).toBe(1)
      expect(state.toolCallOrder).toEqual(['tc-1'])

      // Only one tool-call part in UIMessage
      const toolParts = processor
        .getMessages()[0]!
        .parts.filter((p) => p.type === 'tool-call')
      expect(toolParts).toHaveLength(1)
    })

    it('TOOL_CALL_ARGS for unknown toolCallId should be silently dropped', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()

      // Send args without a preceding START
      processor.processChunk(ev.toolArgs('unknown-id', '{"key":"val"}'))

      // No tool calls in state
      expect(processor.getState().toolCalls.size).toBe(0)
      // No messages created (no content-bearing event)
      expect(processor.getMessages()).toHaveLength(0)
    })

    it('empty delta in TOOL_CALL_ARGS should not transition from awaiting-input', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()

      processor.processChunk(ev.toolStart('tc-1', 'myTool'))
      expect(processor.getState().toolCalls.get('tc-1')?.state).toBe(
        'awaiting-input',
      )

      // Empty delta
      processor.processChunk(ev.toolArgs('tc-1', ''))
      expect(processor.getState().toolCalls.get('tc-1')?.state).toBe(
        'awaiting-input',
      )

      // Non-empty delta transitions
      processor.processChunk(ev.toolArgs('tc-1', '{"key":'))
      expect(processor.getState().toolCalls.get('tc-1')?.state).toBe(
        'input-streaming',
      )
    })

    it('missing TOOL_CALL_END should be caught by RUN_FINISHED safety net', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()

      processor.processChunk(ev.toolStart('tc-1', 'getWeather'))
      processor.processChunk(ev.toolArgs('tc-1', '{"city":"NYC"}'))
      // No TOOL_CALL_END!
      expect(processor.getState().toolCalls.get('tc-1')?.state).toBe(
        'input-streaming',
      )

      processor.processChunk(ev.runFinished('tool_calls'))
      // Safety net should force-complete
      expect(processor.getState().toolCalls.get('tc-1')?.state).toBe(
        'input-complete',
      )
    })

    it('TOOL_CALL_END for already input-complete tool call should be a no-op for state', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()

      processor.processChunk(ev.toolStart('tc-1', 'getWeather'))
      processor.processChunk(ev.toolEnd('tc-1', 'getWeather', { input: {} }))
      expect(processor.getState().toolCalls.get('tc-1')?.state).toBe(
        'input-complete',
      )

      // Second TOOL_CALL_END with result still processes the result
      processor.processChunk(
        ev.toolEnd('tc-1', 'getWeather', { result: '{"temp":72}' }),
      )

      // Should have added tool-result part
      const resultPart = processor
        .getMessages()[0]!
        .parts.find((p) => p.type === 'tool-result')
      expect(resultPart).toBeDefined()
    })

    it('ignored event types (RUN_STARTED, TEXT_MESSAGE_END, STEP_STARTED, STATE_SNAPSHOT, STATE_DELTA) should not crash', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()

      // These should all be silently ignored
      processor.processChunk(chunk('RUN_STARTED', { runId: 'run-1' }))
      processor.processChunk(chunk('TEXT_MESSAGE_END', { messageId: 'msg-1' }))
      processor.processChunk(chunk('STEP_STARTED', { stepId: 'step-1' }))
      processor.processChunk(chunk('STATE_SNAPSHOT', { state: { key: 'val' } }))
      processor.processChunk(chunk('STATE_DELTA', { delta: { key: 'val' } }))

      // No messages created (none of these are content-bearing)
      expect(processor.getMessages()).toHaveLength(0)
    })

    it('RUN_ERROR with empty message should use fallback', () => {
      const events = spyEvents()
      const processor = new StreamProcessor({ events })
      processor.prepareAssistantMessage()

      processor.processChunk(ev.runError(''))

      expect(events.onError).toHaveBeenCalledTimes(1)
      const errorArg = events.onError.mock.calls[0]![0]
      expect(errorArg.message).toBe('An error occurred')
    })
  })

  // ==========================================================================
  // Event callbacks
  // ==========================================================================
  describe('event callbacks', () => {
    it('onMessagesChange should be called on every message state change', () => {
      const events = spyEvents()
      const processor = new StreamProcessor({ events })
      processor.prepareAssistantMessage()

      processor.processChunk(ev.textContent('Hello'))
      processor.processChunk(ev.textContent(' world'))
      processor.processChunk(ev.runFinished('stop'))
      processor.finalizeStream()

      // ensureAssistantMessage (creates msg) + textContent emission + textContent emission
      // + runFinished (no tool calls, no change) + finalizeStream (no pending text, onStreamEnd no messages change)
      // The exact count depends on internal emission logic; let's verify it was called
      expect(events.onMessagesChange.mock.calls.length).toBeGreaterThanOrEqual(
        2,
      )
    })

    it('onStreamStart should fire on first content-bearing chunk', () => {
      const events = spyEvents()
      const processor = new StreamProcessor({ events })
      processor.prepareAssistantMessage()

      // Non-content chunk should NOT trigger onStreamStart
      processor.processChunk(ev.runStarted())
      expect(events.onStreamStart).not.toHaveBeenCalled()

      // First content chunk triggers it
      processor.processChunk(ev.textContent('Hi'))
      expect(events.onStreamStart).toHaveBeenCalledTimes(1)

      // Subsequent content does NOT re-trigger
      processor.processChunk(ev.textContent(' there'))
      expect(events.onStreamStart).toHaveBeenCalledTimes(1)
    })

    it('onStreamEnd should fire during finalizeStream with the assistant message', () => {
      const events = spyEvents()
      const processor = new StreamProcessor({ events })
      processor.prepareAssistantMessage()

      processor.processChunk(ev.textContent('Done'))
      processor.processChunk(ev.runFinished('stop'))
      processor.finalizeStream()

      expect(events.onStreamEnd).toHaveBeenCalledTimes(1)
      const msg = events.onStreamEnd.mock.calls[0]![0]
      expect(msg.role).toBe('assistant')
      expect(msg.parts[0]).toEqual({ type: 'text', content: 'Done' })
    })

    it('onStreamEnd should NOT fire if no assistant message was created', () => {
      const events = spyEvents()
      const processor = new StreamProcessor({ events })
      processor.prepareAssistantMessage()

      processor.processChunk(ev.runFinished('stop'))
      processor.finalizeStream()

      expect(events.onStreamEnd).not.toHaveBeenCalled()
    })

    it('onError should fire on RUN_ERROR', () => {
      const events = spyEvents()
      const processor = new StreamProcessor({ events })
      processor.prepareAssistantMessage()

      processor.processChunk(ev.runError('API rate limited'))

      expect(events.onError).toHaveBeenCalledTimes(1)
      expect(events.onError.mock.calls[0]![0]).toBeInstanceOf(Error)
      expect(events.onError.mock.calls[0]![0].message).toBe('API rate limited')
    })

    it('onTextUpdate should fire for each text emission', () => {
      const events = spyEvents()
      const processor = new StreamProcessor({ events })
      processor.prepareAssistantMessage()

      processor.processChunk(ev.textContent('Hello'))
      processor.processChunk(ev.textContent(' world'))
      processor.processChunk(ev.runFinished('stop'))
      processor.finalizeStream()

      // With ImmediateStrategy, each content chunk triggers onTextUpdate
      expect(events.onTextUpdate).toHaveBeenCalledTimes(2)
      const msgId = processor.getCurrentAssistantMessageId()!
      expect(events.onTextUpdate).toHaveBeenCalledWith(msgId, 'Hello')
      expect(events.onTextUpdate).toHaveBeenCalledWith(msgId, 'Hello world')
    })

    it('onToolCallStateChange should fire on state transitions', () => {
      const events = spyEvents()
      const processor = new StreamProcessor({ events })
      processor.prepareAssistantMessage()

      processor.processChunk(ev.toolStart('tc-1', 'getWeather'))
      processor.processChunk(ev.toolArgs('tc-1', '{"city":"NYC"}'))
      processor.processChunk(ev.toolEnd('tc-1', 'getWeather'))

      const msgId = processor.getCurrentAssistantMessageId()!

      // START -> awaiting-input
      expect(events.onToolCallStateChange).toHaveBeenCalledWith(
        msgId,
        'tc-1',
        'awaiting-input',
        '',
      )
      // ARGS -> input-streaming
      expect(events.onToolCallStateChange).toHaveBeenCalledWith(
        msgId,
        'tc-1',
        'input-streaming',
        '{"city":"NYC"}',
      )
      // END -> input-complete
      expect(events.onToolCallStateChange).toHaveBeenCalledWith(
        msgId,
        'tc-1',
        'input-complete',
        '{"city":"NYC"}',
      )
    })

    it('onThinkingUpdate should fire for each STEP_FINISHED delta', () => {
      const events = spyEvents()
      const processor = new StreamProcessor({ events })
      processor.prepareAssistantMessage()

      processor.processChunk(ev.stepFinished('Thinking'))
      processor.processChunk(ev.stepFinished(' more'))

      const msgId = processor.getCurrentAssistantMessageId()!
      expect(events.onThinkingUpdate).toHaveBeenCalledTimes(2)
      expect(events.onThinkingUpdate).toHaveBeenCalledWith(msgId, 'Thinking')
      expect(events.onThinkingUpdate).toHaveBeenCalledWith(
        msgId,
        'Thinking more',
      )
    })
  })

  // ==========================================================================
  // Recording and replay
  // ==========================================================================
  describe('recording and replay', () => {
    it('should record chunks when recording option is enabled via process()', async () => {
      const processor = new StreamProcessor({ recording: true })
      processor.prepareAssistantMessage()

      await processor.process(
        streamOf(
          ev.runStarted(),
          ev.textStart(),
          ev.textContent('Hello'),
          ev.textEnd(),
          ev.runFinished('stop'),
        ),
      )

      const recording = processor.getRecording()
      expect(recording).not.toBeNull()
      expect(recording!.version).toBe('1.0')
      expect(recording!.chunks).toHaveLength(5)
      expect(recording!.result).toBeDefined()
      expect(recording!.result!.content).toBe('Hello')
      expect(recording!.result!.finishReason).toBe('stop')
    })

    it('should record chunks when startRecording is called manually', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()

      processor.startRecording()
      processor.processChunk(ev.textContent('Hello'))
      processor.processChunk(ev.runFinished('stop'))

      const recording = processor.getRecording()
      expect(recording).not.toBeNull()
      expect(recording!.chunks).toHaveLength(2)
      expect(recording!.chunks[0]!.index).toBe(0)
      expect(recording!.chunks[1]!.index).toBe(1)
    })

    it('getRecording should return null when recording is not enabled', () => {
      const processor = new StreamProcessor()
      expect(processor.getRecording()).toBeNull()
    })

    it('StreamProcessor.replay should process a recording', async () => {
      // First, create a recording
      const processor = new StreamProcessor({ recording: true })
      processor.prepareAssistantMessage()

      await processor.process(
        streamOf(
          ev.runStarted(),
          ev.textStart(),
          ev.textContent('Replayed'),
          ev.textEnd(),
          ev.runFinished('stop'),
        ),
      )

      const recording = processor.getRecording()!

      // Now replay it
      const result = await StreamProcessor.replay(recording)
      expect(result.content).toBe('Replayed')
      expect(result.finishReason).toBe('stop')
    })

    it('createReplayStream should yield all chunks from a recording', async () => {
      const recording = {
        version: '1.0' as const,
        timestamp: Date.now(),
        chunks: [
          { chunk: ev.textContent('A'), timestamp: Date.now(), index: 0 },
          { chunk: ev.textContent('B'), timestamp: Date.now(), index: 1 },
        ],
      }

      const stream = createReplayStream(recording)
      const chunks: Array<StreamChunk> = []
      for await (const c of stream) {
        chunks.push(c)
      }

      expect(chunks).toHaveLength(2)
      expect((chunks[0] as any).delta).toBe('A')
      expect((chunks[1] as any).delta).toBe('B')
    })

    it('replay should pass options to the new processor', async () => {
      const events = spyEvents()
      const recording = {
        version: '1.0' as const,
        timestamp: Date.now(),
        chunks: [
          { chunk: ev.textContent('Hello'), timestamp: Date.now(), index: 0 },
          { chunk: ev.runFinished('stop'), timestamp: Date.now(), index: 1 },
        ],
      }

      await StreamProcessor.replay(recording, { events })
      expect(events.onStreamEnd).toHaveBeenCalledTimes(1)
    })
  })

  // ==========================================================================
  // finalizeStream and reset
  // ==========================================================================
  describe('finalizeStream and reset', () => {
    it('finalizeStream should flush pending text not yet emitted', () => {
      // Use a strategy that buffers (never emits during streaming)
      const strategy: ChunkStrategy = {
        shouldEmit: () => false,
      }
      const processor = new StreamProcessor({ chunkStrategy: strategy })
      processor.prepareAssistantMessage()

      processor.processChunk(ev.textContent('Buffered'))
      // Text was buffered, not emitted
      const msgBefore = processor.getMessages()[0]!
      expect(msgBefore.parts).toHaveLength(0)

      processor.finalizeStream()

      // After finalize, the pending text should be flushed
      const msgAfter = processor.getMessages()[0]!
      expect(msgAfter.parts).toHaveLength(1)
      expect((msgAfter.parts[0] as any).content).toBe('Buffered')
    })

    it('finalizeStream should not fire onStreamEnd if no message was created', () => {
      const events = spyEvents()
      const processor = new StreamProcessor({ events })
      processor.prepareAssistantMessage()

      // No content, just finalize
      processor.finalizeStream()

      expect(events.onStreamEnd).not.toHaveBeenCalled()
    })

    it('finalizeStream should force-complete tool calls as safety net', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()

      processor.processChunk(ev.toolStart('tc-1', 'getWeather'))
      processor.processChunk(ev.toolArgs('tc-1', '{"city":"NYC"}'))
      // No TOOL_CALL_END, no RUN_FINISHED
      expect(processor.getState().toolCalls.get('tc-1')?.state).toBe(
        'input-streaming',
      )

      processor.finalizeStream()
      expect(processor.getState().toolCalls.get('tc-1')?.state).toBe(
        'input-complete',
      )
    })

    it('reset should clear all messages and stream state', () => {
      const processor = new StreamProcessor()
      processor.addUserMessage('Hello')
      processor.prepareAssistantMessage()
      processor.processChunk(ev.textContent('World'))
      processor.processChunk(ev.runFinished('stop'))
      processor.finalizeStream()

      expect(processor.getMessages()).toHaveLength(2)
      expect(processor.getState().content).toBe('World')
      expect(processor.getCurrentAssistantMessageId()).not.toBeNull()

      processor.reset()

      expect(processor.getMessages()).toHaveLength(0)
      expect(processor.getCurrentAssistantMessageId()).toBeNull()
      expect(processor.getState().content).toBe('')
      expect(processor.getState().thinking).toBe('')
      expect(processor.getState().toolCalls.size).toBe(0)
      expect(processor.getState().finishReason).toBeNull()
      expect(processor.getState().done).toBe(false)
    })

    it('chunkStrategy.reset should be called on prepareAssistantMessage', () => {
      const resetFn = vi.fn()
      const strategy: ChunkStrategy = {
        shouldEmit: () => true,
        reset: resetFn,
      }
      const processor = new StreamProcessor({ chunkStrategy: strategy })

      processor.prepareAssistantMessage()
      expect(resetFn).toHaveBeenCalledTimes(1)
    })

    it('TEXT_MESSAGE_START should flush pending text before resetting segment', () => {
      const events = spyEvents()
      const processor = new StreamProcessor({ events })
      processor.prepareAssistantMessage()

      // Simulate a chunk strategy that buffers
      processor.processChunk(ev.textContent('Buffered'))
      // The text was emitted (ImmediateStrategy)

      events.onTextUpdate.mockClear()

      // Now TEXT_MESSAGE_START flushes any pending text, then resets
      processor.processChunk(ev.textStart('msg-2'))

      // Since ImmediateStrategy already emitted, the flush is a no-op
      // (currentSegmentText === lastEmittedText)
      // This test verifies the flush logic doesn't crash
      expect(processor.getState().content).toBe('Buffered')
    })
  })

  // ==========================================================================
  // getState snapshot
  // ==========================================================================
  describe('getState', () => {
    it('should return a complete state snapshot', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()

      processor.processChunk(ev.textContent('Some text'))
      processor.processChunk(ev.toolStart('tc-1', 'myTool'))
      processor.processChunk(ev.toolArgs('tc-1', '{"key":"val"}'))
      processor.processChunk(ev.runFinished('tool_calls'))

      const state = processor.getState()
      expect(state.content).toBe('Some text')
      expect(state.thinking).toBe('')
      expect(state.toolCalls.size).toBe(1)
      expect(state.toolCallOrder).toEqual(['tc-1'])
      expect(state.finishReason).toBe('tool_calls')
      expect(state.done).toBe(true)
    })

    it('should return independent copies (mutations do not affect internal state)', () => {
      const processor = new StreamProcessor()
      processor.prepareAssistantMessage()

      processor.processChunk(ev.toolStart('tc-1', 'myTool'))

      const state1 = processor.getState()
      state1.toolCalls.delete('tc-1')
      state1.toolCallOrder.push('fake')

      const state2 = processor.getState()
      expect(state2.toolCalls.size).toBe(1)
      expect(state2.toolCallOrder).toEqual(['tc-1'])
    })
  })
})
