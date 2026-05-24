import {
  aiEventClient,
  createAIDevtoolsEventEnvelope,
  emitAIDevtoolsEvent,
} from '@tanstack/ai-event-client'
import { convertSchemaToJsonSchema } from '@tanstack/ai'
import type { AnyClientTool } from '@tanstack/ai'
import type { AIDevtoolsEventVisibility } from '@tanstack/ai-event-client'
import type { ChatClientState, ConnectionStatus, UIMessage } from './types'

export interface AIDevtoolsClientMetadata {
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
  private readonly options: AIDevtoolsBridgeOptions<TSnapshot>
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
