import { describe, expect, it, vi } from 'vitest'
import { EventType, InMemoryRunStore, memoryStream } from '@tanstack/ai'
import { DEFAULT_JOURNAL_DIR } from '../src/journal'
import {
  DEFAULT_DETACHED_RUN_TTL,
  DurableRunIdRequiredError,
  alignedIfAttaching,
  journalOptionsFor,
  parseRunTtlMs,
  resolveDurableRunId,
  resolveSandboxDurability,
} from '../src/durability'
import { captureLogger, collectChunks, fakeLog, fromChunkValues } from './fakes'
import type { StreamChunk, StreamDurability } from '@tanstack/ai'

const adapterFor = (runId: string): StreamDurability =>
  memoryStream(new Request(`https://x/run?runId=${runId}`))

function text(messageId: string, delta: string): StreamChunk {
  return {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId,
    delta,
    timestamp: 1,
  }
}

function bridged(name: string): StreamChunk {
  return { type: EventType.CUSTOM, name, value: {}, timestamp: 1 }
}

/**
 * `resolveSandboxDurability` never returns `undefined` for a fully-wired pair,
 * but its type says it might. Narrowing here (rather than `!`) keeps the
 * assertion in the test where a regression that DID return `undefined` would
 * fail loudly instead of being asserted away.
 */
function resolvedDurability(
  durability: Parameters<typeof resolveSandboxDurability>[0],
): NonNullable<ReturnType<typeof resolveSandboxDurability>> {
  const resolved = resolveSandboxDurability(durability)
  if (resolved === undefined) {
    throw new Error('expected resolveSandboxDurability to resolve')
  }
  return resolved
}

describe('resolveDurableRunId', () => {
  it('returns a caller-supplied runId unchanged, durable or not', () => {
    const fallback = vi.fn(() => 'generated')
    for (const durable of [true, false]) {
      expect(
        resolveDurableRunId('caller-run', {
          durable,
          adapter: 'codex',
          fallback,
        }),
      ).toBe('caller-run')
    }
    expect(fallback).not.toHaveBeenCalled()
  })

  it("falls back when durability is OFF, preserving today's behavior exactly", () => {
    const fallback = vi.fn(() => 'generated')
    expect(
      resolveDurableRunId(undefined, {
        durable: false,
        adapter: 'codex',
        fallback,
      }),
    ).toBe('generated')
    expect(fallback).toHaveBeenCalledTimes(1)
  })

  it('throws when durability is ON and no runId was supplied', () => {
    const fallback = vi.fn(() => 'generated')
    expect(() =>
      resolveDurableRunId(undefined, {
        durable: true,
        adapter: 'codex',
        fallback,
      }),
    ).toThrow(DurableRunIdRequiredError)
    // Decisive: the fallback must NOT run. A generated id would produce a
    // journal path no successor host can recompute — an unrecoverable run that
    // LOOKS durable.
    expect(fallback).not.toHaveBeenCalled()
  })

  it('names the adapter and the fix in the message', () => {
    try {
      resolveDurableRunId(undefined, {
        durable: true,
        adapter: 'claude-code',
        fallback: () => 'x',
      })
      expect.unreachable('should have thrown')
    } catch (error) {
      expect(error).toBeInstanceOf(DurableRunIdRequiredError)
      expect((error as Error).message).toContain('claude-code')
      expect((error as Error).message).toContain('runId')
    }
  })

  it('rejects an empty string, which journalPaths would reject anyway', () => {
    const fallback = vi.fn(() => 'generated')
    expect(() =>
      resolveDurableRunId('', { durable: true, adapter: 'codex', fallback }),
    ).toThrow(DurableRunIdRequiredError)
    expect(fallback).not.toHaveBeenCalled()
  })

  it('falls back on an empty string when durability is OFF, never returning it', () => {
    // An empty runId is not a runId. Non-durable callers get a generated id
    // rather than an id that would resolve to the journal directory itself.
    expect(
      resolveDurableRunId('', {
        durable: false,
        adapter: 'codex',
        fallback: () => 'generated',
      }),
    ).toBe('generated')
  })
})

