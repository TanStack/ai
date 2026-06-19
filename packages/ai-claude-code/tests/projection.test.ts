/**
 * Unit test for the Claude Code workspace projector.
 *
 * Drives `projectClaudeWorkspace` with a fake `SandboxHandle` (recording every
 * `fs.write` / `process.exec`) and a `WorkspaceProjection` carrying one of each
 * skill kind plus a plugin. Asserts the native projection (`.mcp.json` with the
 * secret RESOLVED, gitSkill linked under `.claude/skills`, plugin installed,
 * marker written), that a second call still REWRITES `.mcp.json` with the
 * current secret but does NOT re-run the marker-gated gitSkill links / plugin
 * installs, and that a `bearer(ref)` header resolves to `Bearer <value>`.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  bearer,
  createSecrets,
  mcpSkill,
  agentSkill,
  gitSkill,
  resolveGitSkillDir,
} from '@tanstack/ai-sandbox'
import { projectClaudeWorkspace } from '../src/adapters/projection'
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

describe('projectClaudeWorkspace', () => {
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
    return { projection, gitDir: resolveGitSkillDir(ROOT, { kind: 'git', repo: 'me/my-skill' }) }
  }

  it('writes .mcp.json with the secret resolved, links the gitSkill, installs the plugin, writes the marker', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fake = makeFakeHandle({ stdout: '', stderr: '', exitCode: 0 })
    const { projection, gitDir } = buildScenario()

    await projectClaudeWorkspace(fake.handle, projection)

    // MCP config written at project root with the SECRET RESOLVED (not the ref).
    const mcpRaw = fake.writes.get(`${ROOT}/.mcp.json`)
    expect(mcpRaw).toBeDefined()
    const mcp = JSON.parse(mcpRaw ?? '{}')
    expect(mcp.mcpServers.issues.type).toBe('http')
    expect(mcp.mcpServers.issues.url).toBe('https://mcp.example.com/mcp')
    expect(mcp.mcpServers.issues.headers.Authorization).toBe('super-secret')
    expect(mcpRaw).not.toContain('__secretName')

    // gitSkill linked (or copied) under .claude/skills/<basename>.
    const target = `${ROOT}/.claude/skills/my-skill`
    const linkExec = fake.execs.find(
      (e) => e.command.includes('ln -s') && e.command.includes(target),
    )
    expect(linkExec).toBeDefined()
    expect(linkExec?.command).toContain(gitDir)

    // Plugin installed.
    const pluginExec = fake.execs.find((e) =>
      e.command.includes('claude plugin install'),
    )
    expect(pluginExec?.command).toContain('@acme/plugin')

    // agentSkill warned (no claude primitive for bare names).
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

    await projectClaudeWorkspace(fake.handle, projection)

    const mcp = JSON.parse(fake.writes.get(`${ROOT}/.mcp.json`) ?? '{}')
    expect(mcp.mcpServers.issues.headers['X-Plain']).toBe('literal-value')
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

    await projectClaudeWorkspace(fake.handle, projection)

    const mcpRaw = fake.writes.get(`${ROOT}/.mcp.json`)
    const mcp = JSON.parse(mcpRaw ?? '{}')
    expect(mcp.mcpServers.issues.headers.Authorization).toBe('Bearer lin-token')
    expect(mcpRaw).not.toContain('__secretName')
    expect(mcpRaw).not.toContain('__bearerRef')
  })

  it('rewrites .mcp.json on a second call but does not re-run gitSkill links / plugin installs', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fake = makeFakeHandle({ stdout: '', stderr: '', exitCode: 0 })
    const { projection } = buildScenario()

    await projectClaudeWorkspace(fake.handle, projection)
    const execsAfterFirst = fake.execs.length
    expect(fake.writes.get(`${ROOT}/.mcp.json`)).toContain('super-secret')

    // Clear the recorded MCP write so we can prove the second call rewrites it.
    fake.writes.delete(`${ROOT}/.mcp.json`)

    await projectClaudeWorkspace(fake.handle, projection)

    // The secret-bearing MCP config is rewritten every call, with the current
    // secret resolved fresh, so a rotated secret always re-applies.
    const rewritten = fake.writes.get(`${ROOT}/.mcp.json`)
    expect(rewritten).toBeDefined()
    expect(rewritten).toContain('super-secret')

    // The safe, idempotent, non-secret operations (gitSkill links, plugin
    // installs) are marker-gated and do NOT run again on the second call.
    expect(fake.execs.length).toBe(execsAfterFirst)

    warn.mockRestore()
  })
})
