import { DEFAULT_WORKSPACE_ROOT } from './bootstrap'
import type { WorkspaceDefinition } from './workspace'

export const WORKSPACE_PERSISTENCE_METADATA_SCOPE =
  'tanstack.ai.sandbox.workspace'

/**
 * Options for persisting a sandbox workspace tree across runs.
 */
export interface WorkspacePersistenceOptions {
  /**
   * Stable identifier for the persisted workspace snapshot. Defaults to the
   * sandbox definition's computed key, so the same thread/workspace resumes the
   * same tree.
   */
  key?: string
  /**
   * Absolute workspace root to persist. Defaults to the workspace definition's
   * root, or the sandbox's default workspace root.
   */
  root?: string
  /**
   * Glob patterns to include. When set, a path must match at least one pattern
   * (and not match any {@link exclude} pattern) to be persisted. When unset,
   * everything under {@link root} is persisted except {@link exclude} matches.
   */
  include?: Array<string>
  /**
   * Glob patterns to exclude. These are appended to a built-in default list
   * (`node_modules`, `.git`, `dist`, `build`, `.cache`, `.env*`) — they do not
   * replace it. A path matching any exclude pattern is never persisted, even if
   * it also matches an {@link include} pattern.
   */
  exclude?: Array<string>
  /**
   * Maximum size (bytes) of a single file to persist. Defaults to 10 MiB
   * (`10 * 1024 * 1024`). A file exceeding this errors rather than being
   * silently skipped: under `consistency:'strict'` it fails the run; under
   * `'best-effort'` the checkpoint is dropped and the error is logged.
   */
  maxFileBytes?: number
  /**
   * How persistence failures affect the run. Defaults to `'strict'`.
   *
   * - `'strict'` — a restore or checkpoint failure is re-thrown from the
   *   terminal middleware hook and fails the whole run.
   * - `'best-effort'` — failures are swallowed so the run continues, and logged
   *   at `warn` level for observability.
   */
  consistency?: 'strict' | 'best-effort'
}

export interface WorkspacePersistenceManifest {
  version: 1
  files: Record<
    string,
    {
      artifactId: string
      blobKey: string
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
  revision: string,
): string {
  return `workspace:${key}:file:${encodeURIComponent(path)}:${encodeURIComponent(revision)}`
}

export function workspacePersistenceBlobKey(
  key: string,
  path: string,
  revision: string,
): string {
  return `workspace:${key}:blob:${encodeURIComponent(path)}:${encodeURIComponent(revision)}`
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
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES
  if (!Number.isSafeInteger(maxFileBytes) || maxFileBytes <= 0) {
    throw new Error(
      `workspacePersistence.maxFileBytes must be a positive safe integer, received ${maxFileBytes}`,
    )
  }

  return {
    key: options.key ?? input.defaultKey,
    root: options.root ?? input.workspace?.root ?? DEFAULT_WORKSPACE_ROOT,
    include: options.include,
    exclude: [...DEFAULT_EXCLUDE, ...(options.exclude ?? [])],
    maxFileBytes,
    consistency: options.consistency ?? 'strict',
  }
}
