import { getToolName, isToolUIPart } from 'ai'
import type {
  ContentPart,
  ContentPartSource,
  MessagePart,
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

type AISDKPart = UIMessagePart<UIDataTypes, UITools>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isProviderMetadata(value: unknown): value is ProviderMetadata {
  return isRecord(value) && Object.values(value).every(isRecord)
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
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
  }
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
 * Text, files, reasoning and tool calls with their results are kept. A client
 * tool's output and a denied tool call go back to the model as tool results.
 * A call that waits for approval, or has an answer, stays pending:
 * `chatParamsFromAISDKRequest` sends the answer to `chat()` as `resume`.
 */
export function fromAISDKMessages(
  messages: ReadonlyArray<AISDKUIMessage>,
): Array<UIMessage> {
  return messages.map((message) => ({
    id: message.id,
    role: message.role,
    parts: message.parts.flatMap(fromAISDKPart),
  }))
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

function toAISDKParts(message: UIMessage): Array<AISDKPart> {
  const results = new Map<string, ToolResultPart>()
  for (const part of message.parts) {
    if (part.type === 'tool-result') results.set(part.toolCallId, part)
  }

  const parts: Array<AISDKPart> = []
  for (const part of message.parts) {
    // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- tool results join their calls; TanStack UI-only parts are dropped by default.
    switch (part.type) {
      case 'text':
        parts.push({ type: 'text', text: part.content })
        break
      case 'thinking': {
        // `fromUIMessageStream` stores the AI SDK provider metadata as the
        // signature. Send it back as it came.
        const providerMetadata =
          part.signature === undefined ? undefined : parseJson(part.signature)
        parts.push({
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
        parts.push({
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
        const base = {
          type: 'dynamic-tool' as const,
          toolName: part.name,
          toolCallId: part.id,
          input,
        }
        if (result?.outcome === 'denied' && part.approval) {
          parts.push({
            ...base,
            state: 'output-denied',
            approval: { id: part.approval.id, approved: false },
          })
        } else if (result?.state === 'error') {
          parts.push({
            ...base,
            state: 'output-error',
            errorText:
              result.error ??
              (typeof result.content === 'string'
                ? result.content
                : JSON.stringify(result.content)),
          })
        } else if (result !== undefined) {
          parts.push({
            ...base,
            state: 'output-available',
            output: toolOutput(result.content),
          })
        } else if (part.output !== undefined) {
          parts.push({
            ...base,
            state: 'output-available',
            output: part.output,
          })
        } else if (part.approval?.approved !== undefined) {
          // The AI SDK route runs or denies the tool from this answer.
          parts.push({
            ...base,
            state: 'approval-responded',
            approval: {
              id: part.approval.id,
              approved: part.approval.approved,
            },
          })
        } else if (part.approval) {
          parts.push({
            ...base,
            state: 'approval-requested',
            approval: { id: part.approval.id },
          })
        } else {
          parts.push({ ...base, state: 'input-available' })
        }
        break
      }
      default:
        // Results are joined with their calls above. Activity, subagent,
        // structured-output and UI-resource parts are TanStack UI only.
        break
    }
  }
  return parts
}

/**
 * Convert TanStack chat messages into AI SDK `UIMessage`s, the history an AI
 * SDK route reads with `convertToModelMessages`. Tool calls become
 * `dynamic-tool` parts.
 */
export function toAISDKMessages(
  messages: ReadonlyArray<UIMessage>,
): Array<AISDKUIMessage> {
  const out: Array<AISDKUIMessage> = []
  for (const message of messages) {
    if (message.role === 'activity') continue
    out.push({
      id: message.id,
      role: message.role,
      parts: toAISDKParts(message),
    })
  }
  return out
}
