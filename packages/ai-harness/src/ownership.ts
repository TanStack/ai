import { OwnershipLostError } from '@tanstack/ai-persistence'
import type { LogStore } from '@tanstack/ai-persistence'

/** How long a host owns a log after each renewal, and how often it renews. */
export const OWNERSHIP = { ttlMs: 30_000, renewMs: 10_000 }

/** Ownership timing for a host. A missing field uses {@link OWNERSHIP}. */
export interface OwnershipOptions {
  /**
   * How long the host owns a log after each renewal, in milliseconds of the
   * store clock. Default 30 000.
   */
  ttlMs?: number
  /** How often the host renews every log it owns, in milliseconds. Default 10 000. */
  renewMs?: number
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
    this.ttlMs = options.timing?.ttlMs ?? OWNERSHIP.ttlMs
    this.renewMs = options.timing?.renewMs ?? OWNERSHIP.renewMs
  }

  /** The epoch of `logId` while this host owns it. */
  epochOf(logId: string) {
    return this.owned.get(logId)
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
    if (this.owned.size === 0) this.stopTimer()
  }

  /**
   * Give `logId` up. With `epoch`, only that ownership: a later acquire
   * keeps the log. A log that this host does not own does nothing. The
   * store gets the wake time of {@link setWake}, when the log has one.
   */
  release(logId: string, epoch = this.owned.get(logId)) {
    const isOwned = epoch !== undefined && this.owned.get(logId) === epoch
    if (!isOwned) return Promise.resolve()
    this.forget(logId)
    const wakeInMs = this.wakes.get(logId)?.()
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
