import type { ModelMessage } from '@tanstack/ai'

/** How many stored messages the merge keeps. Less than `stored.length` on a reload. */
export function storedCutoff(
  stored: ReadonlyArray<ModelMessage>,
  incoming: ReadonlyArray<ModelMessage>,
) {
  for (let index = incoming.length - 1; index >= 0; index--) {
    const id = incoming[index]?.id
    if (id === undefined) continue
    const storedIndex = stored.findIndex((message) => message.id === id)
    if (storedIndex >= 0) return storedIndex + 1
  }
  return stored.length
}

// Empty incoming keeps stored. Non-empty: the last incoming id that already
// exists in stored is a cutoff (reload drops the old assistant after that
// user). Same id, or a tool result with the same toolCallId, is replaced in
// place, but a stored mid-conversation record stays when the incoming copy has
// none. An id-less message that matches the prefix row at its index is
// dropped. Other messages are appended.
export function mergeStoredMessages(
  stored: ReadonlyArray<ModelMessage>,
  incoming: ReadonlyArray<ModelMessage>,
) {
  if (incoming.length === 0) {
    return stored.slice()
  }

  const prefix = stored.slice(0, storedCutoff(stored, incoming))

  const incomingById = new Map<string, ModelMessage>()
  for (const message of incoming) {
    const id = message.id
    if (id) incomingById.set(id, message)
  }

  const storedIds = new Set<string>()
  const merged: Array<ModelMessage> = []
  for (const message of prefix) {
    const id = message.id
    if (id) {
      storedIds.add(id)
      const replacement = incomingById.get(id)
      merged.push(
        replacement ? keepStoredRecord(replacement, message) : message,
      )
      continue
    }
    merged.push(message)
  }

  for (let index = 0; index < incoming.length; index++) {
    const message = incoming[index]
    if (!message) continue
    const id = message.id
    if (id && storedIds.has(id)) continue
    // A resumed run posts stored tool results under the interrupt snapshot's
    // ids, which the store never saw. Match tool results by toolCallId.
    if (message.role === 'tool' && message.toolCallId !== undefined) {
      const storedIndex = prefix.findIndex(
        (stored) =>
          stored.role === 'tool' && stored.toolCallId === message.toolCallId,
      )
      const stored = prefix[storedIndex]
      if (stored) {
        merged[storedIndex] = keepStoredRecord(message, stored)
        continue
      }
    }
    // Attach/reload can post the stored transcript again with no ids. Keep the
    // prefix row instead of appending a second copy of the same turn.
    if (!id) {
      const existing = merged[index]
      if (
        existing &&
        existing.id === undefined &&
        existing.role === message.role &&
        existing.content === message.content
      ) {
        continue
      }
    }
    merged.push(message)
  }

  return merged
}

// A client never sends the engine's mid-conversation record (UIMessages have
// none), so keep the stored one. Without it, each turn starts a new start
// point and the prompt cache breaks once per turn.
function keepStoredRecord(
  incoming: ModelMessage,
  stored: ModelMessage,
): ModelMessage {
  if (incoming.midConversationChange || !stored.midConversationChange) {
    return incoming
  }
  return { ...incoming, midConversationChange: stored.midConversationChange }
}
