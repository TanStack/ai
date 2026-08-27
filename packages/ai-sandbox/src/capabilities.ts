import { createCapability } from '@tanstack/ai'
import type { SandboxHandle } from './contracts'
import type { SandboxPolicy } from './policy'
import type { ToolBridgeProvisioner } from './tool-bridge'

export const SandboxCapability = createCapability<SandboxHandle>()('sandbox')

export const SandboxPolicyCapability =
  createCapability<SandboxPolicy>()('sandbox-policy')

export const ToolBridgeProvisionerCapability =
  createCapability<ToolBridgeProvisioner>()('tool-bridge-provisioner')

/** Destructured accessors for adapters: `getSandbox(ctx)` reads the handle. */
export const [getSandbox, provideSandbox] = SandboxCapability
export const [getSandboxPolicy, provideSandboxPolicy] = SandboxPolicyCapability
export const [getToolBridgeProvisioner, provideToolBridgeProvisioner] =
  ToolBridgeProvisionerCapability
