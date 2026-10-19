import { OwnershipLostError } from '@tanstack/ai-persistence'
import type { LogStore } from '@tanstack/ai-persistence'

/** How long a host owns a log after each renewal, and how often it renews. */
export const OWNERSHIP = { ttlMs: 30_000, renewMs: 10_000 }

/**
 * How long a sweep waits before it tries again a log whose thread did not
 * open. The log goes back with this wake time.
 */
export const OPEN_RETRY_MS = 30_000

/**
 * Ownership timing for a host, and its stable id. A missing timing field
 * uses {@link OWNERSHIP}.
 */
export interface OwnershipOptions {
  /**
   * A stable id for this host, for example the machine or pod name. Keep it
   * the same after a restart. When you set it, a thread that uses a local
   * folder is pinned to this host, and another host refuses the thread with
   * the pinned error. When you do not set it, threads are not pinned, and
   * every host can continue every thread.
   */
  hostId?: string
  /**
   * How long the host owns a log after each renewal, in milliseconds of the
   * store clock. Default 30 000.
   */
  ttlMs?: number
  /**
   * How often the host renews every log it owns, in milliseconds. It must be
   * less than `ttlMs`. Default 10 000, or a third of `ttlMs` when you set
   * only `ttlMs`.
   */
  renewMs?: number
}

/**
 * @internal For tests only. Timing with this key is not checked, so a test
 * host can own a log for a short time and never renew it, like a process
 * that stopped.
 */
export const UNCHECKED_TIMING = Symbol('harness.uncheckedTiming')

/**
 * The `ttlMs` and `renewMs` of `timing`, with the defaults. Throws a
 * `RangeError` for a value that is not more than 0, and when `renewMs` is
 * not less than `ttlMs`: then each ownership expires before its renewal,
 * and other hosts take the logs of this host while it runs.
 */
function ownershipTiming(timing: OwnershipOptions = {}) {
  const ttlMs = timing.ttlMs ?? OWNERSHIP.ttlMs
  const renewMs =
    timing.renewMs ??
    (timing.ttlMs === undefined
      ? OWNERSHIP.renewMs
      : Math.max(1, Math.floor(ttlMs / 3)))
  if (UNCHECKED_TIMING in timing) return { ttlMs, renewMs }
  for (const [name, value] of [
    ['ttlMs', ttlMs],
    ['renewMs', renewMs],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new RangeError(
        `ownership.${name} must be a number more than 0, not ${String(value)}.`,
      )
    }
  }
  if (renewMs >= ttlMs) {
    throw new RangeError(
      `ownership.renewMs (${renewMs}) must be less than ownership.ttlMs (${ttlMs}). Else the ownership of a log expires before its renewal, and other hosts take it.`,
    )
  }
  return { ttlMs, renewMs }
}

/**
 * A write that this host cannot do: another host owns the log, or took it
 * from this host. Nothing was written. This host still reads the log.
 */
export class LogOwnedElsewhereError extends Error {
  readonly logId: string

  constructor(logId: string) {
    super(
      `Another host owns the log ${JSON.stringify(logId)}, so this host cannot write to it. This host still reads the log.`,
    )
    this.name = 'LogOwnedElsewhereError'
    this.logId = logId
  }
}

/**
 * The logs that one host owns, with their epochs. The host acquires a log
 * the first time it must write to it, and releases it when it has no work
 * on it. One timer renews every owned log. With no owned log, there is no
 * timer and no store call.
 */
export class HostOwnership {
  private readonly store: LogStore
  /** The id of this host in the ownership records. */
  readonly ownerId: string
  /**
   * The stable id of this host for pins: a log pinned to it takes only this
   * host. `undefined` when the host has none. Then it takes no pinned log.
   */
  readonly affinity: string | undefined
  private readonly ttlMs: number
  private readonly renewMs: number
  /** The epoch of each log that this host owns, by store log id. */
  private readonly owned = new Map<string, number>()
  /** The owned logs that the store gave over an owner that stopped. */
  private readonly takenOver = new Set<string>()
  private readonly lostListeners = new Map<
    string,
    Set<(error: OwnershipLostError) => void>
  >()
  /**
   * The releases that run, by store log id. An acquire of the same log waits
   * for its release, so a late release never gives up a new acquire.
   */
  private readonly releasing = new Map<string, Promise<void>>()
  /**
   * How long until each log has work again, by store log id. A release
   * passes it to the store as `wakeInMs`, so a worker takes the log then.
   */
  private readonly wakes = new Map<string, () => number | undefined>()
  private timer: ReturnType<typeof setInterval> | undefined
  /** A renewal round runs. The next tick skips, so rounds never overlap. */
  private renewing = false

  constructor(options: {
    store: LogStore
    /** The id of this host in the ownership records. */
    ownerId: string
    /** The stable id of this host for pins. */
    affinity?: string
    timing?: OwnershipOptions
  }) {
    this.store = options.store
    this.ownerId = options.ownerId
    this.affinity = options.affinity
    const { ttlMs, renewMs } = ownershipTiming(options.timing)
    this.ttlMs = ttlMs
    this.renewMs = renewMs
  }

