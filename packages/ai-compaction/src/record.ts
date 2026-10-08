import type { ModelMessage, TokenUsage } from '@tanstack/ai'
import type { CompactionReason } from './index'

/** The log record type of a durable compaction. */
export const COMPACTION_RECORD_TYPE = 'tanstack.compaction'

/**
 * One durable compaction, as a host log record. Fold it into the model
 * context with {@link projectCompaction}. It is a type, not an interface, so
 * it fits the record shape of `LogRecordsWriter.append`.
 */
export type CompactionRecord = {
  type: typeof COMPACTION_RECORD_TYPE
  reason: CompactionReason
  tokensBefore: number
  tokensAfter: number
  usage?: TokenUsage
  /** The messages before `from` were replaced by `head`. */
  head: Array<ModelMessage>
  from: number
  /** The id of the first kept message, when it has one. Checked before `from`. */
  firstKeptId?: string
}

const sameMessage = (a: ModelMessage, b: ModelMessage) =>
  a === b || JSON.stringify(a) === JSON.stringify(b)

/**
 * The record of a compaction from `before` to `after`: the new head, and the
 * index in `before` where the kept tail starts. When `after` does not end with
 * the tail of `before`, the head is all of `after`, and `from` is the end of
 * `before`.
 */
export function compactionRecord(input: {
  reason: CompactionReason
  before: ReadonlyArray<ModelMessage>
  after: Array<ModelMessage>
  tokensBefore: number
  tokensAfter: number
  usage?: TokenUsage
}): CompactionRecord {
  const { before, after } = input
  let kept = 0
  for (;;) {
    const old = before[before.length - 1 - kept]
    const next = after[after.length - 1 - kept]
    if (!old || !next || !sameMessage(old, next)) break
    kept += 1
  }
  // A full rewrite keeps no tail: the head is all of `after`, and `from` is
  // the end of `before`. A fold that does not have all of `before` yet (the
  // results of a tool phase that are not saved) then skips the record.
  const from = before.length - kept
  const firstKeptId = before[from]?.id
  return {
    type: COMPACTION_RECORD_TYPE,
    reason: input.reason,
    tokensBefore: input.tokensBefore,
    tokensAfter: input.tokensAfter,
    ...(input.usage ? { usage: input.usage } : {}),
    head: after.slice(0, after.length - kept),
    from,
    ...(firstKeptId ? { firstKeptId } : {}),
  }
}

// The log is folded again on each open, so a bad record must not throw.
const isMessageList = (value: unknown): value is Array<ModelMessage> =>
  Array.isArray(value) &&
  value.every(
    (item: unknown) =>
      typeof item === 'object' &&
      item !== null &&
      'role' in item &&
      typeof item.role === 'string',
  )

/**
 * Fold a compaction record into the model context. Give it to the host:
 * `createHarnessHost({ project: { record: projectCompaction } })`. Returns
 * `undefined` for a record of another type, and for a record that this fold
 * cannot use. Pure: the same log always folds to the same context.
 */
export function projectCompaction(input: {
  messages: ReadonlyArray<ModelMessage>
  record: { type: string; [key: string]: unknown }
}): Array<ModelMessage> | undefined {
  const { messages, record } = input
  if (record.type !== COMPACTION_RECORD_TYPE) return undefined
  const head = record.head
  if (!isMessageList(head)) return undefined
  const start =
    typeof record.firstKeptId === 'string'
      ? messages.findIndex((message) => message.id === record.firstKeptId)
      : record.from
  // The record counted messages that this fold does not have yet (a kept id
  // that is not here, or a `from` past the end), or it is malformed. Skip it:
  // the next check compacts again. A slice here would repeat those messages.
  if (
    typeof start !== 'number' ||
    !Number.isInteger(start) ||
    start < 0 ||
    start > messages.length
  ) {
    return undefined
  }
  return [...head, ...messages.slice(start)]
}
