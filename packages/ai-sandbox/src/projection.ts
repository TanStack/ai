/**
 * Workspace projection capability — provided by `withSandbox` and consumed by
 * harness adapters (claude-code, codex, gemini-cli, opencode) to idempotently
 * project skills, plugins, and resolved secrets into the native harness format.
 *
 * The capability carries the raw provisioning inputs (skills, plugins, a
 * resolve function for secret refs) together with a marker path that lets
 * adapters guard the projection with a one-time idempotency file.
 */
import { createCapability } from '@tanstack/ai'
import type { SecretRef } from './secrets'
import type { WorkspaceSkill } from './workspace'

/**
 * The shape provided to harness adapters via the sandbox projection capability.
 * Harness adapters read this in their `chatStream` setup to project workspace
 * inputs into their native format (MCP config, skills dirs, plugin installs).
 */
export interface WorkspaceProjection {
  /** Skills declared on the workspace — MCP servers, file skills, git repos, etc. */
  skills: Array<WorkspaceSkill>
  /** Harness plugin identifiers to install idempotently. */
  plugins: Array<string>
  /**
   * Resolve a SecretRef to its plaintext value. Bound to the workspace's
   * secrets registry; throws when the ref is unknown.
   */
  resolveSecret: (ref: SecretRef) => string
  /**
   * Absolute path to the idempotency marker file. Harness adapters write this
   * file after a successful projection so subsequent runs skip re-projection.
   * The file is NOT included in snapshots — absent on restore, triggering
   * re-projection (which re-writes any secret-bearing config files).
   */
  markerPath: string
  /** Workspace root inside the sandbox (e.g. `/workspace`). */
  root: string
}

export const ProjectionCapability =
  createCapability<WorkspaceProjection>()('sandbox-projection')

export const [getWorkspaceProjection, provideWorkspaceProjection] =
  ProjectionCapability
