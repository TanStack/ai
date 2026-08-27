import { createCapability } from '@tanstack/ai'
import { DEFAULT_JOURNAL_DIR } from './journal'
import { alignToStoredLog, isBridgeCustomChunk } from './align'
import type { JournalOptions } from './runner'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type { RunStore, StreamChunk, StreamDurability } from '@tanstack/ai'

/** `withSandbox(sandbox, { durability })`. */
export interface SandboxDurabilityOptions<TOffset extends string = string> {
  adapter: StreamDurability<TOffset>
  /** Journal directory inside the sandbox. Defaults to `/tmp/tanstack-runs`. */
  journal?: string
  detachOnDisconnect?: boolean
  attach?: boolean
  /** Journal poll interval for providers that cannot follow. */
  pollIntervalMs?: number
  attachWaitMs?: number
}

export type SandboxDurabilityLog = Omit<StreamDurability, 'read'>

export interface SandboxRunDurability {
  runs: RunStore
  adapter: SandboxDurabilityLog
  journalDir: string
  attach: boolean
  detachOnDisconnect: boolean
  pollIntervalMs?: number
  attachWaitMs?: number
}

export const SandboxDurabilityCapability =
  createCapability<SandboxRunDurability>()('sandbox-durability')

/** Destructured accessors, matching `./capabilities`. */
export const [getSandboxDurability, provideSandboxDurability] =
  SandboxDurabilityCapability

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

export function resolveDurableRunId(
  runId: string | undefined,
  options: { durable: boolean; adapter: string; fallback: () => string },
): string {
  const hasRunId = runId !== undefined && runId.length > 0
  if (hasRunId) return runId
  if (options.durable) throw new DurableRunIdRequiredError(options.adapter)
  return options.fallback()
}

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

export function resolveDurableThreadId(
  threadId: string | undefined,
  options: {
    durable: boolean
    attaching: boolean
    adapter: string
    fallback: () => string
  },
): string {
  const hasThreadId = threadId !== undefined && threadId.length > 0
  if (hasThreadId) return threadId
  const isAttachingDurable = options.durable && options.attaching
  if (isAttachingDurable) {
    throw new DurableThreadIdRequiredError(options.adapter)
  }
  return options.fallback()
}

export class DurableAttachNotSupportedError extends Error {
  constructor(
    readonly adapter: string,
    readonly reason: string,
  ) {
    super(
      `${adapter}: this code path cannot ATTACH to an existing durable run (${reason}). ` +
        `It does not journal, so there is no stored output to replay and no alignment to suppress what was already delivered. ` +
        `Proceeding would re-run the agent from scratch against the workspace the previous attempt already modified, and double-append its entire output to the run log. ` +
        `Route the attach through a journaling spawn path, or drop \`runs\`/\`durability\` from withSandbox(...) so the run is never resumed in the first place. ` +
        `This is not a transient condition — unlike \`JournalAttachUnavailableError\`, waiting and retrying can never make it succeed.`,
    )
    this.name = 'DurableAttachNotSupportedError'
  }
}

export function resolveSandboxDurability<TOffset extends string = string>(
  options:
    | { runs?: RunStore; durability?: SandboxDurabilityOptions<TOffset> }
    | undefined,
): SandboxRunDurability | undefined {
  const runs = options?.runs
  const durability = options?.durability
  const isMissingDurability = runs === undefined || durability === undefined
  if (isMissingDurability) return undefined
  return {
    runs,
    adapter: durability.adapter,
    journalDir: durability.journal ?? DEFAULT_JOURNAL_DIR,
    attach: durability.attach === true,
    detachOnDisconnect: durability.detachOnDisconnect !== false,
    ...(durability.pollIntervalMs === undefined
      ? {}
      : { pollIntervalMs: durability.pollIntervalMs }),
    ...(durability.attachWaitMs === undefined
      ? {}
      : { attachWaitMs: durability.attachWaitMs }),
  }
}

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

export function alignedIfAttaching(
  chunks: AsyncIterable<StreamChunk>,
  durability: SandboxRunDurability | undefined,
  logger?: InternalLogger,
): AsyncIterable<StreamChunk> {
  const shouldSkipAttach = durability === undefined || !durability.attach
  if (shouldSkipAttach) return chunks
  return alignToStoredLog(chunks, {
    durability: durability.adapter,
    isOutOfBand: isBridgeCustomChunk,
    ...(logger === undefined ? {} : { logger }),
  })
}
