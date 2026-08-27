export class AsyncQueue<T> implements AsyncIterable<T> {
  private readonly values: Array<T> = []
  private readonly waiters: Array<{
    resolve: (result: IteratorResult<T>) => void
    reject: (error: unknown) => void
  }> = []
  private ended = false
  private error: unknown = undefined
  private failed = false

  push(value: T): void {
    const isClosed = this.ended || this.failed
    if (isClosed) return
    const waiter = this.waiters.shift()
    if (waiter) {
      waiter.resolve({ value, done: false })
    } else {
      this.values.push(value)
    }
  }

  /** Signal normal completion; pending and future reads resolve as done. */
  end(): void {
    const isClosed = this.ended || this.failed
    if (isClosed) return
    this.ended = true
    const pendingWaiters = this.waiters.splice(0)
    for (const waiter of pendingWaiters) {
      waiter.resolve({ value: undefined, done: true })
    }
  }

  /** Signal failure; pending and future reads reject (after buffered values drain). */
  fail(error: unknown): void {
    const isClosed = this.ended || this.failed
    if (isClosed) return
    this.failed = true
    this.error = error
    const pendingWaiters = this.waiters.splice(0)
    for (const waiter of pendingWaiters) {
      waiter.reject(error)
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<T> {
    return {
      next: (): Promise<IteratorResult<T>> => {
        if (this.values.length > 0) {
          return Promise.resolve({
            value: this.values.shift() as T,
            done: false,
          })
        }
        if (this.failed) return Promise.reject(this.error)
        if (this.ended) {
          return Promise.resolve({ value: undefined, done: true })
        }
        return new Promise((resolve, reject) => {
          this.waiters.push({ resolve, reject })
        })
      },
    }
  }
}
