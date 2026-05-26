import {
  aiEventClient,
  createAIDevtoolsEventEnvelope,
  emitAIDevtoolsEvent,
} from '@tanstack/ai-event-client'
import { convertSchemaToJsonSchema } from '@tanstack/ai'
import { DefaultChatClientEventEmitter } from './events'
import type { AnyClientTool, StreamChunk } from '@tanstack/ai'
import type { AIDevtoolsEventVisibility } from '@tanstack/ai-event-client'
import type {
  ChatClientEventContext,
  ChatClientEventEmitter,
  ChatClientRunEventContext,
} from './events'
import type {
  ChatClientState,
  ConnectionStatus,
  MessagePart,
  ToolCallPart,
  UIMessage,
} from './types'

export interface AIDevtoolsDisplayOptions {
  name?: string
}

export interface AIDevtoolsClientMetadata extends AIDevtoolsDisplayOptions {
  framework?: string
  hookName: string
  outputKind?: 'chat' | 'text' | 'structured' | 'image' | 'video' | 'audio'
}

export interface AIDevtoolsGenerationProgress {
  value: number
  message?: string
}

export interface AIDevtoolsGenerationMediaItem {
  src: string
  sourceType: 'url' | 'base64'
  mimeType?: string
  format?: string
  duration?: number
}

export interface AIDevtoolsGenerationVideoJob {
  jobId: string
  status?: string
  progress?: number
  error?: string
}

export type AIDevtoolsGenerationPreview =
  | {
      kind: 'image'
      items: Array<AIDevtoolsGenerationMediaItem>
    }
  | {
      kind: 'audio'
      items: Array<AIDevtoolsGenerationMediaItem>
    }
  | {
      kind: 'video'
      items: Array<AIDevtoolsGenerationMediaItem>
      job?: AIDevtoolsGenerationVideoJob
    }
  | {
      kind: 'text'
      text: string
    }
  | {
      kind: 'structured'
      value: unknown
    }
  | {
      kind: 'empty'
    }

export interface AIDevtoolsGenerationRunSnapshot<
  TOutput = unknown,
> extends Record<string, unknown> {
  id: string
  input: unknown | null
  result: TOutput | null
  preview: AIDevtoolsGenerationPreview
  progress: AIDevtoolsGenerationProgress | null
  status: string
  isLoading: boolean
  startedAt: number
  updatedAt: number
  completedAt?: number
  error?: string
  jobId?: string | null
  videoStatus?: unknown | null
}

export interface AIDevtoolsGenerationPreviewInput {
  outputKind?: AIDevtoolsClientMetadata['outputKind']
  result: unknown
  videoStatus?: unknown
}

export interface AIDevtoolsChatSnapshot {
  [key: string]: unknown
  messages: Array<UIMessage>
  status: ChatClientState
  isLoading: boolean
  isSubscribed: boolean
  connectionStatus: ConnectionStatus
  sessionGenerating: boolean
  activeRunIds: Array<string>
  error?: string
}

export function createAIDevtoolsGenerationPreview(
  input: AIDevtoolsGenerationPreviewInput,
): AIDevtoolsGenerationPreview {
  if (input.outputKind === 'image') {
    return imagePreviewFromResult(input.result)
  }

  if (input.outputKind === 'audio') {
    return audioPreviewFromResult(input.result)
  }

  if (input.outputKind === 'video') {
    return videoPreviewFromResult(input.result, input.videoStatus)
  }

  if (input.outputKind === 'text') {
    return textPreviewFromResult(input.result)
  }

  if (input.result === null || input.result === undefined) {
    return { kind: 'empty' }
  }

  return {
    kind: 'structured',
    value: input.result,
  }
}

type UnknownRecord = { [key: string]: unknown }

function imagePreviewFromResult(result: unknown): AIDevtoolsGenerationPreview {
  const record = asRecord(result)
  const images = Array.isArray(record?.images) ? record.images : []
  const items = images
    .map((image) => mediaItemFromSource(image, 'image/png'))
    .filter(isGenerationMediaItem)

  if (items.length === 0 && result !== null && result !== undefined) {
    const directItem = mediaItemFromSource(result, 'image/png')
    if (directItem) {
      items.push(directItem)
    }
  }

  return { kind: 'image', items }
}

function audioPreviewFromResult(result: unknown): AIDevtoolsGenerationPreview {
  const record = asRecord(result)
  const audio = record?.audio
  const resultContentType = stringField(record, 'contentType')
  const format = stringField(record, 'format')
  const mimeType = resultContentType ?? mimeTypeFromAudioFormat(format)

  const items: Array<AIDevtoolsGenerationMediaItem> = []
  const directItem =
    typeof audio === 'string'
      ? base64MediaItem(audio, mimeType, {
          format,
          duration: numberField(record, 'duration'),
        })
      : mediaItemFromSource(audio, mimeType, {
          format,
        })

  if (directItem) {
    items.push(directItem)
  }

  return { kind: 'audio', items }
}

function videoPreviewFromResult(
  result: unknown,
  videoStatus: unknown,
): AIDevtoolsGenerationPreview {
  const resultRecord = asRecord(result)
  const statusRecord = asRecord(videoStatus)
  const item =
    mediaItemFromSource(result, 'video/mp4') ??
    mediaItemFromSource(videoStatus, 'video/mp4')
  const items = item ? [item] : []
  const job = videoJobFromStatus(statusRecord ?? resultRecord)

  return {
    kind: 'video',
    items,
    ...(job ? { job } : {}),
  }
}

function textPreviewFromResult(result: unknown): AIDevtoolsGenerationPreview {
  const record = asRecord(result)
  const text =
    stringField(record, 'text') ??
    stringField(record, 'summary') ??
    stringField(record, 'content') ??
    (typeof result === 'string' ? result : undefined)

  if (text !== undefined) {
    return { kind: 'text', text }
  }

  if (result === null || result === undefined) {
    return { kind: 'empty' }
  }

  return {
    kind: 'structured',
    value: result,
  }
}

function videoJobFromStatus(
  record: UnknownRecord | undefined,
): AIDevtoolsGenerationVideoJob | undefined {
  const jobId = stringField(record, 'jobId')
  if (!jobId) return undefined

  return {
    jobId,
    ...(stringField(record, 'status')
      ? { status: stringField(record, 'status') }
      : {}),
    ...(numberField(record, 'progress') !== undefined
      ? { progress: numberField(record, 'progress') }
      : {}),
    ...(stringField(record, 'error')
      ? { error: stringField(record, 'error') }
      : {}),
  }
}

