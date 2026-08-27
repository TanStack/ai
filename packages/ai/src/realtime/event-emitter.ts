import type {
  RealtimeEvent,
  RealtimeEventHandler,
  RealtimeEventPayloads,
} from './types'

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
