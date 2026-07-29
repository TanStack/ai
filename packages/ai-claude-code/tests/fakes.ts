/**
 * Shared test doubles for the in-sandbox Claude Code adapter's real-sandbox
 * tests (`text-adapter.test.ts`, `translate-determinism.test.ts`,
 * `attach.test.ts`). Kept here, not inlined per-file, per the repo's
 * test-hygiene rule on reusable test utilities.
 */
import {
  SandboxCapability,
  provideSandboxDurability,
} from '@tanstack/ai-sandbox'
import { InMemoryRunStore, memoryStream } from '@tanstack/ai'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type { CapabilityContext } from '@tanstack/ai'
import type { SandboxHandle, SandboxRunDurability } from '@tanstack/ai-sandbox'

export const noopLogger = {
  request: () => {},
  provider: () => {},
  errors: () => {},
  agentLoop: () => {},
  warnings: () => {},
  debug: () => {},
} as unknown as InternalLogger

/**
 * Build a resolved `SandboxRunDurability` payload for a test, without going
 * through `withSandbox`/`resolveSandboxDurability` (both belong to
 * `@tanstack/ai-sandbox` and are not exported — a harness adapter only ever
 * consumes the ALREADY-RESOLVED capability, never re-derives it). `runs` is a
 * fresh `InMemoryRunStore` unless the caller supplies one (e.g. to assert on
 * its contents afterwards); `adapter` is a fresh `memoryStream` keyed by the
 * test's own `runId` unless the caller wants a specific fixture.
 */
export function fakeDurability(
  runId: string,
  overrides: Partial<SandboxRunDurability> = {},
): SandboxRunDurability {
  return {
    runs: new InMemoryRunStore(),
    adapter: memoryStream(new Request(`https://x/run?runId=${runId}`)),
    journalDir: '/tmp/tanstack-runs',
    attach: false,
    detachOnDisconnect: true,
    detachedRunTtlMs: 30 * 60_000,
    ...overrides,
  }
}

/**
 * Build a capability context that hands the adapter the given sandbox handle,
 * and — when `durability` is supplied — the resolved `SandboxDurabilityCapability`
 * a real `withSandbox(sandbox, { runs, durability })` would have provided.
 * Omitting it entirely (not passing `durability: undefined`) matches how
 * `withSandbox` behaves when an app never wires `runs`/`durability`.
 */
export function capabilityContextWith(
  handle: SandboxHandle,
  durability?: SandboxRunDurability,
): CapabilityContext {
  const [, provideSandbox] = SandboxCapability
  const ctx = {
    capabilities: { markProvided: () => {}, has: () => true },
  } as unknown as CapabilityContext
  provideSandbox(ctx, handle)
  if (durability !== undefined) provideSandboxDurability(ctx, durability)
  return ctx
}

// `@tanstack/ai-sandbox`'s journal reader picks a "follow" strategy
// (`tail -c +N -f journal | base64`, piped through a spawned `SpawnHandle`)
// whenever `capabilities.backgroundProcesses && capabilities.killableProcesses`
// — true for `local-process`. On this host that pipeline's downstream
// `base64` fully buffers its stdout (it isn't a tty and `tail -f` never
// closes its input), so nothing is ever flushed to the reader for a payload
// under one buffer's worth — the read hangs forever even though the journal
// file itself is complete and correct. The bounded "poll" strategy
// (`tail -c +N journal | base64`, no `-f`) has no such problem: each poll is a
// one-shot process that flushes its buffer on exit. `journalReadStrategy`
// decides purely from `handle.capabilities`, so reporting
// `killableProcesses: false` on the handle we hand the adapter steers it onto
// the poll path without touching `@tanstack/ai-sandbox` or the adapter itself
// — every other operation (fs, process.exec, destroy) still goes through the
// real local-process sandbox unchanged.
/**
 * Force the bounded-poll read strategy, and record every command the adapter
 * spawns/execs so the journal wiring can be asserted from the command itself.
 *
 * Recording the command is the only durable way to prove journal options
 * reached `spawnNdjson`: the journal is deleted once the run reaches its
 * `{"__exit":N}` sentinel, so by the time a test can look, a correctly
 * journaled run and an unjournaled one both leave no file behind.
 */
export function pollStrategyHandle(handle: SandboxHandle): {
  handle: SandboxHandle
  spawned: Array<string>
} {
  const spawned: Array<string> = []
  return {
    spawned,
    handle: {
      ...handle,
      capabilities: { ...handle.capabilities, killableProcesses: false },
      process: {
        ...handle.process,
        spawn: (command, options) => {
          spawned.push(command)
          return handle.process.spawn(command, options)
        },
        exec: (command, options) => {
          spawned.push(command)
          return handle.process.exec(command, options)
        },
      },
    },
  }
}