function mediaItemFromSource(
  value: unknown,
  defaultMimeType: string,
  extras: {
    format?: string
    duration?: number
  } = {},
): AIDevtoolsGenerationMediaItem | undefined {
  const record = asRecord(value)
  if (!record) return undefined

  const explicitContentType =
    stringField(record, 'contentType') ?? stringField(record, 'mimeType')
  const duration = numberField(record, 'duration') ?? extras.duration
  const format = stringField(record, 'format') ?? extras.format
  const url = stringField(record, 'url')
  if (url) {
    return {
      src: url,
      sourceType: 'url',
      ...(explicitContentType ? { mimeType: explicitContentType } : {}),
      ...(format ? { format } : {}),
      ...(duration !== undefined ? { duration } : {}),
    }
  }

  const b64Json = stringField(record, 'b64Json')
  if (!b64Json) return undefined

  return base64MediaItem(b64Json, explicitContentType ?? defaultMimeType, {
    format,
    duration,
  })
}

function base64MediaItem(
  value: string,
  mimeType: string | undefined,
  extras: {
    format?: string
    duration?: number
  } = {},
): AIDevtoolsGenerationMediaItem {
  const src = value.startsWith('data:')
    ? value
    : `data:${mimeType ?? 'application/octet-stream'};base64,${value}`

  return {
    src,
    sourceType: 'base64',
    ...(mimeType ? { mimeType } : {}),
    ...(extras.format ? { format: extras.format } : {}),
    ...(extras.duration !== undefined ? { duration: extras.duration } : {}),
  }
}

function mimeTypeFromAudioFormat(format: string | undefined): string {
  if (!format) return 'audio/mpeg'
  if (format === 'mp3') return 'audio/mpeg'
  return `audio/${format}`
}

function asRecord(value: unknown): UnknownRecord | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return undefined
  }
  return value as UnknownRecord
}

function stringField(
  record: UnknownRecord | undefined,
  field: string,
): string | undefined {
  const value = record?.[field]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function numberField(
  record: UnknownRecord | undefined,
  field: string,
): number | undefined {
  const value = record?.[field]
  return typeof value === 'number' ? value : undefined
}

function isGenerationMediaItem(
  value: AIDevtoolsGenerationMediaItem | undefined,
): value is AIDevtoolsGenerationMediaItem {
  return Boolean(value)
}

export interface AIDevtoolsToolFixture {
  fixtureId?: string
  hookId?: string
  threadId?: string
  runId?: string
  toolName: string
  input: unknown
  output: unknown
  execute?: boolean
  message?: {
    id: string
    role: UIMessage['role']
    parts: Array<unknown>
    createdAt?: number | string
  }
  toolCallId?: string
  messageId?: string
  errorText?: string
}

type AIDevtoolsRunEventType =
  | 'run:created'
  | 'run:started'
  | 'run:updated'
  | 'run:completed'
  | 'run:errored'
  | 'run:cancelled'

type AIDevtoolsRunStatus =
  | 'created'
  | 'started'
  | 'updated'
  | 'completed'
  | 'errored'
  | 'cancelled'

export interface AIDevtoolsBridgeOptions<
  TSnapshot extends Record<string, unknown>,
> {
  hookId: string
  threadId?: string
  clientId: string
  metadata: AIDevtoolsClientMetadata
  getSnapshot: () => TSnapshot
  getTools?: () => Iterable<AnyClientTool>
  applyToolFixture?: (fixture: AIDevtoolsToolFixture) => void | Promise<void>
}

type Unsubscribe = () => void

interface AIDevtoolsEvent<TPayload> {
  payload: TPayload
}

interface ActiveDevtoolsBridge {
  deactivate: () => void
  dispose: () => void
  supersede?: () => void
}

const activeBridgeRegistryKey = Symbol.for(
  'tanstack.ai.devtools.activeBridgeByHookId',
)

function getActiveBridgeRegistry(): Map<string, ActiveDevtoolsBridge> {
  const global = globalThis as typeof globalThis & {
    [activeBridgeRegistryKey]?: Map<string, ActiveDevtoolsBridge>
  }
  const existing = global[activeBridgeRegistryKey]
  if (existing) return existing

  const registry = new Map<string, ActiveDevtoolsBridge>()
  global[activeBridgeRegistryKey] = registry
  return registry
}

export class ClientDevtoolsBridge<TSnapshot extends Record<string, unknown>> {
  protected readonly options: AIDevtoolsBridgeOptions<TSnapshot>
  private readonly bridgeId: string
  private readonly unsubscribers: Array<Unsubscribe> = []
  private disposed = false
  private superseded = false
  private registered = false

  constructor(options: AIDevtoolsBridgeOptions<TSnapshot>) {
    this.options = options
    this.bridgeId = createBridgeId(options.hookId)
  }

  emitRegistered(): void {
    if (!this.prepareForMountEmit()) {
      return
    }
    this.registered = true
    emitAIDevtoolsEvent('hook:registered', {
      ...this.createEnvelope('hook:registered'),
      ...this.createMetadataPayload(),
      lifecycle: 'mounted',
    })
  }

  emitUpdated(): void {
    if (!this.prepareForEmit()) {
      return
    }
    emitAIDevtoolsEvent('hook:updated', {
      ...this.createEnvelope('hook:updated'),
      ...this.createMetadataPayload(),
      lifecycle: 'active',
    })
  }

  emitSnapshot(): void {
    if (!this.prepareForEmit()) {
      return
    }
    emitAIDevtoolsEvent('hook:state-snapshot', {
      ...this.createEnvelope('hook:state-snapshot'),
      ...this.createMetadataPayload(),
      state: this.options.getSnapshot(),
    })
  }

  emitToolsRegistered(): void {
    if (!this.prepareForEmit()) {
      return
    }
    const tools = this.options.getTools
      ? Array.from(this.options.getTools()).map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema
            ? convertSchemaToJsonSchema(tool.inputSchema)
            : { type: 'object' },
          outputSchema: tool.outputSchema
            ? convertSchemaToJsonSchema(tool.outputSchema)
            : undefined,
          needsApproval: tool.needsApproval,
          metadata: tool.metadata,
        }))
      : []

    emitAIDevtoolsEvent('tools:registered', {
      ...this.createEnvelope('tools:registered'),
      ...this.createMetadataPayload(),
      tools,
    })
  }

  emitRunLifecycle(
    eventType: AIDevtoolsRunEventType,
    runId: string,
    status: AIDevtoolsRunStatus,
    options: { error?: string } = {},
  ): void {
    if (!this.prepareForEmit()) {
      return
    }
    emitAIDevtoolsEvent(eventType, {
      ...this.createEnvelope(eventType, 'client-state', { runId }),
      runId,
      status,
      ...(options.error ? { error: options.error } : {}),
    })
  }

  deactivate(): void {
    const activeBridgeByHookId = getActiveBridgeRegistry()
    if (activeBridgeByHookId.get(this.options.hookId) === this) {
      activeBridgeByHookId.delete(this.options.hookId)
    }

    for (const unsubscribe of this.unsubscribers.splice(0)) {
      unsubscribe()
    }
  }

  supersede(): void {
    if (this.disposed) {
      return
    }

    this.superseded = true
    this.disposed = true
    this.deactivate()
  }

  dispose(): void {
    if (this.disposed) {
      return
    }

    this.disposed = true
    if (!this.registered) {
      this.deactivate()
      return
    }

    const payload = {
      ...this.createEnvelope('hook:unregistered'),
      ...this.createMetadataPayload(),
      reason: 'disposed',
    } as const

    emitAIDevtoolsEvent('hook:unregistered', payload)

    this.deactivate()
  }

  private prepareForEmit(): boolean {
    if (this.disposed || this.superseded) {
      return false
    }
    this.activate()
    return true
  }

  private prepareForMountEmit(): boolean {
    if (this.superseded) {
      return false
    }

    if (this.disposed) {
      this.disposed = false
      this.registered = false
    }

    this.activate()
    return true
  }

  private activate(): void {
    if (this.disposed) {
      return
    }

    const activeBridgeByHookId = getActiveBridgeRegistry()
    const activeBridge = activeBridgeByHookId.get(this.options.hookId)
    if (activeBridge && activeBridge !== this) {
      if (typeof activeBridge.supersede === 'function') {
        activeBridge.supersede()
      } else {
        activeBridge.deactivate()
      }
    }
    activeBridgeByHookId.set(this.options.hookId, this)

    if (this.unsubscribers.length > 0) {
      return
    }

    this.unsubscribers.push(
      aiEventClient.on('devtools:request-state', (event) => {
        this.handleRequestState(event)
      }),
    )

    if (this.options.applyToolFixture) {
      this.unsubscribers.push(
        aiEventClient.on('devtools:tool-fixture:apply', (event) => {
          void this.handleToolFixtureApply(event)
        }),
      )
    }
  }

  private handleRequestState(
    event: AIDevtoolsEvent<{ targetHookId?: string }>,
  ): void {
    if (this.disposed || this.superseded) {
      return
    }

    const targetHookId = event.payload.targetHookId
    if (targetHookId && targetHookId !== this.options.hookId) {
      return
    }

    this.emitRegistered()
    this.emitToolsRegistered()
    this.emitSnapshot()
  }

  private async handleToolFixtureApply(
    event: AIDevtoolsEvent<AIDevtoolsToolFixture>,
  ): Promise<void> {
    const fixture = event.payload
    if (!this.matchesFixtureTarget(fixture)) {
      return
    }

    await this.options.applyToolFixture?.(fixture)
  }

  private matchesFixtureTarget(fixture: AIDevtoolsToolFixture): boolean {
    if (!fixture.hookId && !fixture.threadId) {
      return false
    }

    if (fixture.hookId) {
      return fixture.hookId === this.options.hookId
    }

    if (
      fixture.threadId &&
      (!this.options.threadId || fixture.threadId !== this.options.threadId)
    ) {
      return false
    }
    return true
  }

  private createEnvelope(
    eventType:
      | 'hook:registered'
      | 'hook:updated'
      | 'hook:unregistered'
      | 'hook:state-snapshot'
      | 'tools:registered'
      | AIDevtoolsRunEventType,
    visibility: AIDevtoolsEventVisibility = 'client-state',
    context: { runId?: string } = {},
  ) {
    return createAIDevtoolsEventEnvelope({
      eventType,
      source: 'client',
      visibility,
      clientId: this.options.clientId,
      hookId: this.options.hookId,
      correlationId: this.bridgeId,
      ...(this.options.threadId ? { threadId: this.options.threadId } : {}),
      ...(context.runId ? { runId: context.runId } : {}),
      timestamp: Date.now(),
    })
  }

  private createMetadataPayload() {
    return {
      hookId: this.options.hookId,
      hookName: this.options.metadata.hookName,
      ...(this.options.metadata.name
        ? { displayName: this.options.metadata.name }
        : {}),
      ...(this.options.metadata.outputKind
        ? { outputKind: this.options.metadata.outputKind }
        : {}),
      ...(this.options.metadata.framework
        ? { framework: this.options.metadata.framework }
        : {}),
    }
  }
}

