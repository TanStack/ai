import { EventType } from '../src/types'
import type { AnyTextAdapter } from '../src/activities/chat/adapter'
import type {
  RunErrorEvent,
  RunFinishedEvent,
  RunStartedEvent,
  StepFinishedEvent,
  StepStartedEvent,
  StreamChunk,
  TextMessageContentEvent,
  TextMessageEndEvent,
  TextMessageStartEvent,
  Tool,
  ToolCallArgsEvent,
  ToolCallEndEvent,
  ToolCallStartEvent,
} from '../src/types'

// ============================================================================
// Chunk factory
// ============================================================================

/** Builds a typed StreamChunk by event type. Narrows the return to the
 *  matching variant via `Extract`, so callers get the right shape and TS
 *  catches missing required fields. Pass `EventType.X` for `type`. */
export function chunk<T extends StreamChunk['type']>(
  type: T,
  fields?: Record<string, unknown>,
): Extract<StreamChunk, { type: T }> {
  return { type, timestamp: Date.now(), ...fields } as Extract<
    StreamChunk,
    { type: T }
  >
}

// ============================================================================
// Event shorthand builders
// ============================================================================

/** Shorthand chunk factories for common AG-UI events. */
export const ev = {
  runStarted: (runId = 'run-1', threadId = 'thread-1'): RunStartedEvent => ({
    type: EventType.RUN_STARTED,
    runId,
    threadId,
    timestamp: Date.now(),
  }),
  textStart: (messageId = 'msg-1'): TextMessageStartEvent => ({
    type: EventType.TEXT_MESSAGE_START,
    messageId,
    role: 'assistant',
    timestamp: Date.now(),
  }),
  textContent: (
    delta: string,
    messageId = 'msg-1',
  ): TextMessageContentEvent => ({
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId,
    delta,
    timestamp: Date.now(),
  }),
  textEnd: (messageId = 'msg-1'): TextMessageEndEvent => ({
    type: EventType.TEXT_MESSAGE_END,
    messageId,
    timestamp: Date.now(),
  }),
  toolStart: (
    toolCallId: string,
    toolCallName: string,
    index?: number,
  ): ToolCallStartEvent => ({
    type: EventType.TOOL_CALL_START,
    toolCallId,
    toolCallName,
    toolName: toolCallName,
    timestamp: Date.now(),
    ...(index !== undefined ? { index } : {}),
  }),
  toolArgs: (toolCallId: string, delta: string): ToolCallArgsEvent => ({
    type: EventType.TOOL_CALL_ARGS,
    toolCallId,
    delta,
    timestamp: Date.now(),
  }),
  toolEnd: (
    toolCallId: string,
    toolCallName: string,
    opts?: { input?: unknown; result?: string },
  ): ToolCallEndEvent => ({
    type: EventType.TOOL_CALL_END,
    toolCallId,
    toolCallName,
    toolName: toolCallName,
    timestamp: Date.now(),
    ...opts,
  }),
  runFinished: (
    finishReason:
      | 'stop'
      | 'length'
      | 'content_filter'
      | 'tool_calls'
      | null = 'stop',
    runId = 'run-1',
    usage?: {
      promptTokens: number
      completionTokens: number
      totalTokens: number
    },
    threadId = 'thread-1',
  ): RunFinishedEvent => ({
    type: EventType.RUN_FINISHED,
    runId,
    threadId,
    finishReason,
    timestamp: Date.now(),
    ...(usage ? { usage } : {}),
  }),
  runError: (message: string): RunErrorEvent => ({
    type: EventType.RUN_ERROR,
    message,
    timestamp: Date.now(),
    error: { message },
  }),
  stepStarted: (stepName = 'step-1'): StepStartedEvent => ({
    type: EventType.STEP_STARTED,
    stepName,
    timestamp: Date.now(),
  }),
  stepFinished: (delta: string, stepName = 'step-1'): StepFinishedEvent => ({
    type: EventType.STEP_FINISHED,
    stepName,
    stepId: stepName,
    delta,
    timestamp: Date.now(),
  }),
}

// ============================================================================
// Mock adapter
// ============================================================================

