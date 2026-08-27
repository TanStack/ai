import type {
  AssistantMessage,
  InputContent,
  ReasoningMessage,
  SystemMessage,
  ToolCall,
  ToolMessage,
  UserMessage,
} from '@ag-ui/core'
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
import { normalizeToolResult } from './tool-result'
import {
  coerceCreatedAt,
  modelMessageToUIMessage,
} from '../activities/chat/messages'

type WithMetadata<T> = T & { metadata?: MetadataRecord }
type WireSystemMessage = WithMetadata<SystemMessage>
type WireUserMessage = WithMetadata<UserMessage>
type WireAssistantMessage = WithMetadata<AssistantMessage>
type WireToolMessage = WithMetadata<
  ToolMessage & {
    name?: string
  }
>
type WireReasoningMessage = WithMetadata<ReasoningMessage>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function rebuiltToolMetadata(
  metadata: unknown,
  createdAt: unknown,
  id: string | undefined,
  content: string | null | Array<ContentPart>,
  anchorOwnsUiResources = false,
): MetadataRecord | undefined {
  const source: MetadataRecord = isRecord(metadata) ? metadata : {}
  const tanstack = isRecord(source.tanstack) ? { ...source.tanstack } : {}
  if (anchorOwnsUiResources) delete tanstack.uiResources
  const date = coerceCreatedAt(createdAt)
  const toolResult: NonNullable<TanStackMessageMetadata['toolResult']> = {
    ...(id !== undefined ? { id } : {}),
    ...(date && { createdAt: date.toISOString() }),
    ...(Array.isArray(content) && { content }),
  }
  const result = {
    ...source,
    tanstack: { ...tanstack, toolResult },
  }
  return Object.keys(result).length ? result : undefined
}

export type WireMessage =
  | WireSystemMessage
  | WireUserMessage
  | WireAssistantMessage
  | WireToolMessage
  | WireReasoningMessage

function appendStandaloneToolMessage(
  msg: ModelMessage,
  wire: Array<WireMessage>,
  usedWireIds: Set<string>,
  assistantIds: ReadonlySet<string>,
): void {
  if (msg.role !== 'tool') return
  if (!msg.toolCallId) return
  const id = uniqueToolWireId(
    toolWireId(msg.id, msg.toolCallId, assistantIds),
    usedWireIds,
  )
  const metadata = rebuiltToolMetadata(
    msg.metadata,
    msg.createdAt,
    msg.id,
    msg.content,
  )
  wire.push({
    role: 'tool',
    id,
    ...(msg.name !== undefined && { name: msg.name }),
    toolCallId: msg.toolCallId,
    content:
      typeof msg.content === 'string'
        ? msg.content
        : JSON.stringify(msg.content),
    ...(msg.error !== undefined && { error: msg.error }),
    ...(metadata !== undefined && { metadata }),
  })
}

function appendReasoningFanouts(
  uiMessage: UIMessage,
  parts: ReadonlyArray<MessagePart>,
  wire: Array<WireMessage>,
  usedWireIds: Set<string>,
): void {
  for (const part of parts) {
    if (part.type !== 'thinking') continue
    const reasoning: WireReasoningMessage = {
      role: 'reasoning',
      id: uniqueWireId(deriveReasoningId(uiMessage.id, part), usedWireIds),
      content: part.content,
    }
    if (part.signature) {
      reasoning.encryptedValue = part.signature
    }
    wire.push(reasoning)
  }
}

function appendToolResultFanout(
  part: Extract<MessagePart, { type: 'tool-result' }>,
  wire: Array<WireMessage>,
  usedWireIds: Set<string>,
): void {
  const id = uniqueToolWireId(
    part.id ?? deriveToolMessageId(part.toolCallId),
    usedWireIds,
  )
  const metadata = rebuiltToolMetadata(
    part.metadata,
    part.createdAt,
    part.id,
    part.content,
    true,
  )
  wire.push({
    role: 'tool',
    id,
    toolCallId: part.toolCallId,
    ...(part.name !== undefined && { name: part.name }),
    content:
      typeof part.content === 'string'
        ? part.content
        : JSON.stringify(part.content),
    ...(part.error !== undefined && { error: part.error }),
    ...(metadata !== undefined && { metadata }),
  })
}

