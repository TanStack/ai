import { batch, createContext, onCleanup, onMount, useContext } from 'solid-js'
import { createStore, produce } from 'solid-js/store'
import { aiEventClient } from '@tanstack/ai-event-client'
import {
  addSavedFixture,
  applyHookEvent,
  clearHookRegistry,
  createHookRegistryState,
  removeSavedFixture,
  replaceSavedFixtures,
  setActiveHook,
} from './hook-registry'
import {
  createClientToolCallMessage,
  shouldSkipClientAssistantPlaceholder,
} from './message-event-utils'
import type { ContentPartSource } from '@tanstack/ai'
import type {
  DevtoolsToolFixtureApplyEvent,
  RunLifecycleEvent,
} from '@tanstack/ai-event-client'
import type { HookRegistryState, ToolFixtureRecord } from './hook-registry'
import type { ParentComponent } from 'solid-js'

interface MessagePart {
  type:
    | 'text'
    | 'tool-call'
    | 'tool-result'
    | 'thinking'
    | 'image'
    | 'audio'
    | 'video'
    | 'document'
    | 'structured-output'
  content?: string
  status?: 'streaming' | 'complete' | 'error'
  raw?: string
  partial?: unknown
  data?: unknown
  reasoning?: string
  errorMessage?: string
  toolCallId?: string
  toolName?: string
  arguments?: string
  state?: string
  output?: unknown
  error?: string
  approval?: {
    id?: string
    needsApproval?: boolean
    approved?: boolean
  }
  // Multimodal content fields
  source?: ContentPartSource
  metadata?: unknown
}

export interface ToolCall {
  id: string
  name: string
  arguments: string
  state: string
  result?: unknown
  approvalRequired?: boolean
  approvalId?: string
  approvalApproved?: boolean
  /** Duration of tool execution in milliseconds */
  duration?: number
}

interface TokenUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  timestamp: number
  parts?: Array<MessagePart>
  toolCalls?: Array<ToolCall>
  /** Consolidated chunks - consecutive same-type chunks are merged into one entry */
  chunks?: Array<Chunk>
  /** Total number of raw chunks received (before consolidation) */
  totalChunkCount?: number
  model?: string
  usage?: TokenUsage
  thinkingContent?: string
  /** Source of the message: 'client' for aggregated client-side data, 'server' for individual server chunks */
  source?: 'client' | 'server'
  /** The requestId this message belongs to (for scoping usage calculations) */
  requestId?: string
}

/**
 * Consolidated chunk - represents one or more raw chunks of the same type.
 * Consecutive content/thinking chunks are merged into a single entry with accumulated content.
 */
export interface Chunk {
  id: string
  type:
    | 'content'
    | 'tool_call'
    | 'tool_result'
    | 'done'
    | 'error'
    | 'approval'
    | 'thinking'
    | 'structured_output'
  timestamp: number
  messageId?: string
  /** Accumulated content from all merged chunks */
  content?: string
  /** The last delta received (kept for debugging) */
  delta?: string
  toolName?: string
  toolCallId?: string
  finishReason?: string
  error?: string
  approvalId?: string
  approved?: boolean
  input?: unknown
  /** Tool arguments for tool_call chunks */
  arguments?: string
  /** Tool result data for tool_result chunks */
  result?: unknown
  /** Duration in ms for tool execution */
  duration?: number
  /** Number of raw chunks that were merged into this consolidated chunk */
  chunkCount: number
  /** Whether this is a client-side tool execution */
  isClientTool?: boolean
  structuredStatus?: 'streaming' | 'complete' | 'error'
  raw?: string
  partial?: unknown
  data?: unknown
  reasoning?: string
  errorMessage?: string
}

export interface MiddlewareEvent {
  id: string
  middlewareName: string
  hookName: string
  timestamp: number
  duration?: number
  hasTransform: boolean
  configChanges?: Record<string, unknown>
  originalChunkType?: string
  resultCount?: number
  wasDropped?: boolean
}

export interface Iteration {
  /** The requestId this iteration belongs to (unique per chat() call) */
  requestId?: string
  index: number
  messageId: string
  startedAt: number
  completedAt?: number
  model?: string
  provider?: string
  systemPrompts?: Array<string>
  toolNames?: Array<string>
  options?: Record<string, unknown> | undefined
  modelOptions?: Record<string, unknown> | undefined
  finishReason?: string
  usage?: TokenUsage
  middlewareEvents: Array<MiddlewareEvent>
  messageIds: Array<string>
}

export interface SummarizeOperation {
  id: string
  model: string
  inputLength: number
  outputLength?: number
  duration?: number
  timestamp: number
  status: 'started' | 'completed'
}

export interface ActivityEvent {
  id: string
  name: string
  timestamp: number
  payload: unknown
}

export interface Conversation {
  id: string
  type: 'client' | 'server'
  label: string
  messages: Array<Message>
  chunks: Array<Chunk>
  model?: string
  provider?: string
  status: 'active' | 'completed' | 'error'
  startedAt: number
  completedAt?: number
  runIds?: Array<string>
  usage?: TokenUsage
  iterations: Array<Iteration>
  iterationCount?: number
  toolNames?: Array<string>
  options?: Record<string, unknown> | undefined
  modelOptions?: Record<string, unknown> | undefined
  systemPrompts?: Array<string>
  /** Flags for which operation types this conversation has */
  hasChat?: boolean
  hasSummarize?: boolean
  hasImage?: boolean
  hasAudio?: boolean
  hasSpeech?: boolean
  hasTranscription?: boolean
  hasVideo?: boolean
  /** Summarize operations in this conversation */
  summaries?: Array<SummarizeOperation>
  imageEvents?: Array<ActivityEvent>
  audioEvents?: Array<ActivityEvent>
  speechEvents?: Array<ActivityEvent>
  transcriptionEvents?: Array<ActivityEvent>
  videoEvents?: Array<ActivityEvent>
}

interface AIStoreState {
  conversations: Record<string, Conversation>
  activeConversationId: string | null
  hooks: HookRegistryState
}

interface AIContextValue {
  state: AIStoreState
  clearAllConversations: () => void
  selectConversation: (id: string) => void
  clearHooks: () => void
  selectHook: (id: string | null) => void
  saveToolFixture: (fixture: ToolFixtureRecord) => void
  deleteToolFixture: (fixtureId: string) => void
  applyToolFixture: (fixture: ToolFixtureRecord) => void
}

const AIContext = createContext<AIContextValue>()

export function useAIStore(): AIContextValue {
  const context = useContext(AIContext)
  if (!context) {
    throw new Error('useAIStore must be used within an AIProvider')
  }
  return context
}

