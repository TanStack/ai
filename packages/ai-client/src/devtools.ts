import {
  aiEventClient,
  createAIDevtoolsEventEnvelope,
  emitAIDevtoolsEvent,
} from '@tanstack/ai-event-client'
import { convertSchemaToJsonSchema } from '@tanstack/ai/client'
import { DefaultChatClientEventEmitter } from './events'
import type { AnyClientTool, StreamChunk } from '@tanstack/ai/client'
import type {
  AIDevtoolsEventVisibility,
  MemoryScopeLite,
} from '@tanstack/ai-event-client'
import type {
  ChatClientEventContext,
  ChatClientEventEmitter,
  ChatClientRunEventContext,
} from './events'
import type {
  ChatClientState,
  ConnectionStatus,
  MessagePart,
  QueuedMessage,
  ToolCallPart,
  UIMessage,
} from './types'

export interface AIDevtoolsDisplayOptions {
  name?: string
}

/**
 * Structural mirror of `MemoryStateEventValue` from `@tanstack/ai-memory` — the
 * payload of the `memory:state` CUSTOM chunk. Kept local so `ai-client` doesn't
 * depend on `ai-memory`; the memory middleware is the producer.
 */
interface SkillsStateEventValue {
  catalog?: Array<{ name: string; description: string }>
  activated?: Array<string>
}

interface MemoryStateEventValue {
  scope: MemoryScopeLite
  adapter: string
  query?: string
  recall?: {
    fragmentCount?: number
    hasTools?: boolean
    systemPromptChars?: number
    durationMs?: number
  }
  snapshot?: {
    takenAt: string
    data: unknown
    facts?: Array<{
      id: string
      text: string
      source?: string
      createdAt?: string
    }>
  }
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

export type AIDevtoolsGenerationRunStatus =
  | 'idle'
  | 'generating'
  | 'success'
  | 'error'
  | 'cancelled'

export interface AIDevtoolsGenerationRunSnapshot<TOutput = unknown> {
  id: string
  input: unknown
  result: TOutput | null
  preview: AIDevtoolsGenerationPreview
  progress: AIDevtoolsGenerationProgress | null
  status: AIDevtoolsGenerationRunStatus
  isLoading: boolean
  startedAt: number
  updatedAt: number
  completedAt?: number
  error?: string
  jobId?: string | null
  videoStatus?: unknown
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
  queue?: Array<QueuedMessage>
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

