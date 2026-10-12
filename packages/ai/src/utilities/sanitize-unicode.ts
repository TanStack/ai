import type { SystemPrompt } from '../system-prompts'
import type { ModelMessage, ModelMessageBlock } from '../types'

/** Remove lone UTF-16 surrogates. Keep valid pairs unchanged. */
function sanitizeUnicode(text: string): string {
  return text.replace(
    /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
    '',
  )
}

/** Sanitize decoded argument strings. Keep original JSON bytes when nothing changes. */
function sanitizeJsonArguments(argumentsJson: string): string {
  try {
    JSON.parse(argumentsJson)
    return argumentsJson.replace(/"(?:\\.|[^"\\])*"/g, (token) => {
      const decoded: unknown = JSON.parse(token)
      if (typeof decoded !== 'string') return token
      const clean = sanitizeUnicode(decoded)
      return clean === decoded ? token : JSON.stringify(clean)
    })
  } catch {
    return argumentsJson
  }
}

/**
 * Clean string content that has a block order map. Each text block is
 * cleaned on its own, so the map lengths still match the content.
 */
function sanitizeOrderedContent(
  content: string,
  order: Array<ModelMessageBlock>,
): { content: string; blockOrder: Array<ModelMessageBlock> } {
  let offset = 0
  let clean = ''
  const blockOrder: Array<ModelMessageBlock> = []
  for (const block of order) {
    if (block.type !== 'text') {
      blockOrder.push(block)
      continue
    }
    const text = sanitizeUnicode(content.slice(offset, offset + block.length))
    offset += block.length
    clean += text
    if (text.length > 0) blockOrder.push({ ...block, length: text.length })
  }
  return {
    content: clean + sanitizeUnicode(content.slice(offset)),
    blockOrder,
  }
}

/**
 * Remove lone surrogates from the text `chat()` sends to a provider. A lone
 * surrogate is invalid UTF-8 / JSON on the wire, so providers reject the
 * whole request.
 */
export function sanitizeProviderRequest(
  messages: Array<ModelMessage>,
  systemPrompts: Array<SystemPrompt> | undefined,
) {
  return {
    messages: messages.map((message) => ({
      ...message,
      ...(typeof message.content === 'string'
        ? message.blockOrder
          ? sanitizeOrderedContent(message.content, message.blockOrder)
          : { content: sanitizeUnicode(message.content) }
        : {
            content:
              message.content?.map((part) =>
                part.type === 'text'
                  ? { ...part, content: sanitizeUnicode(part.content) }
                  : part,
              ) ?? null,
          }),
      ...(message.toolCalls && {
        toolCalls: message.toolCalls.map((toolCall) => ({
          ...toolCall,
          function: {
            ...toolCall.function,
            arguments: sanitizeJsonArguments(toolCall.function.arguments),
          },
        })),
      }),
    })),
    systemPrompts: systemPrompts?.map((prompt) =>
      typeof prompt === 'string'
        ? sanitizeUnicode(prompt)
        : { ...prompt, content: sanitizeUnicode(prompt.content) },
    ),
  }
}
