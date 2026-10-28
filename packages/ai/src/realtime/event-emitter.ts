import type {
  RealtimeEvent,
  RealtimeEventHandler,
  RealtimeEventPayloads,
} from './types'

/**
 * Handlers are stored with a `never` payload so any specific
 * `RealtimeEventHandler<TEvent>` is assignable in (contravariance), keeping the
 * heterogeneous handler map type-safe without `any`. `emit` narrows back to the
 * event's real payload type via its signature; the lone `as never` at the call
 * site is the inverse of that stored `never`.
 */
type StoredHandler = (payload: never) => void

export function createRealtimeEventEmitter() {
  const eventHandlers = new Map<RealtimeEvent, Set<StoredHandler>>()

  return {
    emit<TEvent extends RealtimeEvent>(
      event: TEvent,
      payload: RealtimeEventPayloads[TEvent],
    ) {
      const handlers = eventHandlers.get(event)
      if (!handlers) return
      for (const handler of handlers) {
        handler(payload as never)
      }
    },
    on<TEvent extends RealtimeEvent>(
      event: TEvent,
      handler: RealtimeEventHandler<TEvent>,
    ): () => void {
      let handlers = eventHandlers.get(event)
      if (!handlers) {
        handlers = new Set<StoredHandler>()
        eventHandlers.set(event, handlers)
      }
      handlers.add(handler)

      return () => {
        handlers.delete(handler)
      }
    },
  }
}
