import type { SetupInput } from './setup-plan'

/**
 * Workspace definition — the portable description of what the agent sees
 * inside the sandbox. Each harness adapter PROJECTS this into its own native
 * format via `projectWorkspace()` (e.g. Claude Code → CLAUDE.md + .claude/skills
 * + --mcp-config). The definition itself is provider- and harness-agnostic.
 */

/** Where the working tree comes from. */
export type WorkspaceSource =
  | {
      type: 'git'
      url: string
      ref?: string
      auth?: { username?: string; token: string }
      /**
       * Clone depth. Defaults to `1` (shallow). Pass a number for a specific
       * depth, or `'full'` to fetch the entire history.
       */
      depth?: number | 'full'
    }
  | { type: 'local'; path: string }
  | { type: 'none' }

/** Clone a git repo into the workspace. `githubRepo` is a convenience wrapper. */
export function gitSource(input: {
  url: string
  ref?: string
  auth?: { username?: string; token: string }
  depth?: number | 'full'
}): WorkspaceSource {
  return { type: 'git', ...input }
}

export function githubRepo(input: {
  repo: string
  ref?: string
  auth?: { username?: string; token: string }
  depth?: number | 'full'
}): WorkspaceSource {
  const url = input.repo.startsWith('http')
    ? input.repo
    : `https://github.com/${input.repo}.git`
  return { type: 'git', url, ref: input.ref, auth: input.auth, depth: input.depth }
}

export function localSource(path: string): WorkspaceSource {
  return { type: 'local', path }
}

/** A unit of agent guidance/config projected into the harness's native format. */
export type WorkspaceSkill =
  | { kind: 'file'; path: string; content: string }
  | { kind: 'agent-skill'; name: string }
  | {
      kind: 'mcp'
      name: string
      config: Record<string, unknown>
    }

/** Write a file (e.g. CLAUDE.md) into the workspace / harness config. */
export function fileSkill(input: {
  path: string
  content: string
}): WorkspaceSkill {
  return { kind: 'file', ...input }
}

/** Reference a named agent skill the harness should load. */
export function agentSkill(name: string): WorkspaceSkill {
  return { kind: 'agent-skill', name }
}

/** Project an MCP server into the harness. */
export function mcpSkill(
  name: string,
  config: Record<string, unknown>,
): WorkspaceSkill {
  return { kind: 'mcp', name, config }
}

export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun' | 'auto'

export interface WorkspaceDefinition {
  source: WorkspaceSource
  /** Defaults to `'auto'` — detect from the lockfile after the source lands. */
  packageManager?: PackageManager
  /** Commands run once during bootstrap. Accepts a string array (serial) or a builder function for serial/parallel groups. */
  setup?: SetupInput
  /** Named commands the agent/user can invoke (e.g. { test: 'pnpm test' }). */
  scripts?: Record<string, string>
  /** Guidance/config projected into the harness. */
  skills?: Array<WorkspaceSkill>
  /**
   * Secrets injected into the sandbox env at create/resume. NEVER written to
   * snapshots, the SandboxStore, or the event log — they live only in the
   * running sandbox's environment and are re-injected each create/resume.
   */
  secrets?: Record<string, string>
  /** Workspace root inside the sandbox. Defaults to `/workspace`. */
  root?: string
}

export function defineWorkspace(
  definition: WorkspaceDefinition,
): WorkspaceDefinition {
  return definition
}
