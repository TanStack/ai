import type { SessionEvent } from './types'

/**
 * A FIFO queue with O(1) push and amortized O(1) shift. A shift moves a head
 * index. The array is cut only when the dropped half is the bigger half, so
 * each item is moved at most once per cut.
 */
class Queue<T> {
  private items: Array<T | undefined> = []
  private head = 0

  get length() {
    return this.items.length - this.head
  }

  /** The item at `index`, counted from the oldest. */
  at(index: number) {
    return this.items[this.head + index] as T
  }

  push(item: T) {
    this.items.push(item)
  }

  shift() {
    if (this.length === 0) return undefined
    const item = this.items[this.head] as T
    this.items[this.head] = undefined
    this.head += 1
    if (this.head * 2 >= this.items.length) {
      this.items = this.items.slice(this.head)
      this.head = 0
    }
    return item
  }
}

/** One kept event: the shape of the in-memory tail of the shared log. */
export interface RingEntry {
  thread: string
  entry: SessionEvent
  /** The byte size of the event (its JSON length). */
  size: number
}

/** The events after a cursor, and whether older events are gone. */
export interface RingRead {
  entries: Array<SessionEvent>
  /**
   * `true` when the cursor is older than the oldest kept event: the ring
   * dropped events that the reader did not get. The caller can send a gap.
   */
  gap: boolean
}

/**
 * The newest events, up to `maxBytes` of them. A push that goes over the cap
 * drops the oldest events, but the newest event always stays. Cursors are
 * numbers that grow with each push. They do not need to be consecutive.
 *
 * Push and drop are O(1) (amortized). A read finds its start with a binary
 * search, and a read of one thread uses the index of that thread, so it does
 * not walk the events of other threads.
 */
export class EventRing {
  private readonly all = new Queue<RingEntry & { cursor: number }>()
  /** The kept events of each thread, oldest first. */
  private readonly threads = new Map<
    string,
    Queue<RingEntry & { cursor: number }>
  >()
  private total = 0
  private readonly maxBytes: number
  /** Every event after this cursor is kept. */
  private floor: number

  /**
   * `from`: the cursor before the first event the ring gets. A read from an
   * older cursor reports a gap. Default `0`.
   */
  constructor(options: { maxBytes: number; from?: number }) {
    this.maxBytes = options.maxBytes
    this.floor = options.from ?? 0
  }

  /** The sum of the sizes of the kept events. */
  get bytes() {
    return this.total
  }

  /** The number of kept events. */
  get length() {
    return this.all.length
  }

  /** Every event after this cursor is kept. An older cursor has a gap. */
  get from() {
    return this.floor
  }

  /** Keep `item`. Its cursor must be bigger than the cursor of each kept event. */
  push(item: RingEntry): void {
    const kept = { ...item, cursor: Number(item.entry.cursor) }
    this.all.push(kept)
    let own = this.threads.get(item.thread)
    if (!own) {
      own = new Queue()
      this.threads.set(item.thread, own)
    }
    own.push(kept)
    this.total += item.size
    while (this.total > this.maxBytes && this.all.length > 1) {
      // The oldest event of all is also the oldest event of its thread.
      const dropped = this.all.shift()
      if (!dropped) break
      const queue = this.threads.get(dropped.thread)
      queue?.shift()
      if (queue?.length === 0) this.threads.delete(dropped.thread)
      this.total -= dropped.size
      this.floor = dropped.cursor
    }
  }

  /**
   * The kept events after `cursor` (exclusive), oldest first. With `thread`,
   * only the events of that thread.
   */
  after(cursor: number, thread?: string): RingRead {
    const queue = thread === undefined ? this.all : this.threads.get(thread)
    const entries: Array<SessionEvent> = []
    if (queue) {
      for (let i = firstAfter(queue, cursor); i < queue.length; i++) {
        entries.push(queue.at(i).entry)
      }
    }
    return { entries, gap: cursor < this.floor }
  }
}

/** The index of the first item of `queue` with a cursor after `cursor`. */
function firstAfter(queue: Queue<{ cursor: number }>, cursor: number) {
  let low = 0
  let high = queue.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (queue.at(middle).cursor <= cursor) low = middle + 1
    else high = middle
  }
  return low
}
