/**
 * `chatStreamAcp` never journals (only `chatStreamNdjson` does — see
 * `attach.test.ts`'s header comment). A durable sandbox run must therefore
 * pick the journaled path when the app does not set `protocol`.
 *
 * Acceptance for issue #1081 item 5: `grokBuildText(model)` with durability
 * wired and no `protocol` / `extraArgs` journals. An explicit
 * `protocol: 'acp'` can still be a warn (fresh) or a throw (ATTACH).
 *
 * The ACP cases drive `chatStreamAcp` for real — a fake ACP agent (the actual
 * `@agentclientprotocol/sdk` agent side) spawned over stdio inside a real
 * `localProcessSandbox`, exactly like `packages/ai-acp/tests/compatible.test.ts`
 * — because the warn check sits inline in `chatStreamAcp`'s setup, ahead of
 * spawning the connection.
 */
import { afterAll, describe, expect, it, vi } from 'vitest'
import * as fsp from 'node:fs/promises'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'
import {
  SandboxCapability,
  SandboxDurabilityCapability,
  journalPaths,
} from '@tanstack/ai-sandbox'
import { InMemoryRunStore } from '@tanstack/ai'
import { grokBuildText } from '../src/index'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type {
  CapabilityContext,
  StreamChunk,
  StreamDurability,
} from '@tanstack/ai'
import type { SandboxHandle, SandboxRunDurability } from '@tanstack/ai-sandbox'

/**
 * Locate the real `@agentclientprotocol/sdk` install through `@tanstack/ai-acp`'s
 * own `node_modules` rather than resolving it directly: `ai-grok-build` does not
 * (and should not) depend on the ACP SDK itself, only on `@tanstack/ai-acp`,
 * which does. `require.resolve` can't cross that boundary because the SDK isn't
 * declared in this package's own dependency graph under pnpm's strict
 * resolution, so this walks the filesystem instead of module resolution.
 */
function resolveAcpSdkEntryUrl(): string {
  const testDir = path.dirname(fileURLToPath(import.meta.url))
  const sdkDir = fs.realpathSync(
    path.join(
      testDir,
      '..',
      'node_modules',
      '@tanstack',
      'ai-acp',
      'node_modules',
      '@agentclientprotocol',
      'sdk',
    ),
  )
  const pkg = JSON.parse(
    fs.readFileSync(path.join(sdkDir, 'package.json'), 'utf8'),
  ) as { exports?: { '.'?: { import?: string } }; main?: string }
  const entry = pkg.exports?.['.']?.import ?? pkg.main
  if (entry === undefined) {
    throw new Error('could not resolve @agentclientprotocol/sdk entry point')
  }
  return pathToFileURL(path.join(sdkDir, entry)).href
}

const SDK_URL = resolveAcpSdkEntryUrl()

/** A minimal native `streaming-json` harness, as `chatStreamNdjson` expects on stdout. */
const NDJSON_FAKE_GROK = [
  `const w = (s) => process.stdout.write(s + '\\n')`,
  `w('{"type":"text","data":"pong"}')`,
  `w('{"type":"end","stopReason":"EndTurn","sessionId":"sess-1"}')`,
].join('\n')

/** A minimal ACP agent that replies "pong" and reports the SDK's protocol version. */
const FAKE_GROK_ACP_AGENT = `
import { AgentSideConnection, ndJsonStream, PROTOCOL_VERSION } from ${JSON.stringify(SDK_URL)}
import { Readable, Writable } from 'node:stream'

const input = Readable.toWeb(process.stdin)
const output = Writable.toWeb(process.stdout)
const stream = ndJsonStream(output, input)

new AgentSideConnection((conn) => ({
  async initialize() {
    return {
      protocolVersion: PROTOCOL_VERSION,
      agentCapabilities: { loadSession: true },
      authMethods: [
        { id: 'xai.api_key', name: 'xai.api_key', description: null },
        { id: 'grok.com', name: 'grok.com', description: null },
      ],
    }
  },
  async authenticate() {
    return {}
  },
  async newSession() {
    return { sessionId: 'sess-1' }
  },
  async loadSession() {
    return {}
  },
  async prompt(params) {
    await conn.sessionUpdate({
      sessionId: params.sessionId,
      update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'pong' } },
    })
    return { stopReason: 'end_turn' }
  },
  async cancel() {},
}), stream)
`

const baseDir = path.join(
  os.tmpdir(),
  `tanstack-ai-grok-build-durability-warn-${Date.now()}`,
)
// No removeOnDestroy: destroying a sandbox right after killing its agent races
// the OS releasing the dir (EBUSY on Windows) — see compatible.test.ts.
const provider = localProcessSandbox({ baseDir })

