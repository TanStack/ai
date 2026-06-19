/**
 * Unit test for the Gemini CLI workspace projector.
 *
 * Drives `projectGeminiWorkspace` with a fake `SandboxHandle` (recording every
 * `fs.write` / `process.exec`) and a `WorkspaceProjection` carrying one of each
 * skill kind plus a plugin. Asserts the native projection (`~/.gemini/settings.json`
 * with the secret RESOLVED, gitSkill linked under `.gemini/skills`, plugin
 * warn-and-skip, marker written), that a second call still REWRITES the MCP
 * config but does NOT re-run the marker-gated gitSkill links, and that a
 * `bearer(ref)` header resolves to `Bearer <value>`. Also verifies that absent
 * concepts (agentSkill, plugins) warn but do not throw.
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
import { projectGeminiWorkspace } from '../src/adapters/projection'
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

  const handle = {
    fs: {
      write: (path: string, data: string | Uint8Array) => {
        writes.set(path, typeof data === 'string' ? data : '')
        existing.add(path)
        return Promise.resolve()
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

  return { handle, writes, execs, existing }
}

const ROOT = '/workspace'
const MARKER = `${ROOT}/.tanstack-projected-abc123`
const SETTINGS_PATH = '/root/.gemini/settings.json'

describe('projectGeminiWorkspace', () => {
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

  it('writes settings.json with the secret resolved, links the gitSkill, warns for agentSkill and plugin, writes the marker', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fake = makeFakeHandle({ stdout: '', stderr: '', exitCode: 0 })
    const { projection, gitDir } = buildScenario()

    await projectGeminiWorkspace(fake.handle, projection)

    // MCP config written to ~/.gemini/settings.json with the SECRET RESOLVED.
    const settingsRaw = fake.writes.get(SETTINGS_PATH)
    expect(settingsRaw).toBeDefined()
    const settings = JSON.parse(settingsRaw ?? '{}')
    expect(settings.mcpServers.issues.url).toBe('https://mcp.example.com/mcp')
    expect(settings.mcpServers.issues.headers.Authorization).toBe('super-secret')
    expect(settingsRaw).not.toContain('__secretName')

    // gitSkill linked (or copied) under .gemini/skills/<basename>.
    const target = `${ROOT}/.gemini/skills/my-skill`
    const linkExec = fake.execs.find(
      (e) => e.command.includes('ln -s') && e.command.includes(target),
    )
    expect(linkExec).toBeDefined()
    expect(linkExec?.command).toContain(gitDir)

    // agentSkill and plugin both warned (no gemini-cli primitives).
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

    await projectGeminiWorkspace(fake.handle, projection)

    const settings = JSON.parse(fake.writes.get(SETTINGS_PATH) ?? '{}')
    expect(settings.mcpServers.issues.headers['X-Plain']).toBe('literal-value')
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

    await projectGeminiWorkspace(fake.handle, projection)

    const settingsRaw = fake.writes.get(SETTINGS_PATH)
    const settings = JSON.parse(settingsRaw ?? '{}')
    expect(settings.mcpServers.issues.headers.Authorization).toBe(
      'Bearer lin-token',
    )
    expect(settingsRaw).not.toContain('__secretName')
    expect(settingsRaw).not.toContain('__bearerRef')
  })

  it('rewrites settings.json on a second call but does not re-run gitSkill links', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fake = makeFakeHandle({ stdout: '', stderr: '', exitCode: 0 })
    const { projection } = buildScenario()

    await projectGeminiWorkspace(fake.handle, projection)
    const execsAfterFirst = fake.execs.length
    expect(fake.writes.get(SETTINGS_PATH)).toContain('super-secret')

    // Clear the recorded MCP write so we can prove the second call rewrites it.
    fake.writes.delete(SETTINGS_PATH)

    await projectGeminiWorkspace(fake.handle, projection)

    // The secret-bearing MCP config is rewritten every call.
    const rewritten = fake.writes.get(SETTINGS_PATH)
    expect(rewritten).toBeDefined()
    expect(rewritten).toContain('super-secret')

    // The safe, idempotent, non-secret operations (gitSkill links) are
    // marker-gated and do NOT run again on the second call.
    expect(fake.execs.length).toBe(execsAfterFirst)

    warn.mockRestore()
  })

  it('warns for agentSkill but does not throw', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fake = makeFakeHandle({ stdout: '', stderr: '', exitCode: 0 })
    const projection: WorkspaceProjection = {
      skills: [agentSkill('my-public-skill')],
      plugins: [],
      resolveSecret: () => {
        throw new Error('should not be called')
      },
      markerPath: MARKER,
      root: ROOT,
    }

    await expect(
      projectGeminiWorkspace(fake.handle, projection),
    ).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('agentSkill'),
    )

    warn.mockRestore()
  })

  it('warns for plugins but does not throw', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fake = makeFakeHandle({ stdout: '', stderr: '', exitCode: 0 })
    const projection: WorkspaceProjection = {
      skills: [],
      plugins: ['@acme/some-plugin'],
      resolveSecret: () => {
        throw new Error('should not be called')
      },
      markerPath: MARKER,
      root: ROOT,
    }

    await expect(
      projectGeminiWorkspace(fake.handle, projection),
    ).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('@acme/some-plugin'),
    )

    warn.mockRestore()
  })

  it('does not write settings.json when there are no MCP skills', async () => {
    const fake = makeFakeHandle({ stdout: '', stderr: '', exitCode: 0 })
    const projection: WorkspaceProjection = {
      skills: [agentSkill('x')],
      plugins: [],
      resolveSecret: () => {
        throw new Error('should not be called')
      },
      markerPath: MARKER,
      root: ROOT,
    }
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await projectGeminiWorkspace(fake.handle, projection)

    expect(fake.writes.has(SETTINGS_PATH)).toBe(false)

    warn.mockRestore()
  })
})