function appendToolCallFanout(
  part: Extract<MessagePart, { type: 'tool-call' }>,
  explicitToolResults: ReadonlySet<string>,
  wire: Array<WireMessage>,
  usedWireIds: Set<string>,
): void {
  const approved = part.approval?.approved
  const isIncompleteExplicitToolResults =
    explicitToolResults.has(part.id) ||
    (part.output === undefined &&
      (part.state !== 'approval-responded' || approved === undefined))
  if (isIncompleteExplicitToolResults) {
    return
  }
  const result =
    part.output !== undefined
      ? normalizeToolResult(part.output)
      : JSON.stringify({
          approved,
          ...(approved && { pendingExecution: true }),
          message: approved
            ? 'User approved this action'
            : 'User denied this action',
        })
  const content = typeof result === 'string' ? result : JSON.stringify(result)
  wire.push({
    role: 'tool',
    id: uniqueToolWireId(deriveToolMessageId(part.id), usedWireIds),
    toolCallId: part.id,
    content,
    metadata: rebuiltToolMetadata(undefined, undefined, undefined, result),
  })
}

function appendAssistantWire(
  uiMessage: UIMessage,
  parts: ReadonlyArray<MessagePart>,
  includeSnapshotStructuredOutput: boolean,
  wire: Array<WireMessage>,
  usedWireIds: Set<string>,
): void {
  appendReasoningFanouts(uiMessage, parts, wire, usedWireIds)
  const text = collectText(parts)
  const toolCalls = collectToolCalls(parts)
  wire.push(
    toAnchor(
      uiMessage,
      'assistant',
      {
        ...(text !== '' && { content: text }),
        ...(toolCalls && { toolCalls }),
      },
      parts,
      includeSnapshotStructuredOutput,
    ),
  )
  const explicitToolResults = new Set(
    parts.flatMap((part) =>
      part.type === 'tool-result' ? [part.toolCallId] : [],
    ),
  )
  for (const part of parts) {
    if (part.type === 'tool-result') {
      appendToolResultFanout(part, wire, usedWireIds)
    } else if (part.type === 'tool-call') {
      appendToolCallFanout(part, explicitToolResults, wire, usedWireIds)
    }
  }
}

