import { batch, createContext, onCleanup, onMount, useContext } from 'solid-js'
import { createStore, produce } from 'solid-js/store'
import { aiEventClient } from '@tanstack/ai/event-client'
import type { ContentPartSource } from '@tanstack/ai'
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
  content?: string
  toolCallId?: string
  toolName?: string
  arguments?: string
  state?: string
  output?: unknown
  error?: string
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
  usage?: TokenUsage
  iterationCount?: number
  toolNames?: Array<string>
  options?: Record<string, unknown>
  modelOptions?: Record<string, unknown>
  systemPrompts?: Array<string>
  /** Flags for which operation types this conversation has */
  hasChat?: boolean
  hasSummarize?: boolean
  hasImage?: boolean
  hasSpeech?: boolean
  hasTranscription?: boolean
  hasVideo?: boolean
  /** Summarize operations in this conversation */
  summaries?: Array<SummarizeOperation>
  imageEvents?: Array<ActivityEvent>
  speechEvents?: Array<ActivityEvent>
  transcriptionEvents?: Array<ActivityEvent>
  videoEvents?: Array<ActivityEvent>
}

interface AIStoreState {
  conversations: Record<string, Conversation>
  activeConversationId: string | null
}

interface AIContextValue {
  state: AIStoreState
  clearAllConversations: () => void
  selectConversation: (id: string) => void
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
  })

  const streamToConversation = new Map<string, string>()
  const requestToConversation = new Map<string, string>()

  // Batching system for high-frequency chunk updates with consolidated chunk merging
  // Stores: conversationId -> { chunks to merge, totalNewChunks count }
  const pendingConversationChunks = new Map<
    string,
    { chunks: Array<Chunk>; newChunkCount: number }
  >()
  // Stores: conversationId -> messageIndex -> { chunks to merge, totalNewChunks count }
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

  /** Check if a chunk type can be merged with consecutive same-type chunks */
  function isMergeableChunkType(type: Chunk['type']): boolean {
    return type === 'content' || type === 'thinking'
  }

  /** Merge pending chunks into existing chunks array, consolidating consecutive same-type chunks */
  function mergeChunks(existing: Array<Chunk>, pending: Array<Chunk>): void {
    for (const chunk of pending) {
      const lastChunk = existing[existing.length - 1]

      // If last chunk exists, is the same type, and both are mergeable types, merge them
      if (
        lastChunk &&
        lastChunk.type === chunk.type &&
        isMergeableChunkType(chunk.type) &&
        lastChunk.messageId === chunk.messageId
      ) {
        // Merge: use the new chunk's content (it's already accumulated), update delta, increment count
        lastChunk.content = chunk.content || lastChunk.content
        lastChunk.delta = chunk.delta
        lastChunk.chunkCount += chunk.chunkCount
      } else {
        // Different type or not mergeable - add as new entry
        existing.push(chunk)
      }
    }
  }

  function flushPendingChunks(): void {
    batchScheduled = false

    batch(() => {
      // Flush conversation-level chunks
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

      // Flush message-level chunks
      for (const [conversationId, messageMap] of pendingMessageChunks) {
        const conv = state.conversations[conversationId]
        if (!conv) continue

        for (const [messageIndex, { chunks, newChunkCount }] of messageMap) {
          const message = conv.messages[messageIndex]
          if (message) {
            // Update chunks array with merging
            setState(
              'conversations',
              conversationId,
              'messages',
              messageIndex,
              'chunks',
              produce((arr: Array<Chunk> | undefined) => {
                if (!arr) {
                  // First time - just set the chunks (they're already consolidated in pending)
                  return chunks
                }
                mergeChunks(arr, chunks)
                return arr
              }),
            )
            // Update total chunk count
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
    if (!pendingConversationChunks.has(conversationId)) {
      pendingConversationChunks.set(conversationId, {
        chunks: [],
        newChunkCount: 0,
      })
    }
    const pending = pendingConversationChunks.get(conversationId)!

    // Pre-merge in pending buffer to reduce array operations during flush
    const lastPending = pending.chunks[pending.chunks.length - 1]
    if (
      lastPending &&
      lastPending.type === chunk.type &&
      isMergeableChunkType(chunk.type) &&
      lastPending.messageId === chunk.messageId
    ) {
      // Merge into pending buffer - only append delta (incremental content)
      // Use the new chunk's content as the accumulated content (it's already accumulated)
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
    if (!pendingMessageChunks.has(conversationId)) {
      pendingMessageChunks.set(conversationId, new Map())
    }
    const messageMap = pendingMessageChunks.get(conversationId)!
    if (!messageMap.has(messageIndex)) {
      messageMap.set(messageIndex, { chunks: [], newChunkCount: 0 })
    }
    const pending = messageMap.get(messageIndex)!

    // Pre-merge in pending buffer
    const lastPending = pending.chunks[pending.chunks.length - 1]
    if (
      lastPending &&
      lastPending.type === chunk.type &&
      isMergeableChunkType(chunk.type) &&
      lastPending.messageId === chunk.messageId
    ) {
      // Merge into pending buffer - only append delta (incremental content)
      // Use the new chunk's content as the accumulated content (it's already accumulated)
      lastPending.content = chunk.content || lastPending.content
      lastPending.delta = chunk.delta
      lastPending.chunkCount += chunk.chunkCount
    } else {
      pending.chunks.push(chunk)
    }
    pending.newChunkCount += chunk.chunkCount
    scheduleBatchFlush()
  }

  // Optimized helper functions using path-based updates
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
        imageEvents: [],
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

    // Sum up usage from all previous assistant messages
    for (let i = 0; i < targetMessageIndex; i++) {
      const msg = conv.messages[i]
      if (msg?.role === 'assistant' && msg.usage) {
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

  // Public actions
  function clearAllConversations() {
    setState('conversations', {})
    setState('activeConversationId', null)
    streamToConversation.clear()
    requestToConversation.clear()
    pendingConversationChunks.clear()
    pendingMessageChunks.clear()
  }

  function selectConversation(id: string) {
    setState('activeConversationId', id)
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
        value as Conversation[keyof Conversation],
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
        value as Message[keyof Message],
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

    // ============= Client Events =============

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

    // ============= Message Events =============

    cleanupFns.push(
      aiEventClient.on('text:message:created', (e) => {
        const { clientId, streamId, messageId, role, content, timestamp } =
          e.payload
        const conversationId =
          clientId ||
          (streamId ? streamToConversation.get(streamId) : undefined)

        if (!conversationId) return
        if (role === 'tool' || role === 'system') return

        if (!state.conversations[conversationId]) {
          getOrCreateConversation(
            conversationId,
            clientId ? 'client' : 'server',
            clientId
              ? `Client Chat (${conversationId.substring(0, 8)})`
              : `Server Chat (${conversationId.substring(0, 8)})`,
          )
        }

        const conv = state.conversations[conversationId]
        if (!conv) return

        const existingIndex = conv.messages.findIndex(
          (message) => message.id === messageId,
        )

        const parts = e.payload.parts
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
            // Handle multimodal parts (image, audio, video, document)
            // These have a source property instead of content
            if (
              part.type === 'image' ||
              part.type === 'audio' ||
              part.type === 'video' ||
              // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
              part.type === 'document'
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
          .filter((part): part is MessagePart => part !== null)

        const toolCalls = e.payload.toolCalls?.map((toolCall) => ({
          id: toolCall.id,
          name: toolCall.function.name,
          arguments: toolCall.function.arguments,
          state: 'input-complete',
        }))

        const source = e.payload.source ?? (clientId ? 'client' : 'server')

        if (role === 'user' && conv.type === 'client' && source === 'server') {
          return
        }

        // Skip empty assistant messages from client - the real content comes from server
        if (
          role === 'assistant' &&
          source === 'client' &&
          !content &&
          (!toolCalls || toolCalls.length === 0)
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
        }

        if (existingIndex >= 0) {
          updateMessage(conversationId, existingIndex, messagePayload)
        } else {
          addMessage(conversationId, messagePayload)
        }

        updateConversation(conversationId, { status: 'active', hasChat: true })
      }),
    )

    cleanupFns.push(
      aiEventClient.on('text:message:user', (e) => {
        const { clientId, streamId, messageId, content, timestamp } = e.payload
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

        const source = e.payload.source ?? (clientId ? 'client' : 'server')

        if (conv.type === 'client' && source === 'server') {
          return
        }

        addMessage(conversationId, {
          id: messageId,
          role: 'user',
          content,
          timestamp,
          source,
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

    // ============= Tool Events =============

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
        const { clientId, toolCallId, approved } = e.payload

        if (!clientId) return
        if (!state.conversations[clientId]) return

        const conv = state.conversations[clientId]

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
            updateToolCall(clientId, messageIndex, toolCallIndex, {
              state: approved ? 'approved' : 'denied',
              approvalRequired: false,
            })
            return
          }
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

        const conv = state.conversations[conversationId]
        const messageIndex = conv.messages.findIndex(
          (m: Message) => m.id === messageId,
        )
        if (messageIndex === -1) return

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

    // ============= Stream Events =============

    cleanupFns.push(
      aiEventClient.on('text:chunk:content', (e) => {
        const streamId = e.payload.streamId
        const conversationId = streamToConversation.get(streamId)
        if (!conversationId) return

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
        const conversationId = streamToConversation.get(streamId)
        if (!conversationId) return

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
        const conversationId = streamToConversation.get(streamId)
        if (!conversationId) return

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
        const conversationId = streamToConversation.get(streamId)
        if (!conversationId) return

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

          if (e.payload.messageId) {
            const messageIndex = conv.messages.findIndex(
              (msg) => msg.id === e.payload.messageId,
            )
            if (messageIndex !== -1) {
              updateMessage(conversationId, messageIndex, {
                thinkingContent: e.payload.content,
              })
            }
          }
        } else {
          ensureMessageForChunk(
            conversationId,
            e.payload.messageId,
            e.payload.timestamp,
          )
          addChunk(conversationId, chunk)
        }
      }),
    )

    cleanupFns.push(
      aiEventClient.on('text:chunk:done', (e) => {
        const streamId = e.payload.streamId
        const conversationId = streamToConversation.get(streamId)
        if (!conversationId) return

        const chunk: Chunk = {
          id: `chunk-${Date.now()}-${Math.random()}`,
          type: 'done',
          messageId: e.payload.messageId,
          finishReason: e.payload.finishReason || undefined,
          timestamp: e.payload.timestamp,
          chunkCount: 1,
        }

        if (e.payload.usage) {
          updateConversation(conversationId, { usage: e.payload.usage })
          updateMessageUsage(
            conversationId,
            e.payload.messageId,
            e.payload.usage,
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

        updateConversation(conversationId, {
          status: 'completed',
          completedAt: e.payload.timestamp,
        })
      }),
    )

    cleanupFns.push(
      aiEventClient.on('text:chunk:error', (e) => {
        const streamId = e.payload.streamId
        const conversationId = streamToConversation.get(streamId)
        if (!conversationId) return

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
        } = e.payload

        const conversationId =
          clientId || streamToConversation.get(streamId) || ''
        if (!conversationId) return

        const conv = state.conversations[conversationId]
        if (!conv) return

        const chunk: Chunk = {
          id: `chunk-${Date.now()}-${Math.random()}`,
          type: 'approval',
          messageId: messageId,
          toolCallId,
          toolName,
          approvalId,
          input,
          timestamp,
          chunkCount: 1,
        }

        if (conv.type === 'client') {
          addChunkToMessage(conversationId, chunk)
        } else {
          addChunk(conversationId, chunk)
        }

        for (let i = conv.messages.length - 1; i >= 0; i--) {
          const message = conv.messages[i]
          if (!message) continue

          if (message.role === 'assistant' && message.toolCalls) {
            const toolCallIndex = message.toolCalls.findIndex(
              (t: ToolCall) => t.id === toolCallId,
            )
            if (toolCallIndex >= 0) {
              updateToolCall(conversationId, i, toolCallIndex, {
                approvalRequired: true,
                approvalId,
                state: 'approval-requested',
              })
              return
            }
          }
        }
      }),
    )

    // ============= Chat Events (for usage tracking) =============

    cleanupFns.push(
      aiEventClient.on('text:request:started', (e) => {
        const streamId = e.payload.streamId
        const model = e.payload.model
        const provider = e.payload.provider
        const clientId = e.payload.clientId

        if (clientId && state.conversations[clientId]) {
          streamToConversation.set(streamId, clientId)
          requestToConversation.set(e.payload.requestId, clientId)
          updateConversation(clientId, {
            status: 'active',
            ...e.payload,
            systemPrompts: e.payload.systemPrompts,
            hasChat: true,
          })
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
          }
        }
      }),
    )

    cleanupFns.push(
      aiEventClient.on('text:request:completed', (e) => {
        const { requestId, usage } = e.payload

        const conversationId = requestToConversation.get(requestId)
        if (conversationId && state.conversations[conversationId]) {
          const updates: Partial<Conversation> = {
            status: 'completed',
            completedAt: e.payload.timestamp,
          }
          if (usage) {
            updates.usage = usage
          }
          updateConversation(conversationId, updates)
          if (usage) {
            updateMessageUsage(conversationId, e.payload.messageId, usage)
          }
        }
      }),
    )

    cleanupFns.push(
      aiEventClient.on('text:usage', (e) => {
        const { requestId, usage, messageId } = e.payload

        const conversationId = requestToConversation.get(requestId)
        if (conversationId && state.conversations[conversationId]) {
          updateConversation(conversationId, { usage })
          updateMessageUsage(conversationId, messageId, usage)
        }
      }),
    )

    // ============= Summarize Events =============

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

    // ============= Image Events =============

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

    // ============= Speech Events =============

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

    // ============= Transcription Events =============

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

    // ============= Video Events =============

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
  }

  return (
    <AIContext.Provider value={contextValue}>
      {props.children}
    </AIContext.Provider>
  )
}
