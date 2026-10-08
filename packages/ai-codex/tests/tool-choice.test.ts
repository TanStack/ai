/**
 * `chat({ toolChoice })` on the Codex adapter. A fake `codex` CLI runs in a
 * real local-process sandbox, and a fake bridge provisioner records which
 * chat() tools reach the bridge.
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
import { CapabilityRegistry } from '@tanstack/ai'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { codexText } from '../src/index'
import type { AnyTool, CapabilityContext, ToolChoice } from '@tanstack/ai'

const baseDir = path.join(os.tmpdir(), `tanstack-ai-codex-choice-${Date.now()}`)
const provider = localProcessSandbox({ baseDir, removeOnDestroy: true })

afterAll(async () => {
  await fsp.rm(baseDir, { recursive: true, force: true })
})

const FAKE_CODEX = [
  `process.stdin.resume()`,
  `process.stdin.on('end', () => {`,
  `  const w = (o) => process.stdout.write(JSON.stringify(o) + '\\n')`,
  `  w({ type: 'thread.started', thread_id: 'th-1' })`,
  `  w({ type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } })`,
  `})`,
].join('\n')

const MODEL = 'gpt-5.5-codex'

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
    await sbx.fs.write('/workspace/fake-codex.mjs', FAKE_CODEX)
    const bridged: Array<Array<string>> = []
    const capabilities: CapabilityContext = {
      capabilities: new CapabilityRegistry(),
    }
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
    const adapter = codexText(MODEL, { codexExecutable: 'node fake-codex.mjs' })
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
// sandbox. They end with a RUN_ERROR for the missing sandbox.
async function callWithoutSandbox(
  adapter: ReturnType<typeof codexText>,
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

describe('codex toolChoice', () => {
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
    const adapter = codexText(MODEL)
    await callWithoutSandbox(adapter, warn, 'required')
    await callWithoutSandbox(adapter, warn, 'required')
    await callWithoutSandbox(adapter, warn, 'none')
    await callWithoutSandbox(adapter, warn, { type: 'tool', name: 'getTime' })
    expect(warn.mock.calls.map(([message]) => message)).toEqual([
      expect.stringContaining("codex: toolChoice 'required' is not supported"),
      expect.stringContaining('codex: toolChoice limits only the chat() tools'),
    ])
  })

  it("'auto' and unset do not warn", async () => {
    const warn = vi.fn()
    const adapter = codexText(MODEL)
    await callWithoutSandbox(adapter, warn, 'auto')
    await callWithoutSandbox(adapter, warn, undefined)
    expect(warn).not.toHaveBeenCalled()
  })
})
