import { isProviderExecutedToolCall } from '@tanstack/ai'
import { getToolName, isToolUIPart } from 'ai'
import type {
  ContentPart,
  ContentPartSource,
  MessagePart,
  ProviderExecutedToolMetadata,
  ToolCallPart,
  ToolResultPart,
  UIMessage,
} from '@tanstack/ai'
import type {
  DynamicToolUIPart,
  FileUIPart,
  ProviderMetadata,
  UIMessage as AISDKUIMessage,
  ToolUIPart,
  UIMessagePart,
  UIDataTypes,
  UITools,
} from 'ai'

import { isRecord, parseJson } from './data-parts'

type AISDKPart = UIMessagePart<UIDataTypes, UITools>

function isProviderMetadata(value: unknown): value is ProviderMetadata {
  return isRecord(value) && Object.values(value).every(isRecord)
}

const DATA_URL = /^data:([^;,]+)?(?:;[^,]*)?;base64,(.*)$/s

function fileToContentPart(part: FileUIPart): ContentPart {
  const match = DATA_URL.exec(part.url)
  const source: ContentPartSource = match
    ? {
        type: 'data',
        value: match[2] ?? '',
        mimeType: match[1] ?? part.mediaType,
      }
    : { type: 'url', value: part.url, mimeType: part.mediaType }
  const kind = part.mediaType.split('/')[0]
  if (kind === 'image' || kind === 'audio' || kind === 'video') {
    return { type: kind, source }
  }
  return { type: 'document', source }
}

function toolParts(
  part: ToolUIPart<UITools> | DynamicToolUIPart,
): Array<MessagePart> {
  const call: ToolCallPart = {
    type: 'tool-call',
    id: part.toolCallId,
    name: getToolName(part),
    arguments: JSON.stringify(part.input ?? {}),
    input: part.input,
    state:
      part.state === 'input-streaming'
        ? 'input-streaming'
        : part.state === 'output-available'
          ? 'complete'
          : part.state === 'output-error' || part.state === 'output-denied'
            ? 'error'
            : 'input-complete',
    // `toUIMessageStream` sends the TanStack tool-call metadata (Gemini
    // `thoughtSignature`, `providerExecuted`) as `providerMetadata.tanstack`.
    ...(part.callProviderMetadata?.tanstack !== undefined && {
      metadata: part.callProviderMetadata.tanstack,
    }),
  }
  // The provider ran the call and replays its result from the metadata, so
  // it has no tool result.
  if (isProviderExecutedToolCall(call)) return [call]
  // A result goes right after its call, so a text after the tool replays
  // after the result.
  if (part.state === 'output-available') {
    const result: ToolResultPart = {
      type: 'tool-result',
      toolCallId: part.toolCallId,
      content:
        typeof part.output === 'string'
          ? part.output
          : JSON.stringify(part.output ?? null),
      state: 'complete',
    }
    return [call, result]
  }
  if (part.state === 'output-error' || part.state === 'output-denied') {
    const error =
      part.state === 'output-error'
        ? part.errorText
        : (part.approval.reason ?? 'The user denied this tool call')
    const result: ToolResultPart = {
      type: 'tool-result',
      toolCallId: part.toolCallId,
      content: error,
      state: 'error',
      error,
      ...(part.state === 'output-denied' && { outcome: 'denied' }),
    }
    return [call, result]
  }
  return [call]
}

function fromAISDKPart(part: AISDKPart): Array<MessagePart> {
  if (isToolUIPart(part)) return toolParts(part)
  // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- sources, data, step and custom parts are UI only; default drops them.
  switch (part.type) {
    case 'text':
      return [{ type: 'text', content: part.text }]
    case 'reasoning': {
      const tanstack = part.providerMetadata?.tanstack
      const signature = isRecord(tanstack) ? tanstack.signature : undefined
      return [
        {
          type: 'thinking',
          content: part.text,
          ...(typeof signature === 'string' && { signature }),
          ...(isRecord(tanstack) &&
            tanstack.redacted === true && { redacted: true }),
        },
      ]
    }
    case 'file':
      return [fileToContentPart(part)]
    default:
      // Sources, data parts, step markers and custom parts are UI only.
      return []
  }
}

