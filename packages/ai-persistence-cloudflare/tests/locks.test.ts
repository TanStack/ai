import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  CloudflareLockDurableObject,
  createDurableObjectLockStore,
} from '../src/index'
import type {
  DurableObjectNamespaceBinding,
  DurableObjectStubBinding,
  LockDurableObjectStorage,
} from '../src/index'

class FakeLockStorage implements LockDurableObjectStorage {
  readonly values = new Map<string, unknown>()
  alarm: number | undefined

  get(key: string): Promise<unknown> {
    return Promise.resolve(this.values.get(key))
  }

  put(key: string, value: unknown): Promise<void> {
    this.values.set(key, value)
    return Promise.resolve()
  }

  delete(key: string): Promise<boolean> {
    return Promise.resolve(this.values.delete(key))
  }

  setAlarm(timestamp: number): Promise<void> {
    this.alarm = timestamp
    return Promise.resolve()
  }

  deleteAlarm(): Promise<void> {
    this.alarm = undefined
    return Promise.resolve()
  }
}

function request(
  operation: 'acquire' | 'renew' | 'release',
  ownerId: string,
  leaseDurationMs = 100,
): Request {
  return new Request(`https://lock.invalid/${operation}`, {
    method: 'POST',
    body: JSON.stringify({ ownerId, leaseDurationMs }),
    headers: { 'content-type': 'application/json' },
  })
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

function waitForAbort(signal: AbortSignal): Promise<void> {
  if (signal.aborted) return Promise.resolve()
  return new Promise((resolve) => {
    signal.addEventListener('abort', () => resolve(), { once: true })
  })
}

async function ownerIdFrom(request: Request): Promise<string | undefined> {
  const body: unknown = await request.clone().json()
  if (
    typeof body !== 'object' ||
    body === null ||
    !('ownerId' in body) ||
    typeof body.ownerId !== 'string'
  ) {
    return undefined
  }
  return body.ownerId
}

afterEach(() => {
  vi.useRealTimers()
})

describe('CloudflareLockDurableObject', () => {
  it('acquires, renews, and releases an owner-scoped lease', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(1_000)
    const storage = new FakeLockStorage()
    const durableObject = new CloudflareLockDurableObject({ storage })

    expect((await durableObject.fetch(request('acquire', 'one'))).status).toBe(
      200,
    )
    expect((await durableObject.fetch(request('acquire', 'two'))).status).toBe(
      409,
    )
    vi.setSystemTime(1_050)
    expect((await durableObject.fetch(request('renew', 'one'))).status).toBe(
      200,
    )
    expect(storage.alarm).toBe(1_150)
    expect((await durableObject.fetch(request('release', 'two'))).status).toBe(
      409,
    )
    expect((await durableObject.fetch(request('release', 'one'))).status).toBe(
      200,
    )
    expect((await durableObject.fetch(request('acquire', 'two'))).status).toBe(
      200,
    )
  })

  it('expires a lease from the Durable Object alarm', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(2_000)
    const storage = new FakeLockStorage()
    const durableObject = new CloudflareLockDurableObject({ storage })
    await durableObject.fetch(request('acquire', 'one'))

    vi.setSystemTime(2_101)
    await durableObject.alarm()

    expect((await durableObject.fetch(request('acquire', 'two'))).status).toBe(
      200,
    )
  })
})

