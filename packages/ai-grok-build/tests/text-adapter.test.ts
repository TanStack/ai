/**
 * Basic deterministic tests for the Grok Build in-sandbox adapter.
 */
import { afterAll, describe, expect, it } from 'vitest'
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'
import { SandboxCapability } from '@tanstack/ai-sandbox'
import { grokBuildText } from '../src/index'
import { GROK_BUILD_MODELS, resolveGrokCliModel } from '../src/model-meta'
import type { InternalLogger } from '@tanstack/ai/adapter-internals'
import type { CapabilityContext, StreamChunk } from '@tanstack/ai'
import type { SandboxHandle } from '@tanstack/ai-sandbox'

const baseDir = path.join(
  os.tmpdir(),
  `tanstack-ai-grok-build-test-${Date.now()}`,
)
const provider = localProcessSandbox({ baseDir, removeOnDestroy: true })

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
        model: 'grok-build-0.1',
        messages: [{ role: 'user', content: 'say pong' }],
        logger: noopLogger,
        capabilities: capabilityContextWith(sbx),
      }),
    )

    expect((chunks[0] as { type: string }).type).toBe('RUN_STARTED')
    const text = chunks
      .filter((c) => c.type === 'TEXT_MESSAGE_CONTENT')
      .map((c) => (c as { delta?: string }).delta ?? '')
      .join('')
    expect(text).toContain('pong')
    expect(chunks.some((c) => c.type === 'RUN_FINISHED')).toBe(true)

    const argv = await sbx.fs.read('/workspace/grok-argv.txt')
    expect(argv).toContain('--model')
    expect(argv).toContain('grok-build-0.1')
    expect(argv).not.toContain('--mcp-config')
    expect(argv).toContain('--always-approve')
    expect(argv).toContain('--cwd')
    // local-process: harness cwd must be the real host dir, not virtual /workspace.
    expect(argv).toContain(sbx.id)
    expect(argv).not.toContain('/workspace')

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
        model: 'grok-build',
        messages: [{ role: 'user', content: 'say pong' }],
        logger: noopLogger,
        capabilities: capabilityContextWith(sbx),
      }),
    )

    const text = chunks
      .filter((c) => c.type === 'TEXT_MESSAGE_CONTENT')
      .map((c) => (c as { delta?: string }).delta ?? '')
      .join('')
    expect(text).toBe('pong')
    expect(chunks.some((c) => c.type === 'RUN_FINISHED')).toBe(true)
    await sbx.destroy()
  })
})
