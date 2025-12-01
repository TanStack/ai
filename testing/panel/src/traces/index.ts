/**
 * Sample trace files for testing the stream processor
 *
 * These are extracted from unit tests in @tanstack/ai-client
 */

import type { ChunkRecording } from '@tanstack/ai'

// Helper to create a base recording
function createRecording(chunks: any[]): ChunkRecording {
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

/**
 * Simple text streaming - "Hello world!" character by character
 */
export const textSimple = createRecording([
  {
    type: 'content',
    id: 'msg-1',
    model: 'test',
    timestamp: Date.now(),
    delta: 'H',
    content: 'H',
    role: 'assistant',
  },
  {
    type: 'content',
    id: 'msg-1',
    model: 'test',
    timestamp: Date.now(),
    delta: 'e',
    content: 'He',
    role: 'assistant',
  },
  {
    type: 'content',
    id: 'msg-1',
    model: 'test',
    timestamp: Date.now(),
    delta: 'l',
    content: 'Hel',
    role: 'assistant',
  },
  {
    type: 'content',
    id: 'msg-1',
    model: 'test',
    timestamp: Date.now(),
    delta: 'l',
    content: 'Hell',
    role: 'assistant',
  },
  {
    type: 'content',
    id: 'msg-1',
    model: 'test',
    timestamp: Date.now(),
    delta: 'o',
    content: 'Hello',
    role: 'assistant',
  },
  {
    type: 'content',
    id: 'msg-1',
    model: 'test',
    timestamp: Date.now(),
    delta: ' ',
    content: 'Hello ',
    role: 'assistant',
  },
  {
    type: 'content',
    id: 'msg-1',
    model: 'test',
    timestamp: Date.now(),
    delta: 'w',
    content: 'Hello w',
    role: 'assistant',
  },
  {
    type: 'content',
    id: 'msg-1',
    model: 'test',
    timestamp: Date.now(),
    delta: 'o',
    content: 'Hello wo',
    role: 'assistant',
  },
  {
    type: 'content',
    id: 'msg-1',
    model: 'test',
    timestamp: Date.now(),
    delta: 'r',
    content: 'Hello wor',
    role: 'assistant',
  },
  {
    type: 'content',
    id: 'msg-1',
    model: 'test',
    timestamp: Date.now(),
    delta: 'l',
    content: 'Hello worl',
    role: 'assistant',
  },
  {
    type: 'content',
    id: 'msg-1',
    model: 'test',
    timestamp: Date.now(),
    delta: 'd',
    content: 'Hello world',
    role: 'assistant',
  },
  {
    type: 'content',
    id: 'msg-1',
    model: 'test',
    timestamp: Date.now(),
    delta: '!',
    content: 'Hello world!',
    role: 'assistant',
  },
  {
    type: 'done',
    id: 'msg-1',
    model: 'test',
    timestamp: Date.now(),
    finishReason: 'stop',
  },
])

/**
 * Text with punctuation - multiple sentences
 */
export const textPunctuation = createRecording([
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
  {
    type: 'content',
    id: 'msg-1',
    model: 'test',
    timestamp: Date.now(),
    delta: '!',
    content: 'Hello world!',
    role: 'assistant',
  },
  {
    type: 'content',
    id: 'msg-1',
    model: 'test',
    timestamp: Date.now(),
    delta: ' How',
    content: 'Hello world! How',
    role: 'assistant',
  },
  {
    type: 'content',
    id: 'msg-1',
    model: 'test',
    timestamp: Date.now(),
    delta: ' are',
    content: 'Hello world! How are',
    role: 'assistant',
  },
  {
    type: 'content',
    id: 'msg-1',
    model: 'test',
    timestamp: Date.now(),
    delta: ' you?',
    content: 'Hello world! How are you?',
    role: 'assistant',
  },
  {
    type: 'done',
    id: 'msg-1',
    model: 'test',
    timestamp: Date.now(),
    finishReason: 'stop',
  },
])

/**
 * Single tool call with streaming arguments
 */
export const toolCallSingle = createRecording([
  {
    type: 'tool_call',
    id: 'msg-1',
    model: 'test',
    timestamp: Date.now(),
    toolCall: {
      id: 'call_1',
      type: 'function',
      function: { name: 'getWeather', arguments: '{"lo' },
    },
    index: 0,
  },
  {
    type: 'tool_call',
    id: 'msg-1',
    model: 'test',
    timestamp: Date.now(),
    toolCall: {
      id: 'call_1',
      type: 'function',
      function: { name: 'getWeather', arguments: 'cation":' },
    },
    index: 0,
  },
  {
    type: 'tool_call',
    id: 'msg-1',
    model: 'test',
    timestamp: Date.now(),
    toolCall: {
      id: 'call_1',
      type: 'function',
      function: { name: 'getWeather', arguments: ' "Paris"}' },
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
])

/**
 * Multiple parallel tool calls
 */
export const toolCallParallel = createRecording([
  {
    type: 'tool_call',
    id: 'msg-1',
    model: 'test',
    timestamp: Date.now(),
    toolCall: {
      id: 'call_1',
      type: 'function',
      function: { name: 'getWeather', arguments: '{"lo' },
    },
    index: 0,
  },
  {
    type: 'tool_call',
    id: 'msg-1',
    model: 'test',
    timestamp: Date.now(),
    toolCall: {
      id: 'call_2',
      type: 'function',
      function: { name: 'getTime', arguments: '{"ci' },
    },
    index: 1,
  },
  {
    type: 'tool_call',
    id: 'msg-1',
    model: 'test',
    timestamp: Date.now(),
    toolCall: {
      id: 'call_1',
      type: 'function',
      function: { name: 'getWeather', arguments: 'cation":"Paris"}' },
    },
    index: 0,
  },
  {
    type: 'tool_call',
    id: 'msg-1',
    model: 'test',
    timestamp: Date.now(),
    toolCall: {
      id: 'call_2',
      type: 'function',
      function: { name: 'getTime', arguments: 'ty":"Tokyo"}' },
    },
    index: 1,
  },
  {
    type: 'done',
    id: 'msg-1',
    model: 'test',
    timestamp: Date.now(),
    finishReason: 'tool_calls',
  },
])

/**
 * Tool call followed by text (tool result response)
 */
export const toolCallWithText = createRecording([
  {
    type: 'tool_call',
    id: 'msg-1',
    model: 'test',
    timestamp: Date.now(),
    toolCall: {
      id: 'call_1',
      type: 'function',
      function: { name: 'getWeather', arguments: '{"location":"Paris"}' },
    },
    index: 0,
  },
  {
    type: 'content',
    id: 'msg-1',
    model: 'test',
    timestamp: Date.now(),
    delta: 'The weather in Paris is',
    content: 'The weather in Paris is',
    role: 'assistant',
  },
  {
    type: 'content',
    id: 'msg-1',
    model: 'test',
    timestamp: Date.now(),
    delta: ' sunny',
    content: 'The weather in Paris is sunny',
    role: 'assistant',
  },
  {
    type: 'content',
    id: 'msg-1',
    model: 'test',
    timestamp: Date.now(),
    delta: ' and warm.',
    content: 'The weather in Paris is sunny and warm.',
    role: 'assistant',
  },
  {
    type: 'done',
    id: 'msg-1',
    model: 'test',
    timestamp: Date.now(),
    finishReason: 'stop',
  },
])

/**
 * Tool result chunk
 */
export const toolResult = createRecording([
  {
    type: 'tool_call',
    id: 'msg-1',
    model: 'test',
    timestamp: Date.now(),
    toolCall: {
      id: 'call_1',
      type: 'function',
      function: { name: 'calculate', arguments: '{"expression":"2+2"}' },
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
  {
    type: 'tool_result',
    id: 'msg-2',
    model: 'test',
    timestamp: Date.now(),
    toolCallId: 'call_1',
    content: '4',
  },
  {
    type: 'content',
    id: 'msg-2',
    model: 'test',
    timestamp: Date.now(),
    delta: 'The result is 4.',
    content: 'The result is 4.',
    role: 'assistant',
  },
  {
    type: 'done',
    id: 'msg-2',
    model: 'test',
    timestamp: Date.now(),
    finishReason: 'stop',
  },
])

/**
 * Thinking/reasoning chunks (Claude-style)
 */
export const thinking = createRecording([
  {
    type: 'thinking',
    id: 'msg-1',
    model: 'test',
    timestamp: Date.now(),
    delta: 'Let me think about this...',
    content: 'Let me think about this...',
  },
  {
    type: 'thinking',
    id: 'msg-1',
    model: 'test',
    timestamp: Date.now(),
    delta: ' I need to consider the weather patterns.',
    content:
      'Let me think about this... I need to consider the weather patterns.',
  },
  {
    type: 'content',
    id: 'msg-1',
    model: 'test',
    timestamp: Date.now(),
    delta: 'Based on my analysis, ',
    content: 'Based on my analysis, ',
    role: 'assistant',
  },
  {
    type: 'content',
    id: 'msg-1',
    model: 'test',
    timestamp: Date.now(),
    delta: 'it looks like rain.',
    content: 'Based on my analysis, it looks like rain.',
    role: 'assistant',
  },
  {
    type: 'done',
    id: 'msg-1',
    model: 'test',
    timestamp: Date.now(),
    finishReason: 'stop',
  },
])

/**
 * Approval requested flow
 */
export const approvalRequested = createRecording([
  {
    type: 'tool_call',
    id: 'msg-1',
    model: 'test',
    timestamp: Date.now(),
    toolCall: {
      id: 'call_1',
      type: 'function',
      function: { name: 'deleteFile', arguments: '{"path":"/tmp/test.txt"}' },
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
  {
    type: 'approval-requested',
    id: 'msg-1',
    model: 'test',
    timestamp: Date.now(),
    toolCallId: 'call_1',
    toolName: 'deleteFile',
    input: { path: '/tmp/test.txt' },
    approval: { id: 'approval_call_1', needsApproval: true },
  },
])

/**
 * Client tool input available
 */
export const toolInputAvailable = createRecording([
  {
    type: 'tool_call',
    id: 'msg-1',
    model: 'test',
    timestamp: Date.now(),
    toolCall: {
      id: 'call_1',
      type: 'function',
      function: { name: 'getUserLocation', arguments: '{}' },
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
  {
    type: 'tool-input-available',
    id: 'msg-1',
    model: 'test',
    timestamp: Date.now(),
    toolCallId: 'call_1',
    toolName: 'getUserLocation',
    input: {},
  },
])

/**
 * Error chunk
 */
export const error = createRecording([
  {
    type: 'content',
    id: 'msg-1',
    model: 'test',
    timestamp: Date.now(),
    delta: 'Starting...',
    content: 'Starting...',
    role: 'assistant',
  },
  {
    type: 'error',
    id: 'msg-1',
    model: 'test',
    timestamp: Date.now(),
    error: { message: 'Rate limit exceeded', code: 'rate_limit' },
  },
])

/**
 * Delta-only chunks (no accumulated content)
 */
export const deltaOnly = createRecording([
  {
    type: 'content',
    id: 'msg-1',
    model: 'test',
    timestamp: Date.now(),
    delta: 'Hello',
  },
  {
    type: 'content',
    id: 'msg-1',
    model: 'test',
    timestamp: Date.now(),
    delta: ' world',
  },
  {
    type: 'content',
    id: 'msg-1',
    model: 'test',
    timestamp: Date.now(),
    delta: '!',
  },
  {
    type: 'done',
    id: 'msg-1',
    model: 'test',
    timestamp: Date.now(),
    finishReason: 'stop',
  },
])
