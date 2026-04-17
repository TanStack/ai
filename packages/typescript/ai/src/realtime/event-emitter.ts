import type { RealtimeEvent, RealtimeEventHandler } from "./types";

export function createRealtimeEventEmitter() {
  const eventHandlers = new Map<RealtimeEvent, Set<RealtimeEventHandler<any>>>()

  return {
    emit<TEvent extends RealtimeEvent>(
      event: TEvent,
      payload: Parameters<RealtimeEventHandler<TEvent>>[0],
    ) {
      const handlers = eventHandlers.get(event)
      if (handlers) {
        for (const handler of handlers) {
          handler(payload)
        }
      }
    },
    on<TEvent extends RealtimeEvent>(
      event: TEvent,
      handler: RealtimeEventHandler<TEvent>,
    ): () => void {
      if (!eventHandlers.has(event)) {
        eventHandlers.set(event, new Set())
      }
      eventHandlers.get(event)!.add(handler)
    
      return () => {
        eventHandlers.get(event)!.delete(handler)
      }
    }
  }
}