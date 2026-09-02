/**
 * Print useful review-stream content to CI logs. Skip lifecycle noise.
 */

const MAX_CHARS = 4000

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function clip(text: string) {
  if (text.length <= MAX_CHARS) return text
  return `${text.slice(0, MAX_CHARS)}\n… (${String(text.length - MAX_CHARS)} more chars)`
}

function pretty(value: unknown) {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        return JSON.stringify(JSON.parse(trimmed), null, 2)
      } catch {
        return value
      }
    }
    return value
  }
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function readString(value: unknown, key: string) {
  if (!isRecord(value) || typeof value[key] !== 'string') return null
  return value[key]
}

/**
 * Buffer text/reasoning/tool args, then write one block per finished item.
 */
export function createReviewStreamLogger(
  write: (line: string) => void = console.log,
) {
  let text = ''
  let reasoning = ''
  const toolName = new Map<string, string>()
  const toolArgs = new Map<string, string>()

  function flush(label: string, buffer: string) {
    const body = buffer.trim()
    if (body.length === 0) return
    write(`${label}:\n${clip(body)}`)
  }

  return {
    chunk(value: unknown) {
      if (!isRecord(value) || typeof value.type !== 'string') return
      const type = value.type
      if (type === 'TEXT_MESSAGE_CONTENT' || type === 'TEXT_MESSAGE_CHUNK') {
        const delta = readString(value, 'delta')
        if (delta !== null) text += delta
        return
      }
      if (type === 'TEXT_MESSAGE_END') {
        flush('text', text)
        text = ''
        return
      }
      if (
        type === 'REASONING_MESSAGE_CONTENT' ||
        type === 'REASONING_MESSAGE_CHUNK' ||
        type === 'THINKING_TEXT_MESSAGE_CONTENT'
      ) {
        const delta = readString(value, 'delta')
        if (delta !== null) reasoning += delta
        return
      }
      if (
        type === 'REASONING_MESSAGE_END' ||
        type === 'THINKING_TEXT_MESSAGE_END'
      ) {
        flush('reasoning', reasoning)
        reasoning = ''
        return
      }
      if (type === 'TOOL_CALL_START') {
        const id = readString(value, 'toolCallId')
        const name =
          readString(value, 'toolCallName') ??
          readString(value, 'toolName') ??
          'tool'
        if (id !== null) toolName.set(id, name)
        return
      }
      if (type === 'TOOL_CALL_ARGS' || type === 'TOOL_CALL_CHUNK') {
        const id = readString(value, 'toolCallId')
        const delta = readString(value, 'delta')
        if (id !== null && delta !== null) {
          toolArgs.set(id, (toolArgs.get(id) ?? '') + delta)
        }
        return
      }
      if (type === 'TOOL_CALL_END') {
        const id = readString(value, 'toolCallId')
        if (id === null) return
        const name = toolName.get(id) ?? 'tool'
        const input =
          'input' in value && value.input !== undefined
            ? pretty(value.input)
            : pretty(toolArgs.get(id) ?? '')
        write(`tool ${name} input:\n${clip(input)}`)
        return
      }
      if (type === 'TOOL_CALL_RESULT') {
        const id = readString(value, 'toolCallId')
        const name = (id !== null ? toolName.get(id) : undefined) ?? 'tool'
        const content = 'content' in value ? pretty(value.content) : ''
        write(`tool ${name} output:\n${clip(content)}`)
        return
      }
      if (type === 'RUN_ERROR') {
        const message = readString(value, 'message') ?? pretty(value)
        write(`error: ${message}`)
      }
    },
    flush() {
      flush('text', text)
      text = ''
      flush('reasoning', reasoning)
      reasoning = ''
    },
  }
}
