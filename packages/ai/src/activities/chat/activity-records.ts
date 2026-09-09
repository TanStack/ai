import jsonPatch from 'fast-json-patch'
import { generateMessageId } from './messages'
import { mergeMetadata } from '../../utilities/merge-metadata'
import type {
  ActivityPart,
  ActivityRecord,
  StreamChunk,
  UIMessage,
} from '../../types'

function isActivityPart(
  part: UIMessage['parts'][number],
): part is ActivityPart {
  return part.type === 'activity'
}

function isActivityContent(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

export function activityRecordToUIMessage(record: ActivityRecord): UIMessage {
  return {
    id: record.id,
    role: 'activity',
    parts: [
      {
        type: 'activity',
        activityType: record.activityType,
        content: structuredClone(record.content),
      },
    ],
  }
}

/**
 * Insert activity rows into a model-derived UI transcript at each record's
 * stored `index`. Earlier records are inserted first so later indexes stay
 * aligned with the growing list.
 */
export function interleaveActivityRecords(
  modelUI: Array<UIMessage>,
  records: Array<ActivityRecord>,
): Array<UIMessage> {
  const out = [...modelUI]
  const sorted = [...records].sort((a, b) => a.index - b.index)
  for (const record of sorted) {
    out.splice(
      Math.min(record.index, out.length),
      0,
      activityRecordToUIMessage(record),
    )
  }
  return out
}

/**
 * Collect inbound `role: 'activity'` UIMessages. `index` is the position in
 * the original inbound list so reconstruct can put them back.
 */
export function peelInboundActivities(
  messages: ReadonlyArray<{
    role?: string
    id?: string
    parts?: UIMessage['parts']
  }>,
): Array<ActivityRecord> {
  const records: Array<ActivityRecord> = []
  for (const [index, message] of messages.entries()) {
    if (message.role !== 'activity' || !Array.isArray(message.parts)) continue
    const part = message.parts.find(isActivityPart)
    if (!part) continue
    records.push({
      id: message.id || generateMessageId(),
      activityType: part.activityType,
      content: structuredClone(part.content),
      index,
    })
  }
  return records
}

export function applyActivitySnapshotToUIMessages(
  messages: Array<UIMessage>,
  chunk: Extract<StreamChunk, { type: 'ACTIVITY_SNAPSHOT' }>,
): Array<UIMessage> {
  const { messageId, activityType, content } = chunk
  const replace = chunk.replace ?? true
  const existingIndex = messages.findIndex((m) => m.id === messageId)
  const existing = existingIndex >= 0 ? messages[existingIndex] : undefined

  if (existing && (!replace || existing.role !== 'activity')) return messages

  const metadata = mergeMetadata(
    existing?.role === 'activity' ? existing.metadata : undefined,
    chunk.metadata,
  )
  const next: UIMessage = {
    id: messageId,
    role: 'activity',
    parts: [
      {
        type: 'activity',
        activityType,
        content: structuredClone(content ?? {}),
      },
    ],
    ...(metadata != null ? { metadata } : {}),
    ...(existing?.role === 'activity' && existing.createdAt != null
      ? { createdAt: existing.createdAt }
      : {}),
    ...(existing?.role === 'activity' && existing.name != null
      ? { name: existing.name }
      : {}),
  }

  if (existingIndex === -1) return [...messages, next]
  return messages.map((msg, index) => (index === existingIndex ? next : msg))
}

export function applyActivityDeltaToUIMessages(
  messages: Array<UIMessage>,
  chunk: Extract<StreamChunk, { type: 'ACTIVITY_DELTA' }>,
): Array<UIMessage> {
  const { messageId, activityType, patch } = chunk
  const existingIndex = messages.findIndex((m) => m.id === messageId)
  if (existingIndex === -1) return messages

  const existing = messages[existingIndex]
  if (existing == null || existing.role !== 'activity') {
    console.warn(
      `ACTIVITY_DELTA: Message '${messageId}' is not an activity message`,
    )
    return messages
  }

  const activityPart = existing.parts.find(isActivityPart)
  if (activityPart && activityPart.activityType !== activityType) {
    console.warn(
      `ACTIVITY_DELTA: activityType '${activityType}' does not match '${activityPart.activityType}' for '${messageId}'`,
    )
    return messages
  }
  const baseContent = structuredClone(activityPart?.content ?? {})

  try {
    const result = jsonPatch.applyPatch(baseContent, patch ?? [], true, false)
    if (!isActivityContent(result.newDocument)) {
      console.warn(
        `ACTIVITY_DELTA: patched content for '${messageId}' is not an object`,
      )
      return messages
    }
    const updatedContent = structuredClone(result.newDocument)
    const nextPart: ActivityPart = {
      type: 'activity',
      activityType,
      content: updatedContent,
    }
    const parts = activityPart
      ? existing.parts.map((part) =>
          part.type === 'activity' ? nextPart : part,
        )
      : [nextPart]
    const metadata = mergeMetadata(existing.metadata, chunk.metadata)
    return messages.map((msg, index) =>
      index === existingIndex
        ? { ...msg, parts, ...(metadata != null ? { metadata } : {}) }
        : msg,
    )
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    console.warn(
      `Failed to apply activity patch for '${messageId}': ${errorMessage}`,
    )
    return messages
  }
}

function uiMessagesToActivityRecords(
  messages: Array<UIMessage>,
  previous: Array<ActivityRecord>,
  nextIndex: number,
): Array<ActivityRecord> {
  return messages
    .filter((message) => message.role === 'activity')
    .map((message) => {
      const part = message.parts.find(isActivityPart)
      const prev = previous.find((record) => record.id === message.id)
      return {
        id: message.id,
        activityType: part?.activityType ?? '',
        content: structuredClone(part?.content ?? {}),
        index: prev?.index ?? nextIndex,
      }
    })
}

export function applyActivitySnapshotToRecords(
  records: Array<ActivityRecord>,
  chunk: Extract<StreamChunk, { type: 'ACTIVITY_SNAPSHOT' }>,
  nextIndex: number,
): Array<ActivityRecord> {
  return uiMessagesToActivityRecords(
    applyActivitySnapshotToUIMessages(
      records.map(activityRecordToUIMessage),
      chunk,
    ),
    records,
    nextIndex,
  )
}

export function applyActivityDeltaToRecords(
  records: Array<ActivityRecord>,
  chunk: Extract<StreamChunk, { type: 'ACTIVITY_DELTA' }>,
): Array<ActivityRecord> {
  return uiMessagesToActivityRecords(
    applyActivityDeltaToUIMessages(
      records.map(activityRecordToUIMessage),
      chunk,
    ),
    records,
    records.length,
  )
}
