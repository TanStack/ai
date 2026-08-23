import { isProviderExecutedToolCall } from '../../utilities/provider-executed'
import { normalizeToolResult } from '../../utilities/tool-result'
import { tanstackMetadata } from '../../utilities/merge-metadata'
import type { Message as AGUIMessage } from '@ag-ui/core'
import type {
  ContentPart,
  MessagePart,
  ModelMessage,
  StructuredOutputPart,
  TanStackMessageMetadata,
  TextPart,
  ToolCall,
  ToolCallPart,
  UIMessage,
  UIResourcePart,
} from '../../types'
// ===========================
// Message Converters
// ===========================

/**
 * Check if a MessagePart is a content part (text, image, audio, video, document)
 * that maps directly to a ModelMessage ContentPart.
 */
function isContentPart(part: MessagePart): part is ContentPart {
  return (
    part.type === 'text' ||
    part.type === 'image' ||
    part.type === 'audio' ||
    part.type === 'video' ||
    part.type === 'document'
  )
}

export function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? ''
  } catch {
    return ''
  }
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

function encryptedValueFrom(value: object): string | undefined {
  if ('encryptedValue' in value) {
    const fromSpec = nonEmptyString(value.encryptedValue)
    if (fromSpec !== undefined) return fromSpec
  }
  return nonEmptyString(tanstackMetadata(value)?.signature)
}

function toolCallFromWire(toolCall: ToolCall, bag: unknown): ToolCall {
  const fromBag =
    bag != null && typeof bag === 'object' && !Array.isArray(bag)
      ? bag
      : undefined
  const encrypted = encryptedValueFrom(toolCall)
  if (fromBag === undefined && encrypted === undefined) return toolCall
  return {
    ...toolCall,
    metadata: {
      ...(fromBag ?? {}),
      ...(encrypted !== undefined ? { thoughtSignature: encrypted } : {}),
    },
  }
}

function parseToolResultContent(content: string): unknown {
  try {
    return JSON.parse(content)
  } catch {
    return content
  }
}

/**
 * Collapse an array of ContentParts into the most compact ModelMessage content:
 * - Empty array → null
 * - All text parts → joined string (or null if empty)
 * - Mixed content → ContentPart array as-is
 */
function collapseContentParts(
  parts: Array<ContentPart>,
): string | null | Array<ContentPart> {
  if (parts.length === 0) return null

  const allText = parts.every((p) => p.type === 'text')
  if (allText) {
    const joined = parts.map((p) => p.content).join('')
    return joined || null
  }

  return parts
}

/**
 * Extract text content from ModelMessage content (string, null, or ContentPart array).
 * Used when only the text portion is needed (e.g., tool result content).
 */
function getTextContent(
  content: string | null | undefined | Array<ContentPart>,
): string {
  // Tool-call-only assistant turns carry no text and reach here as `null` or
  // `undefined`; both must collapse to an empty string rather than crash on
  // `.filter` (issue #532 — the interrupt-boundary MessagesSnapshot).
  if (content === null || content === undefined) return ''
  if (typeof content === 'string') return content
  return content
    .filter((part): part is TextPart => part.type === 'text')
    .map((part) => part.content)
    .join('')
}

/**
 * Convert UIMessages or ModelMessages to ModelMessages
 */
