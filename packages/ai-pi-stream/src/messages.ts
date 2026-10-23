import type { ContentPart, ModelMessage, ToolCall } from '@tanstack/ai'
import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type {
  AssistantMessage,
  ImageContent,
  JsonObject,
  Message,
  TextContent,
  ToolResultMessage,
  Usage,
} from '@earendil-works/pi-ai'

/** The model fields of a pi assistant message. */
export type PiModelFields = Pick<AssistantMessage, 'api' | 'provider' | 'model'>

/** A pi `Usage` with every count zero. */
export function emptyUsage(): Usage {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  }
}

export function parseJsonObject(text: string): JsonObject {
  try {
    const value: unknown = JSON.parse(text)
    return isJsonObject(value) ? value : {}
  } catch {
    return {}
  }
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function textOf(content: string | null | Array<ContentPart>): string {
  if (typeof content === 'string') return content
  return (content ?? [])
    .map((part) => (part.type === 'text' ? part.content : ''))
    .join('')
}

/** TanStack content parts as pi user content. Only text and base64 images cross. */
function toPiContent(
  content: string | null | Array<ContentPart>,
): string | Array<TextContent | ImageContent> {
  if (typeof content === 'string' || content === null) return content ?? ''
  return content.flatMap((part): Array<TextContent | ImageContent> => {
    if (part.type === 'text') return [{ type: 'text', text: part.content }]
    if (part.type === 'image' && part.source.type === 'data') {
      return [
        {
          type: 'image',
          data: part.source.value,
          mimeType: part.source.mimeType,
        },
      ]
    }
    // ponytail: pi user messages take text and base64 images only. URL,
    // file and other media parts are dropped.
    return []
  })
}

function fromPiContent(
  content: string | Array<TextContent | ImageContent>,
): string | Array<ContentPart> {
  if (typeof content === 'string') return content
  return content.map(
    (part): ContentPart =>
      part.type === 'text'
        ? { type: 'text', content: part.text }
        : {
            type: 'image',
            source: { type: 'data', value: part.data, mimeType: part.mimeType },
          },
  )
}

/**
 * Convert TanStack `ModelMessage`s, such as `chat()` history, into pi
 * messages for `agentLoop` or `Agent`. `systemPrompts` become the leading pi
 * system message.
 *
 * A pi assistant message names the model that wrote it. Pass `model` (the
 * pi model fields) so pi providers can replay reasoning signatures from the
 * same model. Without it the fields are empty strings, and pi treats the
 * messages as from another model.
 */
export function toPiMessages(
  messages: ReadonlyArray<ModelMessage>,
  {
    systemPrompts,
    model = { api: '', provider: '', model: '' },
  }: { systemPrompts?: ReadonlyArray<string>; model?: PiModelFields } = {},
): Array<Message> {
  const timestamp = Date.now()
  const toolNames = new Map<string, string>()
  const out: Array<Message> = []
  if (systemPrompts?.length) {
    out.push({ role: 'system', content: systemPrompts.join('\n\n'), timestamp })
  }
  for (const message of messages) {
    const at = message.createdAt?.getTime() ?? timestamp
    if (message.role === 'user') {
      out.push({
        role: 'user',
        content: toPiContent(message.content),
        timestamp: at,
      })
      continue
    }
    if (message.role === 'tool') {
      const toolCallId = message.toolCallId ?? ''
      const text = textOf(message.content)
      out.push({
        role: 'toolResult',
        toolCallId,
        toolName: toolNames.get(toolCallId) ?? '',
        content: [{ type: 'text', text: message.error ?? text }],
        isError: message.error !== undefined,
        timestamp: at,
      })
      continue
    }
    const content: AssistantMessage['content'] = []
    for (const thinking of message.thinking ?? []) {
      content.push({
        type: 'thinking',
        thinking: thinking.content,
        ...(thinking.signature !== undefined && {
          thinkingSignature: thinking.signature,
        }),
        ...(thinking.redacted && { redacted: true }),
      })
    }
    const text = textOf(message.content)
    if (text) content.push({ type: 'text', text })
    for (const call of message.toolCalls ?? []) {
      toolNames.set(call.id, call.function.name)
      const signature = thoughtSignature(call)
      content.push({
        type: 'toolCall',
        id: call.id,
        name: call.function.name,
        arguments: parseJsonObject(call.function.arguments),
        ...(signature !== undefined && { thoughtSignature: signature }),
      })
    }
    out.push({
      role: 'assistant',
      content,
      ...model,
      usage: emptyUsage(),
      stopReason: message.toolCalls?.length ? 'toolUse' : 'stop',
      timestamp: at,
    })
  }
  return out
}

function thoughtSignature(call: ToolCall): string | undefined {
  const metadata: unknown = call.metadata
  if (
    typeof metadata === 'object' &&
    metadata !== null &&
    'thoughtSignature' in metadata &&
    typeof metadata.thoughtSignature === 'string'
  ) {
    return metadata.thoughtSignature
  }
  return undefined
}

/** Tool result content as the TanStack tool message text. */
export function toolResultText(message: Pick<ToolResultMessage, 'content'>) {
  return message.content
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('')
}

function isMessage(message: AgentMessage): message is Message {
  return (
    typeof message === 'object' &&
    'role' in message &&
    ['system', 'user', 'assistant', 'toolResult'].includes(message.role)
  )
}

/**
 * Convert pi messages, such as `agent.state.messages` or the `agent_end`
 * messages, into `chat()` params: the `ModelMessage` history and the system
 * prompts.
 *
 * Spread the result into `chat()` only for a history the server owns. For
 * messages from a client request, use `messages` and set the system prompts
 * on the server. Otherwise the client controls the system prompt.
 *
 * App-specific pi messages (declared with `CustomAgentMessages`) are skipped.
 */
export function fromPiMessages(messages: ReadonlyArray<AgentMessage>): {
  messages: Array<ModelMessage>
  systemPrompts: Array<string>
} {
  const out: Array<ModelMessage> = []
  const systemPrompts: Array<string> = []
  for (const message of messages) {
    if (!isMessage(message)) continue
    switch (message.role) {
      case 'system': {
        const text =
          typeof message.content === 'string'
            ? message.content
            : message.content.map((part) => part.text).join('')
        if (text) systemPrompts.push(text)
        break
      }
      case 'user':
        out.push({
          role: 'user',
          content: fromPiContent(message.content),
          createdAt: new Date(message.timestamp),
        })
        break
      case 'toolResult': {
        const text = toolResultText(message)
        out.push({
          role: 'tool',
          toolCallId: message.toolCallId,
          content: text,
          ...(message.isError && { error: text }),
          createdAt: new Date(message.timestamp),
        })
        break
      }
      case 'assistant': {
        const thinking: NonNullable<ModelMessage['thinking']> = []
        const toolCalls: Array<ToolCall> = []
        let text = ''
        for (const part of message.content) {
          if (part.type === 'text') text += part.text
          else if (part.type === 'thinking') {
            thinking.push({
              content: part.thinking,
              ...(part.thinkingSignature !== undefined && {
                signature: part.thinkingSignature,
              }),
              ...(part.redacted && { redacted: true }),
            })
          } else {
            toolCalls.push({
              id: part.id,
              type: 'function',
              function: {
                name: part.name,
                arguments: JSON.stringify(part.arguments),
              },
              ...(part.thoughtSignature !== undefined && {
                metadata: { thoughtSignature: part.thoughtSignature },
              }),
            })
          }
        }
        out.push({
          role: 'assistant',
          content: text || null,
          ...(thinking.length > 0 && { thinking }),
          ...(toolCalls.length > 0 && { toolCalls }),
          createdAt: new Date(message.timestamp),
        })
        break
      }
    }
  }
  return { messages: out, systemPrompts }
}
