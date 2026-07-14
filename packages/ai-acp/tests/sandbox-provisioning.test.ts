/**
 * End-to-end tests for sandbox CREATION / provisioning, observed through a fake
 * ACP agent running in a real local-process sandbox.
 *
 * `defineSandbox(...).ensure()` runs the real provider-agnostic bootstrap
 * (secrets → env, fileSkills + instructions → files, setup commands), so a
 * spawned harness genuinely sees the provisioned workspace. The fake agent
 * reports back what it observed; we assert on the translated stream.
 */
import { afterAll, describe, expect, it } from 'vitest'
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'
import {
  SandboxCapability,
  bearer,
  createSecrets,
  defineSandbox,
  defineWorkspace,
  fileSkill,
  gitSkill,
  mcpSkill,
  provideWorkspaceProjection,
} from '@tanstack/ai-sandbox'
import { acpCompatibleText } from '../src/index'
import {
  projectAcpWorkspace,
  workspaceMcpServers,
} from '../src/adapters/projection'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type { CapabilityContext, StreamChunk } from '@tanstack/ai'
import type {
  SandboxHandle,
  SecretRef,
  WorkspaceProjection,
} from '@tanstack/ai-sandbox'

const require = createRequire(import.meta.url)
const SDK_URL = pathToFileURL(require.resolve('@agentclientprotocol/sdk')).href

/** Reports the env/files it sees and records newSession params (mcpServers). */
const PROBE_AGENT = `
import { AgentSideConnection, ndJsonStream, PROTOCOL_VERSION } from ${JSON.stringify(SDK_URL)}
import { Readable, Writable } from 'node:stream'
import { writeFileSync, readFileSync } from 'node:fs'

const readSafe = (p) => { try { return readFileSync(p, 'utf8') } catch { return '' } }
const stream = ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin))

new AgentSideConnection((conn) => ({
  async initialize() {
    return { protocolVersion: PROTOCOL_VERSION, agentCapabilities: { loadSession: true }, authMethods: [] }
  },
  async newSession(params) {
    writeFileSync('acp-session.json', JSON.stringify(params))
    return { sessionId: 'sess-1' }
  },
  async loadSession() { return {} },
  async prompt(params) {
    const report = [
      'SECRET=' + (process.env.TEST_SECRET ?? ''),
      'STYLE=' + readSafe('STYLE.md'),
      'AGENTS=' + readSafe('AGENTS.md'),
      'SETUP=' + readSafe('setup-marker.txt'),
    ].join('\\n')
    await conn.sessionUpdate({
      sessionId: params.sessionId,
      update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: report } },
    })
    return { stopReason: 'end_turn' }
  },
  async cancel() {},
}), stream)
`

/** Requests permission for a dangerous tool and reports the chosen optionId. */
const PERMISSION_AGENT = `
import { AgentSideConnection, ndJsonStream, PROTOCOL_VERSION } from ${JSON.stringify(SDK_URL)}
import { Readable, Writable } from 'node:stream'

const stream = ndJsonStream(Writable.toWeb(process.stdout), Readable.toWeb(process.stdin))

new AgentSideConnection((conn) => ({
  async initialize() {
    return { protocolVersion: PROTOCOL_VERSION, agentCapabilities: { loadSession: true }, authMethods: [] }
  },
  async newSession() { return { sessionId: 'sess-1' } },
  async loadSession() { return {} },
  async prompt(params) {
    const res = await conn.requestPermission({
      sessionId: params.sessionId,
      toolCall: { toolCallId: 't1', title: 'rm -rf /', kind: 'execute', status: 'pending' },
      options: [
        { optionId: 'allow', name: 'Allow', kind: 'allow_once' },
        { optionId: 'reject', name: 'Reject', kind: 'reject_once' },
      ],
    })
    await conn.sessionUpdate({
      sessionId: params.sessionId,
      update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'OUTCOME=' + JSON.stringify(res.outcome) } },
    })
    return { stopReason: 'end_turn' }
  },
  async cancel() {},
}), stream)
`

const baseDir = path.join(os.tmpdir(), `tanstack-ai-acp-prov-${Date.now()}`)
// No removeOnDestroy: destroying a sandbox right after killing its agent races
// the OS releasing the dir (EBUSY on Windows). Clean the whole tree once at the
// end instead, with retries for any lingering handle.
const provider = localProcessSandbox({ baseDir, removeOnDestroy: false })