/**
 * Convert AI SDK `UIMessage`s (the `messages` body that AI SDK `useChat`
 * posts) into TanStack `UIMessage`s for `chat({ messages })`.
 *
 * Text, files, reasoning, tool calls with their results and metadata, and the
 * message metadata are kept. A client tool's output and a denied tool call
 * go back to the model as tool results. A provider-executed call has none.
 * A call that waits for approval, or has an answer, stays pending:
 * `chatParamsFromAISDKRequest` sends the answer to `chat()` as `resume`.
 */
export function fromAISDKMessages(
  messages: ReadonlyArray<AISDKUIMessage>,
): Array<UIMessage> {
  return messages.map((message) => {
    const metadata = messageMetadata(message)
    return {
      id: message.id,
      role: message.role,
      parts: message.parts.flatMap(fromAISDKPart),
      ...(metadata !== undefined && { metadata }),
    }
  })
}

/**
 * The message metadata, with `tanstack` from `toUIMessageStream`. The OpenAI
 * Responses adapter replays `tanstack.responseItems`, which name the items
 * of one model call. A message of more steps drops them and replays as text.
 */
function messageMetadata(
  message: AISDKUIMessage,
): Record<string, unknown> | undefined {
  if (!isRecord(message.metadata)) return undefined
  const tanstack = message.metadata.tanstack
  const steps = message.parts.filter((part) => part.type === 'step-start')
  if (!isRecord(tanstack) || !('responseItems' in tanstack) || steps.length < 2)
    return message.metadata
  const { responseItems: _dropped, ...rest } = tanstack
  return { ...message.metadata, tanstack: rest }
}

function sourceToUrl(source: ContentPartSource): string {
  return source.type === 'data'
    ? `data:${source.mimeType};base64,${source.value}`
    : source.value
}

function toolOutput(content: ToolResultPart['content']): unknown {
  if (typeof content !== 'string') return content
  return parseJson(content) ?? content
}

/** The AI SDK approval fields that the TanStack tool-call part has no place for. */
export type AISDKApprovalFields = Omit<
  Extract<DynamicToolUIPart, { state: 'approval-requested' }>['approval'],
  'id' | 'approved' | 'reason'
>

/**
 * `ToolCallPart.metadata` as `fromUIMessageStream` sets it. `providerExecuted`
 * is the TanStack convention. `aiSdk` keeps the AI SDK tool part fields that
 * `toAISDKMessages` sends back.
 */
export interface AISDKToolCallMetadata extends ProviderExecutedToolMetadata {
  aiSdk?: {
    callProviderMetadata?: ProviderMetadata
    resultProviderMetadata?: ProviderMetadata
    approval?: AISDKApprovalFields
  }
}

function isApprovalFields(value: unknown): value is AISDKApprovalFields {
  return (
    isRecord(value) &&
    (value.signature === undefined || typeof value.signature === 'string') &&
    (value.requestReason === undefined ||
      typeof value.requestReason === 'string') &&
    (value.isAutomatic === undefined || typeof value.isAutomatic === 'boolean')
  )
}

/** The AI SDK fields kept on a tool call, read back from its metadata. */
function aiSdkToolFields(part: ToolCallPart) {
  const aiSdk =
    isRecord(part.metadata) && isRecord(part.metadata.aiSdk)
      ? part.metadata.aiSdk
      : {}
  return {
    call: isProviderMetadata(aiSdk.callProviderMetadata)
      ? aiSdk.callProviderMetadata
      : undefined,
    result: isProviderMetadata(aiSdk.resultProviderMetadata)
      ? aiSdk.resultProviderMetadata
      : undefined,
    approval: isApprovalFields(aiSdk.approval) ? aiSdk.approval : {},
  }
}

