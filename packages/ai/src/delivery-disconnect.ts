const disconnectHandlers = new WeakMap<object, () => void>()

export function publishRunDisconnectHandler(
  stream: object,
  onDisconnect: () => void,
): void {
  disconnectHandlers.set(stream, onDisconnect)
}

export function notifyRunDisconnected(stream: unknown): void {
  if (typeof stream !== 'object' || stream === null) return
  const handler = disconnectHandlers.get(stream)
  if (handler === undefined) return
  try {
    handler()
  } catch {
    // Intentionally empty: see above.
  }
}