/**
 * Create a mock adapter that satisfies AnyTextAdapter.
 * `chatStreamFn` receives the options and returns an AsyncIterable of chunks.
 * Multiple invocations can be tracked via the returned `calls` array.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock adapter callbacks receive internal SDK types
export function createMockAdapter(options: {
  chatStreamFn?: (opts: any) => AsyncIterable<StreamChunk>
  /** Array of chunk sequences: chatStream returns iterations[0] on first call, iterations[1] on second, etc. */
  iterations?: Array<Array<StreamChunk>>
  structuredOutput?: (opts: any) => Promise<{ data: unknown; rawText: string }>
  /**
   * Override `adapter.chat()` for non-streaming tests. If omitted the
   * BaseTextAdapter default (drains chatStream) applies — which is fine
   * for tests that only care that *some* chat() impl runs.
   */
  chatFn?: (opts: any) => Promise<{
    content: string
    reasoning?: string
    toolCalls?: Array<{
      id: string
      type: 'function'
      function: { name: string; arguments: string }
    }>
    finishReason?: string
    usage?: {
      promptTokens?: number
      completionTokens?: number
      totalTokens?: number
    }
  }>
  /** Array of chat() responses: chatFn returns chatIterations[0] on first call, etc. */
  chatIterations?: Array<{
    content: string
    reasoning?: string
    toolCalls?: Array<{
      id: string
      type: 'function'
      function: { name: string; arguments: string }
    }>
    finishReason?: string
    usage?: {
      promptTokens?: number
      completionTokens?: number
      totalTokens?: number
    }
  }>
}) {
  const calls: Array<Record<string, unknown>> = []
  const chatCalls: Array<Record<string, unknown>> = []
  let callIndex = 0
  let chatCallIndex = 0

  const adapter: AnyTextAdapter = {
    kind: 'text' as const,
    name: 'mock',
    model: 'test-model' as const,
    '~types': {
      providerOptions: {} as Record<string, unknown>,
      inputModalities: ['text'] as readonly ['text'],
      messageMetadataByModality: {
        text: undefined as unknown,
        image: undefined as unknown,
        audio: undefined as unknown,
        video: undefined as unknown,
        document: undefined as unknown,
      },
      toolCapabilities: [] as ReadonlyArray<string>,
      toolCallMetadata: undefined as unknown,
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
    chatNonStreaming: async (opts: any) => {
      chatCalls.push(opts)

      if (options.chatFn) {
        return options.chatFn(opts)
      }

      if (options.chatIterations) {
        const result = options.chatIterations[chatCallIndex] || {
          content: '',
        }
        chatCallIndex++
        return result
      }

      // Default: drain the mock's chatStream and reassemble — mirrors the
      // legacy stream-then-concatenate behaviour so existing tests that
      // configure `iterations` (stream chunks) keep working when invoked
      // through the non-streaming path.
      let content = ''
      let reasoning = ''
      const toolCallsByIndex = new Map<
        number,
        { id: string; name: string; args: string }
      >()
      let nextIndex = 0
      let finishReason: string | undefined
      let usage:
        | {
            promptTokens?: number
            completionTokens?: number
            totalTokens?: number
          }
        | undefined

      for await (const chunk of adapter.chatStream(opts)) {
        switch (chunk.type) {
          case 'TEXT_MESSAGE_CONTENT': {
            const e = chunk as { delta?: string }
            if (e.delta) content += e.delta
            break
          }
          case 'REASONING_MESSAGE_CONTENT': {
            const e = chunk as { delta?: string }
            if (e.delta) reasoning += e.delta
            break
          }
          case 'TOOL_CALL_START': {
            const e = chunk as {
              toolCallId: string
              toolCallName?: string
              toolName?: string
              index?: number
            }
            const index = e.index ?? nextIndex++
            toolCallsByIndex.set(index, {
              id: e.toolCallId,
              name: e.toolCallName ?? e.toolName ?? '',
              args: '',
            })
            break
          }
          case 'TOOL_CALL_ARGS': {
            const e = chunk as { toolCallId: string; delta?: string }
            for (const tc of toolCallsByIndex.values()) {
              if (tc.id === e.toolCallId) {
                tc.args += e.delta ?? ''
                break
              }
            }
            break
          }
          case 'RUN_FINISHED': {
            const e = chunk as {
              finishReason?: string
              usage?: typeof usage
            }
            if (e.finishReason) finishReason = e.finishReason
            if (e.usage) usage = e.usage
            break
          }
        }
      }

      const toolCalls =
        toolCallsByIndex.size > 0
          ? Array.from(toolCallsByIndex.values()).map((tc) => ({
              id: tc.id,
              type: 'function' as const,
              function: { name: tc.name, arguments: tc.args },
            }))
          : undefined

      return {
        content,
        ...(reasoning ? { reasoning } : {}),
        ...(toolCalls ? { toolCalls } : {}),
        ...(finishReason ? { finishReason } : {}),
        ...(usage ? { usage } : {}),
      }
    },
    structuredOutput:
      options.structuredOutput ?? (async () => ({ data: {}, rawText: '{}' })),
  }

  return { adapter, calls, chatCalls }
}

// ============================================================================
// Stream collection
// ============================================================================

/** Collect all chunks from an async iterable. */
export async function collectChunks(
  stream: AsyncIterable<StreamChunk>,
): Promise<Array<StreamChunk>> {
  const chunks: Array<StreamChunk> = []
  for await (const c of stream) {
    chunks.push(c)
  }
  return chunks
}

// ============================================================================
// Type guards & extraction helpers
// ============================================================================

/** Type guard for TEXT_MESSAGE_CONTENT chunks. */
export function isTextContent(c: StreamChunk): c is TextMessageContentEvent {
  return c.type === 'TEXT_MESSAGE_CONTENT'
}

/** Extract all text deltas from a chunk array. */
export function getDeltas(chunks: Array<StreamChunk>): Array<string> {
  return chunks.filter(isTextContent).map((c) => c.delta)
}

// ============================================================================
// Tool helpers
// ============================================================================

/** Simple server tool for testing. */
export function serverTool(
  name: string,
  executeFn: (args: unknown) => unknown,
): Tool {
  return {
    name,
    description: `Test tool: ${name}`,
    execute: executeFn,
  }
}

/** Client tool (no execute function). */
export function clientTool(
  name: string,
  opts?: { needsApproval?: boolean },
): Tool {
  return {
    name,
    description: `Client tool: ${name}`,
    needsApproval: opts?.needsApproval,
  }
}
