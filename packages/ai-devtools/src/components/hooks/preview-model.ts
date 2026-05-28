export type HoverOrigin = 'timeline' | 'preview'

export interface HoverTarget {
  messageIds: Array<string>
  partIds: Array<string>
  origin: HoverOrigin
}

export interface PreviewJsonItem {
  label: string
  value: unknown
}

export interface StructuredOutputJsonSource {
  data?: unknown
  partial?: unknown
  raw?: unknown
  reasoning?: unknown
  errorMessage?: unknown
}

export function createHoverTarget(input: {
  messageIds?: Array<string | null | undefined>
  partIds?: Array<string | null | undefined>
  origin?: HoverOrigin
}): HoverTarget {
  return {
    messageIds: uniqueStrings(input.messageIds ?? []),
    partIds: uniqueStrings(input.partIds ?? []),
    origin: input.origin ?? 'timeline',
  }
}

export function createHoverTargetFromDataAttributes(input: {
  messageIds?: string | null
  partIds?: string | null
  origin?: HoverOrigin
}): HoverTarget | null {
  const target = createHoverTarget({
    messageIds: splitDataIds(input.messageIds),
    partIds: splitDataIds(input.partIds),
    origin: input.origin,
  })

  if (target.messageIds.length === 0 && target.partIds.length === 0) {
    return null
  }

  return target
}

export function isMessageHighlighted(
  messageId: string,
  target: HoverTarget | null,
): boolean {
  return target?.messageIds.includes(messageId) ?? false
}

export function isPartHighlighted(
  messageId: string,
  partId: string,
  target: HoverTarget | null,
): boolean {
  if (!target) return false
  return (
    target.partIds.includes(partId) || target.messageIds.includes(messageId)
  )
}

export function isMessageOrPartHighlighted(
  messageId: string,
  partIds: Array<string>,
  target: HoverTarget | null,
): boolean {
  if (!target) return false
  return (
    target.messageIds.includes(messageId) ||
    partIds.some((partId) => target.partIds.includes(partId))
  )
}

export function getHoverDataAttributes(target: {
  messageIds?: Array<string>
  partIds?: Array<string>
}): Record<string, string> {
  return {
    'data-ai-devtools-hover-message-ids': (target.messageIds ?? []).join(','),
    'data-ai-devtools-hover-part-ids': (target.partIds ?? []).join(','),
  }
}

export function hoverTargetMatchesElement(
  target: HoverTarget,
  elementTarget: {
    messageIds?: string | null
    partIds?: string | null
  },
): boolean {
  const messageIds = splitDataIds(elementTarget.messageIds)
  const partIds = splitDataIds(elementTarget.partIds)

  return (
    target.messageIds.some((id) => messageIds.includes(id)) ||
    target.partIds.some((id) => partIds.includes(id))
  )
}

export function toolCallPartId(toolCallId: string): string {
  return `tool-call:${toolCallId}`
}

export function toolResultPartId(toolCallId: string): string {
  return `tool-result:${toolCallId}`
}

export function structuredOutputPartId(messageId: string): string {
  return `structured-output:${messageId}`
}

export function parseJsonishValue(value: unknown): unknown {
  if (typeof value !== 'string') return value

  const trimmed = value.trim()
  if (!trimmed) return value
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value

  try {
    return JSON.parse(trimmed)
  } catch {
    return value
  }
}

export function structuredOutputJsonItems(
  source: StructuredOutputJsonSource,
): Array<PreviewJsonItem> {
  const raw = typeof source.raw === 'string' ? source.raw : undefined
  const items: Array<PreviewJsonItem> = []
  const partialValue =
    source.partial !== undefined
      ? source.partial
      : source.data !== undefined
        ? source.data
        : parseJsonishValue(raw)

  if (raw !== undefined) {
    items.push({
      label: 'Raw',
      value: raw,
    })
  }

  if (partialValue !== undefined) {
    items.push({
      label: 'Partial',
      value: partialValue,
    })
  }

  if (source.reasoning !== undefined) {
    items.push({
      label: 'Reasoning',
      value: source.reasoning,
    })
  }

  if (source.errorMessage !== undefined) {
    items.push({
      label: 'Error',
      value: source.errorMessage,
    })
  }

  return items
}

function uniqueStrings(
  values: Array<string | null | undefined>,
): Array<string> {
  const result: Array<string> = []
  const seen = new Set<string>()

  for (const value of values) {
    if (!value || seen.has(value)) continue
    seen.add(value)
    result.push(value)
  }

  return result
}

function splitDataIds(value: string | null | undefined): Array<string> {
  if (!value) return []
  return value.split(',').filter(Boolean)
}
