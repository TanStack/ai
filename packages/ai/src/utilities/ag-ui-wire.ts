import type {
  ContentPart,
  MessagePart,
  ModelMessage,
  StructuredOutputPart,
  TanStackMessageMetadata,
  UIMessage,
  UIResourcePart,
} from '../types'
import type { MetadataRecord } from './merge-metadata'
import { tanstackMetadata } from './merge-metadata'
import { modelMessageToUIMessage } from '../activities/chat/messages'

type AGUITextInputContent = { type: 'text'; text: string }
type AGUIInputContent =
  | AGUITextInputContent
  | (ContentPart & { type: 'image' | 'audio' | 'video' | 'document' })

type AGUIToolCallMirror = {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
  encryptedValue?: string
}

type AGUIToolMessage = {
  role: 'tool'
  id: string
  toolCallId: string
  content: string
  error?: string
}

type AGUIReasoningMessage = {
  role: 'reasoning'
  id: string
  content: string
  encryptedValue?: string
  metadata?: MetadataRecord
}

/** Spec AG-UI message. No `parts`, no `createdAt` Date. */
type WireAnchorMessage = {
  id: string
  role: UIMessage['role']
  name?: string
  content?: string | Array<AGUIInputContent>
  toolCalls?: Array<AGUIToolCallMirror>
  metadata?: MetadataRecord
}

export type WireMessage =
  | WireAnchorMessage
  | AGUIToolMessage
  | AGUIReasoningMessage

/**
 * Serialize TanStack `UIMessage`s and `ModelMessage`s into the AG-UI
 * `RunAgentInput.messages` wire shape. Anchors are spec-only (`id`, `role`,
 * `name`, `content`, `toolCalls`, `metadata`). Tool results and thinking parts
 * on assistant messages are additionally emitted as fan-out
 * `{role:'tool',...}` and `{role:'reasoning',...}` entries for strict AG-UI
 * server consumers. Set `includeSnapshotStructuredOutput` to retain complete
 * structured-output metadata for UI snapshots.
 */
export function uiMessagesToWire(
  messages: Array<UIMessage | ModelMessage>,
  options?: { includeSnapshotStructuredOutput: boolean },
): Array<WireMessage> {
  const wire: Array<WireMessage> = []
  const includeSnapshotStructuredOutput =
    options?.includeSnapshotStructuredOutput ?? false

  const assistantIds = new Set<string>()
  for (const msg of messages) {
    if (msg.role === 'assistant' && msg.id !== undefined) {
      assistantIds.add(msg.id)
    }
  }

  for (const msg of messages) {
    if (!('parts' in msg) && msg.role === 'tool' && msg.toolCallId) {
      wire.push({
        role: 'tool',
        id: toolWireId(msg.id, msg.toolCallId, assistantIds),
        toolCallId: msg.toolCallId,
        content:
          typeof msg.content === 'string'
            ? msg.content
            : JSON.stringify(msg.content),
        ...(msg.error !== undefined && { error: msg.error }),
      })
      continue
    }

    const uiMessage: UIMessage =
      'parts' in msg ? msg : modelMessageToUIMessage(msg, msg.id)
    const parts: ReadonlyArray<MessagePart> = uiMessage.parts

    if (msg.role === 'system') {
      wire.push(
        toAnchor(
          uiMessage,
          {
            content:
              parts.length > 0
                ? collectText(parts)
                : ((msg as { content?: string }).content ?? ''),
          },
          parts,
          includeSnapshotStructuredOutput,
        ),
      )
      continue
    }

    if (msg.role === 'user') {
      wire.push(
        toAnchor(
          uiMessage,
          {
            content:
              parts.length > 0
                ? collectUserContent(parts)
                : ((msg as { content?: string }).content ?? ''),
          },
          parts,
          includeSnapshotStructuredOutput,
        ),
      )
      continue
    }

    // assistant: emit reasoning fan-outs first, then anchor, then tool fan-outs
    for (const part of parts) {
      if (part.type === 'thinking') {
        const reasoning: AGUIReasoningMessage = {
          role: 'reasoning',
          id: deriveReasoningId(uiMessage.id, part),
          content: part.content,
        }
        if (part.signature) {
          reasoning.encryptedValue = part.signature
        }
        wire.push(reasoning)
      }
    }

    const text = collectText(parts)
    const toolCalls = collectToolCalls(parts)
    wire.push(
      toAnchor(
        uiMessage,
        {
          ...(text !== '' && { content: text }),
          ...(toolCalls && { toolCalls }),
        },
        parts,
        includeSnapshotStructuredOutput,
      ),
    )

    for (const part of parts) {
      if (part.type === 'tool-result') {
        wire.push({
          role: 'tool',
          id: deriveToolMessageId(part.toolCallId),
          toolCallId: part.toolCallId,
          content:
            typeof part.content === 'string'
              ? part.content
              : JSON.stringify(part.content),
          ...(part.error !== undefined && { error: part.error }),
        })
      }
    }
  }

  return wire
}

