/**
 * The durability seam for a sandboxed run: the option shape `withSandbox` takes,
 * the capability harness adapters read, and the two guards that keep a
 * "durable" run actually recoverable.
 *
 * A run is durable only when BOTH a `RunStore` and a `StreamDurability` are
 * wired, because either alone is useless: a record with no event log cannot be
 * replayed, and a log with no record cannot be found, claimed, or reaped. So the
 * capability exists or it does not — there is no half-configured state, and
 * every existing app (which wires neither) keeps today's behavior untouched.
 */
import { createCapability } from '@tanstack/ai'
import { DEFAULT_JOURNAL_DIR } from './journal'
import { alignToStoredLog, isBridgeCustomChunk } from './align'
import type { JournalOptions } from './runner'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type { RunStore, StreamChunk, StreamDurability } from '@tanstack/ai'

/** `withSandbox(sandbox, { durability })`. */
export interface SandboxDurabilityOptions<TOffset extends string = string> {
  /**
   * Delivery-durable event log for the run. Same key and shape as the
   * transport's `durability.adapter`, so one adapter instance can be handed to
   * both `withSandbox` and `toServerSentEventsResponse`.
   *
   * Generic in the offset type, defaulted to `string`, for the same reason
   * {@link SandboxRunDriverOptions} and {@link ReapOptions} are:
   * `StreamDurability` is INVARIANT in `TOffset` (`read` takes an offset in),
   * so a backend that brands its cursors — `@tanstack/ai-durable-stream`'s
   * `durableStream`, the multi-host production backend the sandbox docs point
   * at — is not assignable to `StreamDurability<string>`. Without the parameter
   * the resume route could be wired with it and the route that STARTS the run
   * could not.
   */
  adapter: StreamDurability<TOffset>
  /** Journal directory inside the sandbox. Defaults to `/tmp/tanstack-runs`. */
  journal?: string
  /**
   * Wall-clock cap on a RUNNING agent with no viewer attached, e.g. `'30m'`.
   * Recorded here and enforced by the reaper; this layer only stores it.
   */
  detachedRunTtl?: string
  /**
   * Whether a client disconnect DETACHES (leave the agent running) instead of
   * destroying the sandbox. Defaults to `true` whenever durability is wired,
   * because that is the whole point of wiring it.
   *
   * Set `false` to keep today's destroy-on-disconnect cost profile while still
   * getting resumable DELIVERY (a reload replays the log). An explicit cancel
   * destroys either way.
   */
  detachOnDisconnect?: boolean
  /**
   * Read an EXISTING run's journal instead of starting a new agent. Set by the
   * attach route's `drive()` callback, never by an application's POST handler.
   *
   * This is where `attach` lives, and deliberately NOT on `chat()`: `chat()` is
   * core and must not gain sandbox vocabulary, and the provider options are
   * per-model type state, not per-request lifecycle.
   */
  attach?: boolean
  /** Journal poll interval for providers that cannot follow. */
  pollIntervalMs?: number
  /**
   * How long an ATTACH waits for a live run's journal to appear before failing
   * with a `JournalAttachUnavailableError`. Defaults to
   * `DEFAULT_ATTACH_JOURNAL_WAIT_MS` (10s). Only the wait is configurable: an
   * unknown or terminal runId fails immediately regardless, since no amount of
   * waiting changes either verdict.
   */
  attachWaitMs?: number
}

/**
 * The view of a caller's event log that the capability bus carries.
 *
 * Deliberately NOT the whole `StreamDurability`. `read` is the only member that
 * takes an offset *in*, which is what makes `StreamDurability` invariant in
 * `TOffset` and a branded-cursor backend unassignable to
 * `StreamDurability<string>`. Every other member mentions the offset only in a
 * return position, so this type is a genuine SUPERTYPE of
 * `StreamDurability<TOffset>` for every `TOffset extends string` — which is the
 * one property that lets a single concrete capability instantiation accept a
 * branded backend. `createCapability<T>()` forces exactly one instantiation
 * (the value type is a plain type argument, and TypeScript has no higher-kinded
 * types), so the payload cannot be parameterized the way the *option* above is.
 *
 * Dropping `read` costs nothing, and that is a property of the seam rather than
 * luck: the bus is the JOURNAL/ALIGNMENT seam, and alignment reads the stored
 * prefix through `snapshot()` — never `read()`, which tails an open log forever
 * (see `alignToStoredLog`). Replay *by offset* belongs to the delivery seam,
 * and that seam (`toServerSentEventsResponse`, `sandboxRunDriver`) receives the
 * application's own adapter directly, with its brand intact.
 */