function toAISDKParts(message: UIMessage): Array<AISDKPart> {
  const results = new Map<string, ToolResultPart>()
  const providerExecuted = new Set<string>()
  for (const part of message.parts) {
    if (part.type === 'tool-result') results.set(part.toolCallId, part)
    if (part.type === 'tool-call' && isProviderExecutedToolCall(part))
      providerExecuted.add(part.id)
  }

  // A tool result ends a step, as in `chat()`: the parts after it are the
  // model's next answer. `convertToModelMessages` splits at `step-start`.
  // A provider runs its own tools inside one step.
  // ponytail: the TanStack message does not keep the AI SDK step bounds, so a
  // server tool's result that streamed before a later call of the same step
  // splits that step in two. Keep the step index on the parts if that matters.
  const parts: Array<AISDKPart> = []
  let stepEnded = false
  function push(part: AISDKPart) {
    if (stepEnded) parts.push({ type: 'step-start' })
    stepEnded = false
    parts.push(part)
  }

  for (const part of message.parts) {
    // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- tool results join their calls; TanStack UI-only parts are dropped by default.
    switch (part.type) {
      case 'text':
        push({ type: 'text', text: part.content })
        break
      case 'structured-output': {
        // Same rule as `chat()`: a complete answer goes back as its JSON text.
        if (part.status !== 'complete') break
        const text =
          part.raw !== ''
            ? part.raw
            : part.data === undefined
              ? ''
              : JSON.stringify(part.data)
        if (text !== '') push({ type: 'text', text })
        break
      }
      case 'tool-result':
        if (!providerExecuted.has(part.toolCallId)) stepEnded = true
        break
      case 'thinking': {
        // `fromUIMessageStream` stores the AI SDK provider metadata as the
        // signature. Send it back as it came.
        const providerMetadata =
          part.signature === undefined ? undefined : parseJson(part.signature)
        push({
          type: 'reasoning',
          text: part.content,
          ...(isProviderMetadata(providerMetadata) && { providerMetadata }),
        })
        break
      }
      case 'image':
      case 'audio':
      case 'video':
      case 'document':
        push({
          type: 'file',
          mediaType:
            part.source.mimeType ??
            (part.type === 'document' ? 'application/octet-stream' : part.type),
          url: sourceToUrl(part.source),
        })
        break
      case 'tool-call': {
        const input = part.input ?? parseJson(part.arguments) ?? {}
        const result = results.get(part.id)
        const fields = aiSdkToolFields(part)
        const base = {
          type: 'dynamic-tool' as const,
          toolName: part.name,
          toolCallId: part.id,
          input,
          ...(providerExecuted.has(part.id) && { providerExecuted: true }),
          ...(fields.call && { callProviderMetadata: fields.call }),
        }
        const resultMetadata = fields.result && {
          resultProviderMetadata: fields.result,
        }
        if (result?.outcome === 'denied' && part.approval) {
          push({
            ...base,
            state: 'output-denied',
            approval: {
              ...fields.approval,
              id: part.approval.id,
              approved: false,
            },
          })
        } else if (result?.state === 'error') {
          push({
            ...base,
            ...resultMetadata,
            state: 'output-error',
            errorText:
              result.error ??
              (typeof result.content === 'string'
                ? result.content
                : JSON.stringify(result.content)),
          })
        } else if (result !== undefined) {
          push({
            ...base,
            ...resultMetadata,
            state: 'output-available',
            output: toolOutput(result.content),
          })
        } else if (part.output !== undefined) {
          push({
            ...base,
            ...resultMetadata,
            state: 'output-available',
            output: part.output,
          })
        } else if (part.approval?.approved !== undefined) {
          // The AI SDK route runs or denies the tool from this answer. A
          // route with `experimental_toolApprovalSecret` checks the signature.
          push({
            ...base,
            state: 'approval-responded',
            approval: {
              ...fields.approval,
              id: part.approval.id,
              approved: part.approval.approved,
            },
          })
        } else if (part.approval) {
          push({
            ...base,
            state: 'approval-requested',
            approval: { ...fields.approval, id: part.approval.id },
          })
        } else {
          push({ ...base, state: 'input-available' })
        }
        break
      }
      default:
        // Results are joined with their calls above. Activity, subagent and
        // UI-resource parts are TanStack UI only.
        break
    }
  }
  return parts
}

/**
 * Convert TanStack chat messages into AI SDK `UIMessage`s, the history an AI
 * SDK route reads with `convertToModelMessages`. Tool calls become
 * `dynamic-tool` parts. After a tool result, a `step-start` part goes before
 * the next part, except after the result of a provider-executed call.
 * System and activity messages are left out: `streamText` rejects system
 * messages in `messages`, and activity is UI only. The
 * AI SDK message metadata that `fromUIMessageStream` kept goes back as the
 * message `metadata`.
 */
export function toAISDKMessages(
  messages: ReadonlyArray<UIMessage>,
): Array<AISDKUIMessage> {
  const out: Array<AISDKUIMessage> = []
  for (const message of messages) {
    if (message.role === 'activity' || message.role === 'system') continue
    const metadata = isRecord(message.metadata)
      ? message.metadata.aiSdk
      : undefined
    out.push({
      id: message.id,
      role: message.role,
      ...(metadata !== undefined && { metadata }),
      parts: toAISDKParts(message),
    })
  }
  return out
}
