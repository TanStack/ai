import { isProviderExecutedToolCall } from '../../utilities/provider-executed'
import {
  isContentPartArray,
  normalizeToolResult,
} from '../../utilities/tool-result'
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

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
  const shouldClearMetadata = bag === null && encrypted === undefined
  if (shouldClearMetadata) {
    return { ...toolCall, metadata: null }
  }
  const hasNoMetadata = fromBag === undefined && encrypted === undefined
  if (hasNoMetadata) return toolCall
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
  if (content === null || content === undefined) return ''
  if (typeof content === 'string') return content
  return content
    .filter((part): part is TextPart => part.type === 'text')
    .map((part) => part.content)
    .join('')
}

function toolResultContent(
  content: string | null | undefined | Array<ContentPart>,
): string | Array<ContentPart> {
  return Array.isArray(content) ? content : getTextContent(content)
}

function collectAnchoredToolCallIds(
  messages: Array<UIMessage | ModelMessage>,
): Set<string> {
  const anchoredToolCallIds = new Set<string>()
  for (const msg of messages) {
    if (!('parts' in msg)) continue
    for (const part of msg.parts) {
      if (part.type === 'tool-result') {
        anchoredToolCallIds.add(part.toolCallId)
      }
    }
  }
  return anchoredToolCallIds
}

function convertDeveloperModelMessage(
  modelMessage: ModelMessage,
): ModelMessage {
  return {
    role: 'system' as ModelMessage['role'],
    content: (modelMessage as { content: string }).content,
    ...optionalName(modelMessage),
    ...optionalCreatedAt(modelMessage),
    ...(modelMessage.metadata !== undefined && {
      metadata: modelMessage.metadata,
    }),
  }
}

function convertAguiUserModelMessage(
  msg: ModelMessage,
  modelMessage: ModelMessage,
): ModelMessage | undefined {
  const content = (msg as { content?: unknown }).content
  if (!Array.isArray(content)) return undefined
  const typed = content as Array<{ type: string }>
  if (
    !typed.some(
      (part) => part.type === 'text' && 'text' in part && !('content' in part),
    )
  ) {
    return modelMessage
  }
  const parts = aguiUserContentToParts(
    typed as Extract<AGUIMessage, { role: 'user' }>['content'],
  )
  const contentParts = parts.filter(isContentPart)
  return {
    role: 'user',
    content: collapseContentParts(contentParts),
    ...((msg as { id?: string }).id !== undefined && {
      id: (msg as { id: string }).id,
    }),
    ...optionalName(modelMessage),
    ...optionalCreatedAt(modelMessage),
    ...(modelMessage.metadata !== undefined && {
      metadata: modelMessage.metadata,
    }),
  }
}

function convertAssistantModelMessage(
  msg: ModelMessage,
  modelMessage: ModelMessage,
  pendingThinking: Array<{ content: string; signature?: string }>,
): ModelMessage {
  const toolCallMetadata = tanstackMetadata(msg)?.toolCallMetadata
  const toolCalls = modelMessage.toolCalls?.map((toolCall) =>
    toolCallFromWire(toolCall, toolCallMetadata?.[toolCall.id]),
  )
  return {
    ...modelMessage,
    ...(toolCalls !== undefined ? { toolCalls } : {}),
    ...(pendingThinking.length > 0
      ? {
          thinking: [...(modelMessage.thinking ?? []), ...pendingThinking],
        }
      : {}),
  }
}