export type SandboxDurabilityLog = Omit<StreamDurability, 'read'>

/** Resolved durability, published on the capability bus by `withSandbox`. */
export interface SandboxRunDurability {
  runs: RunStore
  adapter: SandboxDurabilityLog
  journalDir: string
  attach: boolean
  detachOnDisconnect: boolean
  detachedRunTtlMs: number
  pollIntervalMs?: number
  attachWaitMs?: number
}

/**
 * Provided by `withSandbox` only when a run is genuinely durable (both stores
 * wired). Harness adapters read it with `getOptional` and treat its absence as
 * "no journaling contract to honour", which is exactly today's behavior.
 */
export const SandboxDurabilityCapability =
  createCapability<SandboxRunDurability>()('sandbox-durability')

/** Destructured accessors, matching `./capabilities`. */
export const [getSandboxDurability, provideSandboxDurability] =
  SandboxDurabilityCapability

/** Default `detachedRunTtl`. */
export const DEFAULT_DETACHED_RUN_TTL = '30m'

/**
 * A durable run was started without a caller-supplied `runId`.
 *
 * Thrown rather than defaulted because the failure is otherwise INVISIBLE: an
 * adapter-generated id (`${name}-${Date.now()}-${Math.random()...}`) produces a
 * journal path at `/tmp/tanstack-runs/<id>.ndjson` that no successor host can
 * recompute, so the run streams normally, records normally, and is silently
 * unrecoverable. A loud failure at the start of `chatStream` is strictly better
 * than a run that only reveals itself as non-durable during an incident.
 */
export class DurableRunIdRequiredError extends Error {
  constructor(readonly adapter: string) {
    super(
      `${adapter}: a durable sandboxed run requires a caller-supplied \`runId\`. ` +
        `The journal path and the deterministic message-id generator are both derived from it, ` +
        `so a successor host can only resume a run whose \`runId\` it can recompute. ` +
        `Pass \`runId\` to chat({ ... }), or drop \`runs\`/\`durability\` from withSandbox(...) to run non-durably.`,
    )
    this.name = 'DurableRunIdRequiredError'
  }
}

/**
 * Resolve the `runId` a harness adapter will journal under.
 *
 * Replaces the bare `options.runId ?? this.generateId()` in every harness
 * adapter. The fallback is preserved for non-durable runs — several `chat()`
 * paths pass `runId` as a conditional spread, so `undefined` is reachable and
 * removing the fallback would break them for no benefit.
 *
 * The `durable` check runs BEFORE `fallback()`, and that ordering is load
 * bearing: a generated id must never be minted for a durable run, not even one
 * that is discarded, because the whole point is that no such id can exist.
 */
export function resolveDurableRunId(
  runId: string | undefined,
  options: { durable: boolean; adapter: string; fallback: () => string },
): string {
  if (runId !== undefined && runId.length > 0) return runId
  if (options.durable) throw new DurableRunIdRequiredError(options.adapter)
  return options.fallback()
}

/**
 * An ATTACHING durable run was driven without the run record's `threadId`.
 *
 * The sibling of {@link DurableRunIdRequiredError}, for the other id an attach
 * cannot mint for itself. `threadId` lands in EVERY chunk a harness adapter
 * emits (see each package's `stream/translate.ts`), so a replay that generates a
 * fresh one produces a stream that differs from the stored log in its very first
 * chunk. `alignToStoredLog` then fails at index 0 with a
 * `JournalReplayThreadIdMismatchError` — mid-stream, after the takeover has
 * already claimed the run. Refusing up front is strictly better, and mirrors
 * what `resolveDurableRunId` does for an id whose absence is equally fatal.
 *
 * Core already does its part: `startRunDriver` reads the record and hands
 * `active.threadId` to `drive({ runId, threadId, signal })`. This error exists
 * for the one gap it cannot close — application `drive` code that forgets to
 * forward it into `chat()`.
 */
