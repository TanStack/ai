import { encodeWsFrame } from '@tanstack/ai'
import type { SessionEvent } from './types'

// The encoded frame of each log entry. Readers of one log get the same entry
// objects, so N readers encode an event once.
const encoded = new WeakMap<SessionEvent, string>()

/**
 * The `harness.event` frame of `entry` as JSON text. The event is an AG-UI
 * wire chunk (`toWireChunk`): keys that are not in the AG-UI spec are gone.
 * The log keeps the full chunk. Only the wire drops keys.
 *
 * @example
 * ```ts
 * for await (const entry of session.events({ from })) socket.send(wireFrame(entry))
 * ```
 */
export function wireFrame(entry: SessionEvent): string {
  const cached = encoded.get(entry)
  if (cached !== undefined) return cached
  const { event, ...tags } = entry
  // `encodeWsFrame` with no id is the JSON of `toWireChunk(event)`. The slice
  // drops the closing `}` of the tags, so the event goes in after them.
  const text = `${JSON.stringify({ type: 'harness.event', ...tags }).slice(0, -1)},"event":${encodeWsFrame(event, undefined)}}`
  encoded.set(entry, text)
  return text
}