describe('parseRunTtlMs', () => {
  it('defaults to 30 minutes', () => {
    expect(DEFAULT_DETACHED_RUN_TTL).toBe('30m')
    expect(parseRunTtlMs(undefined)).toBe(30 * 60_000)
  })

  it('parses minutes, hours and seconds', () => {
    expect(parseRunTtlMs('45s')).toBe(45_000)
    expect(parseRunTtlMs('5m')).toBe(300_000)
    expect(parseRunTtlMs('2h')).toBe(7_200_000)
  })

  it('rejects a malformed or zero duration rather than defaulting silently', () => {
    // Silently defaulting would let a typo ('30min') produce a 30-minute token
    // burn the operator thought they had capped at something else.
    for (const bad of ['30min', '', 'm', '0m', '-5m', '1.5h', 'abc', '30 m']) {
      expect(() => parseRunTtlMs(bad)).toThrow(/detachedRunTtl/)
    }
  })
})

describe('resolveSandboxDurability', () => {
  it('requires BOTH stores, and says nothing when only one is wired', () => {
    const runs = new InMemoryRunStore()
    // Neither.
    expect(resolveSandboxDurability(undefined)).toBeUndefined()
    expect(resolveSandboxDurability({})).toBeUndefined()
    // Only `runs`: a record with no event log cannot be replayed.
    expect(resolveSandboxDurability({ runs })).toBeUndefined()
    // Only `durability`: a log with no record cannot be found, claimed, or
    // reaped.
    expect(
      resolveSandboxDurability({ durability: { adapter: adapterFor('r1') } }),
    ).toBeUndefined()
  })

  it('resolves both stores into the capability payload with defaults', () => {
    const runs = new InMemoryRunStore()
    const adapter = adapterFor('r1')
    const resolved = resolveSandboxDurability({ runs, durability: { adapter } })
    expect(resolved).toEqual({
      runs,
      adapter,
      journalDir: DEFAULT_JOURNAL_DIR,
      attach: false,
      detachOnDisconnect: true,
      detachedRunTtlMs: 30 * 60_000,
    })
    // Omitted, not present-and-undefined: the field is optional and the
    // capability payload must not carry an explicit `undefined`.
    expect(Object.keys(resolved ?? {})).not.toContain('pollIntervalMs')
  })

  it('carries every explicit option through, including a false detach', () => {
    const runs = new InMemoryRunStore()
    const adapter = adapterFor('r2')
    expect(
      resolveSandboxDurability({
        runs,
        durability: {
          adapter,
          journal: '/srv/runs',
          attach: true,
          detachOnDisconnect: false,
          detachedRunTtl: '90s',
          pollIntervalMs: 250,
        },
      }),
    ).toEqual({
      runs,
      adapter,
      journalDir: '/srv/runs',
      attach: true,
      detachOnDisconnect: false,
      detachedRunTtlMs: 90_000,
      pollIntervalMs: 250,
    })
  })

  it('throws on a malformed detachedRunTtl at setup, not months later in a reaper', () => {
    const runs = new InMemoryRunStore()
    expect(() =>
      resolveSandboxDurability({
        runs,
        durability: { adapter: adapterFor('r3'), detachedRunTtl: '30min' },
      }),
    ).toThrow(/detachedRunTtl/)
  })
})

describe('journalOptionsFor', () => {
  it('is undefined when the run is not durable, so spawnNdjson keeps its old path', () => {
    // `isJournaled` tests `options.journal !== undefined`, so `undefined` here
    // is what preserves the unjournaled spawn path byte for byte.
    expect(journalOptionsFor(undefined, 'joff-1')).toBeUndefined()
  })

  it('carries runId, dir and attach from the resolved durability', () => {
    const durability = resolvedDurability({
      runs: new InMemoryRunStore(),
      durability: {
        adapter: fakeLog(),
        journal: '/var/j',
        attach: true,
        pollIntervalMs: 10,
      },
    })
    expect(journalOptionsFor(durability, 'jopt-attach')).toEqual({
      runId: 'jopt-attach',
      dir: '/var/j',
      attach: true,
      pollIntervalMs: 10,
    })
  })

  it('always supplies dir, even though JournalOptions.dir is optional', () => {
    // A successor host recomputes the journal path from these options. Leaving
    // `dir` out would make it re-derive the default independently, so the two
    // hosts would agree only by coincidence.
    const durability = resolvedDurability({
      runs: new InMemoryRunStore(),
      durability: { adapter: fakeLog() },
    })
    const options = journalOptionsFor(durability, 'jopt-dir')
    expect(options?.dir).toBe(DEFAULT_JOURNAL_DIR)
    expect(Object.keys(options ?? {})).toContain('dir')
  })

  it('omits pollIntervalMs when unset, rather than passing undefined through', () => {
    const durability = resolvedDurability({
      runs: new InMemoryRunStore(),
      durability: { adapter: fakeLog() },
    })
    const options = journalOptionsFor(durability, 'jopt-default')
    expect(options).toEqual({
      runId: 'jopt-default',
      dir: DEFAULT_JOURNAL_DIR,
      attach: false,
    })
    expect(Object.keys(options ?? {})).not.toContain('pollIntervalMs')
  })
})