export class DurableThreadIdRequiredError extends Error {
  constructor(readonly adapter: string) {
    super(
      `${adapter}: an ATTACHING durable sandboxed run requires the run record's \`threadId\`. ` +
        `Every emitted chunk carries \`threadId\`, so an attach that generates a fresh one replays a stream whose first chunk ` +
        `already differs from the stored log, and alignment fails at index 0 (\`JournalReplayThreadIdMismatchError\`) even though ` +
        `the agent behaved identically. Forward the run record's \`threadId\` — the one \`sandboxRunDriver\` passes to ` +
        `\`drive({ runId, threadId, signal })\` — into \`chat({ ... })\` on the attach route. ` +
        `A durable FRESH run needs none: that run is what establishes the \`threadId\`.`,
    )
    this.name = 'DurableThreadIdRequiredError'
  }
}

/**
 * Resolve the `threadId` a harness adapter will stamp on every chunk.
 *
 * Replaces the bare `options.threadId ?? this.generateId()` in the journaling
 * harness adapters. Only the durable-AND-attaching quadrant throws; the other
 * three keep the generated fallback and are byte-identical to before:
 *
 * | durable | attaching | behavior                                            |
 * | ------- | --------- | --------------------------------------------------- |
 * | no      | no        | fallback — a plain non-durable run                  |
 * | no      | yes       | fallback — not reachable today, and harmless anyway |
 * | yes     | no        | fallback — the FRESH run that ESTABLISHES the id    |
 * | yes     | yes       | throw {@link DurableThreadIdRequiredError}          |
 *
 * The durable-fresh row is the load-bearing one. A fresh durable run legitimately
 * mints its `threadId` (there is no record to reuse one from), so throwing on
 * `durable` alone — the obvious over-simplification — would break every durable
 * run that has ever worked. Only re-entering an existing run has an id it MUST
 * reuse, which is exactly the condition `attach` already expresses.
 *
 * As in `resolveDurableRunId`, the guard runs BEFORE `fallback()`: a generated id
 * must never be minted on this path, not even one that is then discarded.
 */
export function resolveDurableThreadId(
  threadId: string | undefined,
  options: {
    durable: boolean
    attaching: boolean
    adapter: string
    fallback: () => string
  },
): string {
  if (threadId !== undefined && threadId.length > 0) return threadId
  if (options.durable && options.attaching) {
    throw new DurableThreadIdRequiredError(options.adapter)
  }
  return options.fallback()
}

const TTL_PATTERN = /^(\d+)(s|m|h)$/
const TTL_UNIT_MS = { s: 1_000, m: 60_000, h: 3_600_000 } as const
type TtlUnit = keyof typeof TTL_UNIT_MS

/**
 * Narrows the regex's second group to a unit key. The pattern already restricts
 * it, but the type system cannot see that, and a non-null assertion here would
 * hide a real bug if the pattern ever gained a unit the table lacks.
 */
function isTtlUnit(value: string): value is TtlUnit {
  return value in TTL_UNIT_MS
}

/**
 * Parse a `detachedRunTtl` like `'30m'` into milliseconds.
 *
 * Throws on anything malformed instead of falling back to the default. This
 * value caps how long an unwatched agent may keep spending tokens, so a typo
 * silently becoming 30 minutes is a billing incident, not a nicety. Same
 * `<n><unit>` shape as `snapshotMaxAge` in `sandbox.ts`, plus seconds so a test
 * or a demo can use a short window.
 */
export function parseRunTtlMs(value: string | undefined): number {
  const raw = value ?? DEFAULT_DETACHED_RUN_TTL
  const match = TTL_PATTERN.exec(raw)
  const amount = match ? Number(match[1]) : 0
  const unit = match?.[2]
  if (!match || amount <= 0 || unit === undefined || !isTtlUnit(unit)) {
    throw new Error(
      `withSandbox: detachedRunTtl must look like '<n>s' | '<n>m' | '<n>h' with n > 0, got ${JSON.stringify(raw)}`,
    )
  }
  return amount * TTL_UNIT_MS[unit]
}

