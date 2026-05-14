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
}) {
  const calls: Array<Record<string, unknown>> = []
  let callIndex = 0

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
    structuredOutput:
      options.structuredOutput ?? (async () => ({ data: {}, rawText: '{}' })),
  }

  return { adapter, calls }
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