export function convertMessagesToModelMessages(
  messages: Array<UIMessage | ModelMessage>,
): Array<ModelMessage> {
  // Pre-pass: collect toolCallIds already represented in anchor UIMessage parts.
  // Fan-out tool messages whose toolCallId matches an anchored ToolResultPart
  // are AG-UI duplicates and must be dropped to avoid double-feeding the LLM.
  const anchoredToolCallIds = new Set<string>()
  for (const msg of messages) {
    if ('parts' in msg) {
      for (const part of msg.parts) {
        if (part.type === 'tool-result') {
          anchoredToolCallIds.add(part.toolCallId)
        }
      }
    }
  }

  const modelMessages: Array<ModelMessage> = []
  let pendingThinking: Array<{ content: string; signature?: string }> = []
  for (const msg of messages) {
    if ('parts' in msg) {
      modelMessages.push(...uiMessageToModelMessages(msg))
      continue
    }

    const modelMessage = restoreModelMessageCreatedAt(msg)
    const role = (modelMessage as { role: string }).role

    if (
      role === 'tool' &&
      modelMessage.toolCallId &&
      anchoredToolCallIds.has(modelMessage.toolCallId)
    ) {
      continue
    }

    if (role === 'reasoning') {
      const content = (msg as { content?: string }).content
      if (content) {
        const signature = encryptedValueFrom(msg)
        pendingThinking.push({
          content,
          ...(signature !== undefined ? { signature } : {}),
        })
      }
      continue
    }

    if (role === 'activity') {
      continue
    }

    if (role === 'developer') {
      modelMessages.push({
        role: 'system' as ModelMessage['role'],
        content: (msg as { content: string }).content,
        ...(modelMessage.createdAt !== undefined && {
          createdAt: modelMessage.createdAt,
        }),
        ...(modelMessage.metadata !== undefined && {
          metadata: modelMessage.metadata,
        }),
      })
      continue
    }

    if (
      role === 'user' &&
      Array.isArray((msg as { content?: unknown }).content)
    ) {
      const content = (msg as { content: Array<{ type: string }> }).content
      // TanStack ModelMessage text parts use `{ content }`. AG-UI wire text
      // parts use `{ text }`. Only rewrite the AG-UI shape.
      if (
        !content.some(
          (part) =>
            part.type === 'text' && 'text' in part && !('content' in part),
        )
      ) {
        modelMessages.push(modelMessage)
        continue
      }
      const parts = aguiUserContentToParts(
        content as Extract<AGUIMessage, { role: 'user' }>['content'],
      )
      const contentParts = parts.filter(isContentPart)
      modelMessages.push({
        role: 'user',
        content: collapseContentParts(contentParts),
        ...((msg as { id?: string }).id !== undefined && {
          id: (msg as { id: string }).id,
        }),
        ...(modelMessage.createdAt !== undefined && {
          createdAt: modelMessage.createdAt,
        }),
        ...(modelMessage.metadata !== undefined && {
          metadata: modelMessage.metadata,
        }),
      })
      continue
    }

    if (role === 'assistant') {
      const source = modelMessage
      const toolCallMetadata = tanstackMetadata(msg)?.toolCallMetadata
      const toolCalls = source.toolCalls?.map((toolCall) =>
        toolCallFromWire(toolCall, toolCallMetadata?.[toolCall.id]),
      )
      modelMessages.push({
        ...source,
        ...(toolCalls !== undefined ? { toolCalls } : {}),
        ...(pendingThinking.length > 0
          ? {
              thinking: [...(source.thinking ?? []), ...pendingThinking],
            }
          : {}),
      })
      pendingThinking = []
      continue
    }

    modelMessages.push(modelMessage)
  }
  return modelMessages
}

function restoreModelMessageCreatedAt(message: ModelMessage): ModelMessage {
  if (message.createdAt !== undefined) return message
  const createdAt = createdAtFromMetadata(message)
  return createdAt === undefined ? message : { ...message, createdAt }
}

function createdAtFromMetadata(source: object): Date | undefined {
  const createdAtRaw = tanstackMetadata(source)?.createdAt
  if (typeof createdAtRaw !== 'string') return undefined
  const createdAt = new Date(createdAtRaw)
  return Number.isNaN(createdAt.getTime()) ? undefined : createdAt
}

/**
 * Convert a UIMessage to ModelMessage(s)
 *
 * Walks the parts array IN ORDER to preserve the interleaving of text,
 * tool calls, and tool results. This is critical for multi-round tool
 * flows where the model generates text, calls a tool, gets the result,
 * then generates more text and calls another tool.
 *
 * The output preserves the sequential structure:
 *   text1 → toolCall1 → toolResult1 → text2 → toolCall2 → toolResult2
 * becomes:
 *   assistant: {content: "text1", toolCalls: [toolCall1]}
 *   tool: toolResult1
 *   assistant: {content: "text2", toolCalls: [toolCall2]}
 *   tool: toolResult2
 *
 * @param uiMessage - The UIMessage to convert
 * @returns An array of ModelMessages preserving part ordering
 */