afterAll(async () => {
  await fsp.rm(baseDir, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  })
})

const noopLogger = {
  request: () => {},
  provider: () => {},
  errors: () => {},
  agentLoop: () => {},
  warnings: () => {},
  debug: () => {},
} as unknown as InternalLogger

function ctxWith(
  handle: SandboxHandle,
  projection?: WorkspaceProjection,
): CapabilityContext {
  const [, provideSandbox] = SandboxCapability
  const ctx = {
    capabilities: { markProvided: () => {}, has: () => true },
  } as unknown as CapabilityContext
  provideSandbox(ctx, handle)
  if (projection) provideWorkspaceProjection(ctx, projection)
  return ctx
}

async function collect(
  stream: AsyncIterable<StreamChunk>,
): Promise<Array<StreamChunk>> {
  const out: Array<StreamChunk> = []
  for await (const chunk of stream) out.push(chunk)
  return out
}

function textOf(chunks: Array<StreamChunk>): string {
  return chunks
    .filter((c) => c.type === 'TEXT_MESSAGE_CONTENT')
    .map((c) => (c as { delta?: string }).delta ?? '')
    .join('')
}

const probe = (skillsDir?: string) =>
  acpCompatibleText('probe', {
    name: 'probe',
    command: () => 'node probe-agent.mjs',
    ...(skillsDir !== undefined ? { skillsDir } : {}),
  })

describe('sandbox provisioning observed by a fake ACP agent', () => {
  it('injects secrets, writes file skills + instructions, and runs setup', async () => {
    const def = defineSandbox({
      id: 'prov-all',
      provider,
      workspace: defineWorkspace({
        source: { type: 'none' },
        secrets: createSecrets({ TEST_SECRET: 'sk-unique-123' }),
        instructions: 'Always be terse.',
        skills: [fileSkill({ path: 'STYLE.md', content: 'two-space indent' })],
        setup: ['echo ran > setup-marker.txt'],
      }),
    })
    const handle = await def.ensure({ threadId: 't1', runId: 'r1' })
    await handle.fs.write('/workspace/probe-agent.mjs', PROBE_AGENT)

    // Direct creation assertions (independent of the agent).
    expect(await handle.fs.read('/workspace/STYLE.md')).toBe('two-space indent')
    expect(await handle.fs.read('/workspace/AGENTS.md')).toContain('terse')
    const env = await handle.process.exec('printf %s "$TEST_SECRET"')
    expect(env.stdout).toContain('sk-unique-123')

    // The agent, spawned into the provisioned sandbox, sees all of it.
    const chunks = await collect(
      probe().chatStream({
        model: 'probe',
        messages: [{ role: 'user', content: 'report' }],
        logger: noopLogger,
        capabilities: ctxWith(handle),
      }),
    )
    const report = textOf(chunks)
    expect(report).toContain('SECRET=sk-unique-123')
    expect(report).toContain('STYLE=two-space indent')
    expect(report).toContain('AGENTS=Always be terse.')
    expect(report).toContain('SETUP=ran')

    await def.destroy({ threadId: 't1', runId: 'r1' })
  })
})

describe('permission modes (the acpCompatible guardrail surface)', () => {
  async function runPermission(opts: {
    permissionMode?: 'default' | 'acceptEdits' | 'bypassPermissions'
    permissions?: 'headless' | 'interactive'
  }): Promise<Array<StreamChunk>> {
    const sbx = await provider.create({})
    await sbx.fs.write('/workspace/perm-agent.mjs', PERMISSION_AGENT)
    const adapter = acpCompatibleText('probe', {
      name: 'probe',
      command: () => 'node perm-agent.mjs',
      ...(opts.permissionMode ? { permissionMode: opts.permissionMode } : {}),
      ...(opts.permissions ? { permissions: opts.permissions } : {}),
    })
    const chunks = await collect(
      adapter.chatStream({
        model: 'probe',
        messages: [{ role: 'user', content: 'go' }],
        logger: noopLogger,
        capabilities: ctxWith(sbx),
      }),
    )
    await sbx.destroy()
    return chunks
  }

  it('bypassPermissions auto-approves the tool', async () => {
    const report = textOf(
      await runPermission({ permissionMode: 'bypassPermissions' }),
    )
    expect(report).toContain('"optionId":"allow"')
  })

  it('default rejects a non-bridged tool', async () => {
    const report = textOf(await runPermission({ permissionMode: 'default' }))
    expect(report).toContain('"optionId":"reject"')
  })

  it('interactive emits an approval-requested event for ask prompts', async () => {
    const chunks = await runPermission({
      permissions: 'interactive',
      permissionMode: 'default',
    })
    const approval = chunks.find(
      (c) =>
        c.type === 'CUSTOM' &&
        (c as { value?: { approvalId?: string; title?: string } }).value
          ?.approvalId !== undefined,
    )
    expect(approval).toBeDefined()
    expect((approval as { value: { title: string } }).value.title).toContain(
      'rm -rf',
    )
  })
})