function toAnchor(
  msg: UIMessage,
  extras: {
    content?: string | Array<AGUIInputContent>
    toolCalls?: Array<AGUIToolCallMirror>
  },
  parts: ReadonlyArray<MessagePart>,
  includeSnapshotStructuredOutput: boolean,
): WireAnchorMessage {
  const metadata = messageMetadata(msg, parts, includeSnapshotStructuredOutput)
  return {
    id: msg.id,
    role: msg.role,
    ...(msg.name !== undefined && { name: msg.name }),
    ...extras,
    ...(metadata !== undefined && { metadata }),
  }
}

function messageMetadata(
  msg: UIMessage,
  parts: ReadonlyArray<MessagePart>,
  includeSnapshotStructuredOutput: boolean,
): MetadataRecord | undefined {
  const base: MetadataRecord = { ...(msg.metadata ?? {}) }
  const tanstack: MetadataRecord = { ...(tanstackMetadata(msg) ?? {}) }
  if (msg.createdAt) tanstack.createdAt = msg.createdAt.toISOString()

  const structuredOutput = serializedStructuredOutput(
    parts,
    includeSnapshotStructuredOutput,
  )
  if (structuredOutput) tanstack.structuredOutput = structuredOutput

  const toolCallMetadata: Record<string, unknown> = {}
  for (const part of parts) {
    if (part.type === 'tool-call' && part.metadata !== undefined) {
      toolCallMetadata[part.id] = part.metadata
    }
  }
  if (Object.keys(toolCallMetadata).length > 0) {
    tanstack.toolCallMetadata = toolCallMetadata
  }

  const uiResources = parts.filter(
    (p): p is UIResourcePart => p.type === 'ui-resource',
  )
  if (uiResources.length > 0) tanstack.uiResources = uiResources

  if (Object.keys(tanstack).length > 0) base.tanstack = tanstack
  return Object.keys(base).length > 0 ? base : undefined
}

function serializedStructuredOutput(
  parts: ReadonlyArray<MessagePart>,
  includeSnapshotStructuredOutput: boolean,
): TanStackMessageMetadata['structuredOutput'] | undefined {
  for (const p of parts) {
    if (
      p.type === 'structured-output' &&
      (includeSnapshotStructuredOutput || p.status !== 'complete')
    ) {
      return structuredOutputMetadata(p, includeSnapshotStructuredOutput)
    }
  }
  return undefined
}

function structuredOutputMetadata(
  part: StructuredOutputPart,
  includeSnapshotStructuredOutput: boolean,
): NonNullable<TanStackMessageMetadata['structuredOutput']> {
  return {
    status: part.status,
    raw: part.raw,
    ...(includeSnapshotStructuredOutput && part.partial !== undefined
      ? { partial: part.partial }
      : {}),
    ...(includeSnapshotStructuredOutput && part.data !== undefined
      ? { data: part.data }
      : {}),
    ...(includeSnapshotStructuredOutput && part.reasoning
      ? { reasoning: part.reasoning }
      : {}),
    ...(part.errorMessage !== undefined && { errorMessage: part.errorMessage }),
  }
}

