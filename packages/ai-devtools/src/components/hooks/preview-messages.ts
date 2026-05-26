export interface PreviewMessageForMerge {
  id: string
  role?: string
  content?: string
  parts?: Array<PreviewPartForMerge>
}

export interface PreviewPartForMerge {
  id: string
  kind?: string
  content?: string
}

export function mergePreviewMessagesForUserView<
  TMessage extends PreviewMessageForMerge,
>(
  conversationMessages: Array<TMessage>,
  snapshotMessages: Array<TMessage>,
): Array<TMessage> {
  if (conversationMessages.length === 0) {
    return snapshotMessages.filter(isRenderablePreviewMessage)
  }

  const conversationIds = new Set(
    conversationMessages.map((message) => message.id),
  )
  const snapshotById = new Map(
    snapshotMessages
      .filter(isRenderablePreviewMessage)
      .map((message) => [message.id, message] as const),
  )

  const renderableConversationMessages = conversationMessages.filter(
    isRenderablePreviewMessage,
  )
  const shouldUseSnapshotNonUserMessages =
    renderableConversationMessages.length > 0 &&
    !renderableConversationMessages.some(isNonUserPreviewMessage)

  const mergedMessages = [
    ...conversationMessages.map(
      (message) => snapshotById.get(message.id) ?? message,
    ),
    ...snapshotMessages.filter(
      (message) =>
        !conversationIds.has(message.id) &&
        (isFixtureReplayMessage(message) ||
          (shouldUseSnapshotNonUserMessages &&
            isNonUserPreviewMessage(message))),
    ),
  ]

  return mergedMessages.filter(isRenderablePreviewMessage)
}

export function partsToMessageText(parts: Array<unknown>): string {
  return parts
    .map((part) => {
      if (!isRecord(part)) return ''
      if (part.type !== 'text') return ''
      if (typeof part.text === 'string') return part.text
      if (typeof part.content === 'string') return part.content
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

export function visiblePreviewPartsForMessage<
  TPart extends PreviewPartForMerge,
>(message: { content?: string; parts?: Array<TPart> }): Array<TPart> {
  const messageContent = normalizeText(message.content)
  return (message.parts ?? []).filter((part) => {
    if (part.kind !== 'text') return true
    if (!messageContent) return true
    return normalizeText(part.content) !== messageContent
  })
}

export function hasStructuredOutputPreview(
  messages: Array<PreviewMessageForMerge>,
): boolean {
  return messages.some((message) =>
    message.parts?.some((part) => part.kind === 'structured-output'),
  )
}

function isFixtureReplayMessage(message: PreviewMessageForMerge): boolean {
  if (message.id.startsWith('fixture-msg-')) {
    return true
  }

  return Boolean(
    message.parts?.some((part) =>
      part.id.startsWith('tool-call:fixture-tool-call-'),
    ),
  )
}

function isRenderablePreviewMessage(message: PreviewMessageForMerge): boolean {
  if (message.content?.trim()) {
    return true
  }
  return Boolean(message.parts?.length)
}

function isNonUserPreviewMessage(message: PreviewMessageForMerge): boolean {
  return message.role !== undefined && message.role !== 'user'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function normalizeText(value: string | undefined): string {
  return value?.trim() ?? ''
}