/**
 * Resolve `withSandbox`'s two durability options into the capability payload, or
 * `undefined` when the app has not opted in.
 *
 * BOTH `runs` and `durability` are required. A half-configured app gets
 * `undefined` **silently** rather than a warning: it has not asked for
 * durability, so there is nothing to warn about, and the resulting behavior
 * (destroy on disconnect, no journal) is exactly today's.
 *
 * `parseRunTtlMs` runs here, at setup, so a malformed `detachedRunTtl` fails
 * before an agent starts spending tokens rather than when the reaper first runs.
 */
export function resolveSandboxDurability<TOffset extends string = string>(
  options:
    | { runs?: RunStore; durability?: SandboxDurabilityOptions<TOffset> }
    | undefined,
): SandboxRunDurability | undefined {
  const runs = options?.runs
  const durability = options?.durability
  if (runs === undefined || durability === undefined) return undefined
  return {
    runs,
    adapter: durability.adapter,
    journalDir: durability.journal ?? DEFAULT_JOURNAL_DIR,
    attach: durability.attach === true,
    detachOnDisconnect: durability.detachOnDisconnect !== false,
    detachedRunTtlMs: parseRunTtlMs(durability.detachedRunTtl),
    ...(durability.pollIntervalMs === undefined
      ? {}
      : { pollIntervalMs: durability.pollIntervalMs }),
    ...(durability.attachWaitMs === undefined
      ? {}
      : { attachWaitMs: durability.attachWaitMs }),
  }
}

/**
 * Build the `spawnNdjson` journal option for a run, or `undefined` when the run
 * is not durable — in which case `spawnNdjson` takes its original, unjournaled
 * path (`isJournaled` tests `options.journal !== undefined`, `runner.ts:70-72`)
 * and behavior is byte-identical to a pre-durability run.
 *
 * `JournalOptions.dir` is optional, but this always supplies it: the resolved
 * durability has already defaulted `journalDir`, and a successor host must
 * recompute the same path rather than re-derive the default independently.
 *
 * `runs` and `attachWaitMs` are carried ONLY when attaching, and that is not a
 * micro-optimization: they exist for `awaitAttachableJournal`, which the reader
 * runs on the attach path alone. A fresh run has no journal yet BY DESIGN (its own
 * `journaledCommand` spawn creates it moments later), so handing it a run store
 * would only invite a future change to gate a path where absence proves nothing.
 */
export function journalOptionsFor(
  durability: SandboxRunDurability | undefined,
  runId: string,
): JournalOptions | undefined {
  if (durability === undefined) return undefined
  return {
    runId,
    dir: durability.journalDir,
    attach: durability.attach,
    ...(durability.pollIntervalMs === undefined
      ? {}
      : { pollIntervalMs: durability.pollIntervalMs }),
    ...(durability.attach
      ? {
          runs: durability.runs,
          ...(durability.attachWaitMs === undefined
            ? {}
            : { attachWaitMs: durability.attachWaitMs }),
        }
      : {}),
  }
}

/**
 * Align a harness stream against the run's stored log — but ONLY on an attach.
 *
 * The `attach` guard is not an optimization, it is a CORRECTNESS requirement.
 * `alignToStoredLog` snapshots the log before the first chunk is pulled and
 * treats everything in that snapshot as "already delivered". On a FRESH run that
 * premise is false: if such a run were aligned against a log that already holds
 * entries — a `runId` collision, a retried request — its own chunks would be
 * matched against those entries and silently SUPPRESSED instead of delivered,
 * which is silent data loss rather than a slow path. Aligning only when
 * re-entering an existing run keeps the transform's premise ("this stream is a
 * replay of what is already stored") actually true.
 *
 * `isBridgeCustomChunk` is passed because the stored log holds the previous
 * host's MERGED output, including live bridged-tool CUSTOM events that a replay
 * cannot reproduce; without it a bridged-tool run could not be taken over at
 * all. Wrap the merge RESULT, never the pre-merge translator, or the comparison
 * is against a stream the log never contained.
 */
export function alignedIfAttaching(
  chunks: AsyncIterable<StreamChunk>,
  durability: SandboxRunDurability | undefined,
  logger?: InternalLogger,
): AsyncIterable<StreamChunk> {
  if (durability === undefined || !durability.attach) return chunks
  return alignToStoredLog(chunks, {
    durability: durability.adapter,
    isOutOfBand: isBridgeCustomChunk,
    ...(logger === undefined ? {} : { logger }),
  })
}