afterAll(async () => {
  const sbx = await provider.create({})
  await sbx.process.exec(`rm -rf '${JOURNAL_DIR}'`)
  await sbx.destroy()
  await fsp.rm(baseDir, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  })
})

function noopLogger(): InternalLogger & { warn: ReturnType<typeof vi.fn> } {
  return {
    request: () => {},
    provider: () => {},
    errors: () => {},
    agentLoop: () => {},
    warnings: () => {},
    debug: () => {},
    warn: vi.fn(),
  } as unknown as InternalLogger & { warn: ReturnType<typeof vi.fn> }
}

/** A `StreamDurability` whose methods are never expected to be exercised on the ACP path. */
function fakeAdapterLog(): StreamDurability {
  return {
    resumeFrom: () => null,
    append: (chunks) => Promise.resolve(chunks.map((_, i) => `o:${i}`)),
    read: () => (async function* empty() {})(),
    close: () => Promise.resolve(),
    snapshot: () => Promise.resolve([]),
  }
}

/**
 * A journal directory scoped to this file's run. Real (not `/tmp/unused`),
 * because the `streaming-json` case below actually journals through it — see
 * `attach.test.ts` for why `/tmp/...` and not the sandbox's own dir.
 */
const JOURNAL_DIR = `/tmp/tanstack-grok-durability-warn-${Date.now()}`

function durability(attach = false): SandboxRunDurability {
  return {
    runs: new InMemoryRunStore(),
    adapter: fakeAdapterLog(),
    journalDir: JOURNAL_DIR,
    attach,
    detachOnDisconnect: true,
  }
}

