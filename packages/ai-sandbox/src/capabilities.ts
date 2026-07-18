/**
 * Capability tokens the sandbox layer provides/consumes through the
 * `@tanstack/ai` middleware capability system.
 *
 * - `SandboxCapability` is PROVIDED by `withSandbox` and REQUIRED by harness
 *   adapters (`requires: [SandboxCapability]`).
 * - `SandboxStoreCapability` / `LocksCapability` are OPTIONALLY required by
 *   `withSandbox`. It falls back to in-memory defaults. No middleware provides
 *   `SandboxStoreCapability` directly — instead, when a persistence middleware
 *   supplies `PersistenceCapability`, `withSandbox` adapts its `stores.metadata`
 *   into a `SandboxStore`; `LocksCapability` is consumed as-is when provided.
 */
import {
  LocksCapability,
  createCapability,
  getLocks,
  provideLocks,
} from '@tanstack/ai'
import type { SandboxHandle } from './contracts'
import type { SandboxStore } from './store'
import type { SandboxPolicy } from './policy'
import type { ToolBridgeProvisioner } from './tool-bridge'

export const SandboxCapability = createCapability<SandboxHandle>()('sandbox')

export const SandboxStoreCapability =
  createCapability<SandboxStore>()('sandbox-store')

/**
 * The active sandbox policy, provided by `withSandbox` from the definition.
 * Harness adapters read it to map allow/ask/deny rules onto their native
 * permission system.
 */
export const SandboxPolicyCapability =
  createCapability<SandboxPolicy>()('sandbox-policy')

/**
 * Provisions the MCP tool-bridge endpoint for a run. OPTIONALLY provided by a
 * serverless/edge orchestrator (e.g. a Durable Object) to override the default
 * `node:http` host transport. Harness adapters read it via `getOptional` and
 * fall back to `nodeHttpBridgeProvisioner` when absent.
 */
export const ToolBridgeProvisionerCapability =
  createCapability<ToolBridgeProvisioner>()('tool-bridge-provisioner')

/** Destructured accessors for adapters: `getSandbox(ctx)` reads the handle. */
export const [getSandbox, provideSandbox] = SandboxCapability
export const [getSandboxStore, provideSandboxStore] = SandboxStoreCapability
export const [getSandboxPolicy, provideSandboxPolicy] = SandboxPolicyCapability
export const [getToolBridgeProvisioner, provideToolBridgeProvisioner] =
  ToolBridgeProvisionerCapability

export { LocksCapability, getLocks, provideLocks }