let bridgeIdSequence = 0

function createBridgeId(hookId: string): string {
  const cryptoLike = (
    globalThis as {
      crypto?: {
        randomUUID?: () => string
      }
    }
  ).crypto

  if (cryptoLike?.randomUUID) {
    return `bridge:${hookId}:${cryptoLike.randomUUID()}`
  }

  bridgeIdSequence += 1
  return `bridge:${hookId}:${bridgeIdSequence}`
}

// ===========================================================================
// ChatDevtoolsBridge
// ---------------------------------------------------------------------------
// Owns the chat-client side of the devtools contract so the client itself
// stays a pure transport. Everything devtools-only — fixture replay,
// per-run / per-stream event context, snapshot emission — lives here so a
// production no-op bridge can replace it without affecting chat behavior.
// ===========================================================================

export interface ChatDevtoolsBridgeOptions extends AIDevtoolsBridgeOptions<AIDevtoolsChatSnapshot> {
  getMessages: () => Array<UIMessage>
  setMessages: (messages: Array<UIMessage>) => void
  addToolResult: (
    toolCallId: string,
    output: unknown,
    errorText?: string,
  ) => void
  generateId: (prefix: string) => string
}

export class ChatDevtoolsBridge extends ClientDevtoolsBridge<AIDevtoolsChatSnapshot> {
  /**
   * Public event emitter consumed by the chat client. Owned here so that
   * a no-op bridge in production swaps the emitter out wholesale and no
   * client-side event work happens.
   */
  readonly events: ChatClientEventEmitter
  private readonly chatOptions: ChatDevtoolsBridgeOptions
  private currentRunId: string | null = null
  private currentRunThreadId: string | null = null
  private currentStreamId: string | null = null
  private lastStreamId: string | null = null
  private lastRunEventContext: ChatClientRunEventContext | undefined

  constructor(options: ChatDevtoolsBridgeOptions) {
    super({
      ...options,
      // Route the base bridge's fixture subscription back through this
      // subclass. We can't reference `this.applyFixture` directly in the
      // super call, so use a thunk that defers the lookup.
      applyToolFixture: (fixture) => this.applyFixture(fixture),
    })
    this.chatOptions = options
    // Replace the plain emitter with one that auto-attaches the current
    // run/thread context and auto-emits a snapshot after every event so
    // the chat client only ever calls `this.events.X(...)` exactly as it
    // did before the devtools work landed — no context arg, no manual
    // `emitSnapshot()` calls.
    this.events = new ChatDevtoolsAwareEventEmitter(options.clientId, this)
  }