function convertWireModelMessage(
  msg: ModelMessage,
  anchoredToolCallIds: ReadonlySet<string>,
  pendingThinking: Array<{ content: string; signature?: string }>,
):
  | { kind: 'skip' }
  | { kind: 'pending' }
  | { kind: 'message'; message: ModelMessage; clearThinking: boolean } {
  const modelMessage = restoreModelMessageCreatedAt(
    restoreToolResultOwnership(msg),
  )
  const role = (modelMessage as { role: string }).role
  const isAnchoredToolResult =
    role === 'tool' &&
    modelMessage.toolCallId &&
    anchoredToolCallIds.has(modelMessage.toolCallId)
  if (isAnchoredToolResult) {
    return { kind: 'skip' }
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
    return { kind: 'pending' }
  }
  if (role === 'activity') return { kind: 'skip' }
  if (role === 'developer') {
    return {
      kind: 'message',
      message: convertDeveloperModelMessage(modelMessage),
      clearThinking: false,
    }
  }
  if (role === 'user') {
    const converted = convertAguiUserModelMessage(msg, modelMessage)
    if (converted) {
      return { kind: 'message', message: converted, clearThinking: false }
    }
  }
  if (role === 'assistant') {
    return {
      kind: 'message',
      message: convertAssistantModelMessage(msg, modelMessage, pendingThinking),
      clearThinking: true,
    }
  }
  return { kind: 'message', message: modelMessage, clearThinking: false }
}

/**
 * Convert UIMessages or ModelMessages to ModelMessages
 */
export function convertMessagesToModelMessages(
  messages: Array<UIMessage | ModelMessage>,
): Array<ModelMessage> {
  const anchoredToolCallIds = collectAnchoredToolCallIds(messages)
  const modelMessages: Array<ModelMessage> = []
  const pendingThinking: Array<{ content: string; signature?: string }> = []
  for (const msg of messages) {
    if ('parts' in msg) {
      modelMessages.push(...uiMessageToModelMessages(msg))
      continue
    }
    const converted = convertWireModelMessage(
      msg,
      anchoredToolCallIds,
      pendingThinking,
    )
    if (converted.kind !== 'message') continue
    modelMessages.push(converted.message)
    if (converted.clearThinking) pendingThinking.length = 0
  }
  return modelMessages
}

function restoreModelMessageCreatedAt(message: ModelMessage): ModelMessage {
  const createdAt =
    coerceCreatedAt(message.createdAt) ?? createdAtFromMetadata(message)
  if (createdAt === undefined) {
    if (message.createdAt === undefined) return message
    const { createdAt: _invalid, ...rest } = message
    return rest
  }
  return Object.is(message.createdAt, createdAt)
    ? message
    : { ...message, createdAt }
}

export function restoreToolResultOwnership<T extends object>(message: T): T {
  if (!('role' in message)) return message
  if (message.role !== 'tool') return message
  const source = message
  /** Provider-specific metadata that round-trips with the tool call.
       * Untyped at this framework layer; adapters narrow it via their
       * `TToolCallMetadata` generic. */
  const metadata = tanstackMetadata(source)
  const owned = metadata?.toolResult
  if (!isRecord(owned)) return message
  const hasPlainContent =
    'content' in owned && !isContentPartArray(owned.content)
  if (hasPlainContent) return message
  const next = { ...message }
  if (!('id' in owned)) Reflect.deleteProperty(next, 'id')
  if (!('createdAt' in owned)) Reflect.deleteProperty(next, 'createdAt')
  if (typeof owned.id === 'string') Reflect.set(next, 'id', owned.id)
  if (typeof owned.createdAt === 'string') {
    const createdAt = coerceCreatedAt(owned.createdAt)
    if (createdAt) Reflect.set(next, 'createdAt', createdAt)
  }
  if (isContentPartArray(owned.content)) {
    Reflect.set(next, 'content', owned.content)
  }
  const sourceMetadata: unknown = Reflect.get(source, 'metadata')
  if (isRecord(sourceMetadata)) {
    const tanstack = sourceMetadata.tanstack
    if (isRecord(tanstack)) {
      const { toolResult: _toolResult, ...restTanstack } = tanstack
      const restMetadata = { ...sourceMetadata }
      if (Object.keys(restTanstack).length) restMetadata.tanstack = restTanstack
      else delete restMetadata.tanstack
      if (Object.keys(restMetadata).length)
        Reflect.set(next, 'metadata', restMetadata)
      else Reflect.deleteProperty(next, 'metadata')
    }
  }
  return next
}

/**
 * Rebuild a `Date` from a live `Date` or from an ISO string.
 * `JSON.stringify` turns `Date` into a string, so persistence reload
 * and AG-UI wire both land here as strings.
 */
