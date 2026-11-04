/**
 * ACP path: when the structured output does not parse, the turn usage must
 * reach chat(). chat() stops at the first RUN_ERROR, so the usage goes on
 * that RUN_ERROR and no RUN_FINISHED follows it.
 */
import { afterAll, describe, expect, it, vi } from 'vitest'
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'
import { SandboxCapability } from '@tanstack/ai-sandbox'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { grokBuildText } from '../src/index'
import type * as AcpModule from '@tanstack/ai-acp'
import type { AdapterYieldChunk, CapabilityContext } from '@tanstack/ai'

vi.mock('../src/process/resolve-executable', () => ({
  resolveGrokExecutable: () => Promise.resolve('grok'),
}))
vi.mock('../src/process/acp', () => ({
  openGrokAcpConnection: () => Promise.resolve({ transport: {} }),
}))
vi.mock('@tanstack/ai-acp', async (importOriginal) => ({
  ...(await importOriginal<typeof AcpModule>()),
  startAcpSession: (options: { onUpdate: (update: unknown) => void }) =>
    Promise.resolve({
      sessionId: 'sess-1',
      resumed: false,
      prompt: () => {
        options.onUpdate({
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: 'not json' },
        })
        return Promise.resolve({
          stopReason: 'end_turn',
          usage: { inputTokens: 12, outputTokens: 3, totalTokens: 15 },
        })
      },
      cancel: () => Promise.resolve(),
      dispose: () => Promise.resolve(),
    }),
}))

const baseDir = path.join(
  os.tmpdir(),
  `tanstack-ai-grok-build-usage-test-${Date.now()}`,
)
const provider = localProcessSandbox({ baseDir, removeOnDestroy: true })

afterAll(async () => {
  await fsp.rm(baseDir, { recursive: true, force: true })
})

describe('grok-build ACP structured output usage', () => {
  it('puts the usage on the parse-failure RUN_ERROR and drops RUN_FINISHED', async () => {
    const sbx = await provider.create({})
    const [, provideSandbox] = SandboxCapability
    const capabilities = {
      capabilities: { markProvided: () => {}, has: () => true },
    } as unknown as CapabilityContext
    provideSandbox(capabilities, sbx)

    const chunks: Array<AdapterYieldChunk> = []
    for await (const chunk of grokBuildText('grok-build-0.1', {
      protocol: 'acp',
      emitDiff: false,
    }).chatStream({
      threadId: 'thread-1',
      model: 'grok-build-0.1',
      messages: [{ role: 'user', content: 'report' }],
      outputSchema: { type: 'object', properties: {} },
      logger: resolveDebugOption(false),
      capabilities,
    })) {
      chunks.push(chunk)
    }

    expect(chunks.find((c) => c.type === 'RUN_ERROR')).toMatchObject({
      usage: { promptTokens: 12, completionTokens: 3, totalTokens: 15 },
    })
    expect(chunks.some((c) => c.type === 'RUN_FINISHED')).toBe(false)

    await sbx.destroy()
  })
})