  // --- Stream / run context API -------------------------------------------

  setCurrentStreamId(streamId: string | null): void {
    this.currentStreamId = streamId
    if (streamId) {
      this.lastStreamId = streamId
    }
  }

  /**
   * Called by the auto-attaching emitter every time it sees a non-empty
   * streamId pass through. Lets devtools track the latest stream id
   * without the chat client wiring it up explicitly.
   */
  recordStreamId(streamId: string): void {
    if (streamId) this.lastStreamId = streamId
  }

  /**
   * One-call helper for the chat client's `mountDevtools()`: registers
   * the hook, publishes the initial tool list, and emits the first
   * snapshot. Wraps three lower-level emits so the client doesn't need
   * to know the order.
   */
  mountWithTools(initialMessageCount: number): void {
    this.events.clientCreated(initialMessageCount)
    this.emitRegistered()
    this.emitToolsRegistered()
    this.emitSnapshot()
  }

  /** Re-publish the tool list (e.g. after `updateOptions({ tools })`). */
  notifyToolsChanged(): void {
    this.emitToolsRegistered()
    this.emitSnapshot()
  }

  getCurrentStreamId(): string | null {
    return this.currentStreamId
  }

  getLastStreamId(): string | null {
    return this.lastStreamId
  }

  /** Resolve a usable stream id without mutating tracking state. */
  resolveStreamId(): string {
    return (
      this.currentStreamId ??
      this.lastStreamId ??
      this.chatOptions.generateId('stream')
    )
  }

  /**
   * Mark a run as starting before any chunks arrive. The chat client
   * calls this when it has just generated a runId for outbound emit
   * events; the matching `RUN_STARTED` chunk from the adapter will land
   * later and `observeChunk` keeps the same context.
   */
  beginRun(runId: string, threadId: string): void {
    this.currentRunId = runId
    this.currentRunThreadId = threadId
    this.lastRunEventContext = { runId, threadId }
  }

  /**
   * Update run-context tracking based on a streaming chunk. Called from
   * the chat client's subscription loop so the bridge knows which run is
   * currently active without the chat client owning any of this state.
   */
  observeChunk(chunk: StreamChunk): void {
    if (chunk.type === 'RUN_STARTED') {
      this.beginRun(chunk.runId, chunk.threadId)
      return
    }

    if (chunk.type === 'RUN_FINISHED' || chunk.type === 'RUN_ERROR') {
      const runId =
        chunk.type === 'RUN_FINISHED'
          ? chunk.runId
          : (chunk as { runId?: string }).runId
      if (!runId || runId === this.currentRunId) {
        const context = this.getCurrentRunEventContext()
        if (context) {
          this.lastRunEventContext = context
        }
        this.currentRunId = null
        this.currentRunThreadId = null
      }
    }
  }

  getCurrentRunEventContext(): ChatClientRunEventContext | undefined {
    if (!this.currentRunId) return undefined
    return {
      threadId: this.currentRunThreadId ?? this.chatOptions.threadId ?? '',
      runId: this.currentRunId,
    }
  }

  getCurrentOrLastRunEventContext(): ChatClientRunEventContext | undefined {
    return this.getCurrentRunEventContext() ?? this.lastRunEventContext
  }

  findToolCallContext(toolCallId: string): ChatClientEventContext {
    const base: ChatClientEventContext = { toolCallId }
    const runContext = this.getCurrentRunEventContext()
    if (runContext) {
      return {
        threadId: runContext.threadId,
        runId: runContext.runId,
        toolCallId,
      }
    }
    if (this.chatOptions.threadId) {
      return { threadId: this.chatOptions.threadId, toolCallId }
    }
    return base
  }

  // --- Fixture replay ------------------------------------------------------

  /**
   * Entry point invoked when the devtools panel emits
   * `devtools:tool-fixture:apply`. The chat client never calls this
   * directly; it is wired through the base bridge's fixture subscription.
   */
  async applyFixture(fixture: AIDevtoolsToolFixture): Promise<void> {
    const messages = this.chatOptions.getMessages()
    const threadId = fixture.threadId ?? this.chatOptions.threadId ?? ''
    if (fixture.execute) {
      await this.executeFixture(fixture, messages, threadId)
      return
    }

    const replay = this.createReplayMessageFromFixture(fixture, messages)
    const { message, toolCallId } = replay
    const messageId = message.id

    this.events.messageAppended(message, undefined, {
      threadId,
      toolCallId,
      ...(fixture.runId ? { runId: fixture.runId } : {}),
    })
    this.chatOptions.setMessages([...messages, message])
    this.events.toolFixtureApplied({
      hookId: this.chatOptions.hookId,
      threadId,
      ...(fixture.runId ? { runId: fixture.runId } : {}),
      toolName: fixture.toolName,
      input: fixture.input,
      output: fixture.output,
      messageId,
      toolCallId,
      ...(fixture.execute !== undefined ? { execute: fixture.execute } : {}),
      ...(fixture.message ? { message: fixture.message } : {}),
      ...(fixture.errorText ? { errorText: fixture.errorText } : {}),
    })
    this.emitSnapshot()
  }

  private async executeFixture(
    fixture: AIDevtoolsToolFixture,
    messages: Array<UIMessage>,
    threadId: string,
  ): Promise<void> {
    const toolCallId = this.resolveFixtureToolCallId(
      fixture.toolCallId,
      messages,
    )
    const messageId = this.resolveFixtureMessageId(fixture.messageId, messages)
    const message: UIMessage = {
      id: messageId,
      role: 'assistant',
      parts: [
        {
          type: 'tool-call',
          id: toolCallId,
          name: fixture.toolName,
          arguments: stringifyFixtureValue(fixture.input),
          input: fixture.input,
          state: 'input-complete',
        },
      ],
      createdAt: new Date(),
    }

    this.events.messageAppended(message, undefined, {
      threadId,
      toolCallId,
      ...(fixture.runId ? { runId: fixture.runId } : {}),
    })
    this.chatOptions.setMessages([...messages, message])
    this.emitSnapshot()

    const clientTool = this.findClientTool(fixture.toolName)
    const executeFunc = clientTool?.execute
    if (!executeFunc) {
      this.addToolResultForFixture({
        fixture,
        messageId,
        toolCallId,
        threadId,
        output: fixture.output,
        errorText: fixture.errorText,
      })
      return
    }

    try {
      const output = await executeFunc(fixture.input)
      this.addToolResultForFixture({
        fixture,
        messageId,
        toolCallId,
        threadId,
        output,
      })
    } catch (error) {
      this.addToolResultForFixture({
        fixture,
        messageId,
        toolCallId,
        threadId,
        output: null,
        errorText:
          error instanceof Error ? error.message : 'Tool execution failed.',
      })
    }
  }

