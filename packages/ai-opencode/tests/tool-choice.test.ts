/**
 * `chat({ toolChoice })` on the OpenCode adapter. A fake bridge provisioner
 * records which chat() tools reach the bridge (the bridge becomes the MCP
 * server of `opencode serve`). The server start is mocked to fail, so no
 * `opencode` process starts.
 */
import { describe, expect, it, vi } from 'vitest'
import {
  provideSandbox,
  provideToolBridgeProvisioner,
} from '@tanstack/ai-sandbox'
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { opencodeText } from '../src/index'
import type { AnyTool, CapabilityContext, ToolChoice } from '@tanstack/ai'
import type { SandboxHandle } from '@tanstack/ai-sandbox'

vi.mock('../src/process/sandbox-server', () => ({
  startOpencodeServerInSandbox: () =>
    Promise.reject(new Error('no opencode server in this test')),
}))

// The run stops at the mocked server start, before it uses the sandbox.
const unused = () => Promise.reject(new Error('unused in this test'))
const sandbox: SandboxHandle = {
  id: 'sbx',
  provider: 'mock',
  capabilities: {
    fs: false,
    exec: false,
    env: false,
    ports: false,
    backgroundProcesses: false,
    writableStdin: false,
    killableProcesses: false,
    snapshots: false,
    networkPolicy: false,
    durableFilesystem: false,
    fork: false,
  },
  fs: {
    read: unused,
    readBytes: unused,
    write: unused,
    list: unused,
    mkdir: unused,
    remove: unused,
    rename: unused,
    exists: unused,
  },
  git: {
    clone: unused,
    status: unused,
    add: unused,
    commit: unused,
    push: unused,
    pull: unused,
    branch: unused,
  },
  process: { exec: unused, spawn: unused },
  ports: { connect: unused },
  env: { set: unused },
  destroy: () => Promise.resolve(),
}

const MODEL = 'anthropic/claude-sonnet-4-5'

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

/** Run the adapter up to the server start. Returns the bridged tool names. */
async function bridgedFor(toolChoice: ToolChoice) {
  const bridged: Array<Array<string>> = []
  const capabilities = {
    capabilities: { markProvided: () => {}, has: () => true },
  } as unknown as CapabilityContext
  provideSandbox(capabilities, sandbox)
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
    opencodeText(MODEL).chatStream({
      model: MODEL,
      messages: [{ role: 'user', content: 'hi' }],
      logger: loggerWith(() => {}),
      capabilities,
      tools,
      toolChoice,
    }),
  )
  // The run gets past the bridge and stops at the server start.
  expect(chunks.find((chunk) => chunk.type === 'RUN_ERROR')).toMatchObject({
    message: 'no opencode server in this test',
  })
  return bridged
}

// The warning comes before the sandbox lookup, so these calls need no
// sandbox. They end with a RUN_ERROR for the missing sandbox.
async function callWithoutSandbox(
  adapter: ReturnType<typeof opencodeText>,
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

describe('opencode toolChoice', () => {
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
    const adapter = opencodeText(MODEL)
    await callWithoutSandbox(adapter, warn, 'required')
    await callWithoutSandbox(adapter, warn, 'required')
    await callWithoutSandbox(adapter, warn, 'none')
    await callWithoutSandbox(adapter, warn, { type: 'tool', name: 'getTime' })
    expect(warn.mock.calls.map(([message]) => message)).toEqual([
      expect.stringContaining(
        "opencode: toolChoice 'required' is not supported",
      ),
      expect.stringContaining(
        'opencode: toolChoice limits only the chat() tools',
      ),
    ])
  })

  it("'auto' and unset do not warn", async () => {
    const warn = vi.fn()
    const adapter = opencodeText(MODEL)
    await callWithoutSandbox(adapter, warn, 'auto')
    await callWithoutSandbox(adapter, warn, undefined)
    expect(warn).not.toHaveBeenCalled()
  })
})
