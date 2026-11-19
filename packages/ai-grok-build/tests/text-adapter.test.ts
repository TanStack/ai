/**
 * Basic deterministic tests for the Grok Build in-sandbox adapter.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'
import {
  SandboxCapability,
  SandboxPolicyCapability,
  defineSandboxPolicy,
} from '@tanstack/ai-sandbox'
import { CapabilityRegistry } from '@tanstack/ai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { grokBuildText } from '../src/index'
import { GROK_BUILD_MODELS, resolveGrokCliModel } from '../src/model-meta'
import type { GrokBuildTextConfig } from '../src/index'
import type { AdapterYieldChunk, CapabilityContext } from '@tanstack/ai'
import type { SandboxHandle, SandboxPolicy } from '@tanstack/ai-sandbox'

// `authMode: 'host'` reads the host login from `homedir()`.
const hostHome = vi.hoisted(() => ({ dir: '' }))
vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof os>()),
  homedir: () => hostHome.dir,
}))

const baseDir = path.join(
  os.tmpdir(),
  `tanstack-ai-grok-build-test-${Date.now()}`,
)
const provider = localProcessSandbox({ baseDir, removeOnDestroy: true })

const HOST_LOGIN = '{"token":"host"}'

beforeAll(async () => {
  hostHome.dir = path.join(baseDir, 'host-home')
  await fsp.mkdir(path.join(hostHome.dir, '.grok'), { recursive: true })
  await fsp.writeFile(path.join(hostHome.dir, '.grok', 'auth.json'), HOST_LOGIN)
})

afterAll(async () => {
  await fsp.rm(baseDir, { recursive: true, force: true })
})

const LEGACY_FAKE_GROK = [
  `import { writeFileSync } from 'node:fs'`,
  `writeFileSync('grok-argv.txt', process.argv.join(' '))`,
  `const w = (o) => process.stdout.write(JSON.stringify(o) + '\\n')`,
  `w({ type: 'thread.started', thread_id: 'th-1' })`,
  `w({ type: 'turn.started' })`,
  `w({ type: 'item.completed', item: { id: 'i1', type: 'agent_message', text: 'pong' } })`,
  `w({ type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } })`,
].join('\n')

const NATIVE_FAKE_GROK = [
  `import { writeFileSync } from 'node:fs'`,
  `writeFileSync('grok-argv.txt', process.argv.join(' '))`,
  `const w = (o) => process.stdout.write(JSON.stringify(o) + '\\n')`,
  `w({ type: 'text', data: 'pong' })`,
  `w({ type: 'end', stopReason: 'EndTurn', sessionId: 'sess-1' })`,
].join('\n')

/**
 * A small ACP agent for `grok agent ... stdio`. It answers each request and
 * writes what it saw to `grok-run.json`. With FAKE_PROMPT_ERROR set, the
 * prompt fails.
 */
const ACP_FAKE_GROK = [
  `import { writeFileSync } from 'node:fs'`,
  `import { createInterface } from 'node:readline'`,
  `const run = { XAI_API_KEY: process.env.XAI_API_KEY ?? null, GROK_API_KEY: process.env.GROK_API_KEY ?? null, methods: [] }`,
  `const results = {`,
  `  initialize: { protocolVersion: 1, agentCapabilities: {}, authMethods: [{ id: 'xai.api_key', name: 'xAI API key' }] },`,
  `  'session/new': { sessionId: 'sess-1' },`,
  `  'session/prompt': { stopReason: 'end_turn' },`,
  `}`,
  `createInterface({ input: process.stdin }).on('line', (line) => {`,
  `  const message = JSON.parse(line)`,
  `  if (message.id === undefined) return`,
  `  run.methods.push(message.method)`,
  `  writeFileSync('grok-run.json', JSON.stringify(run))`,
  `  const fail = message.method === 'session/prompt' && process.env.FAKE_PROMPT_ERROR`,
  `  const reply = fail`,
  `    ? { error: { code: -32603, message: 'Internal error', data: 'prompt failed' } }`,
  `    : { result: results[message.method] ?? {} }`,
  `  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: message.id, ...reply }) + '\\n')`,
  `})`,
].join('\n')

const noopLogger = resolveDebugOption(false)

function capabilityContextWith(
  handle: SandboxHandle,
  policy?: SandboxPolicy,
): CapabilityContext {
  const [, provideSandbox] = SandboxCapability
  const [, provideSandboxPolicy] = SandboxPolicyCapability
  const ctx = { capabilities: new CapabilityRegistry() }
  provideSandbox(ctx, handle)
  if (policy) provideSandboxPolicy(ctx, policy)
  return ctx
}

