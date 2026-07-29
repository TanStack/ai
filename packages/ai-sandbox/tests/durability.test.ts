import { describe, expect, it, vi } from 'vitest'
import { InMemoryRunStore, memoryStream } from '@tanstack/ai'
import { DEFAULT_JOURNAL_DIR } from '../src/journal'
import {
  DEFAULT_DETACHED_RUN_TTL,
  DurableRunIdRequiredError,
  parseRunTtlMs,
  resolveDurableRunId,
  resolveSandboxDurability,
} from '../src/durability'
import type { StreamDurability } from '@tanstack/ai'

const adapterFor = (runId: string): StreamDurability =>
  memoryStream(new Request(`https://x/run?runId=${runId}`))

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