  const isMissingResultOrResultIsUndefined =
    input.result === null || input.result === undefined
  if (isMissingResultOrResultIsUndefined) {
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

  const isEmptyItemsAndHasResultAndResultIsNotUndefined =
    items.length === 0 && result !== null && result !== undefined
  if (isEmptyItemsAndHasResultAndResultIsNotUndefined) {
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

  const isMissingResultOrResultIsUndefined =
    result === null || result === undefined
  if (isMissingResultOrResultIsUndefined) {
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
  const isNotValueOrTypeofValueIsNotObjectOrValueIsArray =
    !value || typeof value !== 'object' || Array.isArray(value)
  if (isNotValueOrTypeofValueIsNotObjectOrValueIsArray) {
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

export interface AIDevtoolsBridgeOptions<TSnapshot extends object> {
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

/**
 * `{...options}` turns `get hookId()` into a data property. Chat/generation
 * clients mint `threadId` after construct (`ensureThreadId` on mount), so a
 * spread would freeze `hookId: ''` and DevTools could never select the hook.
 */
function withLiveClientIdentity<TSnapshot extends object>(
  identity: Pick<
    AIDevtoolsBridgeOptions<TSnapshot>,
    | 'hookId'
    | 'clientId'
    | 'threadId'
    | 'metadata'
    | 'getTools'
    | 'applyToolFixture'
  >,
  rest: Pick<AIDevtoolsBridgeOptions<TSnapshot>, 'getSnapshot'> &
    Partial<
      Pick<AIDevtoolsBridgeOptions<TSnapshot>, 'getTools' | 'applyToolFixture'>
    >,
): AIDevtoolsBridgeOptions<TSnapshot> {
  return {
    get hookId() {
      return identity.hookId
    },
    get clientId() {
      return identity.clientId
    },
    get threadId() {
      return identity.threadId
    },
    metadata: identity.metadata,
    getSnapshot: rest.getSnapshot,
    ...(rest.getTools || identity.getTools
      ? { getTools: rest.getTools ?? identity.getTools }
      : {}),
    ...(rest.applyToolFixture || identity.applyToolFixture
      ? {
          applyToolFixture: rest.applyToolFixture ?? identity.applyToolFixture,
        }
      : {}),
  }
}

export class ClientDevtoolsBridge<TSnapshot extends object> {
  protected readonly options: AIDevtoolsBridgeOptions<TSnapshot>
  private readonly unsubscribers: Array<Unsubscribe> = []
  private disposed = false
  private superseded = false
  private registered = false

  constructor(options: AIDevtoolsBridgeOptions<TSnapshot>) {
    this.options = options
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
      // Wire envelope uses Record<string, unknown>; widen the typed snapshot
      // here so the typed-snapshot constraint above can stay narrow.
      // oxlint-disable-next-line eslint-js/no-restricted-syntax -- TSnapshot extends object is structurally compatible but TS can't see the missing index signature
      state: this.options.getSnapshot() as unknown as Record<string, unknown>,
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

    const splicedUnsubscribers = this.unsubscribers.splice(0)
    for (const unsubscribe of splicedUnsubscribers) {
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

    const live = getActiveBridgeRegistry().get(this.options.hookId)
    if (live !== this) {
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
    const isDisposedOrSuperseded = this.disposed || this.superseded
    if (isDisposedOrSuperseded) {
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
    const isActiveBridgeAndActiveBridgeIsNotValue =
      activeBridge && activeBridge !== this
    if (isActiveBridgeAndActiveBridgeIsNotValue) {
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
    const isDisposedOrSuperseded = this.disposed || this.superseded
    if (isDisposedOrSuperseded) {
      return
    }

    const targetHookId = event.payload.targetHookId
    const isTargetHookIdAndTargetHookIdIsNotHookId =
      targetHookId && targetHookId !== this.options.hookId
    if (isTargetHookIdAndTargetHookIdIsNotHookId) {
      return
    }

    this.emitRegistered()
    this.emitToolsRegistered()
    this.emitSnapshot()
    this.onReplayState()
  }

  protected onReplayState(): void {}

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
    const isNotHookIdAndNotThreadId = !fixture.hookId && !fixture.threadId
    if (isNotHookIdAndNotThreadId) {
      return false
    }

    if (fixture.hookId) {
      return fixture.hookId === this.options.hookId
    }

    const isThreadIdAndNotThreadIdOrThreadIdIsNotThreadId =
      fixture.threadId &&
      (!this.options.threadId || fixture.threadId !== this.options.threadId)
    if (isThreadIdAndNotThreadIdOrThreadIdIsNotThreadId) {
      return false
    }
    return true
  }

  protected createEnvelope(
    eventType:
      | 'hook:registered'
      | 'hook:updated'
      | 'hook:unregistered'
      | 'hook:state-snapshot'
      | 'tools:registered'
      | 'memory:retrieve:started'
      | 'memory:retrieve:completed'
      | 'memory:snapshot'
      | 'skills:snapshot'
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
  readonly events: ChatClientEventEmitter
  private readonly chatOptions: ChatDevtoolsBridgeOptions
  private currentRunId: string | null = null
  private currentRunThreadId: string | null = null
  private currentStreamId: string | null = null
  private lastStreamId: string | null = null
  private lastRunEventContext: ChatClientRunEventContext | undefined
  /** Last transported `memory:state` value, replayed when a panel opens. */
  private lastMemoryStateValue: unknown = null
  /** Last transported `skills:state` value, replayed when a panel opens. */
  private lastSkillsStateValue: unknown = null

  constructor(options: ChatDevtoolsBridgeOptions) {
    super(
      withLiveClientIdentity(options, {
        getSnapshot: options.getSnapshot,
        // Thunk defers `this.applyFixture` lookup until after `super` returns.
        applyToolFixture: (fixture) => this.applyFixture(fixture),
      }),
    )
    this.chatOptions = options
    // Auto-attaches run/thread context and auto-emits a snapshot after each
    // event so callers can keep using `this.events.X(...)` with no context arg.
    this.events = new ChatDevtoolsAwareEventEmitter(
      () => options.clientId,
      this,
    )
  }

  // --- Stream / run context API -------------------------------------------

  setCurrentStreamId(streamId: string | null): void {
    this.currentStreamId = streamId
    if (streamId) {
      this.lastStreamId = streamId
    }
  }

  recordStreamId(streamId: string): void {
    if (streamId) this.lastStreamId = streamId
  }

  mountWithTools(initialMessageCount: number): void {
    this.events.clientCreated(initialMessageCount)
    this.emitRegistered()
    this.emitToolsRegistered()
    this.emitSnapshot()
  }

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

  resolveStreamId(): string {
    return (
      this.currentStreamId ??
      this.lastStreamId ??
      this.chatOptions.generateId('stream')
    )
  }

  beginRun(runId: string, threadId: string): void {
    this.currentRunId = runId
    this.currentRunThreadId = threadId
    this.lastRunEventContext = { runId, threadId }
  }

  observeChunk(chunk: StreamChunk): void {
    if (chunk.type === 'RUN_STARTED') {
      this.beginRun(chunk.runId, chunk.threadId)
      return
    }

    const isTypeIsRUNFINISHEDOrTypeIsRUNERROR =
      chunk.type === 'RUN_FINISHED' || chunk.type === 'RUN_ERROR'
    if (isTypeIsRUNFINISHEDOrTypeIsRUNERROR) {
      const runId =
        chunk.type === 'RUN_FINISHED'
          ? chunk.runId
          : (chunk as { runId?: string }).runId
      const isNotRunIdOrRunIdIsCurrentRunId =
        !runId || runId === this.currentRunId
      if (isNotRunIdOrRunIdIsCurrentRunId) {
        const context = this.getCurrentRunEventContext()
        if (context) {
          this.lastRunEventContext = context
        }
        this.currentRunId = null
        this.currentRunThreadId = null
      }
    }
  }

  recordMemoryState(rawValue: unknown): void {
    this.lastMemoryStateValue = rawValue
    this.emitMemoryState(rawValue)
  }

  recordSkillsState(rawValue: unknown): void {
    this.lastSkillsStateValue = rawValue
    this.emitSkillsState(rawValue)
  }

  /**
   * Re-emit the browser-side `memory:*` events from a transported
   * `memory:state` value. The devtools store consumes these to render the
   * Memory tab (operations timeline + live contents). The recall pair mirrors
   * the server middleware's own emits; the snapshot is included only when the
   * adapter supports introspection.
   */
  private emitMemoryState(rawValue: unknown): void {
    const isNotRawValueOrTypeofRawValueIsNotObject =
      !rawValue || typeof rawValue !== 'object'
    if (isNotRawValueOrTypeofRawValueIsNotObject) return
    const value = rawValue as MemoryStateEventValue
    const scope = value.scope
    const adapter = value.adapter
    const isNotScopeOrTypeofAdapterIsNotString =
      !scope || typeof adapter !== 'string'
    if (isNotScopeOrTypeofAdapterIsNotString) return
    const runContext = this.currentRunId ? { runId: this.currentRunId } : {}

    emitAIDevtoolsEvent('memory:retrieve:started', {
      ...this.createEnvelope(
        'memory:retrieve:started',
        'client-state',
        runContext,
      ),
      scope,
      adapter,
      query: value.query ?? '',
    })
    if (value.recall) {
      emitAIDevtoolsEvent('memory:retrieve:completed', {
        ...this.createEnvelope(
          'memory:retrieve:completed',
          'client-state',
          runContext,
        ),
        scope,
        adapter,
        fragmentCount: value.recall.fragmentCount ?? 0,
        hasTools: Boolean(value.recall.hasTools),
        systemPromptChars: value.recall.systemPromptChars ?? 0,
        durationMs: value.recall.durationMs ?? 0,
      })
    }
    if (value.snapshot) {
      emitAIDevtoolsEvent('memory:snapshot', {
        ...this.createEnvelope('memory:snapshot', 'client-state', runContext),
        scope,
        adapter,
        takenAt: value.snapshot.takenAt,
        data: value.snapshot.data,
        facts: value.snapshot.facts ?? [],
      })
    }
  }

  private emitSkillsState(rawValue: unknown): void {
    if (!rawValue || typeof rawValue !== 'object') return
    const value = rawValue as SkillsStateEventValue
    const catalog = Array.isArray(value.catalog) ? value.catalog : []
    const activated = Array.isArray(value.activated) ? value.activated : []
    const runContext = this.currentRunId ? { runId: this.currentRunId } : {}
    emitAIDevtoolsEvent('skills:snapshot', {
      ...this.createEnvelope('skills:snapshot', 'client-state', runContext),
      catalog,
      activated,
    })
  }

  protected override onReplayState(): void {
    if (this.lastMemoryStateValue != null) {
      this.emitMemoryState(this.lastMemoryStateValue)
    }
    if (this.lastSkillsStateValue != null) {
      this.emitSkillsState(this.lastSkillsStateValue)
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
      console.warn(
        `[ai-devtools] tool fixture "${fixture.toolName}" requested execute=true but no client tool implementation is registered; replaying saved output instead.`,
      )
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

    let output: unknown
    try {
      output = await executeFunc(fixture.input)
    } catch (error) {
      console.error(
        `[ai-devtools] tool fixture "${fixture.toolName}" execute threw`,
        error,
      )
      this.addToolResultForFixture({
        fixture,
        messageId,
        toolCallId,
        threadId,
        output: null,
        errorText:
          error instanceof Error
            ? `${error.name}: ${error.message}`
            : `Tool execution failed: ${String(error)}`,
      })
      return
    }
    this.addToolResultForFixture({
      fixture,
      messageId,
      toolCallId,
      threadId,
      output,
    })
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
    const isNotSourceMessageOrNotPartsIsArray =
      !sourceMessage || !Array.isArray(sourceMessage.parts)
    if (isNotSourceMessageOrNotPartsIsArray) {
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
      const isNotIsRecordOrTypeIsNotToolCall =
        !isRecord(part) || part.type !== 'tool-call'
      if (isNotIsRecordOrTypeIsNotToolCall) continue
      if (typeof part.id !== 'string') continue
      ids.set(part.id, this.resolveFixtureToolCallId(part.id, messages))
    }
    return ids
  }

  private resolveFixtureMessageId(
    messageId: string | undefined,
    messages: Array<UIMessage>,
  ): string {
    const isMessageIdAndNotSome =
      messageId && !messages.some((message) => message.id === messageId)
    if (isMessageIdAndNotSome) {
      return messageId
    }
    return this.chatOptions.generateId('fixture-msg')
  }

  private resolveFixtureToolCallId(
    toolCallId: string | undefined,
    messages: Array<UIMessage>,
  ): string {
    const isToolCallIdAndNotHasToolCallId =
      toolCallId && !hasToolCallId(messages, toolCallId)
    if (isToolCallIdAndNotHasToolCallId) {
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
  const isValueIsUndefinedOrTypeofValueIsFunctionOrTypeofValueIsSymbol =
    value === undefined ||
    typeof value === 'function' ||
    typeof value === 'symbol'
  if (isValueIsUndefinedOrTypeofValueIsFunctionOrTypeofValueIsSymbol) {
    return String(value)
  }
  try {
    return JSON.stringify(value)
  } catch (error) {
    console.error(
      '[ai-devtools] failed to JSON.stringify fixture value; falling back to String(). Tool call arguments may be malformed.',
      { error, value },
    )
    return String(value)
  }
}

function parseFixtureResultContent(content: string): unknown {
  try {
    return JSON.parse(content)
  } catch (error) {
    console.error(
      '[ai-devtools] failed to JSON.parse fixture result content; replaying as raw string. Fixture payload may be corrupted.',
      { error, content },
    )
    return content
  }
}

function cloneFixtureMessagePart(
  part: unknown,
  toolCallIds: Map<string, string>,
): MessagePart | undefined {
  const isNotIsRecordOrTypeofTypeIsNotString =
    !isRecord(part) || typeof part.type !== 'string'
  if (isNotIsRecordOrTypeofTypeIsNotString) return undefined
  const cloned: Record<string, unknown> = { ...part }

  const isTypeIsToolCallAndTypeofIdIsString =
    part.type === 'tool-call' && typeof part.id === 'string'
  if (isTypeIsToolCallAndTypeofIdIsString) {
    cloned.id = toolCallIds.get(part.id) ?? part.id
  }
  const isTypeIsToolResultAndTypeofToolCallIdIsString =
    part.type === 'tool-result' && typeof part.toolCallId === 'string'
  if (isTypeIsToolResultAndTypeofToolCallIdIsString) {
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
      toolCall.output = Array.isArray(part.content)
        ? part.content
        : parseFixtureResultContent(part.content)
    }
  }

  const isMappedToolCallIdAndOutputIsNotUndefined =
    fixtureOutput.mappedToolCallId && fixtureOutput.output !== undefined
  if (isMappedToolCallIdAndOutputIsNotUndefined) {
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

export interface AIDevtoolsGenerationSnapshotBase<TOutput> {
  input: unknown
  result: TOutput | null
  preview: AIDevtoolsGenerationPreview
  progress: AIDevtoolsGenerationProgress | null
  status: AIDevtoolsGenerationRunStatus
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
  input: unknown
  result: TOutput | null
  progress: AIDevtoolsGenerationProgress | null
  status: AIDevtoolsGenerationRunStatus
  isLoading: boolean
  error?: string
}

export interface GenerationRunPatch<TOutput> {
  input?: unknown
  result?: TOutput | null
  preview?: AIDevtoolsGenerationPreview
  progress?: AIDevtoolsGenerationProgress | null
  status?: AIDevtoolsGenerationRunStatus
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
    super(
      withLiveClientIdentity(options, {
        getSnapshot: () => this.buildSnapshot(),
      }),
    )
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
    const isActiveRunStartedAndActiveRunIdIsRunId =
      this.activeRunStarted && this.activeRunId === runId
    if (isActiveRunStartedAndActiveRunIdIsRunId) return

    const isNotActiveRunStartedAndActiveRunIdAndActiveRunIdIsNotRunId =
      !this.activeRunStarted && this.activeRunId && this.activeRunId !== runId
    if (isNotActiveRunStartedAndActiveRunIdAndActiveRunIdIsNotRunId) {
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

  recordStatusChange(status: AIDevtoolsGenerationRunStatus): void {
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

export interface AIDevtoolsVideoSnapshotBase<
  TOutput,
> extends AIDevtoolsGenerationSnapshotBase<TOutput> {
  jobId: string | null
  videoStatus: unknown
}

export interface VideoDevtoolsCoreState<
  TOutput,
> extends GenerationDevtoolsCoreState<TOutput> {
  jobId: string | null
  videoStatus: unknown
}

export interface VideoDevtoolsBridgeOptions<TOutput> extends Omit<
  GenerationDevtoolsBridgeOptions<TOutput>,
  'getCoreState'
> {
  getCoreState: () => VideoDevtoolsCoreState<TOutput>
}

export interface VideoRunPatch<TOutput> extends GenerationRunPatch<TOutput> {
  jobId?: string | null
  videoStatus?: unknown
}

export class VideoDevtoolsBridge<
  TOutput,
> extends GenerationDevtoolsBridge<TOutput> {
  constructor(options: VideoDevtoolsBridgeOptions<TOutput>) {
    super(options)
  }

  recordJobIdChange(): void {
    this.updateActiveRun({
      jobId: (this.getCoreState() as VideoDevtoolsCoreState<TOutput>).jobId,
    } as VideoRunPatch<TOutput>)
    this.emitState()
  }

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
    super.upsertRun(runId, patch)
    const isPatchHasJobIdOrPatchHasVideoStatus =
      'jobId' in patch || 'videoStatus' in patch
    if (!isPatchHasJobIdOrPatchHasVideoStatus) return

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

  // Override so record* methods inherited from GenerationDevtoolsBridge
  // (e.g. recordResultChange) thread the latest videoStatus into the preview.
  protected override createPreview(
    result: TOutput | null,
  ): AIDevtoolsGenerationPreview {
    const core = this.getCoreState() as VideoDevtoolsCoreState<TOutput>
    return this.createVideoPreview(result, core.videoStatus)
  }

  private createVideoPreview(
    result: TOutput | null,
    videoStatus: unknown,
  ): AIDevtoolsGenerationPreview {
    return createAIDevtoolsGenerationPreview({
      outputKind: this.options.metadata.outputKind,
      result,
      videoStatus,
    })
  }
}

class ChatDevtoolsAwareEventEmitter extends DefaultChatClientEventEmitter {
  constructor(
    private readonly getClientId: () => string,
    private readonly helper: ChatDevtoolsBridge,
  ) {
    super(getClientId())
  }

  protected override emitEvent(
    eventName: string,
    data?: Record<string, any>,
  ): void {
    this.clientId = this.getClientId()
    super.emitEvent(eventName, data)
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