export const AIProvider: ParentComponent = (props) => {
  const [state, setState] = createStore<AIStoreState>({
    conversations: {},
    activeConversationId: null,
    hooks: createHookRegistryState(),
  })

  const streamToConversation = new Map<string, string>()
  const requestToConversation = new Map<string, string>()
  /** Track max cumulative usage per requestId per conversation for correct totals */
  const requestUsageByConversation = new Map<string, Map<string, TokenUsage>>()
  const fixturesStorageKey = 'tanstack-ai-devtools:tool-fixtures'

  const pendingConversationChunks = new Map<
    string,
    { chunks: Array<Chunk>; newChunkCount: number }
  >()
  const pendingMessageChunks = new Map<
    string,
    Map<number, { chunks: Array<Chunk>; newChunkCount: number }>
  >()
  let batchScheduled = false

  function scheduleBatchFlush(): void {
    if (batchScheduled) return
    batchScheduled = true
    queueMicrotask(flushPendingChunks)
  }

  function isMergeableChunkType(type: Chunk['type']): boolean {
    return type === 'content' || type === 'thinking'
  }

  function mergeChunks(existing: Array<Chunk>, pending: Array<Chunk>): void {
    for (const chunk of pending) {
      const lastChunk = existing[existing.length - 1]

      if (
        lastChunk &&
        lastChunk.type === chunk.type &&
        isMergeableChunkType(chunk.type) &&
        lastChunk.messageId === chunk.messageId
      ) {
        lastChunk.content = chunk.content || lastChunk.content
        lastChunk.delta = chunk.delta
        lastChunk.chunkCount += chunk.chunkCount
      } else {
        existing.push(chunk)
      }
    }
  }

  function flushPendingChunks(): void {
    batchScheduled = false

    batch(() => {
      for (const [
        conversationId,
        { chunks, newChunkCount },
      ] of pendingConversationChunks) {
        const conv = state.conversations[conversationId]
        if (conv) {
          setState(
            'conversations',
            conversationId,
            'chunks',
            produce((arr: Array<Chunk>) => {
              mergeChunks(arr, chunks)
            }),
          )
        }
      }
      pendingConversationChunks.clear()

      for (const [conversationId, messageMap] of pendingMessageChunks) {
        const conv = state.conversations[conversationId]
        if (!conv) continue

        for (const [messageIndex, { chunks, newChunkCount }] of messageMap) {
          const message = conv.messages[messageIndex]
          if (message) {
            setState(
              'conversations',
              conversationId,
              'messages',
              messageIndex,
              'chunks',
              produce((arr: Array<Chunk> | undefined) => {
                if (!arr) return chunks
                mergeChunks(arr, chunks)
                return arr
              }),
            )
            const currentTotal = message.totalChunkCount || 0
            setState(
              'conversations',
              conversationId,
              'messages',
              messageIndex,
              'totalChunkCount',
              currentTotal + newChunkCount,
            )
          }
        }
      }
      pendingMessageChunks.clear()
    })
  }

  function queueChunk(conversationId: string, chunk: Chunk): void {
    let pending = pendingConversationChunks.get(conversationId)
    if (!pending) {
      pending = { chunks: [], newChunkCount: 0 }
      pendingConversationChunks.set(conversationId, pending)
    }

    const lastPending = pending.chunks[pending.chunks.length - 1]
    if (
      lastPending &&
      lastPending.type === chunk.type &&
      isMergeableChunkType(chunk.type) &&
      lastPending.messageId === chunk.messageId
    ) {
      lastPending.content = chunk.content || lastPending.content
      lastPending.delta = chunk.delta
      lastPending.chunkCount += chunk.chunkCount
    } else {
      pending.chunks.push(chunk)
    }
    pending.newChunkCount += chunk.chunkCount
    scheduleBatchFlush()
  }

  function queueMessageChunk(
    conversationId: string,
    messageIndex: number,
    chunk: Chunk,
  ): void {
    let messageMap = pendingMessageChunks.get(conversationId)
    if (!messageMap) {
      messageMap = new Map()
      pendingMessageChunks.set(conversationId, messageMap)
    }
    let pending = messageMap.get(messageIndex)
    if (!pending) {
      pending = { chunks: [], newChunkCount: 0 }
      messageMap.set(messageIndex, pending)
    }

    const lastPending = pending.chunks[pending.chunks.length - 1]
    if (
      lastPending &&
      lastPending.type === chunk.type &&
      isMergeableChunkType(chunk.type) &&
      lastPending.messageId === chunk.messageId
    ) {
      lastPending.content = chunk.content || lastPending.content
      lastPending.delta = chunk.delta
      lastPending.chunkCount += chunk.chunkCount
    } else {
      pending.chunks.push(chunk)
    }
    pending.newChunkCount += chunk.chunkCount
    scheduleBatchFlush()
  }

  function getOrCreateConversation(
    id: string,
    type: 'client' | 'server',
    label: string,
  ): void {
    if (!state.conversations[id]) {
      setState('conversations', id, {
        id,
        type,
        label,
        messages: [],
        chunks: [],
        iterations: [],
        imageEvents: [],
        audioEvents: [],
        speechEvents: [],
        transcriptionEvents: [],
        videoEvents: [],
        status: 'active',
        startedAt: Date.now(),
      })
      if (!state.activeConversationId) {
        setState('activeConversationId', id)
      }
    }
  }

  function attachRunToConversation(
    conversationId: string,
    runId: string | undefined,
  ): void {
    if (!runId) return
    const conv = state.conversations[conversationId]
    if (!conv || conv.runIds?.includes(runId)) return
    updateConversation(conversationId, {
      runIds: [...(conv.runIds ?? []), runId],
    })
  }

  function addMessage(conversationId: string, message: Message): void {
    const conv = state.conversations[conversationId]
    if (!conv) return
    setState(
      'conversations',
      conversationId,
      'messages',
      conv.messages.length,
      message,
    )
  }

  function addChunkToMessage(conversationId: string, chunk: Chunk): void {
    const conv = state.conversations[conversationId]
    if (!conv) return

    if (chunk.messageId) {
      const messageIndex = conv.messages.findIndex(
        (msg) => msg.id === chunk.messageId,
      )

      if (messageIndex !== -1) {
        queueMessageChunk(conversationId, messageIndex, chunk)
        return
      } else {
        // Create new message with the chunk
        const newMessage: Message = {
          id: chunk.messageId,
          role: 'assistant',
          content: '',
          timestamp: chunk.timestamp,
          model: conv.model,
          chunks: [chunk],
        }
        setState(
          'conversations',
          conversationId,
          'messages',
          conv.messages.length,
          newMessage,
        )
        return
      }
    }

    // Find last assistant message
    for (let i = conv.messages.length - 1; i >= 0; i--) {
      const message = conv.messages[i]
      if (message && message.role === 'assistant') {
        queueMessageChunk(conversationId, i, chunk)
        return
      }
    }

    // Fallback: add to conversation's main chunks array if no assistant message found
    addChunk(conversationId, chunk)
  }

  function updateMessageUsage(
    conversationId: string,
    messageId: string | undefined,
    cumulativeUsage: TokenUsage,
    requestId?: string,
  ): void {
    const conv = state.conversations[conversationId]
    if (!conv) return

    // Calculate the sum of usage from all previous messages (excluding the target message)
    let previousPromptTokens = 0
    let previousCompletionTokens = 0

    // Find the target message index
    let targetMessageIndex = -1
    if (messageId) {
      targetMessageIndex = conv.messages.findIndex(
        (msg) => msg.id === messageId,
      )
    } else {
      // Find last assistant message
      for (let i = conv.messages.length - 1; i >= 0; i--) {
        if (conv.messages[i]?.role === 'assistant') {
          targetMessageIndex = i
          break
        }
      }
    }

    if (targetMessageIndex === -1) return

    // Sum up usage from previous assistant messages in the SAME request only.
    // Cumulative usage is per-request, so mixing requests gives wrong deltas.
    for (let i = 0; i < targetMessageIndex; i++) {
      const msg = conv.messages[i]
      if (msg?.role === 'assistant' && msg.usage) {
        if (requestId && msg.requestId !== requestId) continue
        previousPromptTokens += msg.usage.promptTokens
        previousCompletionTokens += msg.usage.completionTokens
      }
    }

    // Calculate delta usage for this message
    const deltaUsage: TokenUsage = {
      promptTokens: Math.max(
        0,
        cumulativeUsage.promptTokens - previousPromptTokens,
      ),
      completionTokens: Math.max(
        0,
        cumulativeUsage.completionTokens - previousCompletionTokens,
      ),
      totalTokens: 0,
    }
    deltaUsage.totalTokens =
      deltaUsage.promptTokens + deltaUsage.completionTokens

    setState(
      'conversations',
      conversationId,
      'messages',
      targetMessageIndex,
      'usage',
      deltaUsage,
    )
  }

  /**
   * Update conversation-level usage by tracking max cumulative per request.
   * Usage events report cumulative totals per-request, so we keep the highest
   * value seen for each requestId and sum across all requests for the total.
   */
  function updateConversationUsage(
    conversationId: string,
    requestId: string | undefined,
    usage: TokenUsage,
  ): void {
    if (!state.conversations[conversationId]) return
    const key = requestId || '__default__'
    let requestMap = requestUsageByConversation.get(conversationId)
    if (!requestMap) {
      requestMap = new Map()
      requestUsageByConversation.set(conversationId, requestMap)
    }
    const existing = requestMap.get(key)
    if (!existing || usage.totalTokens > existing.totalTokens) {
      requestMap.set(key, usage)
    }
    // Sum across all requests
    let prompt = 0
    let completion = 0
    for (const v of requestMap.values()) {
      prompt += v.promptTokens
      completion += v.completionTokens
    }
    updateConversation(conversationId, {
      usage: {
        promptTokens: prompt,
        completionTokens: completion,
        totalTokens: prompt + completion,
      },
    })
  }

  // Public actions
  function clearAllConversations() {
    setState('conversations', {})
    setState('activeConversationId', null)
    streamToConversation.clear()
    requestToConversation.clear()
    requestUsageByConversation.clear()
    pendingConversationChunks.clear()
    pendingMessageChunks.clear()
  }

  function selectConversation(id: string) {
    setState('activeConversationId', id)
  }

  function clearHooks() {
    setState(
      'hooks',
      produce((hooks: HookRegistryState) => {
        clearHookRegistry(hooks)
      }),
    )
  }

  function selectHook(id: string | null) {
    setState(
      'hooks',
      produce((hooks: HookRegistryState) => {
        setActiveHook(hooks, id)
      }),
    )
  }

  function saveToolFixture(fixture: ToolFixtureRecord) {
    const fixtures = mergeFixtures(fixture, state.hooks.fixtures)
    setState(
      'hooks',
      produce((hooks: HookRegistryState) => {
        addSavedFixture(hooks, fixture)
      }),
    )
    persistFixtures(fixtures)
  }

  function deleteToolFixture(fixtureId: string) {
    const fixtures = state.hooks.fixtures.filter(
      (fixture) => fixture.id !== fixtureId,
    )
    setState(
      'hooks',
      produce((hooks: HookRegistryState) => {
        removeSavedFixture(hooks, fixtureId)
      }),
    )
    persistFixtures(fixtures)
  }

  function applyToolFixture(fixture: ToolFixtureRecord) {
    const timestamp = Date.now()
    const payload: DevtoolsToolFixtureApplyEvent = {
      eventId: `devtools:tool-fixture:apply:${fixture.id}:${timestamp}:${Math.random()
        .toString(36)
        .slice(2)}`,
      fixtureId: fixture.id,
      timestamp,
      source: 'devtools',
      visibility: 'devtools-action',
      ...(fixture.hookId ? { hookId: fixture.hookId } : {}),
      ...(fixture.threadId ? { threadId: fixture.threadId } : {}),
      ...(fixture.runId ? { runId: fixture.runId } : {}),
      toolName: fixture.toolName,
      input: fixture.input,
      output: fixture.output,
      ...(fixture.execute !== undefined ? { execute: fixture.execute } : {}),
      ...(fixture.message ? { message: fixture.message } : {}),
      ...(fixture.errorText ? { errorText: fixture.errorText } : {}),
    }

    aiEventClient.emit('devtools:tool-fixture:apply', payload)
  }

  function mergeFixtures(
    fixture: ToolFixtureRecord,
    fixtures: Array<ToolFixtureRecord>,
  ): Array<ToolFixtureRecord> {
    return [
      fixture,
      ...fixtures.filter((existing) => existing.id !== fixture.id),
    ].slice(0, 50)
  }

  function persistFixtures(fixtures: Array<ToolFixtureRecord>) {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(fixturesStorageKey, JSON.stringify(fixtures))
  }

  function loadFixtures() {
    if (typeof localStorage === 'undefined') return
    const raw = localStorage.getItem(fixturesStorageKey)
    if (!raw) return

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch (err) {
      // Surface the bad payload instead of silently nuking it — keep the raw
      // value in storage so the user can recover it manually if needed.
      console.error(
        '[ai-devtools] failed to parse saved tool fixtures; keeping raw payload for inspection',
        err,
      )
      return
    }
    if (!Array.isArray(parsed)) {
      console.error(
        '[ai-devtools] saved tool fixtures payload is not an array; ignoring',
        parsed,
      )
      return
    }
    const fixtures = parsed.filter(isToolFixtureRecord)
    setState(
      'hooks',
      produce((hooks: HookRegistryState) => {
        replaceSavedFixtures(hooks, fixtures)
      }),
    )
  }

  function isToolFixtureRecord(value: unknown): value is ToolFixtureRecord {
    if (typeof value !== 'object' || value === null) return false
    const candidate = value as Partial<ToolFixtureRecord>
    return (
      typeof candidate.id === 'string' &&
      typeof candidate.createdAt === 'number' &&
      (candidate.name === undefined || typeof candidate.name === 'string') &&
      typeof candidate.toolName === 'string' &&
      (candidate.execute === undefined ||
        typeof candidate.execute === 'boolean') &&
      'input' in candidate &&
      'output' in candidate &&
      (candidate.message === undefined ||
        isToolFixtureMessage(candidate.message))
    )
  }

  function isToolFixtureMessage(
    value: unknown,
  ): value is NonNullable<ToolFixtureRecord['message']> {
    if (typeof value !== 'object' || value === null) return false
    const candidate = value as {
      id?: unknown
      role?: unknown
      parts?: unknown
      createdAt?: unknown
    }
    return (
      typeof candidate.id === 'string' &&
      (candidate.role === 'system' ||
        candidate.role === 'user' ||
        candidate.role === 'assistant') &&
      Array.isArray(candidate.parts) &&
      (candidate.createdAt === undefined ||
        typeof candidate.createdAt === 'number' ||
        typeof candidate.createdAt === 'string')
    )
  }

  function normalizeMessageSource(
    source: unknown,
    fallback: 'client' | 'server',
  ): 'client' | 'server' {
    return source === 'client' || source === 'server' ? source : fallback
  }

  function stringifyToolArguments(value: unknown): string {
    if (typeof value === 'string') return value
    try {
      return JSON.stringify(value ?? {})
    } catch (error) {
      console.error(
        '[ai-devtools] failed to JSON.stringify tool call arguments; saved fixture replay will be malformed.',
        { error, value },
      )
      return `[ai-devtools] unserializable tool arguments: ${
        error instanceof Error ? error.message : String(error)
      }`
    }
  }

  // Additional optimized helper functions
  function updateConversation(
    conversationId: string,
    updates: Partial<Conversation>,
  ): void {
    if (!state.conversations[conversationId]) return
    for (const [key, value] of Object.entries(updates)) {
      setState(
        'conversations',
        conversationId,
        key as keyof Conversation,
        value,
      )
    }
  }

  function updateMessage(
    conversationId: string,
    messageIndex: number,
    updates: Partial<Message>,
  ): void {
    const conv = state.conversations[conversationId]
    if (!conv || !conv.messages[messageIndex]) return
    for (const [key, value] of Object.entries(updates)) {
      setState(
        'conversations',
        conversationId,
        'messages',
        messageIndex,
        key as keyof Message,
        value,
      )
    }
  }

  function updateToolCall(
    conversationId: string,
    messageIndex: number,
    toolCallIndex: number,
    updates: Partial<ToolCall>,
  ): void {
    const conv = state.conversations[conversationId]
    if (!conv?.messages[messageIndex]?.toolCalls?.[toolCallIndex]) return
    setState(
      'conversations',
      conversationId,
      'messages',
      messageIndex,
      'toolCalls',
      toolCallIndex,
      produce((tc: ToolCall) => Object.assign(tc, updates)),
    )
  }

  function findToolCallLocation(
    conversationId: string,
    input: { toolCallId?: string; approvalId?: string },
  ): { messageIndex: number; toolCallIndex: number } | undefined {
    const conv = state.conversations[conversationId]
    if (!conv) return undefined

    for (
      let messageIndex = conv.messages.length - 1;
      messageIndex >= 0;
      messageIndex--
    ) {
      const message = conv.messages[messageIndex]
      if (!message?.toolCalls) continue

      const toolCallIndex = message.toolCalls.findIndex((toolCall) => {
        if (input.toolCallId && toolCall.id === input.toolCallId) return true
        if (input.approvalId && toolCall.approvalId === input.approvalId) {
          return true
        }
        return false
      })
      if (toolCallIndex >= 0) {
        return { messageIndex, toolCallIndex }
      }
    }

    return undefined
  }

  function getToolEventConversationIds(input: {
    clientId?: string
    threadId?: string
    streamId?: string
    toolCallId?: string
    approvalId?: string
  }): Array<string> {
    const ids: Array<string> = []
    const add = (id: string | undefined) => {
      if (id && !ids.includes(id)) ids.push(id)
    }

    add(input.clientId)
    add(input.streamId ? streamToConversation.get(input.streamId) : undefined)
    add(input.threadId)

    for (const conversationId of Object.keys(state.conversations)) {
      if (
        findToolCallLocation(conversationId, {
          toolCallId: input.toolCallId,
          approvalId: input.approvalId,
        })
      ) {
        add(conversationId)
      }
    }

    return ids
  }

  function getStructuredOutputConversationIds(input: {
    clientId?: string
    threadId?: string
    streamId?: string
    messageId?: string
  }): Array<string> {
    const ids: Array<string> = []
    const add = (id: string | undefined) => {
      if (id && !ids.includes(id)) ids.push(id)
    }

    add(input.clientId)
    add(input.streamId ? streamToConversation.get(input.streamId) : undefined)
    add(input.threadId)

    if (input.messageId) {
      for (const conversation of Object.values(state.conversations)) {
        if (
          conversation.messages.some(
            (message) => message.id === input.messageId,
          )
        ) {
          add(conversation.id)
        }
      }
    }

    return ids
  }

  function upsertStructuredOutputPart(
    conversationId: string,
    input: {
      messageId: string
      timestamp: number
      source: 'client' | 'server'
      requestId?: string
      status: 'streaming' | 'complete' | 'error'
      raw: string
      partial?: unknown
      data?: unknown
      reasoning?: string
      errorMessage?: string
    },
  ): number | undefined {
    const conv = state.conversations[conversationId]
    if (!conv) return undefined

    const part: MessagePart = {
      type: 'structured-output',
      status: input.status,
      raw: input.raw,
      ...(input.partial !== undefined ? { partial: input.partial } : {}),
      ...(input.data !== undefined ? { data: input.data } : {}),
      ...(input.reasoning !== undefined ? { reasoning: input.reasoning } : {}),
      ...(input.errorMessage !== undefined
        ? { errorMessage: input.errorMessage }
        : {}),
    }

    let messageIndex = conv.messages.findIndex(
      (message) => message.id === input.messageId,
    )

    if (messageIndex === -1) {
      messageIndex = conv.messages.length
      addMessage(conversationId, {
        id: input.messageId,
        role: 'assistant',
        content: '',
        timestamp: input.timestamp,
        parts: [part],
        source: input.source,
        ...(input.requestId ? { requestId: input.requestId } : {}),
      })
    } else {
      setState(
        'conversations',
        conversationId,
        'messages',
        messageIndex,
        'parts',
        produce((parts: Array<MessagePart> | undefined) => {
          const next = parts ? [...parts] : []
          const existingIndex = next.findIndex(
            (candidate) => candidate.type === 'structured-output',
          )
          if (existingIndex >= 0) {
            next[existingIndex] = part
          } else {
            next.push(part)
          }
          return next
        }),
      )
    }

    return messageIndex
  }

  function attachMessageToLatestIteration(
    conversationId: string,
    messageId: string,
    requestId: string | undefined,
  ): void {
    const conv = state.conversations[conversationId]
    if (!conv || conv.iterations.length === 0) return

    let iterIndex = -1
    if (requestId) {
      for (let i = conv.iterations.length - 1; i >= 0; i--) {
        if (conv.iterations[i]?.requestId === requestId) {
          iterIndex = i
          break
        }
      }
    }
    if (iterIndex === -1) {
      iterIndex = conv.iterations.length - 1
    }

    const iteration = conv.iterations[iterIndex]
    if (!iteration || iteration.messageIds.includes(messageId)) return

    setState(
      'conversations',
      conversationId,
      'iterations',
      iterIndex,
      'messageIds',
      produce((arr: Array<string>) => {
        arr.push(messageId)
      }),
    )
  }

  function setToolCalls(
    conversationId: string,
    messageIndex: number,
    toolCalls: Array<ToolCall>,
  ): void {
    if (!state.conversations[conversationId]?.messages[messageIndex]) return
    setState(
      'conversations',
      conversationId,
      'messages',
      messageIndex,
      'toolCalls',
      toolCalls,
    )
  }

  function addChunk(conversationId: string, chunk: Chunk): void {
    if (!state.conversations[conversationId]) return
    queueChunk(conversationId, chunk)
  }

  function addActivityEvent(
    conversationId: string,
    activity:
      | 'imageEvents'
      | 'audioEvents'
      | 'speechEvents'
      | 'transcriptionEvents'
      | 'videoEvents',
    event: ActivityEvent,
  ): void {
    if (!state.conversations[conversationId]) return

    setState(
      'conversations',
      conversationId,
      activity,
      produce((events: Array<ActivityEvent> | undefined) => {
        if (!events) return [event]
        events.push(event)
        return events
      }),
    )

    const activityFlagMap: Record<typeof activity, keyof Conversation> = {
      imageEvents: 'hasImage',
      audioEvents: 'hasAudio',
      speechEvents: 'hasSpeech',
      transcriptionEvents: 'hasTranscription',
      videoEvents: 'hasVideo',
    }

    setState('conversations', conversationId, activityFlagMap[activity], true)
  }

  /**
   * For server conversations, ensure a message exists for the given messageId.
   * This creates a placeholder message that will be updated as chunks arrive.
   */
  function ensureMessageForChunk(
    conversationId: string,
    messageId: string | undefined,
    timestamp: number,
  ): void {
    if (!messageId) return
    const conv = state.conversations[conversationId]
    if (!conv || conv.type === 'client') return

    // Check if message already exists
    const existingMessage = conv.messages.find((m) => m.id === messageId)
    if (existingMessage) return

    // Create a new message for this messageId (server-side message)
    addMessage(conversationId, {
      id: messageId,
      role: 'assistant',
      content: '',
      timestamp,
      source: 'server',
    })
  }

  // Register all event listeners on mount
  onMount(() => {
    const cleanupFns: Array<() => void> = []
    loadFixtures()

    cleanupFns.push(
      aiEventClient.on('hook:registered', (e) => {
        setState(
          'hooks',
          produce((hooks: HookRegistryState) => {
            applyHookEvent(hooks, 'hook:registered', e.payload)
          }),
        )
      }),
    )

    cleanupFns.push(
      aiEventClient.on('hook:updated', (e) => {
        setState(
          'hooks',
          produce((hooks: HookRegistryState) => {
            applyHookEvent(hooks, 'hook:updated', e.payload)
          }),
        )
      }),
    )

    cleanupFns.push(
      aiEventClient.on('hook:unregistered', (e) => {
        setState(
          'hooks',
          produce((hooks: HookRegistryState) => {
            applyHookEvent(hooks, 'hook:unregistered', e.payload)
          }),
        )
      }),
    )

    cleanupFns.push(
      aiEventClient.on('hook:state-snapshot', (e) => {
        setState(
          'hooks',
          produce((hooks: HookRegistryState) => {
            applyHookEvent(hooks, 'hook:state-snapshot', e.payload)
          }),
        )
      }),
    )

    const recordRunEvent = (
      eventName:
        | 'run:created'
        | 'run:started'
        | 'run:updated'
        | 'run:completed'
        | 'run:errored'
        | 'run:cancelled',
      payload: RunLifecycleEvent,
    ) => {
      setState(
        'hooks',
        produce((hooks: HookRegistryState) => {
          applyHookEvent(hooks, eventName, payload)
        }),
      )
    }

    cleanupFns.push(
      aiEventClient.on('run:created', (e) => {
        recordRunEvent('run:created', e.payload)
      }),
      aiEventClient.on('run:started', (e) => {
        recordRunEvent('run:started', e.payload)
      }),
      aiEventClient.on('run:updated', (e) => {
        recordRunEvent('run:updated', e.payload)
      }),
      aiEventClient.on('run:completed', (e) => {
        recordRunEvent('run:completed', e.payload)
      }),
      aiEventClient.on('run:errored', (e) => {
        recordRunEvent('run:errored', e.payload)
      }),
      aiEventClient.on('run:cancelled', (e) => {
        recordRunEvent('run:cancelled', e.payload)
      }),
    )

    cleanupFns.push(
      aiEventClient.on('tools:registered', (e) => {
        setState(
          'hooks',
          produce((hooks: HookRegistryState) => {
            applyHookEvent(hooks, 'tools:registered', e.payload)
          }),
        )
      }),
    )

    cleanupFns.push(
      aiEventClient.on('devtools:tool-fixture:apply', (e) => {
        setState(
          'hooks',
          produce((hooks: HookRegistryState) => {
            applyHookEvent(hooks, 'devtools:tool-fixture:apply', e.payload)
          }),
        )
      }),
    )

    cleanupFns.push(
      aiEventClient.on('client:created', (e) => {
        const clientId = e.payload.clientId
        getOrCreateConversation(
          clientId,
          'client',
          `Client Chat (${clientId.substring(0, 8)})`,
        )
        updateConversation(clientId, { model: undefined, provider: 'Client' })
      }),
    )

    cleanupFns.push(
      aiEventClient.on('text:message:created', (e) => {
        const {
          clientId,
          streamId,
          messageId,
          role,
          content,
          timestamp,
          requestId,
        } = e.payload
        const conversationId =
          clientId ||
          (streamId ? streamToConversation.get(streamId) : undefined)

        if (!conversationId) return
        if (clientId && streamId) {
          streamToConversation.set(streamId, clientId)
        }
        if (role === 'tool' || role === 'system') return

        const source = normalizeMessageSource(
          e.payload.source,
          clientId ? 'client' : 'server',
        )
        const conversationType =
          clientId && source !== 'server' ? 'client' : 'server'

        if (!state.conversations[conversationId]) {
          getOrCreateConversation(
            conversationId,
            conversationType,
            conversationType === 'client'
              ? `Client Chat (${conversationId.substring(0, 8)})`
              : `Server Chat (${conversationId.substring(0, 8)})`,
          )
        }

        const conv = state.conversations[conversationId]
        if (!conv) return

        const existingIndex = conv.messages.findIndex(
          (message) => message.id === messageId,
        )

        const parts =
          e.payload.parts
            ?.map((part): MessagePart | null => {
              if (part.type === 'text') {
                return { type: 'text', content: part.content }
              }
              if (part.type === 'tool-call') {
                return {
                  type: 'tool-call',
                  toolCallId: part.id,
                  toolName: part.name,
                  arguments: part.arguments,
                  state: part.state,
                  output: part.output,
                  approval: part.approval,
                  content: part.approval
                    ? JSON.stringify(part.approval)
                    : undefined,
                }
              }
              if (part.type === 'tool-result') {
                return {
                  type: 'tool-result',
                  toolCallId: part.toolCallId,
                  content: part.content,
                  state: part.state,
                  error: part.error,
                }
              }
              if (part.type === 'thinking') {
                return {
                  type: 'thinking',
                  content: part.content,
                }
              }
              if (part.type === 'structured-output') {
                return {
                  type: 'structured-output',
                  status: part.status,
                  raw: part.raw,
                  partial: part.partial,
                  data: part.data,
                  reasoning: part.reasoning,
                  errorMessage: part.errorMessage,
                }
              }
              // Handle multimodal parts (image, audio, video)
              // These have a source property instead of content
              if (
                part.type === 'image' ||
                part.type === 'audio' ||
                part.type === 'video'
              ) {
                return {
                  type: part.type,
                  source: part.source,
                  metadata: part.metadata,
                }
              }
              // Fallback for any unknown part types - skip them
              return null
            })
            .filter((part): part is MessagePart => part !== null) ?? []

        const toolCallsFromPayload = e.payload.toolCalls?.map((toolCall) => ({
          id: toolCall.id,
          name: toolCall.function.name,
          arguments: toolCall.function.arguments,
          state: 'input-complete',
        }))
        const toolCallsFromParts = parts
          .filter((part) => part.type === 'tool-call')
          .map((part) => ({
            id: part.toolCallId ?? `${messageId}:${part.toolName ?? 'tool'}`,
            name: part.toolName ?? 'tool',
            arguments: part.arguments ?? stringifyToolArguments(part.output),
            state: part.state ?? 'input-complete',
            ...(part.output !== undefined ? { result: part.output } : {}),
            ...(part.approval?.needsApproval !== undefined
              ? { approvalRequired: part.approval.needsApproval }
              : {}),
            ...(part.approval?.id ? { approvalId: part.approval.id } : {}),
            ...(part.approval?.approved !== undefined
              ? { approvalApproved: part.approval.approved }
              : {}),
          }))
        const toolCalls =
          toolCallsFromPayload && toolCallsFromPayload.length > 0
            ? toolCallsFromPayload
            : toolCallsFromParts.length > 0
              ? toolCallsFromParts
              : undefined

        if (role === 'user' && conv.type === 'client' && source === 'server') {
          return
        }

        if (
          shouldSkipClientAssistantPlaceholder({
            role,
            source,
            content,
            toolCalls,
            parts,
          })
        ) {
          return
        }

        const messagePayload: Message = {
          id: messageId,
          role,
          content,
          timestamp,
          parts,
          toolCalls,
          source,
          requestId,
        }

        if (existingIndex >= 0) {
          updateMessage(conversationId, existingIndex, messagePayload)
        } else {
          addMessage(conversationId, messagePayload)
        }

        // Track messageId in the correct iteration (scoped by requestId)
        if (conv.iterations.length > 0) {
          let iterIndex = -1
          if (requestId) {
            // Find the latest iteration for this specific request
            for (let i = conv.iterations.length - 1; i >= 0; i--) {
              if (conv.iterations[i]?.requestId === requestId) {
                iterIndex = i
                break
              }
            }
          } else {
            // Fallback: use latest iteration
            iterIndex = conv.iterations.length - 1
          }
          if (iterIndex >= 0) {
            const iter = conv.iterations[iterIndex]
            if (iter && !iter.messageIds.includes(messageId)) {
              setState(
                'conversations',
                conversationId,
                'iterations',
                iterIndex,
                'messageIds',
                produce((arr: Array<string>) => {
                  arr.push(messageId)
                }),
              )
            }
          }
        }

        updateConversation(conversationId, { status: 'active', hasChat: true })
      }),
    )

    cleanupFns.push(
      aiEventClient.on('text:message:user', (e) => {
        const { clientId, streamId, messageId, content, timestamp, requestId } =
          e.payload
        const conversationId =
          clientId ||
          (streamId ? streamToConversation.get(streamId) : undefined)
        if (!conversationId) return

        const conv = state.conversations[conversationId]
        if (!conv) return

        const existingIndex = conv.messages.findIndex(
          (message) => message.id === messageId,
        )

        if (existingIndex >= 0) return

        const source = normalizeMessageSource(
          e.payload.source,
          clientId ? 'client' : 'server',
        )

        if (conv.type === 'client' && source === 'server') {
          return
        }

        addMessage(conversationId, {
          id: messageId,
          role: 'user',
          content,
          timestamp,
          source,
          requestId,
        })
      }),
    )

    cleanupFns.push(
      aiEventClient.on('client:loading:changed', (e) => {
        const clientId = e.payload.clientId
        if (state.conversations[clientId]) {
          updateConversation(clientId, {
            status: e.payload.isLoading ? 'active' : 'completed',
          })
        }
      }),
    )

    cleanupFns.push(
      aiEventClient.on('client:stopped', (e) => {
        const clientId = e.payload.clientId
        if (state.conversations[clientId]) {
          updateConversation(clientId, {
            status: 'completed',
            completedAt: e.payload.timestamp,
          })
        }
      }),
    )

    cleanupFns.push(
      aiEventClient.on('client:messages:cleared', (e) => {
        const clientId = e.payload.clientId
        if (state.conversations[clientId]) {
          updateConversation(clientId, {
            messages: [],
            chunks: [],
            usage: undefined,
          })
        }
      }),
    )

    cleanupFns.push(
      aiEventClient.on('client:reloaded', (e) => {
        const clientId = e.payload.clientId
        const conv = state.conversations[clientId]
        if (conv) {
          updateConversation(clientId, {
            messages: conv.messages.slice(0, e.payload.fromMessageIndex),
            status: 'active',
          })
        }
      }),
    )

    cleanupFns.push(
      aiEventClient.on('client:error:changed', (e) => {
        const clientId = e.payload.clientId
        if (state.conversations[clientId] && e.payload.error) {
          updateConversation(clientId, { status: 'error' })
        }
      }),
    )

    cleanupFns.push(
      aiEventClient.on('tools:result:added', (e) => {
        const {
          clientId,
          toolCallId,
          toolName,
          output,
          state: resultState,
          timestamp,
        } = e.payload

        if (!clientId) return
        if (!state.conversations[clientId]) return

        const conv = state.conversations[clientId]

        // Always create a chunk for the tool result
        const chunk: Chunk = {
          id: `chunk-tool-result-${toolCallId}-${Date.now()}`,
          type: 'tool_result',
          toolCallId,
          toolName,
          result: output,
          timestamp,
          chunkCount: 1,
          isClientTool: true,
        }

        // Find the message with the tool call and update it
        for (
          let messageIndex = conv.messages.length - 1;
          messageIndex >= 0;
          messageIndex--
        ) {
          const message = conv.messages[messageIndex]
          if (!message?.toolCalls) continue

          const toolCallIndex = message.toolCalls.findIndex(
            (t: ToolCall) => t.id === toolCallId,
          )
          if (toolCallIndex >= 0) {
            // Update the tool call state
            updateToolCall(clientId, messageIndex, toolCallIndex, {
              result: output,
              state: resultState === 'output-error' ? 'error' : 'complete',
            })

            // Add chunk with message ID
            chunk.messageId = message.id
            addChunkToMessage(clientId, chunk)
            return
          }
        }

        // If we couldn't find the message with toolCalls, still add the chunk
        // This handles cases where the message hasn't been processed yet
        // or the tool call is a client-only tool
        addChunkToMessage(clientId, chunk)
      }),
    )

    cleanupFns.push(
      aiEventClient.on('tools:approval:responded', (e) => {
        const {
          clientId,
          threadId,
          streamId,
          toolCallId,
          approvalId,
          approved,
          timestamp,
        } = e.payload

        const conversationIds = getToolEventConversationIds({
          clientId,
          threadId,
          streamId,
          toolCallId,
          approvalId,
        })

        for (const conversationId of conversationIds) {
          const conv = state.conversations[conversationId]
          if (!conv) continue

          const location = findToolCallLocation(conversationId, {
            toolCallId,
            approvalId,
          })
          if (!location) continue

          updateToolCall(
            conversationId,
            location.messageIndex,
            location.toolCallIndex,
            {
              state: approved ? 'approved' : 'denied',
              approvalRequired: false,
              approvalId,
              approvalApproved: approved,
            },
          )

          const message = conv.messages[location.messageIndex]
          const chunk: Chunk = {
            id: `chunk-${Date.now()}-${Math.random()}`,
            type: 'approval',
            ...(message?.id ? { messageId: message.id } : {}),
            toolCallId,
            approvalId,
            approved,
            timestamp,
            chunkCount: 1,
          }

          addChunkToMessage(conversationId, chunk)
        }
      }),
    )

    cleanupFns.push(
      aiEventClient.on('tools:call:updated', (e) => {
        const {
          clientId,
          streamId,
          messageId,
          toolCallId,
          toolName,
          state: toolCallState,
          arguments: args,
        } = e.payload

        const conversationId =
          clientId ||
          (streamId ? streamToConversation.get(streamId) : undefined)
        if (!conversationId || !state.conversations[conversationId]) return
        if (clientId && streamId) {
          streamToConversation.set(streamId, clientId)
        }

        const conv = state.conversations[conversationId]
        const messageIndex = conv.messages.findIndex(
          (m: Message) => m.id === messageId,
        )
        if (messageIndex === -1) {
          const source = normalizeMessageSource(
            e.payload.source,
            clientId ? 'client' : 'server',
          )
          addMessage(
            conversationId,
            createClientToolCallMessage({
              messageId,
              toolCallId,
              toolName,
              arguments: args,
              state: toolCallState,
              timestamp: e.payload.timestamp,
              source,
              ...(e.payload.requestId
                ? { requestId: e.payload.requestId }
                : {}),
            }),
          )
          updateConversation(conversationId, {
            status: 'active',
            hasChat: true,
          })
          return
        }

        const message = conv.messages[messageIndex]
        if (!message) return

        const toolCalls = message.toolCalls || []
        const existingToolIndex = toolCalls.findIndex(
          (t: ToolCall) => t.id === toolCallId,
        )

        const toolCall: ToolCall = {
          id: toolCallId,
          name: toolName,
          arguments: args,
          state: toolCallState,
        }

        if (existingToolIndex >= 0) {
          updateToolCall(
            conversationId,
            messageIndex,
            existingToolIndex,
            toolCall,
          )
        } else {
          setToolCalls(conversationId, messageIndex, [...toolCalls, toolCall])
        }
      }),
    )

    cleanupFns.push(
      aiEventClient.on('tools:input:available', (e) => {
        const {
          streamId,
          messageId,
          toolCallId,
          toolName,
          input,
          timestamp,
          clientId,
        } = e.payload

        const conversationId =
          clientId ||
          (streamId ? streamToConversation.get(streamId) : undefined)
        if (!conversationId) return

        const chunk: Chunk = {
          id: `chunk-${Date.now()}-${Math.random()}`,
          type: 'tool_call',
          messageId: messageId,
          toolCallId,
          toolName,
          arguments: JSON.stringify(input),
          timestamp,
          chunkCount: 1,
        }

        const conv = state.conversations[conversationId]
        if (conv?.type === 'client') {
          addChunkToMessage(conversationId, chunk)
        } else {
          addChunk(conversationId, chunk)
        }
      }),
    )

    cleanupFns.push(
      aiEventClient.on('tools:call:completed', (e) => {
        const {
          streamId,
          toolCallId,
          toolName,
          result,
          duration,
          messageId,
          timestamp,
          clientId,
        } = e.payload

        const conversationId =
          clientId ||
          (streamId ? streamToConversation.get(streamId) : undefined)
        if (!conversationId || !state.conversations[conversationId]) return

        const conv = state.conversations[conversationId]

        const chunk: Chunk = {
          id: `chunk-tool-result-${toolCallId}-${Date.now()}`,
          type: 'tool_result',
          messageId: messageId,
          toolCallId,
          toolName,
          result,
          duration,
          timestamp,
          chunkCount: 1,
        }

        if (conv.type === 'client' && messageId) {
          const messageIndex = conv.messages.findIndex(
            (m) => m.id === messageId,
          )
          if (messageIndex !== -1) {
            queueMessageChunk(conversationId, messageIndex, chunk)
          } else {
            for (let i = conv.messages.length - 1; i >= 0; i--) {
              if (conv.messages[i]?.role === 'assistant') {
                queueMessageChunk(conversationId, i, chunk)
                break
              }
            }
          }
        } else {
          addChunk(conversationId, chunk)
        }

        for (let i = conv.messages.length - 1; i >= 0; i--) {
          const message = conv.messages[i]
          if (!message?.toolCalls) continue

          const toolCallIndex = message.toolCalls.findIndex(
            (t) => t.id === toolCallId,
          )
          if (toolCallIndex >= 0) {
            updateToolCall(conversationId, i, toolCallIndex, {
              duration,
              result,
            })
            return
          }
        }
      }),
    )

    const recordStructuredOutput = (payload: {
      clientId?: string
      threadId?: string
      runId?: string
      streamId: string
      messageId: string
      requestId?: string
      timestamp: number
      source?: string
      status: 'streaming' | 'complete' | 'error'
      raw?: string
      partial?: unknown
      data?: unknown
      reasoning?: string
      errorMessage?: string
      delta?: string
    }) => {
      const {
        clientId,
        threadId,
        runId,
        streamId,
        messageId,
        requestId,
        timestamp,
      } = payload

      if (clientId && streamId) {
        streamToConversation.set(streamId, clientId)
      }

      const source = normalizeMessageSource(
        payload.source,
        clientId ? 'client' : 'server',
      )
      const conversationIds = getStructuredOutputConversationIds({
        clientId,
        threadId,
        streamId,
        messageId,
      })

      for (const conversationId of conversationIds) {
        if (!state.conversations[conversationId]) {
          getOrCreateConversation(
            conversationId,
            conversationId === clientId && source === 'client'
              ? 'client'
              : 'server',
            conversationId === clientId && source === 'client'
              ? `Client Chat (${conversationId.substring(0, 8)})`
              : `Server Chat (${conversationId.substring(0, 8)})`,
          )
        }

        attachRunToConversation(conversationId, runId)
        const messageIndex = upsertStructuredOutputPart(conversationId, {
          messageId,
          timestamp,
          source:
            conversationId === clientId && source === 'client'
              ? 'client'
              : 'server',
          ...(requestId ? { requestId } : {}),
          status: payload.status,
          raw: payload.raw ?? '',
          ...(payload.partial !== undefined
            ? { partial: payload.partial }
            : {}),
          ...(payload.data !== undefined ? { data: payload.data } : {}),
          ...(payload.reasoning !== undefined
            ? { reasoning: payload.reasoning }
            : {}),
          ...(payload.errorMessage !== undefined
            ? { errorMessage: payload.errorMessage }
            : {}),
        })

        const chunk: Chunk = {
          id: `chunk-structured-${messageId}-${Date.now()}-${Math.random()}`,
          type: 'structured_output',
          messageId,
          timestamp,
          chunkCount: 1,
          structuredStatus: payload.status,
          raw: payload.raw ?? '',
          ...(payload.partial !== undefined
            ? { partial: payload.partial }
            : {}),
          ...(payload.data !== undefined ? { data: payload.data } : {}),
          ...(payload.reasoning !== undefined
            ? { reasoning: payload.reasoning }
            : {}),
          ...(payload.errorMessage !== undefined
            ? { errorMessage: payload.errorMessage }
            : {}),
          ...(payload.delta !== undefined ? { delta: payload.delta } : {}),
        }

        const conv = state.conversations[conversationId]
        if (conv?.type === 'client' && messageIndex !== undefined) {
          queueMessageChunk(conversationId, messageIndex, chunk)
        } else if (conv?.type === 'client') {
          addChunkToMessage(conversationId, chunk)
        } else {
          addChunk(conversationId, chunk)
        }

        attachMessageToLatestIteration(conversationId, messageId, requestId)
        updateConversation(conversationId, {
          status: payload.status === 'error' ? 'error' : 'active',
          hasChat: true,
        })
      }
    }

    cleanupFns.push(
      aiEventClient.on('structured-output:started', (e) => {
        recordStructuredOutput(e.payload)
      }),
      aiEventClient.on('structured-output:updated', (e) => {
        recordStructuredOutput(e.payload)
      }),
      aiEventClient.on('structured-output:completed', (e) => {
        recordStructuredOutput(e.payload)
      }),
      aiEventClient.on('structured-output:errored', (e) => {
        recordStructuredOutput(e.payload)
      }),
    )

    cleanupFns.push(
      aiEventClient.on('text:chunk:content', (e) => {
        const streamId = e.payload.streamId
        const clientId = e.payload.clientId
        const conversationId = clientId || streamToConversation.get(streamId)
        if (!conversationId) return
        if (clientId) {
          streamToConversation.set(streamId, clientId)
        }

        const chunk: Chunk = {
          id: `chunk-${Date.now()}-${Math.random()}`,
          type: 'content',
          messageId: e.payload.messageId,
          content: e.payload.content,
          delta: e.payload.delta,
          timestamp: e.payload.timestamp,
          chunkCount: 1,
        }

        const conv = state.conversations[conversationId]
        if (conv?.type === 'client') {
          addChunkToMessage(conversationId, chunk)
        } else {
          ensureMessageForChunk(
            conversationId,
            e.payload.messageId,
            e.payload.timestamp,
          )
          addChunk(conversationId, chunk)
        }

        if (e.payload.messageId) {
          const messageIndex = conv?.messages.findIndex(
            (msg) => msg.id === e.payload.messageId,
          )
          if (messageIndex !== undefined && messageIndex >= 0) {
            updateMessage(conversationId, messageIndex, {
              content: e.payload.content,
            })
          }
        }
      }),
    )

    cleanupFns.push(
      aiEventClient.on('text:chunk:tool-call', (e) => {
        const streamId = e.payload.streamId
        const clientId = e.payload.clientId
        const conversationId = clientId || streamToConversation.get(streamId)
        if (!conversationId) return
        if (clientId) {
          streamToConversation.set(streamId, clientId)
        }

        const chunk: Chunk = {
          id: `chunk-${Date.now()}-${Math.random()}`,
          type: 'tool_call',
          messageId: e.payload.messageId,
          toolCallId: e.payload.toolCallId,
          toolName: e.payload.toolName,
          arguments: e.payload.arguments,
          timestamp: e.payload.timestamp,
          chunkCount: 1,
        }

        const conv = state.conversations[conversationId]
        if (conv?.type === 'client') {
          addChunkToMessage(conversationId, chunk)
        } else {
          ensureMessageForChunk(
            conversationId,
            e.payload.messageId,
            e.payload.timestamp,
          )
          addChunk(conversationId, chunk)
        }

        if (e.payload.messageId) {
          const messageIndex = conv?.messages.findIndex(
            (msg) => msg.id === e.payload.messageId,
          )
          if (messageIndex !== undefined && messageIndex >= 0) {
            const message = conv?.messages[messageIndex]
            if (!message) return

            const toolCalls = message.toolCalls || []
            const existingToolIndex = toolCalls.findIndex(
              (t: ToolCall) => t.id === e.payload.toolCallId,
            )

            const toolCall: ToolCall = {
              id: e.payload.toolCallId,
              name: e.payload.toolName,
              arguments: e.payload.arguments,
              state: 'input-streaming',
            }

            if (existingToolIndex >= 0) {
              updateToolCall(
                conversationId,
                messageIndex,
                existingToolIndex,
                toolCall,
              )
            } else {
              setToolCalls(conversationId, messageIndex, [
                ...toolCalls,
                toolCall,
              ])
            }
          }
        }
      }),
    )

    cleanupFns.push(
      aiEventClient.on('text:chunk:tool-result', (e) => {
        const streamId = e.payload.streamId
        const clientId = e.payload.clientId
        const conversationId = clientId || streamToConversation.get(streamId)
        if (!conversationId) return
        if (clientId) {
          streamToConversation.set(streamId, clientId)
        }

        const chunk: Chunk = {
          id: `chunk-${Date.now()}-${Math.random()}`,
          type: 'tool_result',
          messageId: e.payload.messageId,
          toolCallId: e.payload.toolCallId,
          result: e.payload.result,
          timestamp: e.payload.timestamp,
          chunkCount: 1,
        }

        const conv = state.conversations[conversationId]
        if (conv?.type === 'client') {
          addChunkToMessage(conversationId, chunk)
        } else {
          ensureMessageForChunk(
            conversationId,
            e.payload.messageId,
            e.payload.timestamp,
          )
          addChunk(conversationId, chunk)
        }

        // Also update the toolCalls array with the result
        if (conv && e.payload.toolCallId) {
          for (let i = conv.messages.length - 1; i >= 0; i--) {
            const message = conv.messages[i]
            if (!message?.toolCalls) continue

            const toolCallIndex = message.toolCalls.findIndex(
              (t) => t.id === e.payload.toolCallId,
            )
            if (toolCallIndex >= 0) {
              updateToolCall(conversationId, i, toolCallIndex, {
                result: e.payload.result,
                state: 'complete',
              })
              break
            }
          }
        }
      }),
    )

    cleanupFns.push(
      aiEventClient.on('text:chunk:thinking', (e) => {
        const streamId = e.payload.streamId
        const clientId = e.payload.clientId
        const conversationId = clientId || streamToConversation.get(streamId)
        if (!conversationId) return
        if (clientId) {
          streamToConversation.set(streamId, clientId)
        }

        const chunk: Chunk = {
          id: `chunk-${Date.now()}-${Math.random()}`,
          type: 'thinking',
          messageId: e.payload.messageId,
          content: e.payload.content,
          delta: e.payload.delta,
          timestamp: e.payload.timestamp,
          chunkCount: 1,
        }

        const conv = state.conversations[conversationId]
        if (conv?.type === 'client') {
          addChunkToMessage(conversationId, chunk)
        } else {
          ensureMessageForChunk(
            conversationId,
            e.payload.messageId,
            e.payload.timestamp,
          )
          addChunk(conversationId, chunk)
        }

        // Update thinkingContent on the message for all conversation types
        if (e.payload.messageId && conv) {
          const messageIndex = conv.messages.findIndex(
            (msg) => msg.id === e.payload.messageId,
          )
          if (messageIndex !== -1) {
            updateMessage(conversationId, messageIndex, {
              thinkingContent: e.payload.content,
            })
          }
        }
      }),
    )

    cleanupFns.push(
      aiEventClient.on('text:chunk:done', (e) => {
        const streamId = e.payload.streamId
        const clientId = e.payload.clientId
        const conversationId = clientId || streamToConversation.get(streamId)
        if (!conversationId) return
        if (clientId) {
          streamToConversation.set(streamId, clientId)
        }

        const chunk: Chunk = {
          id: `chunk-${Date.now()}-${Math.random()}`,
          type: 'done',
          messageId: e.payload.messageId,
          finishReason: e.payload.finishReason || undefined,
          timestamp: e.payload.timestamp,
          chunkCount: 1,
        }

        if (e.payload.usage) {
          updateConversationUsage(
            conversationId,
            e.payload.requestId,
            e.payload.usage,
          )
          updateMessageUsage(
            conversationId,
            e.payload.messageId,
            e.payload.usage,
            e.payload.requestId,
          )
        }

        const conv = state.conversations[conversationId]
        if (conv?.type === 'client') {
          addChunkToMessage(conversationId, chunk)
        } else {
          ensureMessageForChunk(
            conversationId,
            e.payload.messageId,
            e.payload.timestamp,
          )
          addChunk(conversationId, chunk)
        }

        // Mark the current iteration as completed when the LLM finishes generating.
        // This is critical for iterations that end with tool_calls — the
        // text:iteration:completed event only fires when the NEXT iteration starts,
        // so without this the iteration appears stuck in "streaming" during tool execution.
        if (e.payload.finishReason) {
          const convForIter = state.conversations[conversationId]
          if (convForIter) {
            for (let i = convForIter.iterations.length - 1; i >= 0; i--) {
              const iter = convForIter.iterations[i]
              const msgId = e.payload.messageId
              if (
                iter &&
                !iter.completedAt &&
                msgId &&
                (iter.messageId === msgId || iter.messageIds.includes(msgId))
              ) {
                const iterIdx = i
                setState(
                  'conversations',
                  conversationId,
                  'iterations',
                  iterIdx,
                  produce((it: Iteration) => {
                    it.completedAt = e.payload.timestamp
                    if (!it.finishReason)
                      it.finishReason = e.payload.finishReason || undefined
                    if (e.payload.usage && !it.usage) it.usage = e.payload.usage
                  }),
                )
                break
              }
            }
          }
        }

        updateConversation(conversationId, {
          status: 'completed',
          completedAt: e.payload.timestamp,
        })
      }),
    )

    cleanupFns.push(
      aiEventClient.on('text:chunk:error', (e) => {
        const streamId = e.payload.streamId
        const clientId = e.payload.clientId
        const conversationId = clientId || streamToConversation.get(streamId)
        if (!conversationId) return
        if (clientId) {
          streamToConversation.set(streamId, clientId)
        }

        const chunk: Chunk = {
          id: `chunk-${Date.now()}-${Math.random()}`,
          type: 'error',
          messageId: e.payload.messageId,
          error: e.payload.error,
          timestamp: e.payload.timestamp,
          chunkCount: 1,
        }

        const conv = state.conversations[conversationId]
        if (conv?.type === 'client') {
          addChunkToMessage(conversationId, chunk)
        } else {
          ensureMessageForChunk(
            conversationId,
            e.payload.messageId,
            e.payload.timestamp,
          )
          addChunk(conversationId, chunk)
        }

        // Mark any active iterations as completed with error
        const convForError = state.conversations[conversationId]
        if (convForError) {
          const errorRequestId = e.payload.requestId
          const errorMsgId = e.payload.messageId
          for (let i = convForError.iterations.length - 1; i >= 0; i--) {
            const iter = convForError.iterations[i]
            if (iter && !iter.completedAt) {
              // Scope to matching requestId or messageId when available
              const matchesRequest =
                !errorRequestId || iter.requestId === errorRequestId
              const matchesMessage =
                !errorMsgId ||
                iter.messageId === errorMsgId ||
                iter.messageIds.includes(errorMsgId)
              if (matchesRequest || matchesMessage) {
                setState(
                  'conversations',
                  conversationId,
                  'iterations',
                  i,
                  produce((it: Iteration) => {
                    it.completedAt = e.payload.timestamp
                    if (!it.finishReason) it.finishReason = 'error'
                  }),
                )
              }
            }
          }
        }

        updateConversation(conversationId, {
          status: 'error',
          completedAt: e.payload.timestamp,
        })
      }),
    )

    cleanupFns.push(
      aiEventClient.on('tools:approval:requested', (e) => {
        const {
          streamId,
          messageId,
          toolCallId,
          toolName,
          input,
          approvalId,
          timestamp,
          clientId,
          threadId,
        } = e.payload

        const source = normalizeMessageSource(
          e.payload.source,
          clientId ? 'client' : 'server',
        )
        if (clientId && streamId) {
          streamToConversation.set(streamId, clientId)
        }

        const conversationIds = getToolEventConversationIds({
          clientId,
          threadId,
          streamId,
          toolCallId,
          approvalId,
        })

        for (const conversationId of conversationIds) {
          if (!state.conversations[conversationId]) {
            getOrCreateConversation(
              conversationId,
              conversationId === clientId && source === 'client'
                ? 'client'
                : 'server',
              conversationId === clientId && source === 'client'
                ? `Client Chat (${conversationId.substring(0, 8)})`
                : `Server Chat (${conversationId.substring(0, 8)})`,
            )
          }

          let resolvedMessageId = messageId
          const location = findToolCallLocation(conversationId, { toolCallId })
          if (location) {
            updateToolCall(
              conversationId,
              location.messageIndex,
              location.toolCallIndex,
              {
                approvalRequired: true,
                approvalId,
                state: 'approval-requested',
              },
            )
            resolvedMessageId =
              state.conversations[conversationId]?.messages[
                location.messageIndex
              ]?.id ?? messageId
          } else {
            resolvedMessageId = messageId || `approval-message-${toolCallId}`
            addMessage(
              conversationId,
              createClientToolCallMessage({
                messageId: resolvedMessageId,
                toolCallId,
                toolName,
                arguments: stringifyToolArguments(input),
                state: 'approval-requested',
                timestamp,
                source:
                  conversationId === clientId && source === 'client'
                    ? 'client'
                    : 'server',
                approvalRequired: true,
                approvalId,
              }),
            )
          }

          const chunk: Chunk = {
            id: `chunk-${Date.now()}-${Math.random()}`,
            type: 'approval',
            ...(resolvedMessageId ? { messageId: resolvedMessageId } : {}),
            toolCallId,
            toolName,
            approvalId,
            input,
            timestamp,
            chunkCount: 1,
          }

          if (state.conversations[conversationId]?.type === 'client') {
            addChunkToMessage(conversationId, chunk)
          } else {
            addChunk(conversationId, chunk)
          }
        }

        if (conversationIds.length === 0) {
          const fallbackConversationId = clientId || threadId
          if (!fallbackConversationId) return

          getOrCreateConversation(
            fallbackConversationId,
            clientId ? 'client' : 'server',
            clientId
              ? `Client Chat (${fallbackConversationId.substring(0, 8)})`
              : `Server Chat (${fallbackConversationId.substring(0, 8)})`,
          )
          const resolvedMessageId =
            messageId || `approval-message-${toolCallId}`
          addMessage(
            fallbackConversationId,
            createClientToolCallMessage({
              messageId: resolvedMessageId,
              toolCallId,
              toolName,
              arguments: stringifyToolArguments(input),
              state: 'approval-requested',
              timestamp,
              source: clientId ? 'client' : 'server',
              approvalRequired: true,
              approvalId,
            }),
          )
          addChunkToMessage(fallbackConversationId, {
            id: `chunk-${Date.now()}-${Math.random()}`,
            type: 'approval',
            messageId: resolvedMessageId,
            toolCallId,
            toolName,
            approvalId,
            input,
            timestamp,
            chunkCount: 1,
          })
        }
      }),
    )

    cleanupFns.push(
      aiEventClient.on('text:request:started', (e) => {
        const streamId = e.payload.streamId
        const model = e.payload.model
        const provider = e.payload.provider
        const clientId = e.payload.clientId
        const source = normalizeMessageSource(e.payload.source, 'server')
        const threadConversationId =
          source === 'server' ? (e.payload.threadId ?? clientId) : undefined

        if (threadConversationId) {
          getOrCreateConversation(
            threadConversationId,
            'server',
            `Server Chat (${threadConversationId.substring(0, 8)})`,
          )
          streamToConversation.set(streamId, threadConversationId)
          requestToConversation.set(e.payload.requestId, threadConversationId)
          updateConversation(threadConversationId, {
            status: 'active',
            ...e.payload,
            systemPrompts: e.payload.systemPrompts,
            hasChat: true,
          })
          attachRunToConversation(threadConversationId, e.payload.runId)
          return
        }

        if (clientId && state.conversations[clientId]) {
          streamToConversation.set(streamId, clientId)
          requestToConversation.set(e.payload.requestId, clientId)
          updateConversation(clientId, {
            status: 'active',
            ...e.payload,
            systemPrompts: e.payload.systemPrompts,
            hasChat: true,
          })
          attachRunToConversation(clientId, e.payload.runId)
          return
        }

        const activeClient = Object.values(state.conversations).find(
          (c) => c.type === 'client' && c.status === 'active' && !c.model,
        )

        if (activeClient) {
          streamToConversation.set(streamId, activeClient.id)
          requestToConversation.set(e.payload.requestId, activeClient.id)
          updateConversation(activeClient.id, {
            ...e.payload,
            systemPrompts: e.payload.systemPrompts,
            hasChat: true,
          })
          attachRunToConversation(activeClient.id, e.payload.runId)
        } else {
          const existingServerConv = Object.values(state.conversations).find(
            (c) => c.type === 'server' && c.model === model,
          )

          if (existingServerConv) {
            streamToConversation.set(streamId, existingServerConv.id)
            requestToConversation.set(
              e.payload.requestId,
              existingServerConv.id,
            )
            updateConversation(existingServerConv.id, {
              status: 'active',
              ...e.payload,
              systemPrompts: e.payload.systemPrompts,
              hasChat: true,
            })
            attachRunToConversation(existingServerConv.id, e.payload.runId)
          } else {
            const serverId = `server-${model}`
            getOrCreateConversation(serverId, 'server', `${model} Server`)
            streamToConversation.set(streamId, serverId)
            requestToConversation.set(e.payload.requestId, serverId)
            updateConversation(serverId, {
              ...e.payload,
              systemPrompts: e.payload.systemPrompts,
              hasChat: true,
            })
            attachRunToConversation(serverId, e.payload.runId)
          }
        }
      }),
    )

    cleanupFns.push(
      aiEventClient.on('text:request:completed', (e) => {
        const { requestId, usage } = e.payload

        const conversationId = requestToConversation.get(requestId)
        if (conversationId && state.conversations[conversationId]) {
          updateConversation(conversationId, {
            status: 'completed',
            completedAt: e.payload.timestamp,
          })
          if (usage) {
            updateConversationUsage(conversationId, requestId, usage)
            updateMessageUsage(
              conversationId,
              e.payload.messageId,
              usage,
              requestId,
            )
          }

          // Failsafe: mark any remaining active iterations FOR THIS REQUEST as completed.
          // Only scope to this requestId to avoid touching other requests' iterations.
          const conv = state.conversations[conversationId]
          for (let i = 0; i < conv.iterations.length; i++) {
            const iter = conv.iterations[i]
            if (
              iter &&
              !iter.completedAt &&
              (!requestId || iter.requestId === requestId)
            ) {
              const iterIdx = i
              setState(
                'conversations',
                conversationId,
                'iterations',
                iterIdx,
                produce((it: Iteration) => {
                  it.completedAt = e.payload.timestamp
                  if (!it.finishReason) {
                    it.finishReason = e.payload.finishReason || 'stop'
                  }
                  if (!it.usage && usage) {
                    it.usage = usage
                  }
                }),
              )
            }
          }
        }
      }),
    )

    cleanupFns.push(
      aiEventClient.on('text:usage', (e) => {
        const { requestId, usage, messageId } = e.payload

        const conversationId = requestToConversation.get(requestId)
        if (conversationId && state.conversations[conversationId]) {
          updateConversationUsage(conversationId, requestId, usage)
          updateMessageUsage(conversationId, messageId, usage, requestId)
        }
      }),
    )

    cleanupFns.push(
      aiEventClient.on('text:iteration:started', (e) => {
        const { requestId, streamId, clientId, iteration, messageId } =
          e.payload

        const conversationId =
          clientId ||
          (streamId ? streamToConversation.get(streamId) : undefined) ||
          requestToConversation.get(requestId)
        if (!conversationId || !state.conversations[conversationId]) return

        // Failsafe: when a new iteration starts, any previous uncompleted
        // iterations for the same request must have ended (with tool_calls).
        // This covers edge cases where text:chunk:done didn't match by messageId.
        const convForFailsafe = state.conversations[conversationId]
        for (let i = 0; i < convForFailsafe.iterations.length; i++) {
          const iter = convForFailsafe.iterations[i]
          if (iter && !iter.completedAt && iter.requestId === requestId) {
            setState(
              'conversations',
              conversationId,
              'iterations',
              i,
              produce((it: Iteration) => {
                it.completedAt = e.payload.timestamp
                if (!it.finishReason) it.finishReason = 'tool_calls'
              }),
            )
          }
        }

        // Guard against duplicate iteration events (e.g. middleware registered twice)
        const existingConv = state.conversations[conversationId]
        if (
          existingConv.iterations.some(
            (it) => it.index === iteration && it.requestId === requestId,
          )
        ) {
          return
        }

        const newIteration: Iteration = {
          requestId,
          index: iteration,
          messageId,
          startedAt: e.payload.timestamp,
          model: e.payload.model,
          provider: e.payload.provider,
          systemPrompts: e.payload.systemPrompts,
          toolNames: e.payload.toolNames,
          options: e.payload.options,
          modelOptions: e.payload.modelOptions,
          middlewareEvents: [],
          messageIds: [messageId],
        }

        setState(
          'conversations',
          conversationId,
          'iterations',
          produce((arr: Array<Iteration>) => {
            arr.push(newIteration)
          }),
        )
        setState(
          'conversations',
          conversationId,
          'iterationCount',
          iteration + 1,
        )
      }),
    )

    cleanupFns.push(
      aiEventClient.on('text:iteration:completed', (e) => {
        const { requestId, streamId, clientId, iteration } = e.payload

        const conversationId =
          clientId ||
          (streamId ? streamToConversation.get(streamId) : undefined) ||
          requestToConversation.get(requestId)
        if (!conversationId || !state.conversations[conversationId]) return

        const conv = state.conversations[conversationId]
        // Find the iteration by BOTH requestId and index to avoid cross-request pollution.
        // Without requestId scoping, request 2's iteration 0 would match request 1's iteration 0.
        const iterIndex = conv.iterations.findIndex(
          (it) =>
            it.index === iteration &&
            (!requestId || it.requestId === requestId),
        )
        if (iterIndex === -1) return

        setState(
          'conversations',
          conversationId,
          'iterations',
          iterIndex,
          produce((it: Iteration) => {
            it.completedAt = e.payload.timestamp
            it.finishReason = e.payload.finishReason
            if (e.payload.usage) {
              it.usage = e.payload.usage
            }
          }),
        )
      }),
    )

    /** Find the latest iteration for a given requestId, or the very latest iteration as fallback */
    function findLatestIterationIndex(
      conv: Conversation,
      reqId?: string,
    ): number {
      if (reqId) {
        for (let i = conv.iterations.length - 1; i >= 0; i--) {
          if (conv.iterations[i]?.requestId === reqId) return i
        }
      }
      return conv.iterations.length - 1
    }

    cleanupFns.push(
      aiEventClient.on('middleware:hook:executed', (e) => {
        const { requestId, streamId, clientId } = e.payload

        const conversationId =
          clientId ||
          (streamId ? streamToConversation.get(streamId) : undefined) ||
          requestToConversation.get(requestId)
        if (!conversationId || !state.conversations[conversationId]) return

        const conv = state.conversations[conversationId]
        const iterIndex = findLatestIterationIndex(conv, requestId)
        if (iterIndex < 0) return

        const mwEvent: MiddlewareEvent = {
          id: `mw-${Date.now()}-${Math.random()}`,
          middlewareName: e.payload.middlewareName,
          hookName: e.payload.hookName,
          timestamp: e.payload.timestamp,
          duration: e.payload.duration,
          hasTransform: e.payload.hasTransform,
        }

        setState(
          'conversations',
          conversationId,
          'iterations',
          iterIndex,
          'middlewareEvents',
          produce((arr: Array<MiddlewareEvent>) => {
            arr.push(mwEvent)
          }),
        )
      }),
    )

    cleanupFns.push(
      aiEventClient.on('middleware:config:transformed', (e) => {
        const { requestId, streamId, clientId } = e.payload

        const conversationId =
          clientId ||
          (streamId ? streamToConversation.get(streamId) : undefined) ||
          requestToConversation.get(requestId)
        if (!conversationId || !state.conversations[conversationId]) return

        const conv = state.conversations[conversationId]
        const iterIndex = findLatestIterationIndex(conv, requestId)
        if (iterIndex < 0) return

        const mwEvent: MiddlewareEvent = {
          id: `mw-cfg-${Date.now()}-${Math.random()}`,
          middlewareName: e.payload.middlewareName,
          hookName: 'onConfig',
          timestamp: e.payload.timestamp,
          hasTransform: true,
          configChanges: e.payload.changes,
        }

        setState(
          'conversations',
          conversationId,
          'iterations',
          iterIndex,
          'middlewareEvents',
          produce((arr: Array<MiddlewareEvent>) => {
            arr.push(mwEvent)
          }),
        )
      }),
    )

    cleanupFns.push(
      aiEventClient.on('middleware:chunk:transformed', (e) => {
        const { requestId, streamId, clientId } = e.payload

        const conversationId =
          clientId ||
          (streamId ? streamToConversation.get(streamId) : undefined) ||
          requestToConversation.get(requestId)
        if (!conversationId || !state.conversations[conversationId]) return

        const conv = state.conversations[conversationId]
        const iterIndex = findLatestIterationIndex(conv, requestId)
        if (iterIndex < 0) return

        const mwEvent: MiddlewareEvent = {
          id: `mw-chunk-${Date.now()}-${Math.random()}`,
          middlewareName: e.payload.middlewareName,
          hookName: 'onChunk',
          timestamp: e.payload.timestamp,
          hasTransform: true,
          originalChunkType: e.payload.originalChunkType,
          resultCount: e.payload.resultCount,
          wasDropped: e.payload.wasDropped,
        }

        setState(
          'conversations',
          conversationId,
          'iterations',
          iterIndex,
          'middlewareEvents',
          produce((arr: Array<MiddlewareEvent>) => {
            arr.push(mwEvent)
          }),
        )
      }),
    )

    cleanupFns.push(
      aiEventClient.on('summarize:request:started', (e) => {
        const { requestId, model, inputLength, timestamp, clientId } = e.payload

        // Try to find an active conversation to attach to, or create a new one
        let conversationId = clientId
        if (!conversationId || !state.conversations[conversationId]) {
          // Find most recent active client conversation
          const activeClients = Object.values(state.conversations)
            .filter((c) => c.type === 'client' && c.status === 'active')
            .sort((a, b) => b.startedAt - a.startedAt)

          if (activeClients.length > 0 && activeClients[0]) {
            conversationId = activeClients[0].id
          } else {
            // Create a new conversation for summaries
            conversationId = `summarize-${requestId}`
            getOrCreateConversation(
              conversationId,
              'server',
              `Summarize (${model})`,
            )
            updateConversation(conversationId, { model })
          }
        }

        requestToConversation.set(requestId, conversationId)

        const summarizeOp: SummarizeOperation = {
          id: requestId,
          model,
          inputLength,
          timestamp,
          status: 'started',
        }

        const conv = state.conversations[conversationId]
        if (conv) {
          const summaries = conv.summaries || []
          setState('conversations', conversationId, 'summaries', [
            ...summaries,
            summarizeOp,
          ])
          setState('conversations', conversationId, 'hasSummarize', true)
        }
      }),
    )

    cleanupFns.push(
      aiEventClient.on('summarize:request:completed', (e) => {
        const { requestId, outputLength, duration } = e.payload

        const conversationId = requestToConversation.get(requestId)
        if (!conversationId || !state.conversations[conversationId]) return

        const conv = state.conversations[conversationId]
        if (!conv.summaries) return

        const summaryIndex = conv.summaries.findIndex(
          (op) => op.id === requestId,
        )
        if (summaryIndex >= 0) {
          setState(
            'conversations',
            conversationId,
            'summaries',
            summaryIndex,
            produce((op: SummarizeOperation) => {
              op.duration = duration
              op.outputLength = outputLength
              op.status = 'completed'
            }),
          )
        }
      }),
    )

    cleanupFns.push(
      aiEventClient.on('image:request:started', (e) => {
        const { requestId, clientId, timestamp } = e.payload

        let conversationId = clientId
        if (!conversationId || !state.conversations[conversationId]) {
          conversationId = `image-${requestId}`
          getOrCreateConversation(
            conversationId,
            'server',
            `Image (${requestId.substring(0, 8)})`,
          )
        }

        addActivityEvent(conversationId, 'imageEvents', {
          id: requestId,
          name: 'image:request:started',
          timestamp,
          payload: e.payload,
        })
      }),
    )

    cleanupFns.push(
      aiEventClient.on('image:request:completed', (e) => {
        const { requestId, clientId, timestamp } = e.payload

        let conversationId = clientId
        if (!conversationId || !state.conversations[conversationId]) {
          conversationId = `image-${requestId}`
          getOrCreateConversation(
            conversationId,
            'server',
            `Image (${requestId.substring(0, 8)})`,
          )
        }

        addActivityEvent(conversationId, 'imageEvents', {
          id: requestId,
          name: 'image:request:completed',
          timestamp,
          payload: e.payload,
        })
      }),
    )

    cleanupFns.push(
      aiEventClient.on('image:usage', (e) => {
        const { requestId, clientId, timestamp } = e.payload

        let conversationId = clientId
        if (!conversationId || !state.conversations[conversationId]) {
          conversationId = `image-${requestId}`
          getOrCreateConversation(
            conversationId,
            'server',
            `Image (${requestId.substring(0, 8)})`,
          )
        }

        addActivityEvent(conversationId, 'imageEvents', {
          id: requestId,
          name: 'image:usage',
          timestamp,
          payload: e.payload,
        })
      }),
    )

    cleanupFns.push(
      aiEventClient.on('audio:request:started', (e) => {
        const { requestId, clientId, timestamp } = e.payload

        let conversationId = clientId
        if (!conversationId || !state.conversations[conversationId]) {
          conversationId = `audio-${requestId}`
          getOrCreateConversation(
            conversationId,
            'server',
            `Audio (${requestId.substring(0, 8)})`,
          )
        }

        addActivityEvent(conversationId, 'audioEvents', {
          id: requestId,
          name: 'audio:request:started',
          timestamp,
          payload: e.payload,
        })
      }),
    )

    cleanupFns.push(
      aiEventClient.on('audio:request:completed', (e) => {
        const { requestId, clientId, timestamp } = e.payload

        let conversationId = clientId
        if (!conversationId || !state.conversations[conversationId]) {
          conversationId = `audio-${requestId}`
          getOrCreateConversation(
            conversationId,
            'server',
            `Audio (${requestId.substring(0, 8)})`,
          )
        }

        addActivityEvent(conversationId, 'audioEvents', {
          id: requestId,
          name: 'audio:request:completed',
          timestamp,
          payload: e.payload,
        })
      }),
    )

    cleanupFns.push(
      aiEventClient.on('audio:request:error', (e) => {
        const { requestId, clientId, timestamp } = e.payload

        let conversationId = clientId
        if (!conversationId || !state.conversations[conversationId]) {
          conversationId = `audio-${requestId}`
          getOrCreateConversation(
            conversationId,
            'server',
            `Audio (${requestId.substring(0, 8)})`,
          )
        }

        addActivityEvent(conversationId, 'audioEvents', {
          id: requestId,
          name: 'audio:request:error',
          timestamp,
          payload: e.payload,
        })
      }),
    )

    cleanupFns.push(
      aiEventClient.on('audio:usage', (e) => {
        const { requestId, clientId, timestamp } = e.payload

        let conversationId = clientId
        if (!conversationId || !state.conversations[conversationId]) {
          conversationId = `audio-${requestId}`
          getOrCreateConversation(
            conversationId,
            'server',
            `Audio (${requestId.substring(0, 8)})`,
          )
        }

        addActivityEvent(conversationId, 'audioEvents', {
          id: requestId,
          name: 'audio:usage',
          timestamp,
          payload: e.payload,
        })
      }),
    )

    cleanupFns.push(
      aiEventClient.on('speech:request:started', (e) => {
        const { requestId, clientId, timestamp } = e.payload

        let conversationId = clientId
        if (!conversationId || !state.conversations[conversationId]) {
          conversationId = `speech-${requestId}`
          getOrCreateConversation(
            conversationId,
            'server',
            `Speech (${requestId.substring(0, 8)})`,
          )
        }

        addActivityEvent(conversationId, 'speechEvents', {
          id: requestId,
          name: 'speech:request:started',
          timestamp,
          payload: e.payload,
        })
      }),
    )

    cleanupFns.push(
      aiEventClient.on('speech:request:completed', (e) => {
        const { requestId, clientId, timestamp } = e.payload

        let conversationId = clientId
        if (!conversationId || !state.conversations[conversationId]) {
          conversationId = `speech-${requestId}`
          getOrCreateConversation(
            conversationId,
            'server',
            `Speech (${requestId.substring(0, 8)})`,
          )
        }

        addActivityEvent(conversationId, 'speechEvents', {
          id: requestId,
          name: 'speech:request:completed',
          timestamp,
          payload: e.payload,
        })
      }),
    )

    cleanupFns.push(
      aiEventClient.on('speech:request:error', (e) => {
        const { requestId, clientId, timestamp } = e.payload

        let conversationId = clientId
        if (!conversationId || !state.conversations[conversationId]) {
          conversationId = `speech-${requestId}`
          getOrCreateConversation(
            conversationId,
            'server',
            `Speech (${requestId.substring(0, 8)})`,
          )
        }

        addActivityEvent(conversationId, 'speechEvents', {
          id: requestId,
          name: 'speech:request:error',
          timestamp,
          payload: e.payload,
        })
      }),
    )

    cleanupFns.push(
      aiEventClient.on('speech:usage', (e) => {
        const { requestId, clientId, timestamp } = e.payload

        let conversationId = clientId
        if (!conversationId || !state.conversations[conversationId]) {
          conversationId = `speech-${requestId}`
          getOrCreateConversation(
            conversationId,
            'server',
            `Speech (${requestId.substring(0, 8)})`,
          )
        }

        addActivityEvent(conversationId, 'speechEvents', {
          id: requestId,
          name: 'speech:usage',
          timestamp,
          payload: e.payload,
        })
      }),
    )

    cleanupFns.push(
      aiEventClient.on('transcription:request:started', (e) => {
        const { requestId, clientId, timestamp } = e.payload

        let conversationId = clientId
        if (!conversationId || !state.conversations[conversationId]) {
          conversationId = `transcription-${requestId}`
          getOrCreateConversation(
            conversationId,
            'server',
            `Transcription (${requestId.substring(0, 8)})`,
          )
        }

        addActivityEvent(conversationId, 'transcriptionEvents', {
          id: requestId,
          name: 'transcription:request:started',
          timestamp,
          payload: e.payload,
        })
      }),
    )

    cleanupFns.push(
      aiEventClient.on('transcription:request:completed', (e) => {
        const { requestId, clientId, timestamp } = e.payload

        let conversationId = clientId
        if (!conversationId || !state.conversations[conversationId]) {
          conversationId = `transcription-${requestId}`
          getOrCreateConversation(
            conversationId,
            'server',
            `Transcription (${requestId.substring(0, 8)})`,
          )
        }

        addActivityEvent(conversationId, 'transcriptionEvents', {
          id: requestId,
          name: 'transcription:request:completed',
          timestamp,
          payload: e.payload,
        })
      }),
    )

    cleanupFns.push(
      aiEventClient.on('transcription:request:error', (e) => {
        const { requestId, clientId, timestamp } = e.payload

        let conversationId = clientId
        if (!conversationId || !state.conversations[conversationId]) {
          conversationId = `transcription-${requestId}`
          getOrCreateConversation(
            conversationId,
            'server',
            `Transcription (${requestId.substring(0, 8)})`,
          )
        }

        addActivityEvent(conversationId, 'transcriptionEvents', {
          id: requestId,
          name: 'transcription:request:error',
          timestamp,
          payload: e.payload,
        })
      }),
    )

    cleanupFns.push(
      aiEventClient.on('transcription:usage', (e) => {
        const { requestId, clientId, timestamp } = e.payload

        let conversationId = clientId
        if (!conversationId || !state.conversations[conversationId]) {
          conversationId = `transcription-${requestId}`
          getOrCreateConversation(
            conversationId,
            'server',
            `Transcription (${requestId.substring(0, 8)})`,
          )
        }

        addActivityEvent(conversationId, 'transcriptionEvents', {
          id: requestId,
          name: 'transcription:usage',
          timestamp,
          payload: e.payload,
        })
      }),
    )

    cleanupFns.push(
      aiEventClient.on('video:request:started', (e) => {
        const { requestId, clientId, timestamp } = e.payload

        let conversationId = clientId
        if (!conversationId || !state.conversations[conversationId]) {
          conversationId = `video-${requestId}`
          getOrCreateConversation(
            conversationId,
            'server',
            `Video (${requestId.substring(0, 8)})`,
          )
        }

        addActivityEvent(conversationId, 'videoEvents', {
          id: requestId,
          name: 'video:request:started',
          timestamp,
          payload: e.payload,
        })
      }),
    )

    cleanupFns.push(
      aiEventClient.on('video:request:completed', (e) => {
        const { requestId, clientId, timestamp } = e.payload

        let conversationId = clientId
        if (!conversationId || !state.conversations[conversationId]) {
          conversationId = `video-${requestId}`
          getOrCreateConversation(
            conversationId,
            'server',
            `Video (${requestId.substring(0, 8)})`,
          )
        }

        addActivityEvent(conversationId, 'videoEvents', {
          id: requestId,
          name: 'video:request:completed',
          timestamp,
          payload: e.payload,
        })
      }),
    )

    cleanupFns.push(
      aiEventClient.on('video:usage', (e) => {
        const { requestId, clientId, timestamp } = e.payload

        let conversationId = clientId
        if (!conversationId || !state.conversations[conversationId]) {
          conversationId = `video-${requestId}`
          getOrCreateConversation(
            conversationId,
            'server',
            `Video (${requestId.substring(0, 8)})`,
          )
        }

        addActivityEvent(conversationId, 'videoEvents', {
          id: requestId,
          name: 'video:usage',
          timestamp,
          payload: e.payload,
        })
      }),
    )

    // Cleanup all listeners on unmount
    onCleanup(() => {
      for (const cleanup of cleanupFns) {
        cleanup()
      }
      streamToConversation.clear()
      requestToConversation.clear()
    })
  })

  const contextValue: AIContextValue = {
    state,
    clearAllConversations,
    selectConversation,
    clearHooks,
    selectHook,
    saveToolFixture,
    deleteToolFixture,
    applyToolFixture,
  }

  return (
    <AIContext.Provider value={contextValue}>
      {props.children}
    </AIContext.Provider>
  )
}
