/**
 * Resources one plugin owns for one lifetime (a session or a turn).
 *
 * - `acquire(open, close)` registers `close` only after `open` succeeds.
 * - If the scope closes while `open` is still running, the late resource is
 *   closed as soon as it arrives.
 * - `dispose()` closes resources newest first, runs every closer even when
 *   one throws, and returns the same promise to every caller.
 */
export class ResourceScope {
  private readonly controller = new AbortController()
  readonly signal: AbortSignal = this.controller.signal
  private readonly closers: Array<() => unknown> = []
  private closing?: Promise<void>
  private closed = false

  async acquire<T>(
    open: () => T | Promise<T>,
    close: (resource: T) => unknown,
  ): Promise<T> {
    this.signal.throwIfAborted()
    const resource = await open()
    if (this.closed) {
      await close(resource)
      throw this.signal.reason
    }
    this.closers.push(() => close(resource))
    return resource
  }

  dispose(): Promise<void> {
    if (this.closing) return this.closing
    this.closed = true
    this.controller.abort(new Error('Resource scope disposed'))
    // Defer, so a closer that calls dispose() again gets the same promise.
    // An `open` still running is not awaited: `acquire` closes its resource
    // when it arrives, so an `open` that ignores `signal` cannot hang this.
    this.closing = Promise.resolve().then(async () => {
      const errors: Array<unknown> = []
      for (const close of this.closers.reverse()) {
        try {
          await close()
        } catch (error) {
          errors.push(error)
        }
      }
      this.closers.length = 0
      if (errors.length > 0) {
        throw new AggregateError(errors, 'Resource cleanup failed')
      }
    })
    return this.closing
  }
}

/**
 * Dispose scopes newest first. Every scope is disposed even when one fails.
 * Throws an `AggregateError` with every failure, after all scopes ran.
 */
export async function disposeAll(
  scopes: ReadonlyArray<ResourceScope>,
): Promise<void> {
  const errors: Array<unknown> = []
  for (const scope of [...scopes].reverse()) {
    try {
      await scope.dispose()
    } catch (error) {
      errors.push(error)
    }
  }
  if (errors.length > 0) {
    throw new AggregateError(errors, 'Plugin cleanup failed')
  }
}