export function coerceCreatedAt(value: unknown): Date | undefined {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value
  }
  if (typeof value !== 'string') return undefined
  const createdAt = new Date(value)
  return Number.isNaN(createdAt.getTime()) ? undefined : createdAt
}

function normalizeMessagePart(part: MessagePart): MessagePart {
  if (part.type !== 'tool-result') return part
  const createdAt = coerceCreatedAt(part.createdAt)
  const { createdAt: _createdAt, ...rest } = part
  return createdAt === undefined ? rest : { ...rest, createdAt }
}

function createdAtFromMetadata(source: object): Date | undefined {
  return coerceCreatedAt(tanstackMetadata(source)?.createdAt)
}

function optionalCreatedAt(source: { createdAt?: unknown }): {
  createdAt?: Date
} {
  const createdAt = coerceCreatedAt(source.createdAt)
  return createdAt !== undefined ? { createdAt } : {}
}

function optionalName(source: { name?: string }): { name?: string } {
  return source.name !== undefined ? { name: source.name } : {}
}

function isUiResourcePart(value: unknown): value is UIResourcePart {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  if (!('type' in value) || value.type !== 'ui-resource') return false
  if (!('toolCallId' in value) || typeof value.toolCallId !== 'string') {
    return false
  }
  if (!('toolName' in value) || typeof value.toolName !== 'string') {
    return false
  }
  if (
    !('resource' in value) ||
    value.resource == null ||
    typeof value.resource !== 'object' ||
    Array.isArray(value.resource)
  ) {
    return false
  }
  const resource = value.resource
  return (
    'uri' in resource &&
    typeof resource.uri === 'string' &&
    'mimeType' in resource &&
    typeof resource.mimeType === 'string'
  )
}

function uiResourceKey(part: UIResourcePart): string {
  return `${part.toolCallId}\0${part.toolName}\0${part.resource.uri}`
}

function appendUiResources(
  ui: UIMessage,
  resources: ReadonlyArray<UIResourcePart>,
): UIMessage {
  if (resources.length === 0) return ui
  const seen = new Set(
    ui.parts.filter(isUiResourcePart).map((part) => uiResourceKey(part)),
  )
  const extra = resources.filter((part) => !seen.has(uiResourceKey(part)))
  if (extra.length === 0) return ui
  return { ...ui, parts: [...ui.parts, ...extra] }
}