export function uiMessageToModelMessages(
  uiMessage: UIMessage,
): Array<ModelMessage> {
  // Skip system messages - they're handled via systemPrompts, not ModelMessages
  if (uiMessage.role === 'system') {
    return []
  }

  // For non-assistant messages (user), use the simpler path since they
  // don't have tool calls or tool results to interleave
  if (uiMessage.role !== 'assistant') {
    return [buildUserOrToolMessage(uiMessage)]
  }

  // For assistant messages, walk parts in order to preserve interleaving
  return buildAssistantMessages(uiMessage)
}

/**
 * Build a single ModelMessage for user messages (simple path).
 * Preserves ordering of text and multimodal content parts.
 */
function buildUserOrToolMessage(uiMessage: UIMessage): ModelMessage {
  const contentParts: Array<ContentPart> = []
  for (const part of uiMessage.parts) {
    if (isContentPart(part)) {
      contentParts.push(part)
    }
  }

  return {
    id: uiMessage.id,
    role: uiMessage.role as 'user' | 'assistant' | 'tool',
    content: collapseContentParts(contentParts),
    ...(uiMessage.createdAt !== undefined && {
      createdAt: uiMessage.createdAt,
    }),
    ...(uiMessage.metadata !== undefined && { metadata: uiMessage.metadata }),
  }
}

// Accumulator for building an assistant segment (content + tool calls)
interface AssistantSegment {
  contentParts: Array<ContentPart>
  structuredOutput?: StructuredOutputPart
  toolCalls: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
    /** Provider-specific metadata that round-trips with the tool call.
     * Untyped at this framework layer; adapters narrow it via their
     * `TToolCallMetadata` generic. */
    metadata?: unknown
  }>
}

function createSegment(): AssistantSegment {
  return { contentParts: [], toolCalls: [] }
}

function isToolCallIncluded(part: ToolCallPart): boolean {
  return (
    part.state === 'input-complete' ||
    part.state === 'complete' ||
    part.state === 'approval-requested' ||
    part.state === 'approval-responded' ||
    part.state === 'error' ||
    part.output !== undefined
  )
}

/**
 * Build ModelMessages for an assistant UIMessage, preserving the
 * sequential interleaving of text, tool calls, and tool results.
 *
 * Walks parts in order. Text and tool-call parts accumulate into the
 * current "segment". When a tool-result part is encountered, the
 * current segment is flushed as an assistant message, then the tool
 * result is emitted as a tool message.
 */