describe('Durable Object LockStore', () => {
  it('renews a long-running critical section and awaits release', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(3_000)
    const storage = new FakeLockStorage()
    const server = new CloudflareLockDurableObject({ storage })
    const operations: Array<string> = []
    const stub: DurableObjectStubBinding = {
      fetch(input) {
        const requestInput =
          input instanceof Request ? input : new Request(input)
        operations.push(new URL(requestInput.url).pathname)
        return server.fetch(requestInput)
      },
    }
    const namespace: DurableObjectNamespaceBinding<string> = {
      idFromName: (name) => name,
      get: () => stub,
    }
    const store = createDurableObjectLockStore(namespace, {
      leaseDurationMs: 100,
      renewIntervalMs: 40,
      retryDelayMs: 5,
      acquireTimeoutMs: 100,
      createOwnerId: () => 'owner',
    })
    const work = deferred<string>()
    const result = store.withLock('workspace', () => work.promise)

    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(41)
    expect(operations).toContain('/renew')
    work.resolve('done')
    await expect(result).resolves.toBe('done')
    expect(operations.at(-1)).toBe('/release')
  })

  it('surfaces renewal failure after user work settles and still releases', async () => {
    vi.useFakeTimers()
    const operations: Array<string> = []
    const stub: DurableObjectStubBinding = {
      fetch(input) {
        const requestInput =
          input instanceof Request ? input : new Request(input)
        const operation = new URL(requestInput.url).pathname
        operations.push(operation)
        return Promise.resolve(
          new Response(null, { status: operation === '/renew' ? 503 : 200 }),
        )
      },
    }
    const namespace: DurableObjectNamespaceBinding<string> = {
      idFromName: (name) => name,
      get: () => stub,
    }
    const store = createDurableObjectLockStore(namespace, {
      leaseDurationMs: 100,
      renewIntervalMs: 40,
      createOwnerId: () => 'owner',
    })
    const work = deferred<string>()
    const result = store.withLock('workspace', () => work.promise)

    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(41)
    work.resolve('done')

    await expect(result).rejects.toThrow(/renew.*503/i)
    expect(operations.at(-1)).toBe('/release')
  })

  it('aborts a lost lease before another owner enters after expiry', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(4_000)
    const storage = new FakeLockStorage()
    const server = new CloudflareLockDurableObject({ storage })
    const stub: DurableObjectStubBinding = {
      async fetch(input) {
        const requestInput =
          input instanceof Request ? input : new Request(input)
        const operation = new URL(requestInput.url).pathname
        const ownerId = await ownerIdFrom(requestInput)
        if (
          ownerId === 'owner-1' &&
          (operation === '/renew' || operation === '/release')
        ) {
          return new Response(null, { status: 503 })
        }
        return server.fetch(requestInput)
      },
    }
    const namespace: DurableObjectNamespaceBinding<string> = {
      idFromName: (name) => name,
      get: () => stub,
    }
    const firstStore = createDurableObjectLockStore(namespace, {
      leaseDurationMs: 100,
      renewIntervalMs: 40,
      retryDelayMs: 5,
      acquireTimeoutMs: 200,
      createOwnerId: () => 'owner-1',
    })
    const secondStore = createDurableObjectLockStore(namespace, {
      leaseDurationMs: 100,
      renewIntervalMs: 40,
      retryDelayMs: 5,
      acquireTimeoutMs: 200,
      createOwnerId: () => 'owner-2',
    })
    const legacyStop = deferred<void>()
    let active = 0
    let maximumActive = 0
    let firstAborted = false

    const first = firstStore.withLock('workspace', async (signal) => {
      active += 1
      maximumActive = Math.max(maximumActive, active)
      if (signal instanceof AbortSignal) {
        await waitForAbort(signal)
        firstAborted = signal.aborted
      } else {
        await legacyStop.promise
      }
      active -= 1
    })
    const firstError = first.then(
      () => undefined,
      (error: unknown) => error,
    )
    await vi.advanceTimersByTimeAsync(0)
    const second = secondStore.withLock('workspace', async () => {
      active += 1
      maximumActive = Math.max(maximumActive, active)
      active -= 1
      return 'second'
    })

    await vi.advanceTimersByTimeAsync(110)
    legacyStop.resolve()
    await expect(second).resolves.toBe('second')
    await expect(firstError).resolves.toBeInstanceOf(AggregateError)

    expect(firstAborted).toBe(true)
    expect(maximumActive).toBe(1)
  })

  it('surfaces release failure', async () => {
    const stub: DurableObjectStubBinding = {
      fetch(input) {
        const requestInput =
          input instanceof Request ? input : new Request(input)
        const operation = new URL(requestInput.url).pathname
        return Promise.resolve(
          new Response(null, { status: operation === '/release' ? 503 : 200 }),
        )
      },
    }
    const namespace: DurableObjectNamespaceBinding<string> = {
      idFromName: (name) => name,
      get: () => stub,
    }
    const store = createDurableObjectLockStore(namespace, {
      createOwnerId: () => 'owner',
    })

    await expect(store.withLock('workspace', async () => 42)).rejects.toThrow(
      /release.*503/i,
    )
  })

  it('preserves a critical section rejection with an undefined reason', async () => {
    const namespace: DurableObjectNamespaceBinding<string> = {
      idFromName: (name) => name,
      get: () => ({ fetch: () => Promise.resolve(new Response()) }),
    }
    const store = createDurableObjectLockStore(namespace)

    await expect(
      store.withLock('workspace', () => Promise.reject(undefined)),
    ).rejects.toBeUndefined()
  })

  it('aggregates critical section and release failures', async () => {
    const workError = new Error('work failed')
    const stub: DurableObjectStubBinding = {
      fetch(input) {
        const requestInput =
          input instanceof Request ? input : new Request(input)
        const operation = new URL(requestInput.url).pathname
        return Promise.resolve(
          new Response(null, { status: operation === '/release' ? 503 : 200 }),
        )
      },
    }
    const namespace: DurableObjectNamespaceBinding<string> = {
      idFromName: (name) => name,
      get: () => stub,
    }
    const store = createDurableObjectLockStore(namespace)

    const error = await store
      .withLock('workspace', () => Promise.reject(workError))
      .then(
        () => undefined,
        (reason: unknown) => reason,
      )

    expect(error).toBeInstanceOf(AggregateError)
    expect(error).toMatchObject({
      errors: [
        workError,
        expect.objectContaining({
          message: expect.stringMatching(/release.*503/i),
        }),
      ],
    })
  })

  it('rejects invalid lease timing before acquiring', () => {
    const namespace: DurableObjectNamespaceBinding<string> = {
      idFromName: (name) => name,
      get: () => ({ fetch: () => Promise.resolve(new Response()) }),
    }
    expect(() =>
      createDurableObjectLockStore(namespace, {
        leaseDurationMs: 100,
        renewIntervalMs: 100,
      }),
    ).toThrow(/renewIntervalMs.*leaseDurationMs/)
  })
})