function collectText(parts: ReadonlyArray<MessagePart>): string {
  // The streamed JSON of a completed structured-output part is the source of
  // truth for multi-turn coherence — emitting it back as assistant content
  // lets the LLM see its own prior structured response. Streaming/errored
  // parts are skipped: they'd ship malformed JSON fragments and confuse the
  // model. `completeStructuredOutputPart` tries hard to populate `raw`
  // (caller → existing buffer → `JSON.stringify(data)`), but the stringify
  // fallback can leave it empty when `data` is unserializable (BigInt,
  // circular). The `p.raw !== ''` guard below is what enforces "no malformed
  // round-trip" in that case — without it we'd ship `''` and the model would
  // see an empty assistant turn.
  const out: Array<string> = []
  for (const p of parts) {
    if (p.type === 'text') {
      out.push(p.content)
    } else if (
      p.type === 'structured-output' &&
      p.status === 'complete' &&
      p.raw !== ''
    ) {
      out.push(p.raw)
    }
  }
  return out.join('')
}

function collectUserContent(
  parts: ReadonlyArray<MessagePart>,
): string | Array<AGUIInputContent> {
  const hasMultimodal = parts.some(
    (p) =>
      p.type === 'image' ||
      p.type === 'audio' ||
      p.type === 'video' ||
      p.type === 'document',
  )
  if (!hasMultimodal) {
    return collectText(parts)
  }
  const out: Array<AGUIInputContent> = []
  for (const p of parts) {
    if (p.type === 'text') {
      out.push({ type: 'text', text: p.content })
    } else if (
      p.type === 'image' ||
      p.type === 'audio' ||
      p.type === 'video' ||
      p.type === 'document'
    ) {
      out.push(p)
    }
  }
  return out
}

function thoughtSignatureFromMetadata(metadata: unknown): string | undefined {
  if (
    metadata == null ||
    typeof metadata !== 'object' ||
    Array.isArray(metadata)
  ) {
    return undefined
  }
  if (!('thoughtSignature' in metadata)) return undefined
  const value = metadata.thoughtSignature
  return typeof value === 'string' && value !== '' ? value : undefined
}

function collectToolCalls(
  parts: ReadonlyArray<MessagePart>,
): Array<AGUIToolCallMirror> | undefined {
  const calls: Array<AGUIToolCallMirror> = []
  for (const p of parts) {
    if (p.type === 'tool-call') {
      const encryptedValue = thoughtSignatureFromMetadata(p.metadata)
      calls.push({
        id: p.id,
        type: 'function',
        function: { name: p.name, arguments: p.arguments },
        ...(encryptedValue !== undefined ? { encryptedValue } : {}),
      })
    }
  }
  return calls.length > 0 ? calls : undefined
}

function deriveReasoningId(messageId: string, part: MessagePart): string {
  return `${messageId}-reasoning-${(part as { id?: string }).id ?? hashContent((part as { content: string }).content)}`
}

function deriveToolMessageId(toolCallId: string): string {
  return `tool-${toolCallId}`
}

function toolWireId(
  id: string | undefined,
  toolCallId: string,
  assistantIds: ReadonlySet<string>,
): string {
  const derived = deriveToolMessageId(toolCallId)
  if (id === undefined || assistantIds.has(id)) return derived
  return id
}

function hashContent(s: string): string {
  // Cheap deterministic id suffix; collisions are tolerable since
  // reasoning ids only matter for AG-UI server consumers, not for our
  // own server's dedup logic (which keys on toolCallId, not reasoning id).
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h).toString(36)
}