function appendUiMessageToWire(
  msg: UIMessage | ModelMessage,
  uiMessage: UIMessage,
  includeSnapshotStructuredOutput: boolean,
  wire: Array<WireMessage>,
  usedWireIds: Set<string>,
): void {
  const parts: ReadonlyArray<MessagePart> = uiMessage.parts
  usedWireIds.add(uiMessage.id)
  if (msg.role === 'system') {
    wire.push(
      toAnchor(
        uiMessage,
        'system',
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
    return
  }
  if (msg.role === 'user') {
    wire.push(
      toAnchor(
        uiMessage,
        'user',
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
    return
  }
  appendAssistantWire(
    uiMessage,
    parts,
    includeSnapshotStructuredOutput,
    wire,
    usedWireIds,
  )
}

export function uiMessagesToWire(
  messages: Array<UIMessage | ModelMessage>,
  options?: { includeSnapshotStructuredOutput: boolean },
): Array<WireMessage> {
  const wire: Array<WireMessage> = []
  const usedWireIds = new Set<string>(
    messages.flatMap((message) =>
      'id' in message && message.id && message.role !== 'tool'
        ? [message.id]
        : [],
    ),
  )
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
      appendStandaloneToolMessage(msg, wire, usedWireIds, assistantIds)
      continue
    }
    const uiMessage: UIMessage =
      'parts' in msg ? msg : modelMessageToUIMessage(msg, msg.id)
    appendUiMessageToWire(
      msg,
      uiMessage,
      includeSnapshotStructuredOutput,
      wire,
      usedWireIds,
    )
  }

  return wire
}

function toAnchor(
  msg: UIMessage,
  role: 'system',
  extras: { content: string },
  parts: ReadonlyArray<MessagePart>,
  includeSnapshotStructuredOutput: boolean,
): WireSystemMessage
function toAnchor(
  msg: UIMessage,
  role: 'user',
  extras: { content: string | Array<InputContent> },
  parts: ReadonlyArray<MessagePart>,
  includeSnapshotStructuredOutput: boolean,
): WireUserMessage
function toAnchor(
  msg: UIMessage,
  role: 'assistant',
  extras: {
    content?: string
    toolCalls?: Array<ToolCall>
  },
  parts: ReadonlyArray<MessagePart>,
  includeSnapshotStructuredOutput: boolean,
): WireAssistantMessage
function toAnchor(
  msg: UIMessage,
  role: UIMessage['role'],
  extras: {
    content?: string | Array<InputContent>
    toolCalls?: Array<ToolCall>
  },
  parts: ReadonlyArray<MessagePart>,
  includeSnapshotStructuredOutput: boolean,
): WireSystemMessage | WireUserMessage | WireAssistantMessage {
  const metadata = messageMetadata(msg, parts, includeSnapshotStructuredOutput)
  const base = {
    id: msg.id,
    ...(msg.name !== undefined && { name: msg.name }),
    ...(metadata !== undefined && { metadata }),
  }
  if (role === 'system') {
    return { ...base, role, content: String(extras.content ?? '') }
  }
  if (role === 'user') {
    return { ...base, role, content: extras.content ?? '' }
  }
  return {
    ...base,
    role,
    ...(typeof extras.content === 'string' && { content: extras.content }),
    ...(extras.toolCalls !== undefined && { toolCalls: extras.toolCalls }),
  }
}

function messageMetadata(
  msg: UIMessage,
  parts: ReadonlyArray<MessagePart>,
  includeSnapshotStructuredOutput: boolean,
): MetadataRecord | undefined {
  const base: MetadataRecord = { ...(msg.metadata ?? {}) }
  const previousTanstack = tanstackMetadata(msg)
  const tanstack: TanStackMessageMetadata = {}
  if (previousTanstack?.model !== undefined)
    tanstack.model = previousTanstack.model
  if (previousTanstack?.signature !== undefined)
    tanstack.signature = previousTanstack.signature
  const createdAt = coerceCreatedAt(msg.createdAt)
  if (createdAt !== undefined) tanstack.createdAt = createdAt.toISOString()

  const structuredOutput = serializedStructuredOutput(
    parts,
    includeSnapshotStructuredOutput,
  )
  if (structuredOutput) tanstack.structuredOutput = structuredOutput

  const toolCallMetadata: Record<string, unknown> = {}
  for (const part of parts) {
    const hasPart = part.type === 'tool-call' && part.metadata !== undefined
    if (hasPart) {
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
  else delete base.tanstack
  return Object.keys(base).length > 0 ? base : undefined
}

function serializedStructuredOutput(
  parts: ReadonlyArray<MessagePart>,
  includeSnapshotStructuredOutput: boolean,
): TanStackMessageMetadata['structuredOutput'] | undefined {
  for (const p of parts) {
    const isStructuredOutput =
      p.type === 'structured-output' &&
      (includeSnapshotStructuredOutput || p.status !== 'complete')
    if (isStructuredOutput) {
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
  const out: Array<string> = []
  for (const p of parts) {
    if (p.type === 'text') {
      out.push(p.content)
    } else {
      const isStructuredOutput =
        p.type === 'structured-output' &&
        p.status === 'complete' &&
        p.raw !== ''
      if (isStructuredOutput) {
        out.push(p.raw)
      }
    }
  }
  return out.join('')
}

function collectUserContent(
  parts: ReadonlyArray<MessagePart>,
): string | Array<InputContent> {
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
  const out: Array<InputContent> = []
  for (const p of parts) {
    if (p.type === 'text') {
      out.push({ type: 'text', text: p.content })
    } else {
      const isImage =
        p.type === 'image' ||
        p.type === 'audio' ||
        p.type === 'video' ||
        p.type === 'document'
      if (isImage) {
        out.push(p)
      }
    }
  }
  return out
}

function thoughtSignatureFromMetadata(metadata: unknown): string | undefined {
  const isInvalidMetadata =
    metadata == null || typeof metadata !== 'object' || Array.isArray(metadata)
  if (isInvalidMetadata) {
    return undefined
  }
  if (!('thoughtSignature' in metadata)) return undefined
  const value = metadata.thoughtSignature
  return typeof value === 'string' && value !== '' ? value : undefined
}

function collectToolCalls(
  parts: ReadonlyArray<MessagePart>,
): Array<ToolCall> | undefined {
  const calls: Array<ToolCall> = []
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

function uniqueToolWireId(id: string, used: Set<string>): string {
  return uniqueWireId(id, used)
}

function uniqueWireId(id: string, used: Set<string>): string {
  if (!used.has(id)) {
    used.add(id)
    return id
  }
  let suffix = 2
  while (used.has(`${id}-${suffix}`)) suffix++
  const unique = `${id}-${suffix}`
  used.add(unique)
  return unique
}

function toolWireId(
  id: string | undefined,
  toolCallId: string,
  assistantIds: ReadonlySet<string>,
): string {
  const derived = deriveToolMessageId(toolCallId)
  const isIncompleteId = id === undefined || assistantIds.has(id)
  if (isIncompleteId) return derived
  return id
}

function hashContent(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h).toString(36)
}