  private addToolResultForFixture(input: {
    fixture: AIDevtoolsToolFixture
    messageId: string
    toolCallId: string
    threadId: string
    output: unknown
    errorText?: string
  }): void {
    const state = input.errorText ? 'output-error' : 'output-available'
    this.events.toolResultAdded(
      input.toolCallId,
      input.fixture.toolName,
      input.output,
      state,
      {
        threadId: input.threadId,
        ...(input.fixture.runId ? { runId: input.fixture.runId } : {}),
        toolCallId: input.toolCallId,
      },
    )
    this.chatOptions.addToolResult(
      input.toolCallId,
      input.output,
      input.errorText,
    )
    this.events.toolFixtureApplied({
      hookId: this.chatOptions.hookId,
      threadId: input.threadId,
      ...(input.fixture.runId ? { runId: input.fixture.runId } : {}),
      toolName: input.fixture.toolName,
      input: input.fixture.input,
      output: input.output,
      execute: true,
      messageId: input.messageId,
      toolCallId: input.toolCallId,
      ...(input.errorText ? { errorText: input.errorText } : {}),
    })
    this.emitSnapshot()
  }

  private createReplayMessageFromFixture(
    fixture: AIDevtoolsToolFixture,
    messages: Array<UIMessage>,
  ): { message: UIMessage; toolCallId: string } {
    const cloned = this.cloneFixtureSourceMessage(fixture, messages)
    if (cloned) return cloned

    const toolCallId = this.resolveFixtureToolCallId(
      fixture.toolCallId,
      messages,
    )
    const messageId = this.resolveFixtureMessageId(fixture.messageId, messages)
    const state = fixture.errorText ? 'error' : 'complete'

    return {
      toolCallId,
      message: {
        id: messageId,
        role: 'assistant',
        parts: [
          {
            type: 'tool-call',
            id: toolCallId,
            name: fixture.toolName,
            arguments: stringifyFixtureValue(fixture.input),
            input: fixture.input,
            state: 'input-complete',
            output: fixture.output,
          },
          {
            type: 'tool-result',
            toolCallId,
            content: stringifyFixtureValue(fixture.output),
            state,
            ...(fixture.errorText ? { error: fixture.errorText } : {}),
          },
        ],
        createdAt: new Date(),
      },
    }
  }

  private cloneFixtureSourceMessage(
    fixture: AIDevtoolsToolFixture,
    messages: Array<UIMessage>,
  ): { message: UIMessage; toolCallId: string } | undefined {
    const sourceMessage = fixture.message
    if (!sourceMessage || !Array.isArray(sourceMessage.parts)) {
      return undefined
    }

    const toolCallIds = this.createFixtureToolCallIdMap(
      sourceMessage.parts,
      messages,
    )
    const parts = sourceMessage.parts
      .map((part) => cloneFixtureMessagePart(part, toolCallIds))
      .filter((part): part is MessagePart => Boolean(part))
    const mappedFixtureToolCallId = fixture.toolCallId
      ? toolCallIds.get(fixture.toolCallId)
      : undefined
    hydrateToolCallOutputs(parts, {
      ...(mappedFixtureToolCallId
        ? { mappedToolCallId: mappedFixtureToolCallId }
        : {}),
      output: fixture.output,
    })

    if (parts.length === 0) return undefined

    const toolCallId =
      (fixture.toolCallId ? toolCallIds.get(fixture.toolCallId) : undefined) ??
      firstToolCallId(parts)
    if (!toolCallId) return undefined

    return {
      toolCallId,
      message: {
        id: this.resolveFixtureMessageId(sourceMessage.id, messages),
        role: sourceMessage.role,
        parts,
        createdAt: new Date(),
      },
    }
  }

  private createFixtureToolCallIdMap(
    parts: Array<unknown>,
    messages: Array<UIMessage>,
  ): Map<string, string> {
    const ids = new Map<string, string>()
    for (const part of parts) {
      if (!isRecord(part) || part.type !== 'tool-call') continue
      if (typeof part.id !== 'string') continue
      ids.set(part.id, this.resolveFixtureToolCallId(part.id, messages))
    }
    return ids
  }

  private resolveFixtureMessageId(
    messageId: string | undefined,
    messages: Array<UIMessage>,
  ): string {
    if (messageId && !messages.some((message) => message.id === messageId)) {
      return messageId
    }
    return this.chatOptions.generateId('fixture-msg')
  }

  private resolveFixtureToolCallId(
    toolCallId: string | undefined,
    messages: Array<UIMessage>,
  ): string {
    if (toolCallId && !hasToolCallId(messages, toolCallId)) {
      return toolCallId
    }
    return this.chatOptions.generateId('fixture-tool-call')
  }

  private findClientTool(name: string): AnyClientTool | undefined {
    const tools = this.chatOptions.getTools?.()
    if (!tools) return undefined
    for (const tool of tools) {
      if (tool.name === name) return tool
    }
    return undefined
  }
}

// ---- Module-level fixture helpers (pure; share no state) -------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function stringifyFixtureValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (
    value === undefined ||
    typeof value === 'function' ||
    typeof value === 'symbol'
  ) {
    return String(value)
  }
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function parseFixtureResultContent(content: string): unknown {
  try {
    return JSON.parse(content)
  } catch {
    return content
  }
}

function cloneFixtureMessagePart(
  part: unknown,
  toolCallIds: Map<string, string>,
): MessagePart | undefined {
  if (!isRecord(part) || typeof part.type !== 'string') return undefined
  const cloned: Record<string, unknown> = { ...part }

  if (part.type === 'tool-call' && typeof part.id === 'string') {
    cloned.id = toolCallIds.get(part.id) ?? part.id
  }
  if (part.type === 'tool-result' && typeof part.toolCallId === 'string') {
    cloned.toolCallId = toolCallIds.get(part.toolCallId) ?? part.toolCallId
  }
  return cloned as MessagePart
}

function firstToolCallId(parts: Array<MessagePart>): string | undefined {
  const toolCall = parts.find((part) => part.type === 'tool-call')
  return toolCall?.type === 'tool-call' ? toolCall.id : undefined
}

function hydrateToolCallOutputs(
  parts: Array<MessagePart>,
  fixtureOutput: { mappedToolCallId?: string; output: unknown },
): void {
  for (const part of parts) {
    if (part.type !== 'tool-result') continue
    const toolCall = parts.find(
      (candidate): candidate is ToolCallPart =>
        candidate.type === 'tool-call' &&
        candidate.id === part.toolCallId &&
        candidate.output === undefined,
    )
    if (toolCall) {
      toolCall.output = parseFixtureResultContent(part.content)
    }
  }

  if (fixtureOutput.mappedToolCallId && fixtureOutput.output !== undefined) {
    const toolCall = parts.find(
      (candidate): candidate is ToolCallPart =>
        candidate.type === 'tool-call' &&
        candidate.id === fixtureOutput.mappedToolCallId &&
        candidate.output === undefined,
    )
    if (toolCall) {
      toolCall.output = fixtureOutput.output
    }
  }
}