describe('workspace skill projection', () => {
  it('passes workspace MCP skills through ACP newSession (native, resolved)', async () => {
    const sbx = await provider.create({})
    await sbx.fs.write('/workspace/probe-agent.mjs', PROBE_AGENT)

    const projection: WorkspaceProjection = {
      skills: [
        mcpSkill('weather', {
          url: 'https://mcp.example/weather',
          headers: {
            Authorization: bearer({ __secretName: 'W' } as SecretRef),
          },
        }),
      ],
      plugins: [],
      resolveSecret: (ref) => (ref.__secretName === 'W' ? 'sk-weather' : ''),
      markerPath: '/workspace/.tanstack-projected',
      root: '/workspace',
    }

    await collect(
      probe().chatStream({
        model: 'probe',
        messages: [{ role: 'user', content: 'report' }],
        logger: noopLogger,
        capabilities: ctxWith(sbx, projection),
      }),
    )

    const session = JSON.parse(
      await sbx.fs.read('/workspace/acp-session.json'),
    ) as {
      mcpServers?: Array<{
        name: string
        headers?: Array<{ name: string; value: string }>
      }>
    }
    const weather = session.mcpServers?.find((s) => s.name === 'weather')
    expect(weather).toBeDefined()
    expect(weather?.headers).toContainEqual({
      name: 'Authorization',
      value: 'Bearer sk-weather',
    })
    await sbx.destroy()
  })

  it('links a gitSkill clone into the configured skillsDir', async () => {
    const sbx = await provider.create({})
    // Stand in for a cloned gitSkill repo (bootstrap normally clones it).
    await sbx.fs.write('/workspace/.tanstack-skills/my-skill/SKILL.md', 'hi')

    const projection: WorkspaceProjection = {
      skills: [
        gitSkill({
          repo: 'owner/my-skill',
          into: '/workspace/.tanstack-skills/my-skill',
        }),
      ],
      plugins: [],
      resolveSecret: () => '',
      markerPath: '/workspace/.tanstack-projected',
      root: '/workspace',
    }

    await projectAcpWorkspace(sbx, projection, {
      skillsDir: '.pi/skills',
      harnessName: 'pi',
    })

    expect(await sbx.fs.read('/workspace/.pi/skills/my-skill/SKILL.md')).toBe(
      'hi',
    )
    await sbx.destroy()
  })
})

describe('workspaceMcpServers', () => {
  it('resolves secret + bearer + plain headers', () => {
    const projection = {
      skills: [
        mcpSkill('s', {
          url: 'https://x',
          headers: {
            A: 'plain',
            B: bearer({ __secretName: 'TOK' } as SecretRef),
            C: { __secretName: 'KEY' } as SecretRef,
          },
        }),
      ],
      plugins: [],
      resolveSecret: (ref: SecretRef) =>
        ref.__secretName === 'TOK'
          ? 'tok'
          : ref.__secretName === 'KEY'
            ? 'key'
            : '',
      markerPath: '/m',
      root: '/workspace',
    } satisfies WorkspaceProjection
    const server = workspaceMcpServers(projection)[0]
    if (server === undefined) throw new Error('expected one MCP server')
    expect(server.url).toBe('https://x')
    expect(server.headers).toEqual([
      { name: 'A', value: 'plain' },
      { name: 'B', value: 'Bearer tok' },
      { name: 'C', value: 'key' },
    ])
  })
})