function assistantMetadata(
  uiMessage: UIMessage,
): UIMessage['metadata'] | undefined {
  const fromParts = uiMessage.parts.filter(isUiResourcePart)
  const current = uiMessage.metadata ?? {}
  const previous = tanstackMetadata(uiMessage)
  const tanstack: TanStackMessageMetadata = {}
  if (previous?.model !== undefined) tanstack.model = previous.model
  if (previous?.signature !== undefined) tanstack.signature = previous.signature
  if (fromParts.length > 0) tanstack.uiResources = fromParts
  const result = { ...current }
  if (Object.keys(tanstack).length > 0) result.tanstack = tanstack
  else delete result.tanstack
  return Object.keys(result).length > 0 ? result : undefined
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
    ...optionalName(uiMessage),
    ...optionalCreatedAt(uiMessage),
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
  const messageList: Array<ModelMessage> = []
  let current = createSegment()
  let pendingThinking: Array<{ content: string; signature?: string }> = []
  const emittedToolResultIds = new Set<string>()
  const identityFields = {
    id: uiMessage.id,
    ...optionalName(uiMessage),
    ...optionalCreatedAt(uiMessage),
  }
  const metadata = assistantMetadata(uiMessage)
  const assistantFields = {
    ...identityFields,
    ...(metadata !== undefined && { metadata }),
  }

  function flushSegment(force = false): void {
    const content = collapseContentParts(current.contentParts)
    const hasContent = content !== null
    const hasToolCalls = current.toolCalls.length > 0
    const hasThinking = pendingThinking.length > 0

    const shouldFlush = force || hasContent || hasToolCalls || hasThinking
    if (shouldFlush) {
      messageList.push({
        ...assistantFields,
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

  function handleContentPart(part: MessagePart): boolean {
    const isInputPart =
      part.type === 'text' ||
      part.type === 'image' ||
      part.type === 'audio' ||
      part.type === 'video' ||
      part.type === 'document'
    if (isInputPart) {
      current.contentParts.push(part)
      return true
    }
    return false
  }

  function handleToolCallPart(part: MessagePart): boolean {
    if (part.type !== 'tool-call') return false
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
    return true
  }

  function handleToolResultPart(part: MessagePart): boolean {
    if (part.type !== 'tool-result') return false
    flushSegment(messageList.length === 0)
    const canEmitToolResult =
      (part.state === 'complete' || part.state === 'error') &&
      !emittedToolResultIds.has(part.toolCallId)
    if (canEmitToolResult) {
      messageList.push({
        ...(part.id !== undefined && { id: part.id }),
        ...optionalCreatedAt(part),
        role: 'tool',
        content: part.content,
        toolCallId: part.toolCallId,
        ...(part.name !== undefined && { name: part.name }),
        ...(part.metadata !== undefined && { metadata: part.metadata }),
        ...(part.error !== undefined && { error: part.error }),
      })
      emittedToolResultIds.add(part.toolCallId)
    }
    return true
  }

  function handleSoftAssistantPart(part: MessagePart): void {
    if (part.type === 'thinking') {
      if (!part.content) return
      if (current.toolCalls.some(isProviderExecutedToolCall)) {
        flushSegment()
      }
      pendingThinking.push({
        content: part.content,
        ...(part.signature && { signature: part.signature }),
      })
      return
    }
    const isIncompleteStructuredOutput =
      part.type !== 'structured-output' || part.status !== 'complete'
    if (isIncompleteStructuredOutput) return
    const serialized =
      part.raw !== ''
        ? part.raw
        : part.data !== undefined
          ? safeJsonStringify(part.data)
          : ''
    if (serialized === '') return
    current.contentParts.push({ type: 'text', content: serialized })
    current.structuredOutput = part
  }

  for (const part of uiMessage.parts) {
    if (handleContentPart(part)) continue
    if (handleToolCallPart(part)) continue
    if (handleToolResultPart(part)) continue
    handleSoftAssistantPart(part)
  }

  flushSegment()
  appendImplicitToolResults(uiMessage, messageList, emittedToolResultIds)

  if (messageList.length === 0) {
    messageList.push({
      ...assistantFields,
      role: 'assistant',
      content: null,
    })
  }

  return messageList
}

function appendImplicitToolResults(
  uiMessage: UIMessage,
  messageList: Array<ModelMessage>,
  emittedToolResultIds: Set<string>,
): void {
  for (const part of uiMessage.parts) {
    if (part.type !== 'tool-call') continue
    if (part.output !== undefined && !emittedToolResultIds.has(part.id)) {
      messageList.push({
        role: 'tool',
        content: normalizeToolResult(part.output),
        toolCallId: part.id,
      })
      emittedToolResultIds.add(part.id)
    }
    if (
      part.output === undefined &&
      part.state === 'approval-responded' &&
      part.approval?.approved !== undefined &&
      !emittedToolResultIds.has(part.id)
    ) {
      const approved = part.approval.approved
      messageList.push({
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
}

function appendAssistantThinkingParts(
  modelMessage: ModelMessage,
  parts: Array<MessagePart>,
): void {
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
}

function appendModelContentParts(
  modelMessage: ModelMessage,
  parts: Array<MessagePart>,
  structuredOutput: StructuredOutputPart | undefined,
  createdAt: Date | undefined,
): void {
  if (modelMessage.role === 'assistant' && structuredOutput) {
    if (
      typeof modelMessage.content === 'string' &&
      modelMessage.content &&
      modelMessage.content !== structuredOutput.raw
    ) {
      const suffix = structuredOutput.raw
      const text =
        suffix !== '' && modelMessage.content.endsWith(suffix)
          ? modelMessage.content.slice(0, -suffix.length)
          : modelMessage.content
      if (text) parts.push({ type: 'text', content: text })
    }
    parts.push(structuredOutput)
    return
  }
  if (modelMessage.role === 'tool' && modelMessage.toolCallId) {
    parts.push({
      type: 'tool-result',
      toolCallId: modelMessage.toolCallId,
      content: toolResultContent(modelMessage.content),
      state: modelMessage.error === undefined ? 'complete' : 'error',
      ...(modelMessage.id !== undefined && { id: modelMessage.id }),
      ...(modelMessage.name !== undefined && { name: modelMessage.name }),
      ...(modelMessage.metadata !== undefined && {
        metadata: modelMessage.metadata,
      }),
      ...(createdAt !== undefined && { createdAt }),
      ...(modelMessage.error !== undefined && { error: modelMessage.error }),
    })
    return
  }
  if (Array.isArray(modelMessage.content)) {
    for (const part of modelMessage.content) {
      parts.push(part)
    }
    return
  }
  const textContent = getTextContent(modelMessage.content)
  if (textContent) {
    parts.push({
      type: 'text',
      content: textContent,
    })
  }
}

function appendModelToolCallParts(
  modelMessage: ModelMessage,
  parts: Array<MessagePart>,
): void {
  if (!modelMessage.toolCalls) return
  for (const toolCall of modelMessage.toolCalls) {
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
      state: 'input-complete',
      ...(input !== undefined && { input }),
      ...(toolCall.metadata !== undefined && { metadata: toolCall.metadata }),
    })
  }
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
  const createdAt = coerceCreatedAt(modelMessage.createdAt)
  appendAssistantThinkingParts(modelMessage, parts)
  const structuredOutput =
    modelMessage.structuredOutput ??
    snapshotStructuredOutput(tanstackMetadata(modelMessage)?.structuredOutput)
  appendModelContentParts(modelMessage, parts, structuredOutput, createdAt)
  appendModelToolCallParts(modelMessage, parts)
  const ui: UIMessage = {
    id: id || generateMessageId(),
    role: modelMessage.role === 'tool' ? 'assistant' : modelMessage.role,
    parts,
    ...optionalName(modelMessage),
    ...(createdAt !== undefined && { createdAt }),
    ...(modelMessage.metadata !== undefined && {
      metadata: modelMessage.metadata,
    }),
  }
  const storedResources = tanstackMetadata(modelMessage)?.uiResources
  return appendUiResources(
    ui,
    Array.isArray(storedResources)
      ? storedResources.filter(isUiResourcePart)
      : [],
  )
}

function assistantSnapshotToUIMessage(
  message: Extract<AGUIMessage, { role: 'assistant' }>,
  id: string,
): UIMessage {
  const metadata = tanstackMetadata(message)
  const toolCallMetadata = metadata?.toolCallMetadata
  const structuredOutput = snapshotStructuredOutput(metadata?.structuredOutput)
  const toolCalls = message.toolCalls?.map((toolCall) => {
    const callMetadata =
      toolCallMetadata != null && typeof toolCallMetadata === 'object'
        ? (toolCallMetadata as Record<string, unknown>)[toolCall.id]
        : undefined
    return callMetadata !== undefined
      ? { ...toolCall, metadata: callMetadata }
      : toolCall
  })
  return applySnapshotMetadata(
    message,
    modelMessageToUIMessage(
      {
        role: 'assistant',
        content: message.content ?? null,
        ...optionalName(message),
        ...(toolCalls && { toolCalls }),
        ...(structuredOutput && { structuredOutput }),
      },
      id,
    ),
  )
}

function toolSnapshotToUIMessage(
  message: Extract<AGUIMessage, { role: 'tool' }>,
  id: string,
): UIMessage {
  const owned = restoreToolResultOwnership(message)
  const createdAt =
    coerceCreatedAt('createdAt' in owned ? owned.createdAt : undefined) ??
    createdAtFromMetadata(owned)
  return applySnapshotMetadata(
    owned,
    modelMessageToUIMessage(
      {
        role: 'tool',
        content: owned.content,
        toolCallId: owned.toolCallId,
        ...('name' in owned && typeof owned.name === 'string'
          ? { name: owned.name }
          : {}),
        ...('id' in owned && typeof owned.id === 'string'
          ? { id: owned.id }
          : {}),
        ...('metadata' in owned && owned.metadata != null
          ? { metadata: owned.metadata }
          : {}),
        ...(createdAt !== undefined ? { createdAt } : {}),
        ...(owned.error !== undefined && { error: owned.error }),
      },
      id,
    ),
  )
}

function snapshotWithoutParts(message: AGUIMessage, id: string): UIMessage {
  switch (message.role) {
    case 'user':
      return applySnapshotMetadata(message, {
        id,
        role: 'user',
        parts: aguiUserContentToParts(message.content),
      })
    case 'assistant':
      return assistantSnapshotToUIMessage(message, id)
    case 'tool':
      return toolSnapshotToUIMessage(message, id)
    case 'system':
    case 'developer':
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
      return applySnapshotMetadata(message, {
        id,
        role: 'assistant',
        parts: [],
      })
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
  return snapshotWithoutParts(message, message.id || generateMessageId())
}

/** Copy snapshot metadata when it is a record. Rebuild createdAt from tanstack.createdAt. */
function applySnapshotMetadata(source: object, ui: UIMessage): UIMessage {
  const normalizedParts = ui.parts.map((part) => normalizeMessagePart(part))
  if (normalizedParts !== ui.parts) ui = { ...ui, parts: normalizedParts }
  const name =
    'name' in source && typeof source.name === 'string'
      ? source.name
      : undefined
  let next = name !== undefined ? { ...ui, name } : ui

  let metadata: NonNullable<UIMessage['metadata']> | undefined
  if ('metadata' in source) {
    const raw = source.metadata
    if (raw != null && typeof raw === 'object' && !Array.isArray(raw)) {
      metadata = raw as NonNullable<UIMessage['metadata']>
      next = { ...next, metadata }
    }
  }

  const createdAt =
    coerceCreatedAt(next.createdAt) ??
    (metadata !== undefined ? createdAtFromMetadata(metadata) : undefined)
  const shouldSetCreatedAt =
    createdAt !== undefined && !Object.is(createdAt, next.createdAt)
  if (shouldSetCreatedAt) {
    next = { ...next, createdAt }
  } else {
    const shouldDropCreatedAt =
      createdAt === undefined && next.createdAt !== undefined
    if (shouldDropCreatedAt) {
      const { createdAt: _invalid, ...rest } = next
      next = rest
    }
  }

  const uiResources = tanstackMetadata(metadata)?.uiResources
  const resources = Array.isArray(uiResources)
    ? uiResources.filter(isUiResourcePart)
    : []
  return appendUiResources(next, resources)
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
        const content = toolResultContent(msg.content)
        const toolCallPart = currentAssistantMessage.parts.find(
          (part): part is ToolCallPart =>
            part.type === 'tool-call' && part.id === msg.toolCallId,
        )

        if (toolCallPart) {
          toolCallPart.output =
            typeof content === 'string'
              ? parseToolResultContent(content)
              : content
          toolCallPart.state = msg.error === undefined ? 'complete' : 'error'
        }

        currentAssistantMessage.parts.push({
          type: 'tool-result',
          toolCallId: msg.toolCallId,
          content,
          state: msg.error === undefined ? 'complete' : 'error',
          ...(msg.id !== undefined &&
            msg.id !== currentAssistantMessage.id && { id: msg.id }),
          ...(msg.name !== undefined && { name: msg.name }),
          ...(msg.metadata !== undefined && { metadata: msg.metadata }),
          ...optionalCreatedAt(msg),
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
    const parts = message.parts.map((part) => normalizeMessagePart(part))
    return {
      ...message,
      parts,
      id: message.id || generateId(),
      createdAt: coerceCreatedAt(message.createdAt) ?? new Date(),
    }
  } else {
    // ModelMessage - convert to UIMessage
    return {
      ...modelMessageToUIMessage(message, generateId()),
      createdAt: coerceCreatedAt(message.createdAt) ?? new Date(),
    }
  }
}

/**
 * Generate a unique message ID
 */
export function generateMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).substring(7)}`
}