function hasToolCallId(
  messages: Array<UIMessage>,
  toolCallId: string,
): boolean {
  return messages.some((message) =>
    message.parts.some((part) => {
      if (part.type === 'tool-call') return part.id === toolCallId
      if (part.type === 'tool-result') return part.toolCallId === toolCallId
      return false
    }),
  )
}

// ===========================================================================
// GenerationDevtoolsBridge
// ---------------------------------------------------------------------------
// Owns the devtools side of `GenerationClient` / `VideoGenerationClient`:
// per-run history, active-run lifecycle, and snapshot emission. The
// generation client keeps its own core state (result, progress, loading,
// status, error, input) and pushes it into the bridge via `record*` methods.
// ===========================================================================

export interface AIDevtoolsGenerationSnapshotBase<TOutput> extends Record<
  string,
  unknown
> {
  input: unknown | null
  result: TOutput | null
  preview: AIDevtoolsGenerationPreview
  progress: AIDevtoolsGenerationProgress | null
  status: string
  isLoading: boolean
  activeRunId: string | null
  runs: Array<AIDevtoolsGenerationRunSnapshot<TOutput>>
  error?: string
}

export interface GenerationDevtoolsBridgeOptions<TOutput> extends Omit<
  AIDevtoolsBridgeOptions<AIDevtoolsGenerationSnapshotBase<TOutput>>,
  'getSnapshot'
> {
  getCoreState: () => GenerationDevtoolsCoreState<TOutput>
  maxRuns?: number
}

export interface GenerationDevtoolsCoreState<TOutput> {
  input: unknown | null
  result: TOutput | null
  progress: AIDevtoolsGenerationProgress | null
  status: string
  isLoading: boolean
  error?: string | undefined
}

export interface GenerationRunPatch<TOutput> {
  input?: unknown | null
  result?: TOutput | null
  preview?: AIDevtoolsGenerationPreview
  progress?: AIDevtoolsGenerationProgress | null
  status?: string
  isLoading?: boolean
  completedAt?: number
  error?: string
  clearError?: boolean
}

export class GenerationDevtoolsBridge<TOutput> extends ClientDevtoolsBridge<
  AIDevtoolsGenerationSnapshotBase<TOutput>
> {
  protected activeRunId: string | null = null
  protected activeRunStarted = false
  protected devtoolsRuns: Array<AIDevtoolsGenerationRunSnapshot<TOutput>> = []
  protected readonly maxRuns: number
  protected readonly getCoreState: () => GenerationDevtoolsCoreState<TOutput>

  constructor(options: GenerationDevtoolsBridgeOptions<TOutput>) {
    super({
      ...options,
      getSnapshot: () => this.buildSnapshot(),
    })
    this.maxRuns = options.maxRuns ?? 20
    this.getCoreState = options.getCoreState
  }

  // --- Run lifecycle (called by GenerationClient) -----------------------

  beginRun(input: unknown): string {
    const runId = this.generateRunId()
    this.activeRunId = runId
    this.activeRunStarted = false
    this.upsertRun(runId, {
      input,
      result: null,
      preview: this.createPreview(null),
      progress: null,
      status: 'generating',
      isLoading: true,
      clearError: true,
    })
    return runId
  }

  ensureRunStarted(runId: string): void {
    if (this.activeRunStarted && this.activeRunId === runId) return

    if (
      !this.activeRunStarted &&
      this.activeRunId &&
      this.activeRunId !== runId
    ) {
      this.renameRun(this.activeRunId, runId)
    }

    this.activeRunId = runId
    this.activeRunStarted = true
    this.upsertRun(runId, {
      status: 'generating',
      isLoading: true,
      clearError: true,
    })
    this.emitRunLifecycle('run:started', runId, 'started')
    this.emitState()
  }

  finishRun(
    runId: string,
    eventType: 'run:completed' | 'run:errored' | 'run:cancelled',
    status: 'completed' | 'errored' | 'cancelled',
    error?: string,
  ): void {
    this.ensureRunStarted(runId)
    const completedAt = Date.now()
    const completedProgress =
      status === 'completed' ? this.completeProgress() : this.getProgress()
    const runStatus =
      status === 'completed'
        ? 'success'
        : status === 'errored'
          ? 'error'
          : 'cancelled'

    this.upsertRun(runId, {
      status: runStatus,
      isLoading: false,
      progress: completedProgress,
      completedAt,
      ...(error ? { error } : { clearError: true }),
    })

    if (this.activeRunId === runId) {
      this.activeRunId = null
    }
    this.activeRunStarted = false
    this.emitRunLifecycle(eventType, runId, status, {
      ...(error ? { error } : {}),
    })
    this.emitState()
  }

  getActiveRunId(): string | null {
    return this.activeRunId
  }

  /** Clear all per-run history. Called when the client `reset()`s. */
  resetRuns(): void {
    this.activeRunId = null
    this.activeRunStarted = false
    this.devtoolsRuns = []
  }

  /** Record state changes from the client and emit the matching snapshot. */
  recordResultChange(): void {
    this.updateActiveRun({
      result: this.getCoreState().result,
      preview: this.createPreview(this.getCoreState().result),
      clearError: true,
    })
    this.emitState()
  }

  recordLoadingChange(): void {
    this.updateActiveRun({ isLoading: this.getCoreState().isLoading })
    this.emitState()
  }

  recordErrorChange(error: Error | undefined): void {
    this.updateActiveRun(
      error ? { error: error.message } : { clearError: true },
    )
    this.emitState()
  }

  recordStatusChange(status: string): void {
    this.updateActiveRun({ status })
    this.emitState()
  }

  recordProgressChange(): void {
    this.updateActiveRun({ progress: this.getCoreState().progress })
    this.emitState()
  }

  /** Emit the latest snapshot without touching run state. */
  emitState(): void {
    this.emitUpdated()
    this.emitSnapshot()
  }

  // --- Internal ---------------------------------------------------------

  protected buildSnapshot(): AIDevtoolsGenerationSnapshotBase<TOutput> {
    const core = this.getCoreState()
    return {
      input: core.input,
      result: core.result,
      preview: this.createPreview(core.result),
      progress: core.progress,
      status: core.status,
      isLoading: core.isLoading,
      activeRunId: this.activeRunId,
      runs: this.devtoolsRuns,
      ...(core.error ? { error: core.error } : {}),
    }
  }

  protected updateActiveRun(patch: GenerationRunPatch<TOutput>): void {
    if (!this.activeRunId) return
    this.upsertRun(this.activeRunId, patch)
  }

  protected upsertRun(runId: string, patch: GenerationRunPatch<TOutput>): void {
    const now = Date.now()
    const index = this.devtoolsRuns.findIndex((run) => run.id === runId)
    const existing = index >= 0 ? this.devtoolsRuns[index] : undefined
    const next: AIDevtoolsGenerationRunSnapshot<TOutput> = existing
      ? { ...existing }
      : {
          id: runId,
          input: this.getCoreState().input,
          result: null,
          preview: this.createPreview(null),
          progress: null,
          status: 'idle',
          isLoading: false,
          startedAt: now,
          updatedAt: now,
        }

    if ('input' in patch) next.input = patch.input ?? null
    if ('result' in patch) next.result = patch.result ?? null
    if (patch.preview) next.preview = patch.preview
    if ('progress' in patch) next.progress = patch.progress ?? null
    if (patch.status) next.status = patch.status
    if ('isLoading' in patch) next.isLoading = patch.isLoading === true
    if (patch.completedAt !== undefined) next.completedAt = patch.completedAt
    if (patch.clearError) delete next.error
    if (patch.error !== undefined) next.error = patch.error
    next.updatedAt = now

    if (index >= 0) {
      this.devtoolsRuns = this.devtoolsRuns.map((run) =>
        run.id === runId ? next : run,
      )
    } else {
      this.devtoolsRuns = [...this.devtoolsRuns, next]
    }

    if (this.devtoolsRuns.length > this.maxRuns) {
      this.devtoolsRuns = this.devtoolsRuns.slice(-this.maxRuns)
    }
  }

  protected renameRun(previousRunId: string, nextRunId: string): void {
    if (previousRunId === nextRunId) return

    const existing = this.devtoolsRuns.find((run) => run.id === previousRunId)
    if (!existing) return

    const renamed = { ...existing, id: nextRunId, updatedAt: Date.now() }
    this.devtoolsRuns = this.devtoolsRuns
      .filter((run) => run.id !== nextRunId)
      .map((run) => (run.id === previousRunId ? renamed : run))
  }

  protected getProgress(): AIDevtoolsGenerationProgress | null {
    return this.getCoreState().progress
  }

  protected completeProgress(): AIDevtoolsGenerationProgress | null {
    const progress = this.getCoreState().progress
    if (!progress) return null
    return {
      value: 100,
      ...(progress.message ? { message: progress.message } : {}),
    }
  }

  protected createPreview(result: TOutput | null): AIDevtoolsGenerationPreview {
    return createAIDevtoolsGenerationPreview({
      outputKind: this.options.metadata.outputKind,
      result,
    })
  }

  protected generateRunId(): string {
    return `run-${Date.now()}-${Math.random().toString(36).substring(7)}`
  }
}