function buildAssistantMessages(uiMessage: UIMessage): Array<ModelMessage> {
  // A single UI message can fan out into several model messages. Keep the
  // shared UI id on each one so persistence can retain the original identity.
  const messageList: Array<ModelMessage> = []
  let current = createSegment()
  let pendingThinking: Array<{ content: string; signature?: string }> = []

  // Track emitted tool result IDs to avoid duplicates.
  // A tool call can have BOTH an explicit tool-result part AND an output
  // field on the tool-call part. We only want one per tool call ID.
  const emittedToolResultIds = new Set<string>()
  const sharedFields = {
    id: uiMessage.id,
    ...(uiMessage.createdAt !== undefined && {
      createdAt: uiMessage.createdAt,
    }),
    ...(uiMessage.metadata !== undefined && { metadata: uiMessage.metadata }),
  }

  function flushSegment(): void {
    const content = collapseContentParts(current.contentParts)
    const hasContent = content !== null
    const hasToolCalls = current.toolCalls.length > 0
    const hasThinking = pendingThinking.length > 0

    if (hasContent || hasToolCalls || hasThinking) {
      messageList.push({
        ...sharedFields,
        role: 'assistant',
        content,
        ...(hasToolCalls && { toolCalls: current.toolCalls }),
        ...(hasThinking && { thinking: pendingThinking }),
        ...(current.structuredOutput && {
          structuredOutput: current.structuredOutput,
        }),
      })
      pendingThinking = []
    }
    current = createSegment()
  }

  for (const part of uiMessage.parts) {
    switch (part.type) {
      case 'text':
      case 'image':
      case 'audio':
      case 'video':
      case 'document':
        current.contentParts.push(part)
        break

      case 'tool-call':
        if (isToolCallIncluded(part)) {
          current.toolCalls.push({
            id: part.id,
            type: 'function' as const,
            function: {
              name: part.name,
              arguments: part.arguments,
            },
            ...(part.metadata !== undefined && { metadata: part.metadata }),
          })
        }
        break

      case 'tool-result':
        // Flush the current assistant segment before emitting the tool result
        flushSegment()

        // Emit the tool result
        if (
          (part.state === 'complete' || part.state === 'error') &&
          !emittedToolResultIds.has(part.toolCallId)
        ) {
          messageList.push({
            ...sharedFields,
            role: 'tool',
            content: part.content,
            toolCallId: part.toolCallId,
            ...(part.error !== undefined && { error: part.error }),
          })
          emittedToolResultIds.add(part.toolCallId)
        }
        break

      case 'thinking':
        if (part.content) {
          // Provider-executed tools have no tool-result part, so thinking
          // after them has to start the next segment or it replays first.
          if (current.toolCalls.some(isProviderExecutedToolCall)) {
            flushSegment()
          }
          pendingThinking.push({
            content: part.content,
            ...(part.signature && { signature: part.signature }),
          })
        }
        break

      case 'structured-output':
        // Only emit completed structured responses into history. Streaming or
        // errored buffers would push malformed JSON into the next LLM turn's
        // assistant content. `raw` is the source of truth; `data` is the
        // defensive fallback for terminal-only completes that didn't ship raw.
        if (part.status === 'complete') {
          const serialized =
            part.raw !== ''
              ? part.raw
              : part.data !== undefined
                ? safeJsonStringify(part.data)
                : ''
          if (serialized !== '') {
            current.contentParts.push({ type: 'text', content: serialized })
            current.structuredOutput = part
          }
        }
        break

      case 'ui-resource':
        // MCP Apps widget — rendered client-side only. It must never enter
        // model input, so it is intentionally dropped from the model message.
        break

      default:
        break
    }
  }

  // Flush any remaining accumulated content
  flushSegment()

  // Emit tool results from client tool-call parts with output or approval,
  // but only if not already covered by an explicit tool-result part above.
  // These are appended at the end since they don't have explicit tool-result
  // parts in the parts array to trigger inline emission.
  for (const part of uiMessage.parts) {
    if (part.type !== 'tool-call') continue

    // Output takes priority — if the tool has already produced a result,
    // emit the concrete output regardless of approval metadata.
    if (part.output !== undefined && !emittedToolResultIds.has(part.id)) {
      messageList.push({
        ...sharedFields,
        role: 'tool',
        content: normalizeToolResult(part.output),
        toolCallId: part.id,
      })
      emittedToolResultIds.add(part.id)
    }

    // Approval response without output — emit approval status for iteration tracking
    if (
      part.output === undefined &&
      part.state === 'approval-responded' &&
      part.approval?.approved !== undefined &&
      !emittedToolResultIds.has(part.id)
    ) {
      const approved = part.approval.approved
      messageList.push({
        ...sharedFields,
        role: 'tool',
        content: JSON.stringify({
          approved,
          ...(approved && { pendingExecution: true }),
          message: approved
            ? 'User approved this action'
            : 'User denied this action',
        }),
        toolCallId: part.id,
      })
      emittedToolResultIds.add(part.id)
    }
  }

  // If no messages were produced (e.g., empty parts), emit a minimal assistant message
  if (messageList.length === 0) {
    messageList.push({
      ...sharedFields,
      role: 'assistant',
      content: null,
    })
  }

  return messageList
}

