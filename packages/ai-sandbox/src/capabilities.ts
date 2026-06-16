/**
 * Capability tokens the sandbox layer provides/consumes through the
 * `@tanstack/ai` middleware capability system.
 *
 * - `SandboxCapability` is PROVIDED by `withSandbox` and REQUIRED by harness
 *   adapters (`requires: [SandboxCapability]`).
 * - `SandboxStoreCapability` / `LocksCapability` are OPTIONALLY required by
 *   `withSandbox`. v1 falls back to in-memory defaults; the future persistence
 *   package PROVIDES durable implementations.
 */
import { createCapability } from '@tanstack/ai'
import type { SandboxHandle } from './contracts'
import type { LockStore, SandboxStore } from './store'

export const SandboxCapability = createCapability<SandboxHandle>()('sandbox')

export const SandboxStoreCapability =
  createCapability<SandboxStore>()('sandbox-store')

export const LocksCapability = createCapability<LockStore>()('locks')

/** Destructured accessors for adapters: `getSandbox(ctx)` reads the handle. */
export const [getSandbox, provideSandbox] = SandboxCapability
export const [getSandboxStore, provideSandboxStore] = SandboxStoreCapability
export const [getLocks, provideLocks] = LocksCapability
