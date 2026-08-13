import type { ContentPart, MessagePart, UIMessage } from '../types'

type AGUITextInputContent = { type: 'text'; text: string }
type AGUIInputContent =
  | AGUITextInputContent
  | (ContentPart & { type: 'image' | 'audio' | 'video' | 'document' })

type AGUIToolCallMirror = {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
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
}

type WireAnchorMessage = UIMessage & {
  content?: string | Array<AGUIInputContent>
  toolCalls?: Array<AGUIToolCallMirror>
}

export type WireMessage =
  | WireAnchorMessage
  | AGUIToolMessage
  | AGUIReasoningMessage

/**
 * Serialize TanStack `UIMessage`s into the AG-UI `RunAgentInput.messages`
 * wire shape. Each anchor (system/user/assistant) carries the canonical
 * `parts` array verbatim plus AG-UI mirror fields (`content`, `toolCalls`)
 * so AG-UI Zod parsing succeeds. Tool results and thinking parts on
 * assistant messages are additionally emitted as fan-out
 * `{role:'tool',...}` and `{role:'reasoning',...}` entries for strict
 * AG-UI server consumers.
 */
export function uiMessagesToWire(
  messages: Array<UIMessage>,
): Array<WireMessage> {
  const wire: Array<WireMessage> = []

  for (const msg of messages) {
    // Defensive: if parts is missing (ModelMessage-shaped input), pass through as-is.
    // UIMessage always has parts; ModelMessage uses content directly.
    const parts: ReadonlyArray<MessagePart> =
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- runtime input may be ModelMessage-shaped (no `parts`); cast forces the optional-chain fallback below to remain in scope
      (msg.parts as ReadonlyArray<MessagePart> | undefined) ?? []

    if (msg.role === 'system') {
      wire.push({
        ...msg,
        content:
          parts.length > 0
            ? collectText(parts)
            : ((msg as { content?: string }).content ?? ''),
      })
      continue
    }

    if (msg.role === 'user') {
      wire.push({
        ...msg,
        content:
          parts.length > 0
            ? collectUserContent(parts)
            : ((msg as { content?: string }).content ?? ''),
      })
      continue
    }

    // assistant: emit reasoning fan-outs first, then anchor, then tool fan-outs
    for (const part of parts) {
      if (part.type === 'thinking') {
        wire.push({
          role: 'reasoning',
          id: deriveReasoningId(msg.id, part),
          content: part.content,
        })
      }
    }

    const text = collectText(parts)
    const toolCalls = collectToolCalls(parts)
    wire.push({
      ...msg,
      ...(text !== '' && { content: text }),
      ...(toolCalls && { toolCalls }),
    })

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

function collectToolCalls(
  parts: ReadonlyArray<MessagePart>,
): Array<AGUIToolCallMirror> | undefined {
  const calls: Array<AGUIToolCallMirror> = []
  for (const p of parts) {
    if (p.type === 'tool-call') {
      calls.push({
        id: p.id,
        type: 'function',
        function: { name: p.name, arguments: p.arguments },
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

function hashContent(s: string): string {
  // Cheap deterministic id suffix; collisions are tolerable since
  // reasoning ids only matter for AG-UI server consumers, not for our
  // own server's dedup logic (which keys on toolCallId, not reasoning id).
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h).toString(36)
}