// ===========================================================================
// VideoDevtoolsBridge
// ---------------------------------------------------------------------------
// Specialization of GenerationDevtoolsBridge for video jobs: snapshots also
// carry the job id and the latest provider-reported status, and the preview
// pipeline knows how to consume that status so the devtools panel can show
// streaming progress before the final URL lands.
// ===========================================================================

export interface AIDevtoolsVideoSnapshotBase<
  TOutput,
> extends AIDevtoolsGenerationSnapshotBase<TOutput> {
  jobId: string | null
  videoStatus: unknown | null
}

export interface VideoDevtoolsCoreState<
  TOutput,
> extends GenerationDevtoolsCoreState<TOutput> {
  jobId: string | null
  videoStatus: unknown | null
}

export interface VideoDevtoolsBridgeOptions<TOutput> extends Omit<
  GenerationDevtoolsBridgeOptions<TOutput>,
  'getCoreState'
> {
  getCoreState: () => VideoDevtoolsCoreState<TOutput>
}

export interface VideoRunPatch<TOutput> extends GenerationRunPatch<TOutput> {
  jobId?: string | null
  videoStatus?: unknown | null
}

export class VideoDevtoolsBridge<
  TOutput,
> extends GenerationDevtoolsBridge<TOutput> {
  constructor(options: VideoDevtoolsBridgeOptions<TOutput>) {
    super(options)
  }

  /** Record changes to `jobId` from the core video client. */
  recordJobIdChange(): void {
    this.updateActiveRun({
      jobId: (this.getCoreState() as VideoDevtoolsCoreState<TOutput>).jobId,
    } as VideoRunPatch<TOutput>)
    this.emitState()
  }

  /** Record changes to the provider's `videoStatus` payload. */
  recordVideoStatusChange(): void {
    const core = this.getCoreState() as VideoDevtoolsCoreState<TOutput>
    this.updateActiveRun({
      videoStatus: core.videoStatus,
      preview: this.createVideoPreview(core.result, core.videoStatus),
    } as VideoRunPatch<TOutput>)
    this.emitState()
  }

  protected override buildSnapshot(): AIDevtoolsVideoSnapshotBase<TOutput> {
    const core = this.getCoreState() as VideoDevtoolsCoreState<TOutput>
    return {
      input: core.input,
      result: core.result,
      preview: this.createVideoPreview(core.result, core.videoStatus),
      progress: core.progress,
      status: core.status,
      isLoading: core.isLoading,
      activeRunId: this.activeRunId,
      runs: this.devtoolsRuns,
      jobId: core.jobId,
      videoStatus: core.videoStatus,
      ...(core.error ? { error: core.error } : {}),
    }
  }

  protected override upsertRun(
    runId: string,
    patch: VideoRunPatch<TOutput>,
  ): void {
    // Reuse the base run-upsert machinery, then layer on the video-only
    // patch fields so devtools sees jobId / videoStatus history per run.
    super.upsertRun(runId, patch)
    if (!('jobId' in patch || 'videoStatus' in patch)) return

    const index = this.devtoolsRuns.findIndex((run) => run.id === runId)
    if (index < 0) return
    const target = this.devtoolsRuns[index]
    if (!target) return
    const merged: AIDevtoolsGenerationRunSnapshot<TOutput> = { ...target }
    if ('jobId' in patch) merged.jobId = patch.jobId ?? null
    if ('videoStatus' in patch) merged.videoStatus = patch.videoStatus ?? null
    this.devtoolsRuns = this.devtoolsRuns.map((run) =>
      run.id === runId ? merged : run,
    )
  }

  /**
   * Override the base `createPreview` so any record* method inherited
   * from `GenerationDevtoolsBridge` (e.g. `recordResultChange`) also
   * threads the latest videoStatus through the preview pipeline.
   */
  protected override createPreview(
    result: TOutput | null,
  ): AIDevtoolsGenerationPreview {
    const core = this.getCoreState() as VideoDevtoolsCoreState<TOutput>
    return this.createVideoPreview(result, core.videoStatus)
  }

  private createVideoPreview(
    result: TOutput | null,
    videoStatus: unknown | null,
  ): AIDevtoolsGenerationPreview {
    return createAIDevtoolsGenerationPreview({
      outputKind: this.options.metadata.outputKind,
      result,
      videoStatus,
    })
  }
}

