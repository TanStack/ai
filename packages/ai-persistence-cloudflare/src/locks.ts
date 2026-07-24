import type { LockStore } from '@tanstack/ai-persistence'
import type {
  DurableObjectNamespaceBinding,
  DurableObjectStubBinding,
  LockDurableObjectState,
} from './bindings'

interface LeaseRecord {
  ownerId: string
  expiresAt: number
}

interface LeaseRequest {
  ownerId: string
  leaseDurationMs: number
}

export interface DurableObjectLockStoreOptions {
  /** Duration of each lock lease. Defaults to 30 seconds. */
  leaseDurationMs?: number
  /** Renewal cadence. Defaults to one third of the lease duration. */
  renewIntervalMs?: number
  /** Maximum time spent retrying a contended acquire. Defaults to 30 seconds. */
  acquireTimeoutMs?: number
  /** Delay between contended acquire attempts. Defaults to 50 milliseconds. */
  retryDelayMs?: number
  /** Override owner ID generation, primarily for deterministic runtimes/tests. */
  createOwnerId?: () => string
}

interface ResolvedLockOptions {
  leaseDurationMs: number
  renewIntervalMs: number
  acquireTimeoutMs: number
  retryDelayMs: number
  createOwnerId: () => string
}

type SettledValue<T> =
  | { status: 'fulfilled'; value: T }
  | { status: 'rejected'; reason: unknown }

const leaseKey = 'lease'

function isLeaseRecord(value: unknown): value is LeaseRecord {
  return (
    value !== null &&
    typeof value === 'object' &&
    'ownerId' in value &&
    typeof value.ownerId === 'string' &&
    'expiresAt' in value &&
    typeof value.expiresAt === 'number'
  )
}

function isLeaseRequest(value: unknown): value is LeaseRequest {
  return (
    value !== null &&
    typeof value === 'object' &&
    'ownerId' in value &&
    typeof value.ownerId === 'string' &&
    value.ownerId.length > 0 &&
    'leaseDurationMs' in value &&
    typeof value.leaseDurationMs === 'number' &&
    Number.isFinite(value.leaseDurationMs) &&
    value.leaseDurationMs > 0
  )
}

function response(status: number): Response {
  return new Response(null, { status })
}

/**
 * Durable Object class backing distributed lock leases.
 *
 * Bind this class in Wrangler and pass the resulting namespace to
 * `cloudflarePersistence({ durableObjects })`.
 *
 * SECURITY: this DO must ONLY be reachable through its namespace binding (via
 * `createDurableObjectLockStore`). Its `fetch` handler trusts the caller's
 * `ownerId` and performs no authentication, so routing public HTTP straight to
 * this class exposes an unauthenticated lock-manipulation surface — anyone
 * could acquire, renew, or release any lock key. Never wire it into a public
 * Worker route; reach it only by `namespace.get(namespace.idFromName(key))`.
 */
export class CloudflareLockDurableObject {
  private operationChain: Promise<void> = Promise.resolve()

  constructor(private readonly state: LockDurableObjectState) {}

  fetch(request: Request): Promise<Response> {
    return this.serialize(() => this.handleRequest(request))
  }

  alarm(): Promise<void> {
    return this.serialize(async () => {
      const lease = await this.readLease()
      if (!lease) {
        await this.state.storage.deleteAlarm()
        return
      }
      if (lease.expiresAt > Date.now()) {
        await this.state.storage.setAlarm(lease.expiresAt)
        return
      }
      await this.state.storage.delete(leaseKey)
      await this.state.storage.deleteAlarm()
    })
  }

  private async handleRequest(request: Request): Promise<Response> {
    if (request.method !== 'POST') return response(405)
    let input: unknown
    try {
      input = await request.json()
    } catch {
      return response(400)
    }
    if (!isLeaseRequest(input)) return response(400)

    const operation = new URL(request.url).pathname
    if (operation === '/acquire') return this.acquire(input)
    if (operation === '/renew') return this.renew(input)
    if (operation === '/release') return this.release(input.ownerId)
    return response(404)
  }

  private async acquire(input: LeaseRequest): Promise<Response> {
    const current = await this.readLease()
    if (current && current.expiresAt > Date.now()) return response(409)
    await this.writeLease(input)
    return response(200)
  }

  private async renew(input: LeaseRequest): Promise<Response> {
    const current = await this.readLease()
    if (
      !current ||
      current.ownerId !== input.ownerId ||
      current.expiresAt <= Date.now()
    ) {
      return response(409)
    }
    await this.writeLease(input)
    return response(200)
  }

  private async release(ownerId: string): Promise<Response> {
    const current = await this.readLease()
    if (!current || current.ownerId !== ownerId) return response(409)
    await this.state.storage.delete(leaseKey)
    await this.state.storage.deleteAlarm()
    return response(200)
  }

  private async readLease(): Promise<LeaseRecord | undefined> {
    const value = await this.state.storage.get(leaseKey)
    if (value === undefined) return undefined
    if (!isLeaseRecord(value)) {
      throw new Error('Durable Object lock lease is invalid')
    }
    return value
  }

  private async writeLease(input: LeaseRequest): Promise<void> {
    const lease: LeaseRecord = {
      ownerId: input.ownerId,
      expiresAt: Date.now() + input.leaseDurationMs,
    }
    await this.state.storage.put(leaseKey, lease)
    await this.state.storage.setAlarm(lease.expiresAt)
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationChain.then(operation, operation)
    this.operationChain = result.then(
      () => undefined,
      () => undefined,
    )
    return result
  }
}

