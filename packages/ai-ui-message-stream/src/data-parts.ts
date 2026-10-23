import jsonPatch from 'fast-json-patch'
import { EventType } from '@tanstack/ai'
import type { StreamChunk, SubagentHandleData } from '@tanstack/ai'
import type { UIMessageChunk } from 'ai'

type ActivitySnapshot = Extract<StreamChunk, { type: 'ACTIVITY_SNAPSHOT' }>
type JsonPatch = Extract<StreamChunk, { type: 'STATE_DELTA' }>['delta']

/**
 * The data of a `data-subagent` part: the TanStack subagent card, with the
 * child's text in place of its messages.
 */
export interface SubagentData extends Omit<
  SubagentHandleData,
  'messages' | 'parentRunId'
> {
  text: string
}

/** An AI SDK `data-<name>` chunk. */
export type DataChunk = Extract<UIMessageChunk, { type: `data-${string}` }>

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Turns AG-UI activity, state and subagent events into AI SDK data chunks.
 * Each chunk has an `id`, so the AI SDK client replaces the data part in place
 * when the same `data-<name>` and `id` come again. Make one per stream.
 *
 * - `ACTIVITY_SNAPSHOT` / `ACTIVITY_DELTA`: `data-<activityType>`, `id` is the
 *   activity `messageId`, data is the full content.
 * - `STATE_SNAPSHOT` / `STATE_DELTA`: `data-state`, `id: 'state'`, data is the
 *   full state.
 * - Events with a `subagentRunId`: `data-subagent`, `id` is the
 *   `subagentRunId`, data is a {@link SubagentData}.
 */
export class DataParts {
  private readonly activities = new Map<string, ActivitySnapshot>()
  private state: unknown = {}
  private readonly subagents = new Map<string, SubagentData>()

  /** The data chunks for one event. Empty for any other event. */
  chunks(event: StreamChunk): Array<UIMessageChunk> {
    if ('subagentRunId' in event && event.subagentRunId !== undefined)
      return this.subagent(event, event.subagentRunId)

    // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- only activity and state events have data parts.
    switch (event.type) {
      case EventType.ACTIVITY_SNAPSHOT: {
        const existing = this.activities.get(event.messageId)
        if (existing && event.replace === false) return []
        this.activities.set(event.messageId, event)
        return [activityChunk(event)]
      }
      case EventType.ACTIVITY_DELTA: {
        // Same rules as the TanStack client: no snapshot, another type, a
        // failed patch, or content that is no longer an object keep the old
        // content.
        const existing = this.activities.get(event.messageId)
        if (existing?.activityType !== event.activityType) {
          console.warn(
            `ACTIVITY_DELTA: No '${event.activityType}' activity '${event.messageId}'`,
          )
          return []
        }
        const content = patched(existing.content, event.patch)
        if (!isRecord(content)) return []
        const next = { ...existing, content }
        this.activities.set(event.messageId, next)
        return [activityChunk(next)]
      }
      case EventType.STATE_SNAPSHOT:
        this.state = event.snapshot
        return [{ type: 'data-state', id: 'state', data: this.state }]
      case EventType.STATE_DELTA: {
        const state = patched(this.state, event.delta)
        if (state === undefined) return []
        this.state = state
        return [{ type: 'data-state', id: 'state', data: state }]
      }
      default:
        return []
    }
  }

  // ponytail: re-sends the whole card on every child text delta, so the wire
  // carries O(n²) text for a long child. Throttle or send a text-only delta
  // part if children get long.
  private subagent(event: StreamChunk, id: string): Array<UIMessageChunk> {
    let card = this.subagents.get(id)
    // eslint-disable-next-line @typescript-eslint/switch-exhaustiveness-check -- the card shows lifecycle and text only.
    switch (event.type) {
      case EventType.SUBAGENT_STARTED:
        if (card) {
          // A resume continues the same child.
          card.status = 'running'
          delete card.interruptIds
          delete card.error
          if (event.metadata !== undefined) card.metadata = event.metadata
          break
        }
        card = {
          id,
          name: event.name,
          ...(event.description !== undefined && {
            description: event.description,
          }),
          status: 'running',
          ...(event.parentSubagentRunId !== undefined && {
            parentSubagentRunId: event.parentSubagentRunId,
          }),
          ...(event.parentToolCallId !== undefined && {
            parentToolCallId: event.parentToolCallId,
          }),
          ...(event.metadata !== undefined && { metadata: event.metadata }),
          text: '',
        }
        this.subagents.set(id, card)
        break
      case EventType.TEXT_MESSAGE_START:
        // Keep the child's text messages apart. Nothing to show yet.
        if (card && card.text !== '') card.text += '\n\n'
        return []
      case EventType.TEXT_MESSAGE_CONTENT:
        if (!card) return []
        card.text += event.delta
        break
      case EventType.SUBAGENT_FINISHED:
        if (!card || card.status === 'error') return []
        if (event.outcome?.type === 'suspended') {
          card.status = 'suspended'
          card.interruptIds = event.outcome.interruptIds ?? []
        } else {
          card.status = 'finished'
        }
        break
      case EventType.SUBAGENT_ERROR:
        if (!card) return []
        card.status = 'error'
        card.error = {
          message: event.message,
          ...(event.code !== undefined && { code: event.code }),
        }
        break
      default:
        return []
    }
    return [{ type: 'data-subagent', id, data: structuredClone(card) }]
  }
}

function activityChunk(event: ActivitySnapshot): UIMessageChunk {
  return {
    type: `data-${event.activityType}`,
    id: event.messageId,
    data: event.content,
  }
}

export function isDataChunk(chunk: UIMessageChunk): chunk is DataChunk {
  return chunk.type.startsWith('data-')
}

/**
 * The AG-UI event for an AI SDK data chunk. A persistent chunk with an `id`
 * and object data is an activity, so the TanStack client shows it as an
 * activity message and replaces it when the same `id` comes again. AG-UI
 * activity content must be an object, so other data, transient chunks and
 * chunks without an `id` stay CUSTOM events named `data-<name>`.
 */
export function dataChunkEvent(chunk: DataChunk): StreamChunk {
  if (
    chunk.transient !== true &&
    chunk.id !== undefined &&
    isRecord(chunk.data)
  )
    return {
      type: EventType.ACTIVITY_SNAPSHOT,
      messageId: chunk.id,
      activityType: chunk.type.slice('data-'.length),
      content: chunk.data,
      replace: true,
    }
  return { type: EventType.CUSTOM, name: chunk.type, value: chunk.data }
}

/** `doc` with an RFC 6902 patch applied, or undefined when the patch fails. */
function patched(doc: unknown, patch: JsonPatch): unknown {
  try {
    return jsonPatch.applyPatch(structuredClone(doc), patch, true, false)
      .newDocument
  } catch (error) {
    console.warn('JSON Patch failed', error)
    return undefined
  }
}
