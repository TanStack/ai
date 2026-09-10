import type { RunLogRecord } from '../src/run-log'

export class FakeDurableStorage {
  readonly data = new Map<string, unknown>()
  alarm: number | null = null
  private transactionTail = Promise.resolve()

  get<T>(key: string): Promise<T | undefined> {
    return Promise.resolve(this.data.get(key) as T | undefined)
  }

  put(key: string, value: unknown): Promise<void> {
    this.data.set(key, value)
    return Promise.resolve()
  }

  list<T>(options?: {
    prefix?: string
    start?: string
  }): Promise<Map<string, T>> {
    let entries = [...this.data.entries()].sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    )
    if (options?.prefix !== undefined) {
      entries = entries.filter(([key]) => key.startsWith(options.prefix!))
    }
    if (options?.start !== undefined) {
      entries = entries.filter(([key]) => key >= options.start!)
    }
    return Promise.resolve(new Map(entries) as Map<string, T>)
  }

  transaction<T>(
    closure: (txn: {
      get: <V>(key: string) => Promise<V | undefined>
      put: (key: string, value: unknown) => Promise<void>
    }) => Promise<T>,
  ): Promise<T> {
    const result = this.transactionTail.then(() =>
      closure({
        get: <V>(key: string) =>
          Promise.resolve(this.data.get(key) as V | undefined),
        put: (key, value) => {
          this.data.set(key, value)
          return Promise.resolve()
        },
      }),
    )
    this.transactionTail = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }

  getAlarm(): Promise<number | null> {
    return Promise.resolve(this.alarm)
  }

  setAlarm(timestamp: number | Date): Promise<void> {
    this.alarm = timestamp instanceof Date ? timestamp.getTime() : timestamp
    return Promise.resolve()
  }
}

export function fakeDurableStorage(): FakeDurableStorage &
  DurableObjectStorage {
  return new FakeDurableStorage() as unknown as FakeDurableStorage &
    DurableObjectStorage
}

export function fakeCoordinatorState() {
  const storage = fakeDurableStorage()
  const state = {
    storage,
    waitUntil(_promise: Promise<unknown>) {},
    acceptWebSocket() {},
  } as unknown as DurableObjectState
  return {
    storage,
    state,
    async invokeAlarm(handler: { alarm: () => Promise<void> }) {
      storage.alarm = null
      await handler.alarm()
    },
  }
}

export function seedRunningRecord(
  storage: FakeDurableStorage,
  options: { runId?: string; updatedAt: number; threadId?: string },
): void {
  const runId = options.runId ?? 'run-1'
  const record: RunLogRecord = {
    runId,
    threadId: options.threadId ?? 'thread-1',
    status: 'running',
    startedAt: options.updatedAt,
    updatedAt: options.updatedAt,
    lastSeq: -1,
  }
  storage.data.set(`rec:${runId}`, record)
}

export function deferred<T = void>() {
  let resolve = (_value: T): void => {}
  const promise = new Promise<T>((res) => {
    resolve = res
  })
  return { promise, resolve }
}
