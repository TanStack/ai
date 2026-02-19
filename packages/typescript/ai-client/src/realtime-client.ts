import type {
  AnyClientTool,
  AudioVisualization,
  RealtimeMessage,
  RealtimeMode,
  RealtimeStatus,
  RealtimeToken,
} from '@tanstack/ai'
import type {
  RealtimeClientOptions,
  RealtimeClientState,
  RealtimeConnection,
  RealtimeStateChangeCallback,
} from './realtime-types'

// Token refresh buffer - refresh 1 minute before expiry
const TOKEN_REFRESH_BUFFER_MS = 60_000

/**
 * Client for managing realtime voice conversations.
 *
 * Handles connection lifecycle, audio I/O, message state,
 * and tool execution for realtime voice-to-voice AI interactions.
 *
 * @example
 * ```typescript
 * import { RealtimeClient } from '@tanstack/ai-client'
 * import { openaiRealtime } from '@tanstack/ai-openai'
 *
 * const client = new RealtimeClient({
 *   getToken: () => fetch('/api/realtime-token').then(r => r.json()),
 *   adapter: openaiRealtime(),
 *   tools: [myTool.client(handler)],
 *   onMessage: (msg) => console.log('Message:', msg),
 * })
 *
 * await client.connect()
 * ```
 */
let clientIdCounter = 0

export class RealtimeClient {
  private instanceId: number
  private options: RealtimeClientOptions
  private connection: RealtimeConnection | null = null
  private token: RealtimeToken | null = null
  private tokenRefreshTimeout: ReturnType<typeof setTimeout> | null = null
  private clientTools: Map<string, AnyClientTool>
  private stateChangeCallbacks: Set<RealtimeStateChangeCallback> = new Set()
  private unsubscribers: Array<() => void> = []

  private state: RealtimeClientState = {
    status: 'idle',
    mode: 'idle',
    messages: [],
    pendingUserTranscript: null,
    pendingAssistantTranscript: null,
    error: null,
  }

  constructor(options: RealtimeClientOptions) {
    this.instanceId = ++clientIdCounter
    console.log(`[RealtimeClient #${this.instanceId}] Created`)

    this.options = {
      autoPlayback: true,
      autoCapture: true,
      vadMode: 'server',
      ...options,
    }

    // Build client tools map
    this.clientTools = new Map()
    if (options.tools) {
      for (const tool of options.tools) {
        this.clientTools.set(tool.name, tool)
      }
    }
  }

  // ============================================================================
  // Connection Lifecycle
  // ============================================================================

  /**
   * Connect to the realtime session.
   * Fetches a token and establishes the connection.
   */
  async connect(): Promise<void> {
    if (this.state.status === 'connected') {
      return
    }

    this.updateState({ status: 'connecting', error: null })

    try {
      // Fetch token from server
      this.token = await this.options.getToken()

      // Schedule token refresh
      this.scheduleTokenRefresh()

      // Connect via adapter
      this.connection = await this.options.adapter.connect(this.token)
      console.log(
        `[RealtimeClient #${this.instanceId}] Connection established:`,
        !!this.connection,
      )

      // Subscribe to connection events
      this.subscribeToConnectionEvents()

      // Start audio capture if configured
      if (this.options.autoCapture) {
        await this.connection.startAudioCapture()
      }

      this.updateState({ status: 'connected', mode: 'listening' })
      this.options.onConnect?.()
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      this.updateState({ status: 'error', error: err })
      this.options.onError?.(err)
      throw err
    }
  }

  /**
   * Disconnect from the realtime session.
   */
  async disconnect(): Promise<void> {
    if (this.tokenRefreshTimeout) {
      clearTimeout(this.tokenRefreshTimeout)
      this.tokenRefreshTimeout = null
    }

    // Unsubscribe from all events
    for (const unsub of this.unsubscribers) {
      unsub()
    }
    this.unsubscribers = []

    if (this.connection) {
      await this.connection.disconnect()
      this.connection = null
    }

    this.token = null
    this.updateState({
      status: 'idle',
      mode: 'idle',
      pendingUserTranscript: null,
      pendingAssistantTranscript: null,
    })
    this.options.onDisconnect?.()
  }

  // ============================================================================
  // Voice Control
  // ============================================================================

  /**
   * Start listening for voice input.
   * Only needed when vadMode is 'manual'.
   */
  startListening(): void {
    if (!this.connection || this.state.status !== 'connected') {
      return
    }
    this.connection.startAudioCapture()
    this.updateState({ mode: 'listening' })
  }

  /**
   * Stop listening for voice input.
   * Only needed when vadMode is 'manual'.
   */
  stopListening(): void {
    if (!this.connection) {
      return
    }
    this.connection.stopAudioCapture()
    this.updateState({ mode: 'idle' })
  }

  /**
   * Interrupt the current assistant response.
   */
  interrupt(): void {
    if (!this.connection) {
      return
    }
    this.connection.interrupt()
  }

  // ============================================================================
  // Text Input
  // ============================================================================

  /**
   * Send a text message instead of voice.
   */
  sendText(text: string): void {
    if (!this.connection || this.state.status !== 'connected') {
      return
    }

    // Add user message
    const userMessage: RealtimeMessage = {
      id: this.generateId(),
      role: 'user',
      timestamp: Date.now(),
      parts: [{ type: 'text', content: text }],
    }
    this.addMessage(userMessage)

    // Send to provider
    this.connection.sendText(text)
  }

  // ============================================================================
  // State Access
  // ============================================================================

  /** Get current connection status */
  get status(): RealtimeStatus {
    return this.state.status
  }

  /** Get current mode */
  get mode(): RealtimeMode {
    return this.state.mode
  }