// ===========================================================================
// Real factories — re-exported from `@tanstack/ai-client/devtools` so that
// consumers can opt into the heavy bridge implementations without dragging
// them into the main entry's bundle. Match the factory signatures defined
// in `./devtools-noop` so the clients can swap factories at runtime.
// ===========================================================================

// ===========================================================================
// ChatDevtoolsAwareEventEmitter
// ---------------------------------------------------------------------------
// Replaces the plain event emitter on `ChatDevtoolsBridge` so the chat
// client can call `this.events.X(...)` exactly like it did before the
// devtools work landed:
//   - auto-attach the current run/thread context to every event that
//     accepts one (textUpdated, messageAppended, tool*, structuredOutput,
//     approval*, etc.)
//   - auto-emit a snapshot after every event so chat-client no longer
//     has to sprinkle explicit `emitSnapshot()` calls after every state
//     change
//   - passively learn the latest streamId from outgoing events so
//     `resolveStreamId()` works without the chat client telling it
// ===========================================================================

class ChatDevtoolsAwareEventEmitter extends DefaultChatClientEventEmitter {
  constructor(
    clientId: string,
    private readonly helper: ChatDevtoolsBridge,
  ) {
    super(clientId)
  }

  private afterEmit(streamId?: string): void {
    if (streamId) this.helper.recordStreamId(streamId)
    this.helper.emitSnapshot()
  }

  // -- methods with run context --------------------------------------------

  override textUpdated(
    streamId: string,
    messageId: string,
    content: string,
    context?: ChatClientRunEventContext,
  ): void {
    super.textUpdated(
      streamId,
      messageId,
      content,
      context ?? this.helper.getCurrentRunEventContext(),
    )
    this.afterEmit(streamId)
  }

  override thinkingUpdated(
    streamId: string,
    messageId: string,
    content: string,
    delta?: string,
    context?: ChatClientRunEventContext,
  ): void {
    super.thinkingUpdated(
      streamId,
      messageId,
      content,
      delta,
      context ?? this.helper.getCurrentRunEventContext(),
    )
    this.afterEmit(streamId)
  }

  override messageAppended(
    uiMessage: Parameters<DefaultChatClientEventEmitter['messageAppended']>[0],
    streamId?: string,
    context?: ChatClientEventContext,
  ): void {
    super.messageAppended(
      uiMessage,
      streamId,
      context ?? this.helper.getCurrentRunEventContext(),
    )
    this.afterEmit(streamId)
  }

  override toolCallStateChanged(
    streamId: string,
    messageId: string,
    toolCallId: string,
    toolName: string,
    state: string,
    args: string,
    context?: ChatClientRunEventContext,
  ): void {
    super.toolCallStateChanged(
      streamId,
      messageId,
      toolCallId,
      toolName,
      state,
      args,
      context ?? this.helper.getCurrentRunEventContext(),
    )
    this.afterEmit(streamId)
  }

  override structuredOutputChanged(
    eventName: Parameters<
      DefaultChatClientEventEmitter['structuredOutputChanged']
    >[0],
    streamId: string,
    messageId: string,
    output: Parameters<
      DefaultChatClientEventEmitter['structuredOutputChanged']
    >[3],
    context?: ChatClientRunEventContext,
  ): void {
    super.structuredOutputChanged(
      eventName,
      streamId,
      messageId,
      output,
      context ?? this.helper.getCurrentOrLastRunEventContext(),
    )
    this.afterEmit(streamId)
  }

  override approvalRequested(
    streamId: string,
    messageId: string,
    toolCallId: string,
    toolName: string,
    input: unknown,
    approvalId: string,
    context?: ChatClientRunEventContext,
  ): void {
    super.approvalRequested(
      streamId,
      messageId,
      toolCallId,
      toolName,
      input,
      approvalId,
      context ?? this.helper.getCurrentOrLastRunEventContext(),
    )
    this.afterEmit(streamId)
  }

  override toolResultAdded(
    toolCallId: string,
    toolName: string,
    output: unknown,
    state: string,
    context?: ChatClientEventContext,
  ): void {
    super.toolResultAdded(
      toolCallId,
      toolName,
      output,
      state,
      context ?? this.helper.getCurrentRunEventContext(),
    )
    this.afterEmit()
  }

  override toolApprovalResponded(
    approvalId: string,
    toolCallId: string,
    approved: boolean,
    context?: ChatClientRunEventContext,
  ): void {
    super.toolApprovalResponded(
      approvalId,
      toolCallId,
      approved,
      context ?? this.helper.getCurrentRunEventContext(),
    )
    this.afterEmit()
  }

  // -- methods without context (just auto-emit snapshot) -------------------

  override clientCreated(initialMessageCount: number): void {
    super.clientCreated(initialMessageCount)
    this.afterEmit()
  }
  override loadingChanged(isLoading: boolean): void {
    super.loadingChanged(isLoading)
    this.afterEmit()
  }
  override errorChanged(error: string | null): void {
    super.errorChanged(error)
    this.afterEmit()
  }
  override reloaded(fromMessageIndex: number): void {
    super.reloaded(fromMessageIndex)
    this.afterEmit()
  }
  override stopped(): void {
    super.stopped()
    this.afterEmit()
  }
  override messagesCleared(): void {
    super.messagesCleared()
    this.afterEmit()
  }
  override messageSent(
    messageId: string,
    content: Parameters<DefaultChatClientEventEmitter['messageSent']>[1],
  ): void {
    super.messageSent(messageId, content)
    this.afterEmit()
  }
  override toolFixtureApplied(
    fixture: Parameters<DefaultChatClientEventEmitter['toolFixtureApplied']>[0],
  ): void {
    super.toolFixtureApplied(fixture)
    this.afterEmit()
  }
}

export function createChatDevtoolsBridge(
  options: ChatDevtoolsBridgeOptions,
): ChatDevtoolsBridge {
  return new ChatDevtoolsBridge(options)
}

export function createGenerationDevtoolsBridge<TOutput>(
  options: GenerationDevtoolsBridgeOptions<TOutput>,
): GenerationDevtoolsBridge<TOutput> {
  return new GenerationDevtoolsBridge<TOutput>(options)
}

export function createVideoDevtoolsBridge<TOutput>(
  options: VideoDevtoolsBridgeOptions<TOutput>,
): VideoDevtoolsBridge<TOutput> {
  return new VideoDevtoolsBridge<TOutput>(options)
}
