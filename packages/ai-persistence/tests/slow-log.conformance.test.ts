import { runPersistenceConformance } from '../src/testkit/conformance'
import {
  memoryLogState,
  memoryLogStore,
  memoryPersistence,
} from '../src/memory'
import { defineAIPersistence } from '../src/types'
import type { LogStore } from '../src/types'

// A correct log store on a loaded runner: the reply to a call that starts a
// short ttl or wake comes back later than the short window itself. The
// conformance suite must still pass it.
const REPLY_LATENCY_MS = 450
const SHORT_WINDOW_MS = 1_000

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function startsShortWindow(args: Array<unknown>): boolean {
  const [input] = args
  if (typeof input !== 'object' || input === null) return false
  return ['ttlMs', 'wakeInMs'].some((key) => {
    const value: unknown = Reflect.get(input, key)
    return typeof value === 'number' && value > 0 && value <= SHORT_WINDOW_MS
  })
}

function slowRepliesLogStore(store: LogStore): LogStore {
  return new Proxy(store, {
    get(target, key, receiver) {
      const value: unknown = Reflect.get(target, key, receiver)
      if (typeof value !== 'function') return value
      return (...args: Array<unknown>) => {
        const result: unknown = value.apply(target, args)
        if (!startsShortWindow(args)) return result
        return Promise.resolve(result).then(async (reply) => {
          await pause(REPLY_LATENCY_MS)
          return reply
        })
      }
    },
  })
}

const state = memoryLogState()

runPersistenceConformance(
  'memory, slow replies',
  () =>
    defineAIPersistence({
      stores: {
        ...memoryPersistence().stores,
        log: slowRepliesLogStore(memoryLogStore({ state })),
      },
    }),
  {
    twin: (persistence) =>
      defineAIPersistence({
        stores: { ...persistence.stores, log: memoryLogStore({ state }) },
      }),
  },
)
