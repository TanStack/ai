export type AIDevtoolsEventSource = 'client' | 'server' | 'devtools'

export type AIDevtoolsEventVisibility =
  | 'user-visible'
  | 'client-state'
  | 'server-internal'
  | 'devtools-action'

export interface AIDevtoolsEventEnvelope {
  eventId: string
  eventType: string
  timestamp: number
  source: AIDevtoolsEventSource
  visibility: AIDevtoolsEventVisibility
  runtimeId?: string
  clientId?: string
  requestId?: string
  streamId?: string
  hookId?: string
  threadId?: string
  runId?: string
  messageId?: string
  toolCallId?: string
  sequence?: number
  correlationId?: string
  relatedEventId?: string
}

export type AIDevtoolsEventEnvelopeInput = Omit<
  AIDevtoolsEventEnvelope,
  'eventId'
> & {
  eventId?: string
}

declare global {
  var __TANSTACK_AI_DEVTOOLS_RUNTIME_ID__: string | undefined
}

function createRuntimeId(): string {
  const cryptoLike = (
    globalThis as {
      crypto?: {
        randomUUID?: () => string
      }
    }
  ).crypto
  if (cryptoLike?.randomUUID) {
    return cryptoLike.randomUUID()
  }
  return Math.random().toString(36).slice(2)
}

const runtimeId = (() => {
  if (!globalThis.__TANSTACK_AI_DEVTOOLS_RUNTIME_ID__) {
    globalThis.__TANSTACK_AI_DEVTOOLS_RUNTIME_ID__ = createRuntimeId()
  }
  return globalThis.__TANSTACK_AI_DEVTOOLS_RUNTIME_ID__
})()

let eventCounter = 0

function idPart(value: unknown): string {
  if (value === undefined || value === null || value === '') return 'missing'
  return `value-${encodeURIComponent(String(value))}`
}

function timestampBucket(timestamp: number): number {
  return Math.floor(timestamp / 1000) * 1000
}

export function createAIDevtoolsEventEnvelope(
  input: AIDevtoolsEventEnvelopeInput,
): AIDevtoolsEventEnvelope {
  const resolvedRuntimeId = input.runtimeId ?? runtimeId
  const eventId =
    input.eventId && input.eventId.length > 0
      ? input.eventId
      : [
          input.source,
          input.eventType,
          idPart(resolvedRuntimeId),
          idPart(input.clientId),
          idPart(input.requestId),
          idPart(input.streamId),
          idPart(input.hookId),
          idPart(input.threadId),
          idPart(input.runId),
          idPart(input.messageId),
          idPart(input.toolCallId),
          idPart(input.sequence),
          input.timestamp,
          runtimeId,
          eventCounter++,
        ].join(':')

  return {
    ...input,
    runtimeId: resolvedRuntimeId,
    eventId,
  }
}

export function getAIDevtoolsRuntimeId(): string {
  return runtimeId
}

export function getAIDevtoolsDedupeKey(
  event: Partial<AIDevtoolsEventEnvelope> &
    Pick<
      AIDevtoolsEventEnvelope,
      'eventType' | 'source' | 'visibility' | 'timestamp'
    >,
): string {
  if (event.eventId && event.eventId.length > 0) {
    return `event:${event.eventId}`
  }

  return [
    'fallback',
    event.source,
    event.eventType,
    event.visibility,
    idPart(event.clientId),
    idPart(event.requestId),
    idPart(event.streamId),
    idPart(event.hookId),
    idPart(event.threadId),
    idPart(event.runId),
    idPart(event.messageId),
    idPart(event.toolCallId),
    idPart(event.sequence),
    timestampBucket(event.timestamp),
  ].join(':')
}
