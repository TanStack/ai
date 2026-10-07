import type { ModelMessage } from '@tanstack/ai'

// Empty incoming keeps stored. Non-empty: the last incoming id that already
// exists in stored is a cutoff (reload drops the old assistant after that
// user). Same id is replaced in place. New ids and messages with no id are
// appended.
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
      merged.push(incomingById.get(id) ?? message)
      continue
    }
    merged.push(message)
  }

  for (let index = 0; index < incoming.length; index++) {
    const message = incoming[index]
    if (!message) continue
    const id = message.id
    if (id && storedIds.has(id)) continue
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
