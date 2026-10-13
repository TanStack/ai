/**
 * `chat({ toolChoice })` on the Grok Build adapter. A fake `grok` CLI runs in
 * a real local-process sandbox on the `streaming-json` protocol, and a fake
 * bridge provisioner records which chat() tools reach the bridge. The `acp`
 * protocol uses the same mapping.
 */
import { afterAll, describe, expect, it, vi } from 'vitest'
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { localProcessSandbox } from '@tanstack/ai-sandbox-local-process'
import {
  provideSandbox,
  provideToolBridgeProvisioner,
} from '@tanstack/ai-sandbox'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { grokBuildText } from '../src/index'
import type { AnyTool, CapabilityContext, ToolChoice } from '@tanstack/ai'

const baseDir = path.join(os.tmpdir(), `tanstack-ai-grok-choice-${Date.now()}`)
const provider = localProcessSandbox({ baseDir, removeOnDestroy: true })

afterAll(async () => {
  await fsp.rm(baseDir, { recursive: true, force: true })
})

const FAKE_GROK = [
  `const w = (o) => process.stdout.write(JSON.stringify(o) + '\\n')`,
  `w({ type: 'text', data: 'ok' })`,
  `w({ type: 'end', stopReason: 'EndTurn', sessionId: 'sess-1' })`,
].join('\n')

const MODEL = 'grok-build-0.1'

const tools: Array<AnyTool> = [
  { name: 'getWeather', description: 'weather' },
  { name: 'getTime', description: 'time' },
]

async function collect<T>(stream: AsyncIterable<T>): Promise<Array<T>> {
  const out: Array<T> = []
  for await (const chunk of stream) out.push(chunk)
  return out
}

function loggerWith(warn: (message: string) => void) {
  return resolveDebugOption({
    logger: { debug: () => {}, info: () => {}, warn, error: () => {} },
  })
}

/** Run the adapter once in a real sandbox. Returns the bridged tool names. */
async function bridgedFor(toolChoice: ToolChoice) {
  const sbx = await provider.create({})
  try {
    await sbx.fs.write('/workspace/fake-grok.mjs', FAKE_GROK)
    const bridged: Array<Array<string>> = []
    const capabilities = {
      capabilities: { markProvided: () => {}, has: () => true },
    } as unknown as CapabilityContext
    provideSandbox(capabilities, sbx)
    provideToolBridgeProvisioner(capabilities, {
      provision: (provisioned) => {
        bridged.push(provisioned.map((tool) => tool.name))
        return Promise.resolve({
          name: 'tanstack',
          url: 'http://127.0.0.1:1/mcp',
          token: 'token',
          close: () => Promise.resolve(),
        })
      },
    })
    const adapter = grokBuildText(MODEL, {
      grokExecutable: 'node fake-grok.mjs',
      protocol: 'streaming-json',
      emitDiff: false,
    })
    const chunks = await collect(
      adapter.chatStream({
        model: MODEL,
        messages: [{ role: 'user', content: 'hi' }],
        logger: loggerWith(() => {}),
        capabilities,
        tools,
        toolChoice,
      }),
    )
    expect(chunks.find((chunk) => chunk.type === 'RUN_ERROR')).toBeUndefined()
    return bridged
  } finally {
    await sbx.destroy()
  }
}

// The warning comes before the sandbox lookup, so these calls need no
// sandbox. They take the default `acp` protocol and end with a RUN_ERROR for
// the missing sandbox.
async function callWithoutSandbox(
  adapter: ReturnType<typeof grokBuildText>,
  warn: (message: string) => void,
  toolChoice: ToolChoice | undefined,
) {
  await collect(
    adapter.chatStream({
      model: MODEL,
      messages: [{ role: 'user', content: 'hi' }],
      logger: loggerWith(warn),
      tools,
      ...(toolChoice !== undefined && { toolChoice }),
    }),
  )
}

describe('grok-build toolChoice', () => {
  it("'none' bridges no chat() tool", async () => {
    expect(await bridgedFor('none')).toEqual([])
  })

  it('a named tool bridges only that tool', async () => {
    expect(await bridgedFor({ type: 'tool', name: 'getTime' })).toEqual([
      ['getTime'],
    ])
  })

  it("'auto' bridges every chat() tool", async () => {
    expect(await bridgedFor('auto')).toEqual([['getWeather', 'getTime']])
  })

  it('warns once for each value it cannot fully apply', async () => {
    const warn = vi.fn()
    const adapter = grokBuildText(MODEL)
    await callWithoutSandbox(adapter, warn, 'required')
    await callWithoutSandbox(adapter, warn, 'required')
    await callWithoutSandbox(adapter, warn, 'none')
    await callWithoutSandbox(adapter, warn, { type: 'tool', name: 'getTime' })
    expect(warn.mock.calls.map(([message]) => message)).toEqual([
      expect.stringContaining(
        "grok-build: toolChoice 'required' is not supported",
      ),
      expect.stringContaining(
        'grok-build: toolChoice limits only the chat() tools',
      ),
    ])
  })

  it("'auto' and unset do not warn", async () => {
    const warn = vi.fn()
    const adapter = grokBuildText(MODEL)
    await callWithoutSandbox(adapter, warn, 'auto')
    await callWithoutSandbox(adapter, warn, undefined)
    expect(warn).not.toHaveBeenCalled()
  })
})
