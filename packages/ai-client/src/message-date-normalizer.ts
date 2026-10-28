import type { UIMessage } from './types'

function validDate(value: unknown): Date | undefined {
  if (value instanceof Date)
    return Number.isNaN(value.getTime()) ? undefined : value
  if (typeof value !== 'string') return undefined
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

export function normalizeMessageDates(message: UIMessage): UIMessage {
  const messageDate = validDate(message.createdAt)
  const parts = message.parts.map((part) => {
    if (part.type !== 'tool-result') return part
    const date = validDate(part.createdAt)
    const { createdAt: _ignored, ...rest } = part
    return date ? { ...rest, createdAt: date } : rest
  })
  const { createdAt: _ignored, ...rest } = message
  return messageDate
    ? { ...rest, parts, createdAt: messageDate }
    : { ...rest, parts }
}

export function normalizeMessagesDates(
  messages: Array<UIMessage>,
): Array<UIMessage> {
  return messages.map(normalizeMessageDates)
}
