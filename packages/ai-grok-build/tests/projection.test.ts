/**
 * Unit test for the Grok Build workspace projector.
 *
 * Drives `projectGrokWorkspace` with a fake `SandboxHandle` (recording every
 * `fs.write` / `process.exec`) and a `WorkspaceProjection` carrying one of each
 * skill kind plus a plugin. Asserts the native projection (`.grok/config.toml`
 * TOML with the secret RESOLVED, gitSkill linked under `.grok/skills`, marker
 * written), that a `bearer(ref)` header resolves to `Bearer <value>`, that a
 * second call still REWRITES the TOML with the current secret but does NOT
 * re-run the marker-gated gitSkill links, that workspace MCP tables MERGE with
 * an existing bridge config instead of wiping it, and that the absent
 * plugin/agentSkill concepts warn rather than throw.
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
import {
  projectGrokWorkspace,
  renderGrokMcpToml,
} from '../src/adapters/projection'
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
  files: Map<string, string>
  execs: Array<RecordedExec>
  existing: Set<string>
}

/** Build a fake handle that records writes/execs and tracks existing paths. */
function makeFakeHandle(
  execResult: ExecResult,
  initialFiles: Record<string, string> = {},
): FakeHandle {
  const files = new Map<string, string>(Object.entries(initialFiles))
  const execs: Array<RecordedExec> = []
  const existing = new Set(Object.keys(initialFiles))

  const handle = {
    fs: {
      write: (path: string, data: string | Uint8Array) => {
        files.set(path, typeof data === 'string' ? data : '')
        existing.add(path)
        return Promise.resolve()
      },
      read: (path: string) => {
        const content = files.get(path)
        if (content === undefined) {
          return Promise.reject(new Error(`ENOENT: ${path}`))
        }
        return Promise.resolve(content)
      },
      exists: (path: string) => Promise.resolve(existing.has(path)),
      mkdir: () => Promise.resolve(),
    },
    process: {
      exec: (command: string, options?: { cwd?: string }) => {
        execs.push({ command, cwd: options?.cwd })
        return Promise.resolve(execResult)
      },
    },
  } as unknown as SandboxHandle

  return { handle, files, execs, existing }
}

const ROOT = '/workspace'
const MARKER = `${ROOT}/.tanstack-projected-abc123`
const CONFIG = `${ROOT}/.grok/config.toml`

const BRIDGE_CONFIG = `[mcp_servers.tanstack]
url = "http://host.docker.internal:3001/_bridge"
enabled = true

[mcp_servers.tanstack.headers]
Authorization = "Bearer stale-bridge-token"
`

describe('renderGrokMcpToml', () => {
  it('writes grok project-scope MCP config with bearer header', () => {
    const toml = renderGrokMcpToml({
      name: 'tanstack',
      url: 'http://host.docker.internal:3001/_bridge',
      token: 'secret-token',
      close: async () => {},
    })
    expect(toml).toContain('[mcp_servers.tanstack]')
    expect(toml).toContain('url = "http://host.docker.internal:3001/_bridge"')
    expect(toml).toContain('Authorization = "Bearer secret-token"')
  })
})

describe('projectGrokWorkspace', () => {
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

  it('writes grok TOML with the secret resolved, links the gitSkill, warns for plugin/agentSkill, writes the marker', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fake = makeFakeHandle({ stdout: '', stderr: '', exitCode: 0 })
    const { projection, gitDir } = buildScenario()

    await projectGrokWorkspace(fake.handle, projection)

    const toml = fake.files.get(CONFIG)
    expect(toml).toBeDefined()
    expect(toml).toContain('[mcp_servers.issues]')
    expect(toml).toContain('url = "https://mcp.example.com/mcp"')
    expect(toml).toContain('Authorization = "super-secret"')
    expect(toml).not.toContain('__secretName')

    const target = `${ROOT}/.grok/skills/my-skill`
    const linkExec = fake.execs.find(
      (e) => e.command.includes('ln -s') && e.command.includes(target),
    )
    expect(linkExec).toBeDefined()
    expect(linkExec?.command).toContain(gitDir)

    expect(fake.execs.some((e) => e.command.includes('plugin install'))).toBe(
      false,
    )

    expect(warn).toHaveBeenCalled()

    expect(fake.files.has(MARKER)).toBe(true)

    warn.mockRestore()
  })

  it('merges workspace MCP tables into an existing bridge config instead of wiping it', async () => {
    const fake = makeFakeHandle(
      { stdout: '', stderr: '', exitCode: 0 },
      { [CONFIG]: BRIDGE_CONFIG },
    )
    const projection: WorkspaceProjection = {
      skills: [
        mcpSkill('issues', {
          url: 'https://mcp.example.com/mcp',
          headers: { Authorization: 'resolved-token' },
        }),
      ],
      plugins: [],
      resolveSecret: () => {
        throw new Error('resolveSecret should not be called for plain headers')
      },
      markerPath: MARKER,
      root: ROOT,
    }

    await projectGrokWorkspace(fake.handle, projection)

    const toml = fake.files.get(CONFIG)
    expect(toml).toContain('[mcp_servers.tanstack]')
    expect(toml).toContain('Bearer stale-bridge-token')
    expect(toml).toContain('[mcp_servers.issues]')
    expect(toml).toContain('url = "https://mcp.example.com/mcp"')
    expect(toml).toContain('Authorization = "resolved-token"')
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

    await projectGrokWorkspace(fake.handle, projection)

    const toml = fake.files.get(CONFIG)
    expect(toml).toContain('X-Plain = "literal-value"')
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

    await projectGrokWorkspace(fake.handle, projection)

    const toml = fake.files.get(CONFIG)
    expect(toml).toContain('Authorization = "Bearer lin-token"')
    expect(toml).not.toContain('__secretName')
    expect(toml).not.toContain('__bearerRef')
  })

  it('rewrites the TOML on a second call but does not re-run gitSkill links', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const fake = makeFakeHandle({ stdout: '', stderr: '', exitCode: 0 })
    const { projection } = buildScenario()

    await projectGrokWorkspace(fake.handle, projection)
    const execsAfterFirst = fake.execs.length
    expect(fake.files.get(CONFIG)).toContain('super-secret')

    fake.files.delete(CONFIG)

    await projectGrokWorkspace(fake.handle, projection)

    const rewritten = fake.files.get(CONFIG)
    expect(rewritten).toBeDefined()
    expect(rewritten).toContain('super-secret')

    expect(fake.execs.length).toBe(execsAfterFirst)

    warn.mockRestore()
  })
})