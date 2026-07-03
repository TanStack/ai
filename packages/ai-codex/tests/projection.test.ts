/**
 * Unit test for the Codex workspace projector.
 *
 * Drives `projectCodexWorkspace` with a fake `SandboxHandle` (recording every
 * `fs.write` / `process.exec`) and a `WorkspaceProjection` carrying one of each
 * skill kind plus a plugin. Asserts the native projection (`.codex/config.toml`
 * TOML with the secret RESOLVED, gitSkill linked under `.codex/skills`, marker
 * written), that a `bearer(ref)` header resolves to `Bearer <value>`, that a
 * second call still REWRITES the TOML with the current secret but does NOT
 * re-run the marker-gated gitSkill links, and that the absent plugin/agentSkill
 * concepts warn rather than throw.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  agentSkill,
  bearer,
  createSecrets,
  gitSkill,
  mcpSkill,
  resolveGitSkillDir,
} from '@tanstack/ai-sandbox'
import { projectCodexWorkspace } from '../src/adapters/projection'
import type {
  ExecResult,
  SandboxHandle,
  WorkspaceProjection,
  WorkspaceSkill,
} from '@tanstack/ai-sandbox'

interface RecordedExec {
  command: string
  cwd: string | undefined
}

interface FakeHandle {
  handle: SandboxHandle
  writes: Map<string, string>
  execs: Array<RecordedExec>
  existing: Set<string>
}

/** Build a fake handle that records writes/execs and tracks existing paths. */
function makeFakeHandle(execResult: ExecResult): FakeHandle {
  const writes = new Map<string, string>()
  const execs: Array<RecordedExec> = []
  const existing = new Set<string>()
  const dirs = new Set<string>()

  const handle = {
    fs: {
      write: (path: string, data: string | Uint8Array) => {
        writes.set(path, typeof data === 'string' ? data : '')
        existing.add(path)
        return Promise.resolve()
      },
      exists: (path: string) => Promise.resolve(existing.has(path)),
      mkdir: (path: string) => {
        dirs.add(path)
        return Promise.resolve()
      },
    },
    process: {
      exec: (command: string, options?: { cwd?: string }) => {
        execs.push({ command, cwd: options?.cwd })
        return Promise.resolve(execResult)
      },
    },
  } as unknown as SandboxHandle

  return { handle, writes, execs, existing }
}

const ROOT = '/workspace'
const MARKER = `${ROOT}/.tanstack-projected-abc123`
const CONFIG = `${ROOT}/.codex/config.toml`

