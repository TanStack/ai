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
import type { SandboxPolicy } from './policy'

export const SandboxCapability = createCapability<SandboxHandle>()('sandbox')

export const SandboxStoreCapability =
  createCapability<SandboxStore>()('sandbox-store')

export const LocksCapability = createCapability<LockStore>()('locks')

/**
 * The active sandbox policy, provided by `withSandbox` from the definition.
 * Harness adapters read it to map allow/ask/deny rules onto their native
 * permission system.
 */
export const SandboxPolicyCapability =
  createCapability<SandboxPolicy>()('sandbox-policy')

/** Destructured accessors for adapters: `getSandbox(ctx)` reads the handle. */
export const [getSandbox, provideSandbox] = SandboxCapability
export const [getSandboxStore, provideSandboxStore] = SandboxStoreCapability
export const [getLocks, provideLocks] = LocksCapability
export const [getSandboxPolicy, provideSandboxPolicy] = SandboxPolicyCapability
