import { createCapability } from '@tanstack/ai'
import type { SecretRef } from './secrets'
import type { WorkspaceSkill } from './workspace'

export interface WorkspaceProjection {
  /** Skills declared on the workspace — MCP servers, file skills, git repos, etc. */
  skills: Array<WorkspaceSkill>
  /** Harness plugin identifiers to install idempotently. */
  plugins: Array<string>
  resolveSecret: (ref: SecretRef) => string
  markerPath: string
  /** Workspace root inside the sandbox (e.g. `/workspace`). */
  root: string
  /** Named commands declared on the workspace (e.g. `{ test: 'pnpm test' }`). */
  scripts?: Record<string, string>
}

export const ProjectionCapability =
  createCapability<WorkspaceProjection>()('sandbox-projection')

export const [getWorkspaceProjection, provideWorkspaceProjection] =
  ProjectionCapability