  /** The epoch of `logId` while this host owns it. */
  epochOf(logId: string) {
    return this.owned.get(logId)
  }

  /**
   * True when this host owns `logId` because the ownership of another
   * owner expired: that owner stopped with no release.
   */
  tookOver(logId: string) {
    return this.takenOver.has(logId)
  }

  /**
   * Own `logId`. Returns the epoch, or `null` when another live host owns
   * it. A log that this host owns already keeps its epoch.
   */
  async acquire(logId: string, harness: string) {
    // A failed release leaves the ownership to expire. The acquire goes on.
    await this.releasing.get(logId)?.catch(() => {})
    const got = await this.store.acquire({
      logId,
      harness,
      ownerId: this.ownerId,
      ttlMs: this.ttlMs,
      ...(this.affinity !== undefined ? { affinity: this.affinity } : {}),
    })
    if (got === null) return null
    this.owned.set(logId, got.epoch)
    if (got.expired) this.takenOver.add(logId)
    this.startTimer()
    return got.epoch
  }

  /**
   * Pin `logId` to the host `hostId`, so only that host acquires it, or
   * unpin it with `null`. This host must own the log at `epoch`. Rejects
   * with `OwnershipLostError` when it does not.
   */
  pin(logId: string, epoch: number, hostId: string | null) {
    return this.store.setAffinity({ logId, epoch, affinity: hostId })
  }

  /** Stop owning `logId` with no store call: the store refused its epoch. */
  forget(logId: string) {
    this.owned.delete(logId)
    this.takenOver.delete(logId)
    if (this.owned.size === 0) this.stopTimer()
  }

  /**
   * Give `logId` up. With `epoch`, only that ownership: a later acquire
   * keeps the log. A log that this host does not own does nothing. The
   * store gets `wakeIn` as the wake time, else the wake time of
   * {@link setWake}, when the log has one.
   */
  release(logId: string, epoch = this.owned.get(logId), wakeIn?: number) {
    const isOwned = epoch !== undefined && this.owned.get(logId) === epoch
    if (!isOwned) return Promise.resolve()
    this.forget(logId)
    const wakeInMs = wakeIn ?? this.wakes.get(logId)?.()
    const released = this.store
      .release({
        logId,
        ownerId: this.ownerId,
        epoch,
        ...(wakeInMs !== undefined ? { wakeInMs } : {}),
      })
      .finally(() => {
        if (this.releasing.get(logId) === released) {
          this.releasing.delete(logId)
        }
      })
    this.releasing.set(logId, released)
    return released
  }

  /**
   * Give each release of `logId` the time until the log has work again:
   * `wakeIn` returns milliseconds, or `undefined` for no wake. Returns a
   * function that stops it.
   */
  setWake(logId: string, wakeIn: () => number | undefined) {
    this.wakes.set(logId, wakeIn)
    return () => {
      if (this.wakes.get(logId) === wakeIn) this.wakes.delete(logId)
    }
  }

  /**
   * Call `listener` when a renewal finds that this host lost `logId`.
   * Returns a function that stops the calls.
   */
  onLost(logId: string, listener: (error: OwnershipLostError) => void) {
    const set = this.lostListeners.get(logId) ?? new Set()
    set.add(listener)
    this.lostListeners.set(logId, set)
    return () => {
      set.delete(listener)
      if (set.size === 0 && this.lostListeners.get(logId) === set) {
        this.lostListeners.delete(logId)
      }
    }
  }

  /** Release every owned log and stop the timer, for `host.close()`. */
  async close() {
    this.stopTimer()
    const logIds = [...this.owned.keys()]
    await Promise.allSettled(logIds.map((logId) => this.release(logId)))
  }

  private startTimer() {
    if (this.timer !== undefined) return
    const timer = setInterval(() => void this.renewAll(), this.renewMs)
    // A renewal timer must not keep a CLI or a test process alive.
    if (typeof timer === 'object' && 'unref' in timer) timer.unref()
    this.timer = timer
  }

  private stopTimer() {
    clearInterval(this.timer)
    this.timer = undefined
  }

  /** One round: renew every owned log at once. */
  private async renewAll() {
    if (this.renewing) return
    this.renewing = true
    try {
      const owned = [...this.owned]
      await Promise.all(
        owned.map(([logId, epoch]) => this.renewOne(logId, epoch)),
      )
    } finally {
      this.renewing = false
    }
  }

  private async renewOne(logId: string, epoch: number) {
    let isKept: boolean
    try {
      isKept = await this.store.renew({
        logId,
        ownerId: this.ownerId,
        epoch,
        ttlMs: this.ttlMs,
      })
    } catch {
      // A failed renewal tries again at the next tick. When the ownership
      // expires in the meantime, the next renewal or write finds out.
      return
    }
    // A release or a new acquire while the renewal ran decides instead.
    if (isKept || this.owned.get(logId) !== epoch) return
    this.forget(logId)
    const error = new OwnershipLostError(logId, epoch)
    const listeners = [...(this.lostListeners.get(logId) ?? [])]
    for (const listener of listeners) listener(error)
  }
}