function contextWith(
  handle: SandboxHandle,
  durabilityCapability?: SandboxRunDurability,
): CapabilityContext {
  const [, provideSandbox] = SandboxCapability
  const [, provideSandboxDurability] = SandboxDurabilityCapability
  const ctx = {
    capabilities: { markProvided: () => {}, has: () => true },
  } as unknown as CapabilityContext
  provideSandbox(ctx, handle)
  if (durabilityCapability) provideSandboxDurability(ctx, durabilityCapability)
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

function adapter() {
  // Explicit ACP: an app that chooses ACP on purpose, even with durability.
  return grokBuildText('grok-build', {
    grokExecutable: 'node fake-grok-acp-agent.mjs',
    protocol: 'acp',
    emitDiff: false,
  })
}

function defaultProtocolAdapter(exe: string) {
  // No `protocol` set: the public `grokBuildText(model)` default.
  return grokBuildText('grok-build', {
    grokExecutable: exe,
    emitDiff: false,
  })
}

const SANDBOX_TEST_TIMEOUT = 60_000

describe(
  'grok-build durability + ACP protocol misconfiguration warning',
  { timeout: SANDBOX_TEST_TIMEOUT },
  () => {
    it('journals a durable run when protocol is left unset', async () => {
      const sbx = await provider.create({})
      await sbx.fs.write('/workspace/fake-grok-ndjson.mjs', NDJSON_FAKE_GROK)
      const logger = noopLogger()
      const runId = 'r-default-protocol-journals'

      const chunks = await collect(
        defaultProtocolAdapter('node fake-grok-ndjson.mjs').chatStream({
          model: 'grok-build',
          runId,
          messages: [{ role: 'user', content: 'say pong' }],
          logger,
          capabilities: contextWith(sbx, durability()),
        }),
      )

      expect(textOf(chunks)).toBe('pong')
      expect(chunks.some((c) => c.type === 'RUN_FINISHED')).toBe(true)
      expect(logger.warn).not.toHaveBeenCalled()

      // Journal file is deleted after the exit sentinel. The directory it
      // created is the surviving proof that spawnNdjson journaled this run.
      const paths = journalPaths(runId, JOURNAL_DIR)
      const dirExists = await sbx.process.exec(`test -d '${paths.dir}'`)
      expect(dirExists.exitCode).toBe(0)

      await sbx.destroy()
    })

    it('warns exactly once, naming the consequence and the fix, when durability is configured on an explicit ACP protocol', async () => {
      const sbx = await provider.create({})
      await sbx.fs.write(
        '/workspace/fake-grok-acp-agent.mjs',
        FAKE_GROK_ACP_AGENT,
      )
      const logger = noopLogger()

      const chunks = await collect(
        adapter().chatStream({
          model: 'grok-build',
          messages: [{ role: 'user', content: 'say pong' }],
          logger,
          capabilities: contextWith(sbx, durability()),
        }),
      )

      // The warn does not alter the ACP path's emitted chunk sequence.
      expect(chunks[0]).toMatchObject({ type: 'RUN_STARTED' })
      expect(textOf(chunks)).toBe('pong')
      expect(chunks.some((c) => c.type === 'RUN_FINISHED')).toBe(true)

      expect(logger.warn).toHaveBeenCalledTimes(1)
      const [message] = logger.warn.mock.calls[0] as [string]
      expect(message).toMatch(/not be recoverable/i)
      expect(message).toContain("protocol: 'streaming-json'")

      await sbx.destroy()
    })

    it('REFUSES an attach outright, instead of warning and re-running the agent', async () => {
      const sbx = await provider.create({})
      await sbx.fs.write(
        '/workspace/fake-grok-acp-agent.mjs',
        FAKE_GROK_ACP_AGENT,
      )
      const logger = noopLogger()

      const chunks = await collect(
        adapter().chatStream({
          model: 'grok-build',
          messages: [{ role: 'user', content: 'say pong' }],
          logger,
          capabilities: contextWith(sbx, durability(true)),
        }),
      )

      // The adapter's `catch` turns any throw into a RUN_ERROR chunk, so assert
      // on that rather than on a rejection (same convention as
      // `attach.test.ts`'s `DurableRunIdRequiredError` case).
      expect(chunks).toHaveLength(1)
      const error = chunks[0] as { type: string; message?: string }
      expect(error.type).toBe('RUN_ERROR')
      expect(error.message).toContain('cannot ATTACH')

      // The refusal must state the CONSEQUENCE, not just the condition — this is
      // the difference between a message an operator can act on and one they
      // route to a retry. It names the two corruptions proceeding would cause...
      expect(error.message).toMatch(/re-run the agent from scratch/i)
      expect(error.message).toMatch(/double-append/i)
      // ...and rules out the retry explicitly, because the neighbouring
      // `JournalAttachUnavailableError` IS retryable and would otherwise be the
      // natural assumption.
      expect(error.message).toMatch(/not a transient condition/i)

      // THE POINT OF THE THROW: the agent never ran. `pong` is the fake agent's
      // only output, so its absence proves `session.prompt(...)` was never
      // reached — the workspace the previous attempt mutated was not re-driven,
      // and nothing was appended to the log.
      expect(textOf(chunks)).toBe('')
      expect(chunks.some((c) => c.type === 'RUN_STARTED')).toBe(false)

      // And it is a REFUSAL, not the warn escalated: warning here would have
      // meant the run proceeded.
      expect(logger.warn).not.toHaveBeenCalled()

      await sbx.destroy()
    })

    it('does NOT warn when durability is configured with protocol: streaming-json', async () => {
      const sbx = await provider.create({})
      await sbx.fs.write('/workspace/fake-grok-ndjson.mjs', NDJSON_FAKE_GROK)
      const logger = noopLogger()

      const journalingAdapter = grokBuildText('grok-build', {
        grokExecutable: 'node fake-grok-ndjson.mjs',
        protocol: 'streaming-json',
        emitDiff: false,
      })

      const chunks = await collect(
        journalingAdapter.chatStream({
          model: 'grok-build',
          // The journaling (`chatStreamNdjson`) path requires a caller-supplied
          // `runId` once durability is wired — `resolveDurableRunId` throws
          // `DurableRunIdRequiredError` otherwise (see `attach.test.ts`). That
          // is a different, already-covered diagnostic; supply one here so
          // this test isolates the warning behavior under test.
          runId: 'r-streaming-json-warn-check',
          messages: [{ role: 'user', content: 'say pong' }],
          logger,
          capabilities: contextWith(sbx, durability()),
        }),
      )

      // This IS the journaled path, so confirm the run actually completed
      // rather than the absence of a warning being a side effect of an
      // early failure.
      expect(textOf(chunks)).toBe('pong')
      expect(chunks.some((c) => c.type === 'RUN_FINISHED')).toBe(true)
      expect(logger.warn).not.toHaveBeenCalled()

      await sbx.destroy()
    })

    it('does NOT warn on the common default: no durability wired, ACP protocol', async () => {
      const sbx = await provider.create({})
      await sbx.fs.write(
        '/workspace/fake-grok-acp-agent.mjs',
        FAKE_GROK_ACP_AGENT,
      )
      const logger = noopLogger()

      const chunks = await collect(
        adapter().chatStream({
          model: 'grok-build',
          messages: [{ role: 'user', content: 'say pong' }],
          logger,
          capabilities: contextWith(sbx),
        }),
      )

      expect(textOf(chunks)).toBe('pong')
      expect(logger.warn).not.toHaveBeenCalled()

      await sbx.destroy()
    })
  },
)