async function collect(
  stream: AsyncIterable<AdapterYieldChunk>,
): Promise<Array<AdapterYieldChunk>> {
  const out: Array<AdapterYieldChunk> = []
  for await (const chunk of stream) out.push(chunk)
  return out
}

function textOf(chunks: Array<AdapterYieldChunk>) {
  return chunks
    .map((c) => (c.type === 'TEXT_MESSAGE_CONTENT' ? c.delta : ''))
    .join('')
}

describe('resolveGrokCliModel', () => {
  it('maps grok-build alias to grok-build-0.1 for XAI_API_KEY auth', () => {
    expect(resolveGrokCliModel('grok-build-0.1')).toBe('grok-build-0.1')
    expect(resolveGrokCliModel('grok-build')).toBe('grok-build-0.1')
  })

  it('passes composer-2.5 through unchanged', () => {
    expect(GROK_BUILD_MODELS).toContain('composer-2.5')
    expect(resolveGrokCliModel('composer-2.5')).toBe('composer-2.5')
  })
})

describe('grok-build in-sandbox adapter', () => {
  it('spawns the harness and streams legacy translated events', async () => {
    const sbx = await provider.create({})
    await sbx.fs.write('/workspace/fake-grok.mjs', LEGACY_FAKE_GROK)

    const adapter = grokBuildText('grok-build-0.1', {
      grokExecutable: 'node fake-grok.mjs',
      protocol: 'streaming-json',
    })

    const chunks = await collect(
      adapter.chatStream({
        threadId: 'thread-1',
        model: 'grok-build-0.1',
        messages: [{ role: 'user', content: 'say pong' }],
        logger: noopLogger,
        capabilities: capabilityContextWith(sbx),
      }),
    )

    expect(chunks[0]?.type).toBe('RUN_STARTED')
    expect(textOf(chunks)).toContain('pong')
    expect(chunks.some((c) => c.type === 'RUN_FINISHED')).toBe(true)

    const argv = await sbx.fs.read('/workspace/grok-argv.txt')
    expect(argv).toContain('--model')
    expect(argv).toContain('grok-build-0.1')
    expect(argv).not.toContain('--mcp-config')
    expect(argv).toContain('--always-approve')
    expect(argv).toContain('--no-plan')
    expect(argv).toContain('--no-auto-update')
    expect(argv).toContain('--cwd')
    // local-process: harness cwd must be the real host dir, not virtual /workspace.
    expect(argv).toContain(sbx.id)
    expect(argv).not.toContain('/workspace')

    await sbx.destroy()
  })

  it('omits --always-approve when sandbox policy is read-only', async () => {
    const sbx = await provider.create({})
    await sbx.fs.write('/workspace/fake-grok.mjs', LEGACY_FAKE_GROK)

    const adapter = grokBuildText('grok-build-0.1', {
      grokExecutable: 'node fake-grok.mjs',
      protocol: 'streaming-json',
    })

    await collect(
      adapter.chatStream({
        threadId: 'thread-1',
        model: 'grok-build-0.1',
        messages: [{ role: 'user', content: 'say pong' }],
        logger: noopLogger,
        capabilities: capabilityContextWith(
          sbx,
          defineSandboxPolicy({ capabilities: { fileWrite: 'deny' } }),
        ),
      }),
    )

    const argv = await sbx.fs.read('/workspace/grok-argv.txt')
    expect(argv).not.toContain('--always-approve')
    expect(argv).toContain('--sandbox')
    expect(argv).toContain('read-only')
    expect(argv).toContain('--permission-mode')
    expect(argv).toContain('default')

    await sbx.destroy()
  })

  it('streams native grok streaming-json events', async () => {
    const sbx = await provider.create({})
    await sbx.fs.write('/workspace/fake-grok.mjs', NATIVE_FAKE_GROK)

    const adapter = grokBuildText('grok-build', {
      grokExecutable: 'node fake-grok.mjs',
      protocol: 'streaming-json',
    })

    const chunks = await collect(
      adapter.chatStream({
        threadId: 'thread-1',
        model: 'grok-build',
        messages: [{ role: 'user', content: 'say pong' }],
        logger: noopLogger,
        capabilities: capabilityContextWith(sbx),
      }),
    )

    expect(textOf(chunks)).toBe('pong')
    expect(chunks.some((c) => c.type === 'RUN_FINISHED')).toBe(true)
    await sbx.destroy()
  })
})

const SANDBOX_LOGIN = '/home/user/.grok/auth.json'