function resolveOptions(
  options: DurableObjectLockStoreOptions,
): ResolvedLockOptions {
  const leaseDurationMs = options.leaseDurationMs ?? 30_000
  const renewIntervalMs = options.renewIntervalMs ?? leaseDurationMs / 3
  const acquireTimeoutMs = options.acquireTimeoutMs ?? 30_000
  const retryDelayMs = options.retryDelayMs ?? 50
  for (const [name, value] of [
    ['leaseDurationMs', leaseDurationMs],
    ['renewIntervalMs', renewIntervalMs],
    ['acquireTimeoutMs', acquireTimeoutMs],
    ['retryDelayMs', retryDelayMs],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(`${name} must be a positive finite number`)
    }
  }
  if (renewIntervalMs >= leaseDurationMs) {
    throw new RangeError('renewIntervalMs must be less than leaseDurationMs')
  }
  return {
    leaseDurationMs,
    renewIntervalMs,
    acquireTimeoutMs,
    retryDelayMs,
    createOwnerId: options.createOwnerId ?? (() => crypto.randomUUID()),
  }
}

function sleep(milliseconds: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve()
      return
    }
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', stopWaiting)
      resolve()
    }, milliseconds)
    const stopWaiting = () => {
      clearTimeout(timeout)
      resolve()
    }
    signal?.addEventListener('abort', stopWaiting, { once: true })
  })
}

function isAborted(signal: AbortSignal): boolean {
  return signal.aborted
}

async function settle<T>(promise: Promise<T>): Promise<SettledValue<T>> {
  try {
    return { status: 'fulfilled', value: await promise }
  } catch (error) {
    return { status: 'rejected', reason: error }
  }
}

async function lockOperation(
  stub: DurableObjectStubBinding,
  operation: 'acquire' | 'renew' | 'release',
  ownerId: string,
  leaseDurationMs: number,
): Promise<Response> {
  return stub.fetch(
    new Request(`https://tanstack-ai-lock.invalid/${operation}`, {
      method: 'POST',
      body: JSON.stringify({ ownerId, leaseDurationMs }),
      headers: { 'content-type': 'application/json' },
    }),
  )
}

function operationError(operation: string, status: number): Error {
  return new Error(
    `Durable Object lock ${operation} failed with status ${status}`,
  )
}

async function acquireLease(
  stub: DurableObjectStubBinding,
  ownerId: string,
  options: ResolvedLockOptions,
): Promise<void> {
  const deadline = Date.now() + options.acquireTimeoutMs
  for (;;) {
    const result = await lockOperation(
      stub,
      'acquire',
      ownerId,
      options.leaseDurationMs,
    )
    if (result.ok) return
    if (result.status !== 409) throw operationError('acquire', result.status)
    if (Date.now() >= deadline) {
      throw new Error('Durable Object lock acquire timed out')
    }
    await sleep(options.retryDelayMs)
  }
}

async function renewLeaseUntilFinished(
  stub: DurableObjectStubBinding,
  ownerId: string,
  options: ResolvedLockOptions,
  signal: AbortSignal,
): Promise<void> {
  for (;;) {
    if (isAborted(signal)) return
    await sleep(options.renewIntervalMs, signal)
    if (isAborted(signal)) return
    const result = await lockOperation(
      stub,
      'renew',
      ownerId,
      options.leaseDurationMs,
    )
    if (!result.ok) throw operationError('renew', result.status)
  }
}

function throwFailures(failures: Array<unknown>): void {
  if (failures.length === 1) throw failures[0]
  if (failures.length > 1) {
    throw new AggregateError(failures, 'Durable Object lock operation failed')
  }
}

/** Create a distributed LockStore backed by one Durable Object per lock key. */
export function createDurableObjectLockStore<TId>(
  namespace: DurableObjectNamespaceBinding<TId>,
  lockOptions: DurableObjectLockStoreOptions = {},
): LockStore {
  const options = resolveOptions(lockOptions)
  return {
    async withLock<T>(
      key: string,
      fn: (signal: AbortSignal) => Promise<T>,
    ): Promise<T> {
      const ownerId = options.createOwnerId()
      const stub = namespace.get(namespace.idFromName(key))
      await acquireLease(stub, ownerId, options)

      const workFinished = new AbortController()
      const leaseOwned = new AbortController()
      const workResultPromise = settle(
        Promise.resolve().then(() => fn(leaseOwned.signal)),
      )
      const renewalResultPromise = settle(
        renewLeaseUntilFinished(
          stub,
          ownerId,
          options,
          workFinished.signal,
        ).catch((error: unknown) => {
          leaseOwned.abort(error)
          throw error
        }),
      )
      const workResult = await workResultPromise
      workFinished.abort()
      const renewalResult = await renewalResultPromise
      // A 409 from `release` means the lease was no longer ours (it expired, or
      // another owner acquired it) by the time the critical section finished.
      // We surface that as a thrown error and let `withLock` reject even though
      // the work itself may have completed: a lost lease means mutual exclusion
      // could have been violated mid-section, so the caller must NOT treat the
      // result as if it ran under the lock. `leaseOwned` is aborted when renewal
      // fails, so a well-behaved critical section will already have stopped.
      const releaseResult = await settle(
        lockOperation(stub, 'release', ownerId, options.leaseDurationMs).then(
          (result) => {
            if (!result.ok) throw operationError('release', result.status)
          },
        ),
      )

      const failures: Array<unknown> = []
      if (workResult.status === 'rejected') failures.push(workResult.reason)
      if (renewalResult.status === 'rejected') {
        failures.push(renewalResult.reason)
      }
      if (releaseResult.status === 'rejected') {
        failures.push(releaseResult.reason)
      }
      throwFailures(failures)
      if (workResult.status === 'rejected') throw workResult.reason
      return workResult.value
    },
  }
}
