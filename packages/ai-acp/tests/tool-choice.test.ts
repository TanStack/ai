/**
 * `chat({ toolChoice })` on the ACP adapter. A fake bridge provisioner records
 * which chat() tools reach the bridge (the bridge becomes the ACP session
 * MCP server). `openTransport` then throws, so no agent process starts.
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
import { acpCompatible } from '../src/index'
import type { AnyTool, CapabilityContext, ToolChoice } from '@tanstack/ai'

const baseDir = path.join(os.tmpdir(), `tanstack-ai-acp-choice-${Date.now()}`)
const provider = localProcessSandbox({ baseDir })

afterAll(async () => {
  await fsp.rm(baseDir, { recursive: true, force: true })
})

const pi = acpCompatible({
  name: 'pi',
  openTransport: () => {
    throw new Error('no agent in this test')
  },
})

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

/** Run the adapter up to the transport. Returns the bridged tool names. */
async function bridgedFor(toolChoice: ToolChoice) {
  const sbx = await provider.create({})
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
  const chunks = await collect(
    pi('pi-model').chatStream({
      model: 'pi-model',
      messages: [{ role: 'user', content: 'hi' }],
      logger: loggerWith(() => {}),
      capabilities,
      tools,
      toolChoice,
    }),
  )
  // The run gets past the bridge and stops at the transport.
  expect(chunks.find((chunk) => chunk.type === 'RUN_ERROR')).toMatchObject({
    message: 'no agent in this test',
  })
  return bridged
}

// The warning comes before the sandbox lookup, so these calls need no
// sandbox. They end with a RUN_ERROR for the missing sandbox.
async function callWithoutSandbox(
  adapter: ReturnType<typeof pi>,
  warn: (message: string) => void,
  toolChoice: ToolChoice | undefined,
) {
  await collect(
    adapter.chatStream({
      model: 'pi-model',
      messages: [{ role: 'user', content: 'hi' }],
      logger: loggerWith(warn),
      tools,
      ...(toolChoice !== undefined && { toolChoice }),
    }),
  )
}

describe('acp toolChoice', () => {
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
    const adapter = pi('pi-model')
    await callWithoutSandbox(adapter, warn, 'required')
    await callWithoutSandbox(adapter, warn, 'required')
    await callWithoutSandbox(adapter, warn, 'none')
    await callWithoutSandbox(adapter, warn, { type: 'tool', name: 'getTime' })
    expect(warn.mock.calls.map(([message]) => message)).toEqual([
      expect.stringContaining("pi: toolChoice 'required' is not supported"),
      expect.stringContaining('pi: toolChoice limits only the chat() tools'),
    ])
  })

  it("'auto' and unset do not warn", async () => {
    const warn = vi.fn()
    const adapter = pi('pi-model')
    await callWithoutSandbox(adapter, warn, 'auto')
    await callWithoutSandbox(adapter, warn, undefined)
    expect(warn).not.toHaveBeenCalled()
  })
})