/**
 * A sandbox that is not local-process. Its files live in memory, and `grok`
 * runs through the local-process sandbox. `seen.loginAtSpawn` is the sandbox
 * login file when grok started.
 */
function remoteSandbox(
  local: SandboxHandle,
  options?: { remove?: SandboxHandle['fs']['remove'] },
) {
  const files = new Map<string, string>()
  const seen: { loginAtSpawn?: string } = {}
  const sandbox: SandboxHandle = {
    ...local,
    provider: 'docker',
    fs: {
      ...local.fs,
      mkdir: () => Promise.resolve(),
      write: (p, data) => {
        files.set(p, typeof data === 'string' ? data : '')
        return Promise.resolve()
      },
      read: (p) => Promise.resolve(files.get(p) ?? ''),
      remove:
        options?.remove ??
        ((p) => {
          files.delete(p)
          return Promise.resolve()
        }),
    },
    process: {
      ...local.process,
      exec: () =>
        Promise.resolve({ stdout: '/home/user', stderr: '', exitCode: 0 }),
      spawn: (command, spawnOptions) => {
        seen.loginAtSpawn = files.get(SANDBOX_LOGIN)
        return local.process.spawn(command, spawnOptions)
      },
    },
    destroy: () => local.destroy(),
  }
  return { sandbox, files, seen }
}

/** Runs one ACP chat turn against ACP_FAKE_GROK in `local`. */
async function runAcp(
  local: SandboxHandle,
  config: GrokBuildTextConfig,
  sandbox: SandboxHandle = local,
) {
  await local.fs.write('/workspace/fake-grok.mjs', ACP_FAKE_GROK)
  const adapter = grokBuildText('grok-build-0.1', {
    grokExecutable: 'node fake-grok.mjs',
    protocol: 'acp',
    transport: 'stdio',
    emitDiff: false,
    ...config,
  })
  const chunks = await collect(
    adapter.chatStream({
      threadId: 'thread-1',
      model: 'grok-build-0.1',
      messages: [{ role: 'user', content: 'say pong' }],
      logger: noopLogger,
      capabilities: capabilityContextWith(sandbox),
    }),
  )
  const run: unknown = JSON.parse(
    await local.fs.read('/workspace/grok-run.json'),
  )
  return { chunks, run }
}

const KEY_ENV = { XAI_API_KEY: 'sk-config', GROK_API_KEY: 'gk-config' }
const FAIL_ENV = { FAKE_PROMPT_ERROR: '1' }

describe('grok-build authMode', () => {
  it("'host' runs grok without the API key vars and skips authenticate", async () => {
    const local = await provider.create({})
    try {
      const { chunks, run } = await runAcp(local, {
        authMode: 'host',
        env: KEY_ENV,
      })
      expect(chunks.find((c) => c.type === 'RUN_ERROR')).toBeUndefined()
      expect(run).toEqual({
        XAI_API_KEY: null,
        GROK_API_KEY: null,
        methods: ['initialize', 'session/new', 'session/prompt'],
      })
    } finally {
      await local.destroy()
    }
  })

  it("'api-key' (default) keeps the key vars and authenticates", async () => {
    const local = await provider.create({})
    try {
      const { chunks, run } = await runAcp(local, { env: KEY_ENV })
      expect(chunks.find((c) => c.type === 'RUN_ERROR')).toBeUndefined()
      expect(run).toEqual({
        XAI_API_KEY: 'sk-config',
        GROK_API_KEY: 'gk-config',
        methods: [
          'initialize',
          'authenticate',
          'session/new',
          'session/prompt',
        ],
      })
    } finally {
      await local.destroy()
    }
  })

  it("'host' on a non-local sandbox copies the host login in and removes it after the run", async () => {
    const local = await provider.create({})
    try {
      const { sandbox, files, seen } = remoteSandbox(local)
      const { chunks } = await runAcp(local, { authMode: 'host' }, sandbox)
      expect(chunks.find((c) => c.type === 'RUN_ERROR')).toBeUndefined()
      expect(seen.loginAtSpawn).toBe(HOST_LOGIN)
      expect(files.has(SANDBOX_LOGIN)).toBe(false)
    } finally {
      await local.destroy()
    }
  })

  it("'host' removes the sandbox login when the run fails", async () => {
    const local = await provider.create({})
    try {
      const { sandbox, files, seen } = remoteSandbox(local)
      const { chunks } = await runAcp(
        local,
        { authMode: 'host', env: FAIL_ENV },
        sandbox,
      )
      expect(chunks.find((c) => c.type === 'RUN_ERROR')).toMatchObject({
        message: 'prompt failed',
      })
      expect(seen.loginAtSpawn).toBe(HOST_LOGIN)
      expect(files.has(SANDBOX_LOGIN)).toBe(false)
    } finally {
      await local.destroy()
    }
  })

  it('a release error after a failed run keeps the run error', async () => {
    const local = await provider.create({})
    try {
      const { sandbox } = remoteSandbox(local, {
        remove: () => Promise.reject(new Error('remove failed')),
      })
      const { chunks } = await runAcp(
        local,
        { authMode: 'host', env: FAIL_ENV },
        sandbox,
      )
      expect(chunks.find((c) => c.type === 'RUN_ERROR')).toMatchObject({
        message: 'prompt failed',
      })
    } finally {
      await local.destroy()
    }
  })

  it('a release error after a good run is thrown', async () => {
    const local = await provider.create({})
    try {
      const { sandbox } = remoteSandbox(local, {
        remove: () => Promise.reject(new Error('remove failed')),
      })
      await expect(
        runAcp(local, { authMode: 'host' }, sandbox),
      ).rejects.toThrow('remove failed')
    } finally {
      await local.destroy()
    }
  })
})

