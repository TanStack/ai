/**
 * End-to-end tests for the generic `acpCompatible` harness adapter.
 *
 * A fake ACP agent (the real `@agentclientprotocol/sdk` agent side, imported by
 * absolute path so it resolves from the sandbox's temp cwd) is spawned inside a
 * real local-process sandbox over stdio, exercising the full path: spawn → ACP
 * `initialize`/`newSession`/`prompt` → `session/update` → AG-UI translation.
 */
import { afterAll, describe, expect, it } from 'vitest'
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'
import { SandboxCapability } from '@tanstack/ai-sandbox'
import {
  acpCompatible,
  acpCompatibleText,
  buildAcpPrompt,
} from '../src/index'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type { CapabilityContext, ModelMessage, StreamChunk } from '@tanstack/ai'
import type { SandboxHandle } from '@tanstack/ai-sandbox'

const require = createRequire(import.meta.url)
const SDK_URL = pathToFileURL(
  require.resolve('@agentclientprotocol/sdk'),
).href

/** A minimal ACP agent that replies "pong" and records the prompt it received. */
const FAKE_ACP_AGENT = `
import { AgentSideConnection, ndJsonStream, PROTOCOL_VERSION } from ${JSON.stringify(SDK_URL)}
import { Readable, Writable } from 'node:stream'
import { writeFileSync } from 'node:fs'

const input = Readable.toWeb(process.stdin)
const output = Writable.toWeb(process.stdout)
const stream = ndJsonStream(output, input)

new AgentSideConnection((conn) => ({
  async initialize() {
    return { protocolVersion: PROTOCOL_VERSION, agentCapabilities: { loadSession: true }, authMethods: [] }
  },
  async newSession() {
    return { sessionId: 'sess-1' }
  },
  async loadSession() {
    return {}
  },
  async prompt(params) {
    writeFileSync('acp-prompt.txt', JSON.stringify(params))
    await conn.sessionUpdate({
      sessionId: params.sessionId,
      update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'pong' } },
    })
    return { stopReason: 'end_turn' }
  },
  async cancel() {},
}), stream)
`

const baseDir = path.join(os.tmpdir(), `tanstack-ai-acp-test-${Date.now()}`)
const provider = localProcessSandbox({ baseDir, removeOnDestroy: true })

afterAll(async () => {
  await fsp.rm(baseDir, { recursive: true, force: true })
})

const noopLogger = {
  request: () => {},
  provider: () => {},
  errors: () => {},
  agentLoop: () => {},
  warnings: () => {},
  debug: () => {},
} as unknown as InternalLogger

function capabilityContextWith(handle: SandboxHandle): CapabilityContext {
  const [, provideSandbox] = SandboxCapability
  const ctx = {
    capabilities: { markProvided: () => {}, has: () => true },
  } as unknown as CapabilityContext
  provideSandbox(ctx, handle)
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

describe('buildAcpPrompt', () => {
  const msgs = (
    ...parts: Array<[ModelMessage['role'], string]>
  ): Array<ModelMessage> =>
    parts.map(([role, content]) => ({ role, content }) as ModelMessage)

  it('returns only the trailing user message when resuming a session', () => {
    const built = buildAcpPrompt(
      msgs(['user', 'first'], ['assistant', 'a'], ['user', 'second']),
      'sess-1',
    )
    expect(built).toEqual({ prompt: 'second', resume: 'sess-1' })
  })

  it('flattens prior turns into a transcript preamble for a fresh session', () => {
    const built = buildAcpPrompt(
      msgs(['user', 'first'], ['assistant', 'reply'], ['user', 'second']),
      undefined,
    )
    expect(built.resume).toBeUndefined()
    expect(built.prompt).toBe(
      'Previous conversation:\nUser: first\nAssistant: reply\n\nsecond',
    )
  })

  it('sends just the message when there is no prior context', () => {
    expect(buildAcpPrompt(msgs(['user', 'only']), undefined)).toEqual({
      prompt: 'only',
    })
  })

  it('throws (with the harness name) when the trailing message is not user text', () => {
    expect(() => buildAcpPrompt(msgs(['assistant', 'hi']), undefined, 'pi')).toThrow(
      /pi adapter requires a trailing user message/,
    )
  })
})

describe('acpCompatible config validation', () => {
  it('throws when neither command nor openTransport is provided', () => {
    expect(() => acpCompatibleText('m', { name: 'pi' })).toThrow(
      /needs either a "command" or an "openTransport"/,
    )
  })
})

describe('acpCompatible in-sandbox adapter (stdio)', () => {
  it('spawns the harness over stdio and streams translated ACP events', async () => {
    const sbx = await provider.create({})
    await sbx.fs.write('/workspace/fake-acp-agent.mjs', FAKE_ACP_AGENT)

    const pi = acpCompatible({
      name: 'pi',
      command: () => 'node fake-acp-agent.mjs',
    })

    const chunks = await collect(
      pi('pi-fast').chatStream({
        model: 'pi-fast',
        messages: [{ role: 'user', content: 'say pong' }],
        logger: noopLogger,
        capabilities: capabilityContextWith(sbx),
      }),
    )

    expect((chunks[0] as { type: string }).type).toBe('RUN_STARTED')
    expect(textOf(chunks)).toContain('pong')
    expect(chunks.some((c) => c.type === 'RUN_FINISHED')).toBe(true)

    // The session id is surfaced as a `<name>.session-id` CUSTOM event.
    const sessionEvent = chunks.find(
      (c) =>
        c.type === 'CUSTOM' && (c as { name?: string }).name === 'pi.session-id',
    )
    expect((sessionEvent as { value?: { sessionId?: string } }).value).toEqual({
      sessionId: 'sess-1',
    })

    await sbx.destroy()
  })

  it('resumes a session and sends only the trailing user message', async () => {
    const sbx = await provider.create({})
    await sbx.fs.write('/workspace/fake-acp-agent.mjs', FAKE_ACP_AGENT)

    await collect(
      acpCompatibleText('pi-fast', {
        name: 'pi',
        command: () => 'node fake-acp-agent.mjs',
      }).chatStream({
        model: 'pi-fast',
        messages: [
          { role: 'user', content: 'first question' },
          { role: 'assistant', content: 'first answer' },
          { role: 'user', content: 'follow up' },
        ],
        logger: noopLogger,
        capabilities: capabilityContextWith(sbx),
        modelOptions: { sessionId: 'sess-1' },
      }),
    )

    const recorded = JSON.parse(
      await sbx.fs.read('/workspace/acp-prompt.txt'),
    ) as { prompt: Array<{ text: string }> }
    const sentText = recorded.prompt.map((part) => part.text).join('')
    expect(sentText).toBe('follow up')
    expect(sentText).not.toContain('Previous conversation')

    await sbx.destroy()
  })
})