describe('projectCodexWorkspace', () => {
  function buildScenario() {
    const secrets = createSecrets({ MCP_TOKEN: 'super-secret' })
    const skills: Array<WorkspaceSkill> = [
      mcpSkill('issues', {
        url: 'https://mcp.example.com/mcp',
        headers: { Authorization: secrets.MCP_TOKEN },
      }),
      agentSkill('public-skill'),
      gitSkill({ repo: 'me/my-skill' }),
    ]
    const projection: WorkspaceProjection = {
      skills,
      plugins: ['@acme/plugin'],
      resolveSecret: (ref) => {
        if (ref.__secretName === 'MCP_TOKEN') return 'super-secret'
        throw new Error(`unknown secret "${ref.__secretName}"`)
      },
      markerPath: MARKER,
      root: ROOT,
    }
    return {
      projection,
      gitDir: resolveGitSkillDir(ROOT, { kind: 'git', repo: 'me/my-skill' }),
    }
  }

  it('writes codex TOML with the secret resolved, links the gitSkill, warns for plugin/agentSkill, writes the marker', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fake = makeFakeHandle({ stdout: '', stderr: '', exitCode: 0 })
    const { projection, gitDir } = buildScenario()

    await projectCodexWorkspace(fake.handle, projection)

    // MCP config written as codex TOML with the SECRET RESOLVED (not the ref).
    const toml = fake.writes.get(CONFIG)
    expect(toml).toBeDefined()
    expect(toml).toContain('[mcp_servers.issues]')
    expect(toml).toContain('url = "https://mcp.example.com/mcp"')
    expect(toml).toContain(
      'http_headers = { "Authorization" = "super-secret" }',
    )
    expect(toml).not.toContain('__secretName')

    // gitSkill linked (or copied) under .codex/skills/<basename>.
    const target = `${ROOT}/.codex/skills/my-skill`
    const linkExec = fake.execs.find(
      (e) => e.command.includes('ln -s') && e.command.includes(target),
    )
    expect(linkExec).toBeDefined()
    expect(linkExec?.command).toContain(gitDir)

    // No plugin install command is ever run (codex has no plugin concept).
    expect(fake.execs.some((e) => e.command.includes('plugin install'))).toBe(
      false,
    )

    // agentSkill + plugin both warned (no codex primitive for either).
    expect(warn).toHaveBeenCalled()

    // Marker written.
    expect(fake.writes.has(MARKER)).toBe(true)

    warn.mockRestore()
  })

  it('passes plain-string header values through unchanged', async () => {
    const fake = makeFakeHandle({ stdout: '', stderr: '', exitCode: 0 })
    const projection: WorkspaceProjection = {
      skills: [
        mcpSkill('issues', {
          url: 'https://mcp.example.com/mcp',
          headers: { 'X-Plain': 'literal-value' },
        }),
      ],
      plugins: [],
      resolveSecret: () => {
        throw new Error('resolveSecret should not be called for plain headers')
      },
      markerPath: MARKER,
      root: ROOT,
    }

    await projectCodexWorkspace(fake.handle, projection)

    const toml = fake.writes.get(CONFIG)
    expect(toml).toContain('"X-Plain" = "literal-value"')
  })

  it('resolves a bearer(ref) header to "Bearer <resolved-value>"', async () => {
    const fake = makeFakeHandle({ stdout: '', stderr: '', exitCode: 0 })
    const secrets = createSecrets({ LIN: 'lin-token' })
    const projection: WorkspaceProjection = {
      skills: [
        mcpSkill('issues', {
          url: 'https://mcp.example.com/mcp',
          headers: { Authorization: bearer(secrets.LIN) },
        }),
      ],
      plugins: [],
      resolveSecret: (ref) => {
        if (ref.__secretName === 'LIN') return 'lin-token'
        throw new Error(`unknown secret "${ref.__secretName}"`)
      },
      markerPath: MARKER,
      root: ROOT,
    }

    await projectCodexWorkspace(fake.handle, projection)

    const toml = fake.writes.get(CONFIG)
    expect(toml).toContain('"Authorization" = "Bearer lin-token"')
    expect(toml).not.toContain('__secretName')
    expect(toml).not.toContain('__bearerRef')
  })

  it('rewrites the TOML on a second call but does not re-run gitSkill links', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fake = makeFakeHandle({ stdout: '', stderr: '', exitCode: 0 })
    const { projection } = buildScenario()

    await projectCodexWorkspace(fake.handle, projection)
    const execsAfterFirst = fake.execs.length
    expect(fake.writes.get(CONFIG)).toContain('super-secret')

    // Clear the recorded TOML write so we can prove the second call rewrites it.
    fake.writes.delete(CONFIG)

    await projectCodexWorkspace(fake.handle, projection)

    // The secret-bearing MCP config is rewritten every call, with the current
    // secret resolved fresh, so a rotated secret always re-applies.
    const rewritten = fake.writes.get(CONFIG)
    expect(rewritten).toBeDefined()
    expect(rewritten).toContain('super-secret')

    // The safe, idempotent, non-secret operations (gitSkill links) are
    // marker-gated and do NOT run again on the second call.
    expect(fake.execs.length).toBe(execsAfterFirst)

    warn.mockRestore()
  })
})