/**
 * Convert a ModelMessage to UIMessage
 *
 * This conversion creates a parts-based structure:
 * - content field → TextPart
 * - toolCalls array → ToolCallPart[]
 * - role="tool" messages should be converted separately and merged
 *
 * @param modelMessage - The ModelMessage to convert
 * @param id - Optional ID for the UIMessage (generated if not provided)
 * @returns A UIMessage with parts
 */
export function modelMessageToUIMessage(
  modelMessage: ModelMessage,
  id?: string,
): UIMessage {
  const parts: Array<MessagePart> = []

  if (modelMessage.role === 'assistant' && modelMessage.thinking?.length) {
    for (const thinking of modelMessage.thinking) {
      if (!thinking.content) continue
      parts.push({
        type: 'thinking',
        content: thinking.content,
        ...(thinking.signature && { signature: thinking.signature }),
      })
    }
  }

  // Handle tool results (when role is "tool") - only produce tool-result part,
  // not a text part (the content IS the tool result, not display text)
  if (modelMessage.role === 'assistant' && modelMessage.structuredOutput) {
    parts.push(modelMessage.structuredOutput)
  } else if (modelMessage.role === 'tool' && modelMessage.toolCallId) {
    parts.push({
      type: 'tool-result',
      toolCallId: modelMessage.toolCallId,
      content: getTextContent(modelMessage.content),
      state: modelMessage.error === undefined ? 'complete' : 'error',
      ...(modelMessage.error !== undefined && { error: modelMessage.error }),
    })
  } else if (Array.isArray(modelMessage.content)) {
    // Multimodal content - preserve all content parts as MessageParts
    for (const part of modelMessage.content) {
      parts.push(part)
    }
  } else {
    // String or null content
    const textContent = getTextContent(modelMessage.content)
    if (textContent) {
      parts.push({
        type: 'text',
        content: textContent,
      })
    }
  }

  // Handle tool calls
  if (modelMessage.toolCalls && modelMessage.toolCalls.length > 0) {
    for (const toolCall of modelMessage.toolCalls) {
      // Model-message arguments are complete, so surface the parsed input.
      // A malformed arguments string just leaves `input` undefined.
      let input: unknown
      try {
        input = JSON.parse(toolCall.function.arguments)
      } catch {
        input = undefined
      }
      parts.push({
        type: 'tool-call',
        id: toolCall.id,
        name: toolCall.function.name,
        arguments: toolCall.function.arguments,
        state: 'input-complete', // Model messages have complete arguments
        ...(input !== undefined && { input }),
        ...(toolCall.metadata !== undefined && { metadata: toolCall.metadata }),
      })
    }
  }

  return {
    id: id || generateMessageId(),
    role: modelMessage.role === 'tool' ? 'assistant' : modelMessage.role,
    parts,
    ...(modelMessage.createdAt !== undefined && {
      createdAt: modelMessage.createdAt,
    }),
    ...(modelMessage.metadata !== undefined && {
      metadata: modelMessage.metadata,
    }),
  }
}

/**
 * Normalize a single AG-UI `MESSAGES_SNAPSHOT` message into a `UIMessage`.
 *
 * AG-UI snapshot messages use the wire shape `{ id, role, content }` and have
 * no `parts` array. Casting them directly to `UIMessage` is unsafe: any code
 * that later reads `message.parts` (e.g. the devtools `onToolCallStateChange`
 * handler) crashes with "Cannot read properties of undefined (reading 'find')".
 *
 * Each role is mapped to the canonical `UIMessage` shape, reusing
 * `modelMessageToUIMessage` for the roles that share `ModelMessage`'s structure.
 * The original AG-UI `id` is preserved so later `TEXT_MESSAGE_CONTENT` /
 * `TOOL_CALL_*` events still route by `messageId` (falling back to a generated
 * id only when the snapshot omits one). Messages that already carry `parts`
 * (e.g. a TanStack server echoing `UIMessage`s back over the wire) pass through
 * unchanged apart from ensuring an id.
 */