/** A `grok -p` fake for `'streaming-json'` that writes the key vars it saw. */
const NDJSON_KEYS_FAKE_GROK = [
  `import { writeFileSync } from 'node:fs'`,
  `writeFileSync('grok-run.json', JSON.stringify({ XAI_API_KEY: process.env.XAI_API_KEY ?? null, GROK_API_KEY: process.env.GROK_API_KEY ?? null }))`,
  `const w = (o) => process.stdout.write(JSON.stringify(o) + '\\n')`,
  `w({ type: 'text', data: 'pong' })`,
  `w({ type: 'end', stopReason: 'EndTurn', sessionId: 'sess-1' })`,
].join('\n')

/** Runs one `'streaming-json'` chat turn against NDJSON_KEYS_FAKE_GROK. */
async function runNdjson(
  local: SandboxHandle,
  config: GrokBuildTextConfig,
  sandbox: SandboxHandle = local,
) {
  await local.fs.write('/workspace/fake-grok.mjs', NDJSON_KEYS_FAKE_GROK)
  const adapter = grokBuildText('grok-build-0.1', {
    grokExecutable: 'node fake-grok.mjs',
    protocol: 'streaming-json',
    emitDiff: false,
    ...config,
  })
  const chunks = await collect(
    adapter.chatStream({
      threadId: 'thread-1',
      model: 'grok-build-0.1',
      messages: [{ role: 'user', content: 'say pong' }],
      logger: noopLogger,
      capabilities: capabilityContextWith(sandbox),
    }),
  )
  const run: unknown = JSON.parse(
    await local.fs.read('/workspace/grok-run.json'),
  )
  return { chunks, run }
}

describe("grok-build authMode on 'streaming-json'", () => {
  it("'host' runs grok without the API key vars", async () => {
    const local = await provider.create({})
    try {
      const { chunks, run } = await runNdjson(local, {
        authMode: 'host',
        env: KEY_ENV,
      })
      expect(textOf(chunks)).toBe('pong')
      expect(run).toEqual({ XAI_API_KEY: null, GROK_API_KEY: null })
    } finally {
      await local.destroy()
    }
  })

  it("'api-key' (default) keeps the key vars", async () => {
    const local = await provider.create({})
    try {
      const { run } = await runNdjson(local, { env: KEY_ENV })
      expect(run).toEqual({
        XAI_API_KEY: 'sk-config',
        GROK_API_KEY: 'gk-config',
      })
    } finally {
      await local.destroy()
    }
  })

  it("'host' on a non-local sandbox copies the host login in and removes it after the run", async () => {
    const local = await provider.create({})
    try {
      const { sandbox, files, seen } = remoteSandbox(local)
      const { chunks } = await runNdjson(local, { authMode: 'host' }, sandbox)
      expect(chunks.find((c) => c.type === 'RUN_ERROR')).toBeUndefined()
      expect(seen.loginAtSpawn).toBe(HOST_LOGIN)
      expect(files.has(SANDBOX_LOGIN)).toBe(false)
    } finally {
      await local.destroy()
    }
  })

  it('a release error after a good run is thrown', async () => {
    const local = await provider.create({})
    try {
      const { sandbox } = remoteSandbox(local, {
        remove: () => Promise.reject(new Error('remove failed')),
      })
      await expect(
        runNdjson(local, { authMode: 'host' }, sandbox),
      ).rejects.toThrow('remove failed')
    } finally {
      await local.destroy()
    }
  })
})
