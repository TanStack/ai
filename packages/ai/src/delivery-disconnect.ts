const disconnectHandlers = new WeakMap<object, () => void>()

export function publishRunDisconnectHandler(
  stream: object,
  onDisconnect: () => void,
): void {
  disconnectHandlers.set(stream, onDisconnect)
}

export function notifyRunDisconnected(stream: unknown): void {
  const isInvalidStream = typeof stream !== 'object' || stream === null
  if (isInvalidStream) return
  const handler = disconnectHandlers.get(stream)
  if (handler === undefined) return
  try {
    handler()
  } catch {
    // Intentionally empty: see above.
  }
}
