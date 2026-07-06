import { DEFAULT_WORKSPACE_ROOT } from './bootstrap'
import type { WorkspaceDefinition } from './workspace'

export const WORKSPACE_PERSISTENCE_METADATA_SCOPE =
  'tanstack.ai.sandbox.workspace'

export interface WorkspacePersistenceOptions {
  key?: string
  root?: string
  include?: Array<string>
  exclude?: Array<string>
  maxFileBytes?: number
  consistency?: 'strict' | 'best-effort'
}

export interface WorkspacePersistenceManifest {
  version: 1
  files: Record<
    string,
    {
      artifactId: string
      size: number
      updatedAt: number
    }
  >
  deleted: Record<string, number>
}

export interface ResolvedWorkspacePersistenceOptions {
  key: string
  root: string
  include?: Array<string>
  exclude: Array<string>
  maxFileBytes: number
  consistency: 'strict' | 'best-effort'
}

const DEFAULT_MAX_FILE_BYTES = 10 * 1024 * 1024
const DEFAULT_EXCLUDE = [
  'node_modules',
  '.git',
  'dist',
  'build',
  '.cache',
  '.env*',
]

export function workspacePersistenceManifestKey(key: string): string {
  return `workspace:${key}:manifest`
}

export function workspacePersistenceArtifactId(
  key: string,
  path: string,
): string {
  return `workspace:${key}:file:${encodeURIComponent(path)}`
}

export function resolveWorkspacePersistenceOptions(input: {
  workspacePersistence: boolean | WorkspacePersistenceOptions | undefined
  workspace: WorkspaceDefinition | undefined
  defaultKey: string
}): ResolvedWorkspacePersistenceOptions | undefined {
  if (
    input.workspacePersistence === undefined ||
    input.workspacePersistence === false
  ) {
    return undefined
  }

  const options =
    input.workspacePersistence === true ? {} : input.workspacePersistence

  return {
    key: options.key ?? input.defaultKey,
    root: options.root ?? input.workspace?.root ?? DEFAULT_WORKSPACE_ROOT,
    include: options.include,
    exclude: [...DEFAULT_EXCLUDE, ...(options.exclude ?? [])],
    maxFileBytes: options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES,
    consistency: options.consistency ?? 'strict',
  }
}