export function aguiSnapshotMessageToUIMessage(
  message: AGUIMessage | UIMessage,
): UIMessage {
  if ('parts' in message) {
    return applySnapshotMetadata(message, {
      ...message,
      id: message.id || generateMessageId(),
    })
  }

  const id = message.id || generateMessageId()

  switch (message.role) {
    case 'user':
      return applySnapshotMetadata(message, {
        id,
        role: 'user',
        parts: aguiUserContentToParts(message.content),
      })
    case 'assistant': {
      const metadata = tanstackMetadata(message)
      const toolCallMetadata = metadata?.toolCallMetadata
      const structuredOutput = snapshotStructuredOutput(
        metadata?.structuredOutput,
      )
      const toolCalls = message.toolCalls?.map((toolCall) => {
        const metadata =
          toolCallMetadata != null && typeof toolCallMetadata === 'object'
            ? (toolCallMetadata as Record<string, unknown>)[toolCall.id]
            : undefined
        return metadata !== undefined ? { ...toolCall, metadata } : toolCall
      })
      return applySnapshotMetadata(
        message,
        modelMessageToUIMessage(
          {
            role: 'assistant',
            content: message.content ?? null,
            ...(toolCalls && { toolCalls }),
            ...(structuredOutput && { structuredOutput }),
          },
          id,
        ),
      )
    }
    case 'tool':
      return applySnapshotMetadata(
        message,
        modelMessageToUIMessage(
          {
            role: 'tool',
            content: message.content,
            toolCallId: message.toolCallId,
            ...(message.error !== undefined && { error: message.error }),
          },
          id,
        ),
      )
    case 'system':
    case 'developer':
      // `ModelMessage` has no system/developer role; build the part directly.
      return applySnapshotMetadata(message, {
        id,
        role: 'system',
        parts: message.content
          ? [{ type: 'text', content: message.content }]
          : [],
      })
    case 'reasoning': {
      const signature = encryptedValueFrom(message)
      return applySnapshotMetadata(message, {
        id,
        role: 'assistant',
        parts: message.content
          ? [
              {
                type: 'thinking' as const,
                content: message.content,
                ...(signature !== undefined ? { signature } : {}),
              },
            ]
          : [],
      })
    }
    case 'activity':
    default:
      // `activity` (and any future role) has no text/parts equivalent today.
      return applySnapshotMetadata(message, {
        id,
        role: 'assistant',
        parts: [],
      })
  }
}

/** Copy snapshot metadata when it is a record. Rebuild createdAt from tanstack.createdAt. */
function applySnapshotMetadata(source: object, ui: UIMessage): UIMessage {
  if (!('metadata' in source)) return ui
  const raw = source.metadata
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return ui
  const metadata = raw as NonNullable<UIMessage['metadata']>
  const createdAt = createdAtFromMetadata(metadata)
  const uiResources = tanstackMetadata(metadata)?.uiResources
  const resources = Array.isArray(uiResources)
    ? uiResources.filter(
        (part): part is UIResourcePart =>
          part != null &&
          typeof part === 'object' &&
          part.type === 'ui-resource',
      )
    : []
  return {
    ...ui,
    ...(resources.length > 0
      ? {
          parts: [
            ...ui.parts,
            ...resources.filter(
              (resource) =>
                !ui.parts.some(
                  (part) =>
                    part.type === 'ui-resource' &&
                    part.toolCallId === resource.toolCallId &&
                    part.toolName === resource.toolName &&
                    part.resource.uri === resource.resource.uri,
                ),
            ),
          ],
        }
      : {}),
    metadata,
    ...(createdAt !== undefined ? { createdAt } : {}),
  }
}

function snapshotStructuredOutput(
  value: TanStackMessageMetadata['structuredOutput'],
): StructuredOutputPart | undefined {
  if (
    value == null ||
    (value.status !== 'streaming' &&
      value.status !== 'complete' &&
      value.status !== 'error') ||
    typeof value.raw !== 'string'
  ) {
    return undefined
  }
  return {
    type: 'structured-output',
    status: value.status,
    raw: value.raw,
    ...(value.partial !== undefined ? { partial: value.partial } : {}),
    ...(value.data !== undefined ? { data: value.data } : {}),
    ...(value.reasoning ? { reasoning: value.reasoning } : {}),
    ...(value.errorMessage !== undefined
      ? { errorMessage: value.errorMessage }
      : {}),
  }
}

