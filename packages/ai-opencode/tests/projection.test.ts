/**
 * Unit tests for the OpenCode workspace projector.
 *
 * Drives `projectOpencodeWorkspace` with a fake `SandboxHandle` (recording
 * every `fs.write` / `fs.read` / `process.exec`) and a `WorkspaceProjection`
 * carrying one of each skill kind plus a plugin. Asserts:
 *
 *   - `opencode.json` written at the workspace root with the MCP server whose
 *     secret header is RESOLVED (not the SecretRef).
 *   - A `bearer(ref)` header resolves to `"Bearer <value>"`.
 *   - A 2nd call REWRITES `opencode.json` (with a fresh resolved secret) but
 *     does NOT re-run the marker-gated operations.
 *   - The marker file is written.
 *   - gitSkill / agentSkill / plugin all warn-and-skip (not throw).
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
import { projectOpencodeWorkspace } from '../src/adapters/projection'
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
  reads: Array<string>
  execs: Array<RecordedExec>
  existing: Set<string>
}

/** Build a fake handle that records writes, reads, and execs. */
function makeFakeHandle(execResult: ExecResult = { stdout: '', stderr: '', exitCode: 0 }): FakeHandle {
  const writes = new Map<string, string>()
  const reads: Array<string> = []
  const execs: Array<RecordedExec> = []
  const existing = new Set<string>()

  const handle = {
    fs: {
      write: (path: string, data: string | Uint8Array) => {
        writes.set(path, typeof data === 'string' ? data : '')
        existing.add(path)
        return Promise.resolve()
      },
      read: (path: string) => {
        reads.push(path)
        const content = writes.get(path)
        if (content === undefined) return Promise.reject(new Error(`not found: ${path}`))
        return Promise.resolve(content)
      },
      exists: (path: string) => Promise.resolve(existing.has(path)),
      mkdir: (_path: string) => Promise.resolve(),
    },
    process: {
      exec: (command: string, options?: { cwd?: string }) => {
        execs.push({ command, cwd: options?.cwd })
        return Promise.resolve(execResult)
      },
    },
  } as unknown as SandboxHandle

  return { handle, writes, reads, execs, existing }
}

const ROOT = '/workspace'
const MARKER = `${ROOT}/.tanstack-projected-abc123`

