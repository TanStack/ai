/**
 * Asserts the barrel (`src/index.ts`) actually RESOLVES Phase 3's durable-run
 * surface, importing exclusively from `../src/index` — never from the
 * individual modules, which would test nothing about the barrel itself.
 *
 * Error classes are constructed and instanceof-checked rather than merely
 * `typeof x === 'function'`-checked: a class mis-exported as `export type`
 * still compiles and still passes a `typeof` check in some configurations,
 * but `new` and `instanceof` against a real import can't be faked that way.
 */
import { describe, expect, it } from 'vitest'
import { EventType, InMemoryRunStore, memoryStream } from '@tanstack/ai'
import { InMemoryLockStore } from '@tanstack/ai/locks'
import {
  DEFAULT_DETACHED_RUN_TTL,
  DEFAULT_FENCE_QUIET_MS,
  DEFAULT_ATTACH_JOURNAL_WAIT_MS,
  DEFAULT_MAX_OUT_OF_BAND_SKIP,
  DurableRunIdRequiredError,
  DurableThreadIdRequiredError,
  JournalAttachUnavailableError,
  JournalReplayDivergedError,
  JournalReplayThreadIdMismatchError,
  RunClaimLostError,
  RunClaimNotAcquiredError,
  RunDriverPipeOutsideClaimError,
  SandboxDurabilityCapability,
  alignedIfAttaching,
  alignToStoredLog,
  getSandboxDurability,
  isBridgeCustomChunk,
  journalOptionsFor,
  provideSandboxDurability,
  resolveDurableRunId,
  resolveDurableThreadId,
  sandboxRunDriver,
} from '../src/index'
import type {
  AwaitAttachableJournalOptions,
  SandboxDurabilityOptions,
  SandboxRunDriverOptions,
  SandboxRunDurability,
} from '../src/index'
import type { CapabilityContext, StreamChunk } from '@tanstack/ai'

/** Minimal capability context sufficient for testing capability round-trips. */
function makeCtx(): CapabilityContext {
  return {
    capabilities: { markProvided: () => undefined },
  } as unknown as CapabilityContext
}

function makeDurability(runId: string): SandboxRunDurability {
  return {
    runs: new InMemoryRunStore(),
    adapter: memoryStream(new Request(`https://x/run?runId=${runId}`)),
    journalDir: '/tmp/tanstack-runs',
    attach: false,
    detachOnDisconnect: true,
    detachedRunTtlMs: 30 * 60_000,
  }
}

describe('barrel: durability seam', () => {
  it('SandboxDurabilityCapability round-trips through the barrel accessors', () => {
    const ctx = makeCtx()
    const durability = makeDurability('run-1')

    provideSandboxDurability(ctx, durability)

    expect(getSandboxDurability(ctx, { optional: true })).toBe(durability)
    // The capability token itself must be the same one the accessors close
    // over, or a consumer's own `getOptional(SandboxDurabilityCapability)`
    // would silently miss what `provideSandboxDurability` wrote.
    expect(SandboxDurabilityCapability.capabilityName).toBe(
      'sandbox-durability',
    )
  })

  it('publishes the documented defaults', () => {
    expect(DEFAULT_DETACHED_RUN_TTL).toBe('30m')
    expect(DEFAULT_FENCE_QUIET_MS).toBe(5_000)
    expect(DEFAULT_MAX_OUT_OF_BAND_SKIP).toBe(64)
  })

  it('resolveDurableRunId and journalOptionsFor/alignedIfAttaching are wired end to end', async () => {
    expect(
      resolveDurableRunId('caller-run', {
        durable: true,
        adapter: 'test',
        fallback: () => 'generated',
      }),
    ).toBe('caller-run')

    const durability = makeDurability('run-2')
    const opts = journalOptionsFor(durability, 'run-2')
    expect(opts).toEqual({
      runId: 'run-2',
      dir: '/tmp/tanstack-runs',
      attach: false,
    })

    // Non-attaching: alignedIfAttaching must be a no-op passthrough.
    async function* one(): AsyncGenerator<StreamChunk> {
      yield { type: EventType.RUN_STARTED } as StreamChunk
    }
    const aligned = alignedIfAttaching(one(), durability)
    const collected: Array<StreamChunk> = []
    for await (const chunk of aligned) collected.push(chunk)
    expect(collected).toHaveLength(1)
  })

  it('resolveDurableThreadId is wired through the barrel, attach quadrant included', () => {
    expect(
      resolveDurableThreadId('caller-thread', {
        durable: true,
        attaching: true,
        adapter: 'test',
        fallback: () => 'generated',
      }),
    ).toBe('caller-thread')
    // The durable-fresh row must reach the barrel intact too, or a consumer
    // upgrading would find every new durable run refused.
    expect(
      resolveDurableThreadId(undefined, {
        durable: true,
        attaching: false,
        adapter: 'test',
        fallback: () => 'generated',
      }),
    ).toBe('generated')
    expect(() =>
      resolveDurableThreadId(undefined, {
        durable: true,
        attaching: true,
        adapter: 'test',
        fallback: () => 'generated',
      }),
    ).toThrow(DurableThreadIdRequiredError)
  })

  it('isBridgeCustomChunk recognizes only CUSTOM chunks', () => {
    expect(
      isBridgeCustomChunk({
        type: EventType.CUSTOM,
        name: 'x',
        value: {},
      } as StreamChunk),
    ).toBe(true)
    expect(
      isBridgeCustomChunk({ type: EventType.RUN_STARTED } as StreamChunk),
    ).toBe(false)
  })

  it('alignToStoredLog is reachable through the barrel', async () => {
    const durability = makeDurability('run-3')
    async function* empty(): AsyncGenerator<StreamChunk> {}
    const result: Array<StreamChunk> = []
    for await (const chunk of alignToStoredLog(empty(), {
      durability: durability.adapter,
    })) {
      result.push(chunk)
    }
    expect(result).toHaveLength(0)
  })
})

