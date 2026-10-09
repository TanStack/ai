import type { SystemPrompt } from '../system-prompts'
import type { ModelMessage } from '../types'

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
      content:
        typeof message.content === 'string'
          ? sanitizeUnicode(message.content)
          : (message.content?.map((part) =>
              part.type === 'text'
                ? { ...part, content: sanitizeUnicode(part.content) }
                : part,
            ) ?? null),
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