describe('alignedIfAttaching', () => {
  it('passes the stream through untouched when not attaching', async () => {
    // A log with entries in it: proof that a NON-attach run does not align,
    // which matters because a fresh run's own chunks would otherwise be
    // classified as "already stored" and silently suppressed.
    const adapter = fakeLog([text('m1', 'a')])
    // `fakeLog` COPIES its seed, so assert against the log itself — asserting
    // against the array passed in would be vacuous.
    expect(await adapter.snapshot()).toEqual([
      { offset: 'o:0', chunk: text('m1', 'a') },
    ])
    const durability = resolvedDurability({
      runs: new InMemoryRunStore(),
      durability: { adapter },
    })
    const source = fromChunkValues([text('m1', 'a'), text('m1', 'b')])
    const wrapped = alignedIfAttaching(source, durability)
    // Delivery first: without the `attach` guard, `text('m1', 'a')` matches the
    // seeded entry and is SUPPRESSED — silent data loss, not a slow path.
    expect(await collectChunks(wrapped)).toEqual([
      text('m1', 'a'),
      text('m1', 'b'),
    ])
    // Identity, not just equality: nothing wraps a non-attach stream at all.
    expect(wrapped).toBe(source)
  })

  it('passes the stream through untouched when the run is not durable at all', async () => {
    const source = fromChunkValues([text('m1', 'a')])
    const wrapped = alignedIfAttaching(source, undefined)
    expect(wrapped).toBe(source)
    expect(await collectChunks(wrapped)).toEqual([text('m1', 'a')])
  })

  it('suppresses the stored prefix when attaching', async () => {
    const adapter = fakeLog([text('m1', 'a')])
    expect(await adapter.snapshot()).toHaveLength(1)
    const durability = resolvedDurability({
      runs: new InMemoryRunStore(),
      durability: { adapter, attach: true },
    })
    expect(
      await collectChunks(
        alignedIfAttaching(
          fromChunkValues([text('m1', 'a'), text('m1', 'b')]),
          durability,
        ),
      ),
    ).toEqual([text('m1', 'b')])
  })

  it('tolerates a bridged CUSTOM chunk in the stored log when attaching', async () => {
    // Without `isOutOfBand: isBridgeCustomChunk` this replay diverges at the
    // bridged entry, so a bridged-tool run could never be taken over.
    const adapter = fakeLog([text('m1', 'a'), bridged('code_mode:console')])
    expect(await adapter.snapshot()).toHaveLength(2)
    const durability = resolvedDurability({
      runs: new InMemoryRunStore(),
      durability: { adapter, attach: true },
    })
    expect(
      await collectChunks(
        alignedIfAttaching(
          fromChunkValues([text('m1', 'a'), text('m1', 'b')]),
          durability,
        ),
      ),
    ).toEqual([text('m1', 'b')])
  })

  it('forwards the logger so the alignment summary is observable', async () => {
    const adapter = fakeLog([text('m1', 'a')])
    const durability = resolvedDurability({
      runs: new InMemoryRunStore(),
      durability: { adapter, attach: true },
    })
    const { logger, calls } = captureLogger()
    await collectChunks(
      alignedIfAttaching(
        fromChunkValues([text('m1', 'a'), text('m1', 'b')]),
        durability,
        logger,
      ),
    )
    expect(calls.some((call) => call.msg.includes('journal alignment'))).toBe(
      true,
    )
  })
})
