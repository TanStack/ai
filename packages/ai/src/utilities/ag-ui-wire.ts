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
  SubagentPart,
  TanStackMessageMetadata,
  UIMessage,
  UIResourcePart,
} from '../types'
import type { MetadataRecord } from './merge-metadata'
import { tanstackMetadata } from './merge-metadata'
import { isProviderExecutedToolCall } from './provider-executed'
import { normalizeToolResult } from './tool-result'
import { wireSubagentInfo, wireSubagentRunId } from './subagent-wire'
import type { SubagentWireInfo } from './subagent-wire'
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
      continue
    }

    const uiMessage: UIMessage =
      'parts' in msg ? msg : modelMessageToUIMessage(msg, msg.id)
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
      continue
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
      continue
    }

    // assistant: reasoning fan-outs, then anchor, then tool fan-outs.
    //
    // Provider-executed tools (Anthropic web_search / web_fetch) run inside one
    // provider response, and the provider signs every thinking block against
    // the blocks before it. Emitting all reasoning first and a single anchor
    // with the joined text and every tool call turns
    // "thinking, tool, thinking, text, tool" into
    // "thinking, thinking, text, tool, tool", and the provider rejects the next
    // turn ("thinking blocks in the latest assistant message cannot be
    // modified"). Split the message into ordered segments at each thinking
    // part that follows a provider-executed tool call, the same rule
    // buildAssistantMessages applies, so the wire keeps the signed order.
    // Segments after the first get derived anchor ids; strict AG-UI consumers
    // still see plain anchors.
    type Segment = {
      thinking: Array<Extract<MessagePart, { type: 'thinking' }>>
      parts: Array<MessagePart>
    }
    let current: Segment = { thinking: [], parts: [] }
    const segments: Array<Segment> = [current]
    for (const part of parts) {
      if (part.type === 'thinking') {
        if (
          current.parts.some(
            (p) => p.type === 'tool-call' && isProviderExecutedToolCall(p),
          )
        ) {
          current = { thinking: [part], parts: [] }
          segments.push(current)
        } else {
          current.thinking.push(part)
        }
      } else {
        current.parts.push(part)
      }
    }

    segments.forEach((segment, index) => {
      for (const part of segment.thinking) {
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

      const text = collectText(segment.parts)
      const toolCalls = collectToolCalls(segment.parts)
      const anchorMessage: UIMessage =
        index === 0
          ? uiMessage
          : {
              ...uiMessage,
              id: uniqueWireId(`${uiMessage.id}-segment-${index}`, usedWireIds),
            }
      wire.push(
        toAnchor(
          anchorMessage,
          'assistant',
          {
            ...(text !== '' && { content: text }),
            ...(toolCalls && { toolCalls }),
          },
          segment.parts,
          includeSnapshotStructuredOutput,
        ),
      )
    })

    const explicitToolResults = new Set(
      parts.flatMap((part) =>
        part.type === 'tool-result' ? [part.toolCallId] : [],
      ),
    )
    for (const part of parts) {
      if (part.type === 'tool-result') {
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
      } else if (part.type === 'tool-call') {
        const approved = part.approval?.approved
        if (
          explicitToolResults.has(part.id) ||
          (part.output === undefined &&
            (part.state !== 'approval-responded' || approved === undefined))
        ) {
          continue
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
        const content =
          typeof result === 'string' ? result : JSON.stringify(result)
        wire.push({
          role: 'tool',
          id: uniqueToolWireId(deriveToolMessageId(part.id), usedWireIds),
          toolCallId: part.id,
          content,
          metadata: rebuiltToolMetadata(
            undefined,
            undefined,
            undefined,
            result,
          ),
        })
      }
    }

    for (const part of parts) {
      if (part.type === 'subagent') wire.push(...subagentToWire(part, options))
    }
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
  if (previousTanstack?.runId !== undefined)
    tanstack.runId = previousTanstack.runId
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
  else delete base.tanstack
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

/**
 * A child's messages, tagged with its AG-UI `subagentRunId`. The card data
 * rides in `metadata.tanstack.subagent`, so the other side can rebuild the
 * card and continue a suspended child.
 */
function subagentToWire(
  part: SubagentPart,
  options?: { includeSnapshotStructuredOutput: boolean },
): Array<WireMessage> {
  const { subagent } = part
  const info: SubagentWireInfo = {
    name: subagent.name,
    status: subagent.status,
    ...(subagent.description !== undefined && {
      description: subagent.description,
    }),
    ...(subagent.error !== undefined && { error: subagent.error }),
    ...(subagent.interruptIds !== undefined && {
      interruptIds: subagent.interruptIds,
    }),
    ...(subagent.parentSubagentRunId !== undefined && {
      parentSubagentRunId: subagent.parentSubagentRunId,
    }),
    ...(subagent.parentToolCallId !== undefined && {
      parentToolCallId: subagent.parentToolCallId,
    }),
    ...(subagent.metadata !== undefined && { metadata: subagent.metadata }),
  }
  const child = uiMessagesToWire(subagent.messages, options)
  const own = child.some((message) => wireSubagentRunId(message) === undefined)
  const messages: Array<WireMessage> = own
    ? child
    : [{ id: `subagent:${subagent.id}`, role: 'assistant' }, ...child]
  return messages.map((message, index) => {
    const nestedId = wireSubagentRunId(message)
    if (nestedId !== undefined) {
      const nested = wireSubagentInfo(message)
      if (!nested || nested.parentSubagentRunId !== undefined) return message
      return withSubagentInfo(message, nestedId, {
        ...nested,
        parentSubagentRunId: subagent.id,
      })
    }
    return withSubagentInfo(
      message,
      subagent.id,
      !own && index === 0 ? { ...info, placeholder: true } : info,
    )
  })
}

function withSubagentInfo(
  message: WireMessage,
  subagentRunId: string,
  info: SubagentWireInfo,
): WireMessage {
  const metadata = isRecord(message.metadata) ? message.metadata : {}
  const tanstack = isRecord(metadata.tanstack) ? metadata.tanstack : {}
  return {
    ...message,
    subagentRunId,
    metadata: { ...metadata, tanstack: { ...tanstack, subagent: info } },
  }
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
