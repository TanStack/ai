const detachSignals = new WeakMap<object, () => boolean>()

export function publishRunDetachedSignal(
  stream: object,
  wasDetached: () => boolean,
): void {
  detachSignals.set(stream, wasDetached)
}

export function wasRunDetached(stream: unknown): boolean {
  if (typeof stream !== 'object' || stream === null) return false
  const signal = detachSignals.get(stream)
  if (signal === undefined) return false
  try {
    return signal()
  } catch {
    return false
  }
}
