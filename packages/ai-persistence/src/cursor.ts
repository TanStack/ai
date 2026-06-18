/**
 * Resume cursors.
 *
 * A cursor is an OPAQUE string the client echoes back to resume a run. It
 * encodes a `(runId, seq)` pair where `seq` is a per-run monotonic sequence
 * assigned to each persisted event. The opacity keeps the public contract free
 * of any "cursor is an integer" assumption — backends compare by the decoded
 * `seq`, and the wire format can evolve without breaking clients.
 *
 * Encoding: base64url of `"<seq>:<runId>"`. The sequence comes first and has no
 * colon, so the runId (which may contain colons) is everything after the first
 * delimiter — robust regardless of runId content.
 */

/** Decode the inner `"<seq>:<runId>"` payload, or null if malformed. */
function decodePayload(cursor: string): { runId: string; seq: number } | null {
  let decoded: string
  try {
    decoded = Buffer.from(cursor, 'base64url').toString('utf8')
  } catch {
    return null
  }
  const delimiter = decoded.indexOf(':')
  if (delimiter <= 0) {
    return null
  }
  const seqText = decoded.slice(0, delimiter)
  if (!/^\d+$/.test(seqText)) {
    return null
  }
  return { seq: Number(seqText), runId: decoded.slice(delimiter + 1) }
}

/** Encode a `(runId, seq)` pair into an opaque cursor string. */
export function encodeCursor(runId: string, seq: number): string {
  return Buffer.from(`${seq}:${runId}`, 'utf8').toString('base64url')
}

/** Decode a cursor back to its `(runId, seq)` pair. Throws if malformed. */
export function decodeCursor(cursor: string): { runId: string; seq: number } {
  const payload = decodePayload(cursor)
  if (payload === null) {
    throw new Error(`Invalid resume cursor: ${cursor}`)
  }
  return payload
}

/** Whether `value` is a well-formed cursor produced by {@link encodeCursor}. */
export function isValidCursor(value: string): boolean {
  return value.length > 0 && decodePayload(value) !== null
}

/**
 * Per-run monotonic sequence counter held by `withPersistence` for the lifetime
 * of one run. `next()` assigns the next sequence to an event; on resume,
 * construct it with the highest already-persisted sequence so new events keep
 * climbing without colliding with replayed ones.
 */
export class RunSequence {
  private seq: number

  constructor(
    private readonly runId: string,
    initialSeq = 0,
  ) {
    this.seq = initialSeq
  }

  /** Assign and return the next sequence number. */
  next(): number {
    this.seq += 1
    return this.seq
  }

  /** The most recently assigned sequence number. */
  current(): number {
    return this.seq
  }

  /** Encode the current sequence as a cursor for this run. */
  toCursor(): string {
    return encodeCursor(this.runId, this.seq)
  }
}
