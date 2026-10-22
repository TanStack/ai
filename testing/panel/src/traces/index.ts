/**
 * Sample trace files for testing the stream processor.
 *
 * Each trace is a list of AG-UI events, as the server streams them.
 */

import type { ChunkRecording } from '@tanstack/ai'

// Helper to create a base recording
function createRecording(chunks: Array<any>): ChunkRecording {
  return {
    version: '1.0',
    timestamp: Date.now(),
    chunks: chunks.map((chunk, index) => ({
      chunk,
      timestamp: Date.now() + index * 10,
      index,
    })),
  }
}

const event = (type: string, fields: Record<string, unknown> = {}) => ({
  type,
  timestamp: Date.now(),
  ...fields,
})

const runStarted = () =>
  event('RUN_STARTED', { runId: 'run-1', threadId: 'thread-1' })

const runFinished = (
  finishReason: 'stop' | 'tool_calls',
  outcome?: Record<string, unknown>,
) =>
  event('RUN_FINISHED', {
    runId: 'run-1',
    threadId: 'thread-1',
    ...(outcome ? { outcome } : {}),
    metadata: { tanstack: { finishReason } },
  })

/** A text message, streamed as one content event per delta. */
const text = (deltas: Array<string>, messageId = 'msg-1') => [
  event('TEXT_MESSAGE_START', { messageId, role: 'assistant' }),
  ...deltas.map((delta) => event('TEXT_MESSAGE_CONTENT', { messageId, delta })),
  event('TEXT_MESSAGE_END', { messageId }),
]

const toolStart = (toolCallId: string, toolCallName: string) =>
  event('TOOL_CALL_START', { toolCallId, toolCallName })

const toolArgs = (toolCallId: string, delta: string) =>
  event('TOOL_CALL_ARGS', { toolCallId, delta })

const toolEnd = (toolCallId: string) => event('TOOL_CALL_END', { toolCallId })

/** A tool call, with its arguments streamed as one args event per delta. */
const toolCall = (
  toolCallId: string,
  toolCallName: string,
  argDeltas: Array<string>,
) => [
  toolStart(toolCallId, toolCallName),
  ...argDeltas.map((delta) => toolArgs(toolCallId, delta)),
  toolEnd(toolCallId),
]

/**
 * Simple text streaming - "Hello world!" character by character
 */
export const textSimple = createRecording([
  runStarted(),
  ...text('Hello world!'.split('')),
  runFinished('stop'),
])

/**
 * Text with punctuation - multiple sentences
 */
export const textPunctuation = createRecording([
  runStarted(),
  ...text(['Hello', ' world', '!', ' How', ' are', ' you?']),
  runFinished('stop'),
])

/**
 * Single tool call with streaming arguments
 */
export const toolCallSingle = createRecording([
  runStarted(),
  ...toolCall('call_1', 'getWeather', ['{"lo', 'cation":', ' "Paris"}']),
  runFinished('tool_calls'),
])

/**
 * Multiple parallel tool calls
 */
export const toolCallParallel = createRecording([
  runStarted(),
  toolStart('call_1', 'getWeather'),
  toolArgs('call_1', '{"lo'),
  toolStart('call_2', 'getTime'),
  toolArgs('call_2', '{"ci'),
  toolArgs('call_1', 'cation":"Paris"}'),
  toolArgs('call_2', 'ty":"Tokyo"}'),
  toolEnd('call_1'),
  toolEnd('call_2'),
  runFinished('tool_calls'),
])

/**
 * Tool call followed by text (tool result response)
 */
export const toolCallWithText = createRecording([
  runStarted(),
  ...toolCall('call_1', 'getWeather', ['{"location":"Paris"}']),
  ...text(['The weather in Paris is', ' sunny', ' and warm.']),
  runFinished('stop'),
])

/**
 * Tool result event
 */
export const toolResult = createRecording([
  runStarted(),
  ...toolCall('call_1', 'calculate', ['{"expression":"2+2"}']),
  event('TOOL_CALL_RESULT', {
    messageId: 'tool-result-1',
    toolCallId: 'call_1',
    content: '4',
    role: 'tool',
  }),
  ...text(['The result is 4.'], 'msg-2'),
  runFinished('stop'),
])

/**
 * Thinking/reasoning events
 */
export const thinking = createRecording([
  runStarted(),
  event('REASONING_START', { messageId: 'reasoning-1' }),
  event('REASONING_MESSAGE_START', {
    messageId: 'reasoning-1',
    role: 'reasoning',
  }),
  event('REASONING_MESSAGE_CONTENT', {
    messageId: 'reasoning-1',
    delta: 'Let me think about this...',
  }),
  event('REASONING_MESSAGE_CONTENT', {
    messageId: 'reasoning-1',
    delta: ' I need to consider the weather patterns.',
  }),
  event('REASONING_MESSAGE_END', { messageId: 'reasoning-1' }),
  event('REASONING_END', { messageId: 'reasoning-1' }),
  ...text(['Based on my analysis, ', 'it looks like rain.']),
  runFinished('stop'),
])

/**
 * Approval requested flow: the run stops with an approval interrupt
 */
export const approvalRequested = createRecording([
  runStarted(),
  ...toolCall('call_1', 'deleteFile', ['{"path":"/tmp/test.txt"}']),
  runFinished('tool_calls', {
    type: 'interrupt',
    interrupts: [
      {
        id: 'approval_call_1',
        reason: 'tool_call',
        toolCallId: 'call_1',
        metadata: {
          kind: 'approval',
          toolName: 'deleteFile',
          input: { path: '/tmp/test.txt' },
        },
      },
    ],
  }),
])

/**
 * Client tool flow: the run stops with a client tool interrupt
 */
export const toolInputAvailable = createRecording([
  runStarted(),
  ...toolCall('call_1', 'getUserLocation', ['{}']),
  runFinished('tool_calls', {
    type: 'interrupt',
    interrupts: [
      {
        id: 'client_tool_call_1',
        reason: 'tanstack:client_tool_execution',
        toolCallId: 'call_1',
        metadata: {
          kind: 'client_tool',
          toolName: 'getUserLocation',
          input: {},
        },
      },
    ],
  }),
])

/**
 * Error event
 */
export const error = createRecording([
  runStarted(),
  event('TEXT_MESSAGE_START', { messageId: 'msg-1', role: 'assistant' }),
  event('TEXT_MESSAGE_CONTENT', { messageId: 'msg-1', delta: 'Starting...' }),
  event('RUN_ERROR', { message: 'Rate limit exceeded', code: 'rate_limit' }),
])

/**
 * Many small content deltas
 */
export const deltaOnly = createRecording([
  runStarted(),
  ...text(['Hello', ' ', 'world', '!']),
  runFinished('stop'),
])