describe('projectOpencodeWorkspace', () => {
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

  it('writes opencode.json with the MCP secret resolved, warns for gitSkill/agentSkill/plugin, writes the marker', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fake = makeFakeHandle()
    const { projection } = buildScenario()

    await projectOpencodeWorkspace(fake.handle, projection)

    // opencode.json written with MCP server — secret RESOLVED, no SecretRef leak.
    const raw = fake.writes.get(`${ROOT}/opencode.json`)
    expect(raw).toBeDefined()
    const config = JSON.parse(raw ?? '{}') as { mcp?: Record<string, unknown> }
    expect(config.mcp).toBeDefined()
    const entry = config.mcp?.['issues'] as {
      type?: string
      url?: string
      enabled?: boolean
      headers?: Record<string, string>
    }
    expect(entry?.type).toBe('remote')
    expect(entry?.url).toBe('https://mcp.example.com/mcp')
    expect(entry?.enabled).toBe(true)
    expect(entry?.headers?.['Authorization']).toBe('super-secret')
    // No raw SecretRef bleed-through.
    expect(raw).not.toContain('__secretName')

    // agentSkill and gitSkill and plugin all produce warnings, not throws.
    expect(warn).toHaveBeenCalled()
    const messages = warn.mock.calls.map((call) => String(call[0]))
    expect(messages.some((m) => m.includes('[opencode]') && m.includes('gitSkill'))).toBe(true)
    expect(messages.some((m) => m.includes('[opencode]') && m.includes('agentSkill'))).toBe(true)
    expect(messages.some((m) => m.includes('[opencode]') && m.includes('plugin'))).toBe(true)

    // Marker written.
    expect(fake.writes.has(MARKER)).toBe(true)

    warn.mockRestore()
  })

  it('passes plain-string header values through unchanged', async () => {
    const fake = makeFakeHandle()
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

    await projectOpencodeWorkspace(fake.handle, projection)

    const config = JSON.parse(fake.writes.get(`${ROOT}/opencode.json`) ?? '{}') as {
      mcp?: Record<string, { headers?: Record<string, string> }>
    }
    expect(config.mcp?.['issues']?.headers?.['X-Plain']).toBe('literal-value')
  })

  it('resolves a bearer(ref) header to "Bearer <resolved-value>"', async () => {
    const fake = makeFakeHandle()
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

    await projectOpencodeWorkspace(fake.handle, projection)

    const raw = fake.writes.get(`${ROOT}/opencode.json`)
    const config = JSON.parse(raw ?? '{}') as {
      mcp?: Record<string, { headers?: Record<string, string> }>
    }
    expect(config.mcp?.['issues']?.headers?.['Authorization']).toBe('Bearer lin-token')
    expect(raw).not.toContain('__secretName')
    expect(raw).not.toContain('__bearerRef')
  })

  it('rewrites opencode.json on a second call but does not re-run marker-gated ops', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fake = makeFakeHandle()
    const { projection } = buildScenario()

    await projectOpencodeWorkspace(fake.handle, projection)
    const warnCountAfterFirst = warn.mock.calls.length

    // Clear the recorded opencode.json write to prove a second call rewrites it.
    fake.writes.delete(`${ROOT}/opencode.json`)
    // Make the existing-file check for merging return "not found" since we deleted it.
    fake.existing.delete(`${ROOT}/opencode.json`)

    await projectOpencodeWorkspace(fake.handle, projection)

    // The secret-bearing MCP config is rewritten every call.
    const rewritten = fake.writes.get(`${ROOT}/opencode.json`)
    expect(rewritten).toBeDefined()
    expect(rewritten).toContain('super-secret')

    // The marker-gated operations (gitSkill / agentSkill / plugins) do NOT
    // emit further warnings on the second call (marker present, they are skipped).
    expect(warn.mock.calls.length).toBe(warnCountAfterFirst)

    warn.mockRestore()
  })

  it('skips opencode.json write when there are no MCP skills', async () => {
    const fake = makeFakeHandle()
    const projection: WorkspaceProjection = {
      skills: [agentSkill('only-agent-skill')],
      plugins: [],
      resolveSecret: () => {
        throw new Error('should not be called')
      },
      markerPath: MARKER,
      root: ROOT,
    }

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await projectOpencodeWorkspace(fake.handle, projection)
    warn.mockRestore()

    expect(fake.writes.has(`${ROOT}/opencode.json`)).toBe(false)
    // Marker still written (non-MCP, marker-gated ops ran).
    expect(fake.writes.has(MARKER)).toBe(true)
  })

  it('merges the mcp section into an existing opencode.json, preserving other keys', async () => {
    const fake = makeFakeHandle()
    // Pre-populate an existing opencode.json with a non-mcp setting.
    const existing = JSON.stringify({ theme: 'dark', keybinds: { 'ctrl+s': 'save' } })
    fake.writes.set(`${ROOT}/opencode.json`, existing)
    fake.existing.add(`${ROOT}/opencode.json`)

    const projection: WorkspaceProjection = {
      skills: [
        mcpSkill('issues', {
          url: 'https://mcp.example.com/mcp',
          headers: {},
        }),
      ],
      plugins: [],
      resolveSecret: () => {
        throw new Error('no secret refs in this test')
      },
      markerPath: MARKER,
      root: ROOT,
    }

    await projectOpencodeWorkspace(fake.handle, projection)

    const raw = fake.writes.get(`${ROOT}/opencode.json`)
    const config = JSON.parse(raw ?? '{}') as {
      theme?: string
      keybinds?: unknown
      mcp?: Record<string, unknown>
    }
    // Existing keys preserved.
    expect(config.theme).toBe('dark')
    expect(config.keybinds).toBeDefined()
    // MCP section written.
    expect(config.mcp?.['issues']).toBeDefined()
  })
})