  /** Get conversation messages */
  get messages(): Array<RealtimeMessage> {
    return this.state.messages
  }

  /** Get current error, if any */
  get error(): Error | null {
    return this.state.error
  }

  /** Get pending user transcript (while user is speaking) */
  get pendingUserTranscript(): string | null {
    return this.state.pendingUserTranscript
  }

  /** Get pending assistant transcript (while assistant is speaking) */
  get pendingAssistantTranscript(): string | null {
    return this.state.pendingAssistantTranscript
  }

  /** Get audio visualization data */
  get audio(): AudioVisualization | null {
    console.log(
      `[RealtimeClient #${this.instanceId}] audio getter, connection:`,
      !!this.connection,
    )
    return this.connection?.getAudioVisualization() ?? null
  }

  // ============================================================================
  // State Subscription
  // ============================================================================

  /**
   * Subscribe to state changes.
   * @returns Unsubscribe function
   */
  onStateChange(callback: RealtimeStateChangeCallback): () => void {
    this.stateChangeCallbacks.add(callback)
    return () => {
      this.stateChangeCallbacks.delete(callback)
    }
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  /**
   * Clean up resources.
   * Call this when disposing of the client.
   */
  destroy(): void {
    this.disconnect()
    this.stateChangeCallbacks.clear()
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private updateState(updates: Partial<RealtimeClientState>): void {
    this.state = { ...this.state, ...updates }

    // Notify callbacks
    for (const callback of this.stateChangeCallbacks) {
      callback(this.state)
    }

    // Notify specific callbacks
    if ('status' in updates && updates.status !== undefined) {
      this.options.onStatusChange?.(updates.status)
    }
    if ('mode' in updates && updates.mode !== undefined) {
      this.options.onModeChange?.(updates.mode)
    }
  }

  private addMessage(message: RealtimeMessage): void {
    this.updateState({
      messages: [...this.state.messages, message],
    })
    this.options.onMessage?.(message)
  }

  private scheduleTokenRefresh(): void {
    if (!this.token) return

    const timeUntilExpiry = this.token.expiresAt - Date.now()
    const refreshIn = Math.max(0, timeUntilExpiry - TOKEN_REFRESH_BUFFER_MS)

    this.tokenRefreshTimeout = setTimeout(() => {
      this.refreshToken()
    }, refreshIn)
  }

  private async refreshToken(): Promise<void> {
    try {
      this.token = await this.options.getToken()
      this.scheduleTokenRefresh()
      // Note: Some providers may require reconnection with new token
      // This is handled by the adapter implementation
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      this.updateState({ error: err })
      this.options.onError?.(err)
    }
  }

  private subscribeToConnectionEvents(): void {
    if (!this.connection) return

    // Status changes
    this.unsubscribers.push(
      this.connection.on('status_change', ({ status }) => {
        this.updateState({ status })
      }),
    )

    // Mode changes
    this.unsubscribers.push(
      this.connection.on('mode_change', ({ mode }) => {
        this.updateState({ mode })
      }),
    )

    // Transcripts (streaming)
    // User transcripts are added as messages when final (no separate message_complete for user input)
    // Assistant transcripts are streamed, final message comes via message_complete
    this.unsubscribers.push(
      this.connection.on('transcript', ({ role, transcript, isFinal }) => {
        if (role === 'user') {
          this.updateState({
            pendingUserTranscript: isFinal ? null : transcript,
          })
          // Add user message when transcript is finalized
          if (isFinal && transcript) {
            this.addMessage({
              id: this.generateId(),
              role: 'user',
              timestamp: Date.now(),
              parts: [{ type: 'audio', transcript, durationMs: 0 }],
            })
          }
        } else {
          // Assistant transcripts - just update pending, message_complete handles final
          this.updateState({
            pendingAssistantTranscript: isFinal ? null : transcript,
          })
        }
      }),
    )

    // Tool calls
    this.unsubscribers.push(
      this.connection.on(
        'tool_call',
        async ({ toolCallId, toolName, input }) => {
          const tool = this.clientTools.get(toolName)
          if (tool?.execute) {
            try {
              const output = await tool.execute(input)
              this.connection?.sendToolResult(
                toolCallId,
                typeof output === 'string' ? output : JSON.stringify(output),
              )
            } catch (error) {
              const errMsg =
                error instanceof Error ? error.message : String(error)
              this.connection?.sendToolResult(
                toolCallId,
                JSON.stringify({ error: errMsg }),
              )
            }
          }
        },
      ),
    )

    // Message complete
    this.unsubscribers.push(
      this.connection.on('message_complete', ({ message }) => {
        // Replace pending message with final version if needed
        const existingIndex = this.state.messages.findIndex(
          (m) => m.id === message.id,
        )
        if (existingIndex >= 0) {
          const newMessages = [...this.state.messages]
          newMessages[existingIndex] = message
          this.updateState({ messages: newMessages })
        } else {
          this.addMessage(message)
        }
      }),
    )

    // Interruption
    this.unsubscribers.push(
      this.connection.on('interrupted', ({ messageId }) => {
        if (messageId) {
          const newMessages = this.state.messages.map((m) =>
            m.id === messageId ? { ...m, interrupted: true } : m,
          )
          this.updateState({ messages: newMessages })
        }
        this.updateState({
          mode: 'listening',
          pendingAssistantTranscript: null,
        })
        this.options.onInterrupted?.()
      }),
    )

    // Errors
    this.unsubscribers.push(
      this.connection.on('error', ({ error }) => {
        this.updateState({ error })
        this.options.onError?.(error)
      }),
    )
  }

  private generateId(): string {
    return `msg-${Date.now()}-${Math.random().toString(36).substring(7)}`
  }
}
