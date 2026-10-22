import { ConsoleLogger } from '@tanstack/ai'
import type { Logger } from '@tanstack/ai'
import type { HostEvent } from './host'

/** The most events that wait for one slow reader. Then its read ends. */
export const HOST_EVENT_QUEUE_MAX = 1_000

/** The tenant of a host event. `undefined` is the default tenant. */
export function tenantOfHostEvent(event: HostEvent) {
  return event.type === 'session' || event.type === 'session-deleted'
    ? event.entry.tenantId
    : event.tenantId
}

/** One running read of the bus. */
interface Reader {
  filter?: (event: HostEvent) => boolean
  push: (event: HostEvent) => void
}

/**
 * The fan-out of `host.events()`. A reader of one tenant gets only the
 * events of that tenant, so an event does not visit the readers of other
 * tenants. A reader's filter runs before its queue, so a rejected event
 * takes no memory. A reader that falls more than `maxQueue` events behind
 * stops: its read ends, and it reads again to get the current statuses.
 */
export class HostEventBus {
  /** The readers of each tenant. */
  private readonly tenants = new Map<string | undefined, Set<Reader>>()
  /** The readers of every tenant. */
  private readonly everyTenant = new Set<Reader>()
  /** Where a reader that throws is logged. */
  private readonly logger: Logger

  constructor(logger: Logger = new ConsoleLogger()) {
    this.logger = logger
  }

  /** Give `event` to each reader of its tenant and each reader of every tenant. */
  emit(event: HostEvent): void {
    const own = this.tenants.get(tenantOfHostEvent(event))
    for (const reader of [...(own ?? []), ...this.everyTenant]) {
      // One reader that throws must not stop the others.
      try {
        if (reader.filter && !reader.filter(event)) continue
        reader.push(event)
      } catch (error) {
        this.logger.error(
          '[@tanstack/ai-harness] A host events reader threw.',
          { error },
        )
      }
    }
  }

  /** The number of running reads. */
  get readers() {
    let count = this.everyTenant.size
    for (const readers of this.tenants.values()) count += readers.size
    return count
  }

  /**
   * The events from now on, after `initial`. With `tenant`, only the events
   * of that tenant (`undefined` is the default tenant). The read ends when
   * `signal` aborts, the loop ends, or more than `maxQueue` live events wait
   * (`initial` does not count).
   *
   * The reader listens from this call, not from the first pull, so no event
   * between the read of `initial` and the loop is lost.
   */
  read(
    options: {
      tenant?: { tenantId: string | undefined }
      filter?: (event: HostEvent) => boolean
      initial?: ReadonlyArray<HostEvent>
      maxQueue?: number
      signal?: AbortSignal
    } = {},
  ): AsyncIterable<HostEvent> {
    const { tenant, filter, signal } = options
    const maxQueue = options.maxQueue ?? HOST_EVENT_QUEUE_MAX
    const initial = [...(options.initial ?? [])]
    const queue: Array<HostEvent> = []
    let isFull = false
    let wake = () => {}
    const set = tenant ? this.tenantSet(tenant.tenantId) : this.everyTenant
    const stop = () => {
      set.delete(reader)
      if (tenant && set.size === 0) this.tenants.delete(tenant.tenantId)
      signal?.removeEventListener('abort', onAbort)
    }
    const onAbort = () => {
      stop()
      wake()
    }
    const reader: Reader = {
      ...(filter ? { filter } : {}),
      push: (event) => {
        if (queue.length < maxQueue) queue.push(event)
        else {
          // ponytail: a full reader stops listening at once, so a read that
          // nobody loops over holds at most `maxQueue` events.
          isFull = true
          stop()
        }
        wake()
      },
    }
    set.add(reader)
    signal?.addEventListener('abort', onAbort)
    if (signal?.aborted) stop()
    return (async function* () {
      try {
        while (!signal?.aborted) {
          const next = initial.shift() ?? queue.shift()
          if (next) {
            yield next
            continue
          }
          // The events that waited went out, so the reader saw each one up
          // to the drop. It ends now, and reads again for the current state.
          if (isFull) return
          await new Promise<void>((resolve) => {
            wake = resolve
          })
        }
      } finally {
        // A loop that ends (break, return, throw, abort) stops listening.
        stop()
      }
    })()
  }

  private tenantSet(tenantId: string | undefined) {
    let set = this.tenants.get(tenantId)
    if (!set) {
      set = new Set()
      this.tenants.set(tenantId, set)
    }
    return set
  }
}
