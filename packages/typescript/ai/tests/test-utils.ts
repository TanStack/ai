import { EventType } from '../src/types'
import type { AnyTextAdapter } from '../src/activities/chat/adapter'
import type { StreamChunk, TextMessageContentEvent, Tool } from '../src/types'

// ============================================================================
// Chunk factory
// ============================================================================

/** Escape hatch for tests that deliberately construct off-spec chunks (e.g.
 *  to exercise deprecated-field handling or malformed input). Prefer the
 *  strictly-typed `ev.*` builders below for normal cases. */
export function chunk(
  type: string,
  fields: Record<string, unknown> = {},
): StreamChunk {
  return { type, timestamp: Date.now(), ...fields } as unknown as StreamChunk
}

// ============================================================================
// Event shorthand builders
// ============================================================================

/** Shorthand chunk factories for common AG-UI events. */
export const ev = {
  runStarted: (runId = 'run-1', threadId = 'thread-1') =>
    ({
      type: EventType.RUN_STARTED,
      runId,
      threadId,
      timestamp: Date.now(),
    }) satisfies StreamChunk,
  textStart: (messageId = 'msg-1') =>
    ({
      type: EventType.TEXT_MESSAGE_START,
      messageId,
      role: 'assistant',
      timestamp: Date.now(),
    }) satisfies StreamChunk,
  textContent: (delta: string, messageId = 'msg-1') =>
    ({
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId,
      delta,
      timestamp: Date.now(),
    }) satisfies StreamChunk,
  textEnd: (messageId = 'msg-1') =>
    ({
      type: EventType.TEXT_MESSAGE_END,
      messageId,
      timestamp: Date.now(),
    }) satisfies StreamChunk,
  toolStart: (toolCallId: string, toolCallName: string, index?: number) =>
    ({
      type: EventType.TOOL_CALL_START,
      toolCallId,
      toolCallName,
      toolName: toolCallName,
      timestamp: Date.now(),
      ...(index !== undefined ? { index } : {}),
    }) satisfies StreamChunk,
  toolArgs: (toolCallId: string, delta: string) =>
    ({
      type: EventType.TOOL_CALL_ARGS,
      toolCallId,
      delta,
      timestamp: Date.now(),
    }) satisfies StreamChunk,
  toolEnd: (
    toolCallId: string,
    toolCallName: string,
    opts?: { input?: unknown; result?: string },
  ) =>
    ({
      type: EventType.TOOL_CALL_END,
      toolCallId,
      toolCallName,
      toolName: toolCallName,
      timestamp: Date.now(),
      ...opts,
    }) satisfies StreamChunk,
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
  ) =>
    ({
      type: EventType.RUN_FINISHED,
      runId,
      threadId,
      finishReason,
      timestamp: Date.now(),
      ...(usage ? { usage } : {}),
    }) satisfies StreamChunk,
  runError: (message: string) =>
    ({
      type: EventType.RUN_ERROR,
      message,
      timestamp: Date.now(),
      error: { message },
    }) satisfies StreamChunk,
  stepStarted: (stepName = 'step-1') =>
    ({
      type: EventType.STEP_STARTED,
      stepName,
      timestamp: Date.now(),
    }) satisfies StreamChunk,
  stepFinished: (delta: string, stepName = 'step-1') =>
    ({
      type: EventType.STEP_FINISHED,
      stepName,
      stepId: stepName,
      delta,
      timestamp: Date.now(),
    }) satisfies StreamChunk,
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