/**
 * Convert AG-UI user message content into `UIMessage` parts.
 *
 * AG-UI user content is either a plain string or a multimodal array whose text
 * entries use `{ type: 'text', text }` (vs. TanStack's `{ type: 'text', content }`).
 * Text entries are rewritten to the TanStack shape; image/audio/video/document
 * entries already match `ContentPart` and pass through. `binary` entries have no
 * TanStack equivalent and are dropped.
 */
function aguiUserContentToParts(
  content: Extract<AGUIMessage, { role: 'user' }>['content'],
): Array<MessagePart> {
  if (typeof content === 'string') {
    return content ? [{ type: 'text', content }] : []
  }

  const parts: Array<MessagePart> = []
  for (const part of content) {
    if (part.type === 'text') {
      parts.push({ type: 'text', content: part.text })
    } else if (part.type !== 'binary') {
      parts.push(part)
    }
  }
  return parts
}

/**
 * Convert an array of ModelMessages to UIMessages
 *
 * This handles merging tool result messages with their corresponding assistant messages
 *
 * @param modelMessages - Array of ModelMessages to convert
 * @returns Array of UIMessages
 */
export function modelMessagesToUIMessages(
  modelMessages: Array<ModelMessage>,
): Array<UIMessage> {
  const uiMessages: Array<UIMessage> = []
  let currentAssistantMessage: UIMessage | null = null

  for (const msg of modelMessages) {
    if (msg.role === 'tool') {
      // Tool result - merge into the last assistant message if possible
      if (
        msg.toolCallId !== undefined &&
        currentAssistantMessage &&
        currentAssistantMessage.role === 'assistant'
      ) {
        const content = getTextContent(msg.content)
        const toolCallPart = currentAssistantMessage.parts.find(
          (part): part is ToolCallPart =>
            part.type === 'tool-call' && part.id === msg.toolCallId,
        )

        if (toolCallPart) {
          toolCallPart.output = parseToolResultContent(content)
          toolCallPart.state = msg.error === undefined ? 'complete' : 'error'
        }

        currentAssistantMessage.parts.push({
          type: 'tool-result',
          toolCallId: msg.toolCallId,
          content,
          state: msg.error === undefined ? 'complete' : 'error',
          ...(msg.error !== undefined && { error: msg.error }),
        })
      } else {
        // No assistant message to merge into, create a standalone one
        const toolResultUIMessage = modelMessageToUIMessage(msg, msg.id)
        uiMessages.push(toolResultUIMessage)
      }
    } else {
      // Regular message. Preserve a persisted stable id so a hydrated message
      // keeps the same identity as its live stream (enables in-place resume).
      const uiMessage = modelMessageToUIMessage(msg, msg.id)
      uiMessages.push(uiMessage)

      // Track assistant messages for potential tool result merging
      if (msg.role === 'assistant') {
        currentAssistantMessage = uiMessage
      } else {
        currentAssistantMessage = null
      }
    }
  }

  return uiMessages
}

/**
 * Normalize a message (UIMessage or ModelMessage) to a UIMessage
 * Ensures the message has an ID and createdAt timestamp
 *
 * @param message - Either a UIMessage or ModelMessage
 * @param generateId - Function to generate a message ID if needed
 * @returns A UIMessage with guaranteed id and createdAt
 */
export function normalizeToUIMessage(
  message: UIMessage | ModelMessage,
  generateId: () => string,
): UIMessage {
  if ('parts' in message) {
    // Already a UIMessage
    return {
      ...message,
      id: message.id || generateId(),
      createdAt: message.createdAt || new Date(),
    }
  } else {
    // ModelMessage - convert to UIMessage
    return {
      ...modelMessageToUIMessage(message, generateId()),
      createdAt: message.createdAt ?? new Date(),
    }
  }
}

/**
 * Generate a unique message ID
 */
export function generateMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).substring(7)}`
}