describe('barrel: run driver', () => {
  it('sandboxRunDriver assembles a RunDriverOptions-shaped object', () => {
    const input: SandboxRunDriverOptions = {
      request: new Request('https://x/run?runId=run-4'),
      runs: new InMemoryRunStore(),
      locks: new InMemoryLockStore(),
      durability: (runId) =>
        memoryStream(new Request(`https://x/run?runId=${runId}`)),
      drive: async function* () {},
    }
    const result = sandboxRunDriver(input)
    expect(result.request).toBe(input.request)
    expect(result.runs).toBe(input.runs)
    expect(result.locks).toBe(input.locks)
    expect(result.drive).toBe(input.drive)
    expect(typeof result.claim).toBe('function')
    expect(typeof result.pipe).toBe('function')
  })
})

describe('barrel: error classes are values, not types (instanceof must work)', () => {
  it('DurableRunIdRequiredError', () => {
    const err = new DurableRunIdRequiredError('codex')
    expect(err).toBeInstanceOf(DurableRunIdRequiredError)
    expect(err).toBeInstanceOf(Error)
    expect(err.adapter).toBe('codex')
  })

  it('DurableThreadIdRequiredError', () => {
    const err = new DurableThreadIdRequiredError('grok-build')
    expect(err).toBeInstanceOf(DurableThreadIdRequiredError)
    expect(err).toBeInstanceOf(Error)
    expect(err.adapter).toBe('grok-build')
  })

  it('JournalReplayDivergedError', () => {
    const err = new JournalReplayDivergedError(3, 'a', 'b')
    expect(err).toBeInstanceOf(JournalReplayDivergedError)
    expect(err).toBeInstanceOf(Error)
    expect(err.index).toBe(3)
  })

  it('RunClaimNotAcquiredError', () => {
    const err = new RunClaimNotAcquiredError('run-1', 'terminal')
    expect(err).toBeInstanceOf(RunClaimNotAcquiredError)
    expect(err).toBeInstanceOf(Error)
    expect(err.reason).toBe('terminal')
  })

  it('RunClaimLostError', () => {
    const err = new RunClaimLostError('run-1', 2, 3)
    expect(err).toBeInstanceOf(RunClaimLostError)
    expect(err).toBeInstanceOf(Error)
    expect(err.heldEpoch).toBe(2)
  })

  it('RunDriverPipeOutsideClaimError', () => {
    const err = new RunDriverPipeOutsideClaimError('run-1')
    expect(err).toBeInstanceOf(RunDriverPipeOutsideClaimError)
    expect(err).toBeInstanceOf(Error)
    expect(err.runId).toBe('run-1')
  })

  it('JournalAttachUnavailableError carries a branchable reason', () => {
    const err = new JournalAttachUnavailableError('run-1', 'unknown-run', 'why')
    expect(err).toBeInstanceOf(JournalAttachUnavailableError)
    expect(err).toBeInstanceOf(Error)
    expect(err.runId).toBe('run-1')
    expect(err.reason).toBe('unknown-run')
    expect(DEFAULT_ATTACH_JOURNAL_WAIT_MS).toBeGreaterThan(0)
  })

  it('JournalReplayThreadIdMismatchError is a JournalReplayDivergedError subclass', () => {
    // The subclass relationship is part of the published surface: a consumer
    // already branching on the general class must keep working.
    const err = new JournalReplayThreadIdMismatchError(0, 's', 'r', 'ta', 'tb')
    expect(err).toBeInstanceOf(JournalReplayThreadIdMismatchError)
    expect(err).toBeInstanceOf(JournalReplayDivergedError)
    expect(err.storedThreadId).toBe('ta')
    expect(err.replayedThreadId).toBe('tb')
  })
})

// Type-only usage: fails to compile (not just at runtime) if the barrel drops
// either type export.
function typeSurfaceStillExported(
  a: SandboxDurabilityOptions,
  b: SandboxRunDurability,
  c: SandboxRunDriverOptions,
  d: AwaitAttachableJournalOptions,
): void {
  void a
  void b
  void c
  void d
}
void typeSurfaceStillExported
