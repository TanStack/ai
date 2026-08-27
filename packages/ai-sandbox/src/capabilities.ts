import { createCapability } from '@tanstack/ai'
import type { SandboxHandle } from './contracts'
import type { SandboxPolicy } from './policy'
import type { ToolBridgeProvisioner } from './tool-bridge'

export const SandboxCapability = createCapability<SandboxHandle>()('sandbox')

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
export const /** Destructured accessors for adapters: `getSandbox(ctx)` reads the handle. */
[getSandbox, provideSandbox] = SandboxCapability
export const [getSandboxPolicy, provideSandboxPolicy] = SandboxPolicyCapability
export const [getToolBridgeProvisioner, provideToolBridgeProvisioner] =
  ToolBridgeProvisionerCapability
