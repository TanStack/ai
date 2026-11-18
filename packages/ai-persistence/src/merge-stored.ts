import {
  appMetadata,
  tanstackOnlyMetadata,
} from '@tanstack/ai/adapter-internals'
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
// none, and the stored app metadata of a tool result stays. An id-less message that matches the prefix row at its index is
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
      const isSameToolResult = (row: ModelMessage) =>
        row.role === 'tool' && row.toolCallId === message.toolCallId
      const storedIndex = prefix.findIndex(isSameToolResult)
      const prefixRow = prefix[storedIndex]
      if (prefixRow) {
        merged[storedIndex] = keepStoredRecord(message, prefixRow)
        continue
      }
      // With no later message, the stored tool result is past the cutoff. It
      // is not in the prefix, so keep its app metadata when one row matches.
      const [match, ...others] = stored.filter(isSameToolResult)
      if (match && others.length === 0) {
        merged.push(keepStoredAppMetadata(message, match))
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
function keepStoredRecord(incoming: ModelMessage, stored: ModelMessage) {
  const record =
    incoming.midConversationChange || !stored.midConversationChange
      ? incoming
      : { ...incoming, midConversationChange: stored.midConversationChange }
  // Copy app metadata only onto the result of the same tool call.
  const isSameToolResult =
    incoming.role === 'tool' &&
    stored.role === 'tool' &&
    incoming.toolCallId === stored.toolCallId
  return isSameToolResult ? keepStoredAppMetadata(record, stored) : record
}

// The server owns the app keys of tool result metadata. The client removes
// them before it sends, so the stored app keys win and incoming app keys are
// dropped. The `tanstack` key comes from the incoming copy.
function keepStoredAppMetadata(incoming: ModelMessage, stored: ModelMessage) {
  const metadata = {
    ...tanstackOnlyMetadata(incoming.metadata),
    ...appMetadata(stored.metadata),
  }
  if (Object.keys(metadata).length > 0) return { ...incoming, metadata }
  if (incoming.metadata === undefined) return incoming
  const { metadata: _metadata, ...rest } = incoming
  return rest
}
