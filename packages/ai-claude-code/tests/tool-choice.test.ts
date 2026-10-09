/**
 * `chat({ toolChoice })` on the Claude Code adapter. A fake `claude` CLI
 * writes its argv to a file, and a fake bridge provisioner records which
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
import { resolveDebugOption } from '@tanstack/ai/adapter-internals'
import { claudeCodeText } from '../src/index'
import type { AnyTool, CapabilityContext, ToolChoice } from '@tanstack/ai'

const baseDir = path.join(os.tmpdir(), `tanstack-ai-cc-choice-${Date.now()}`)
const provider = localProcessSandbox({ baseDir, removeOnDestroy: true })

afterAll(async () => {
  await fsp.rm(baseDir, { recursive: true, force: true })
})

const FAKE_CLAUDE = [
  `import { writeFileSync } from 'node:fs'`,
  `writeFileSync('argv.json', JSON.stringify(process.argv.slice(2)))`,
  `process.stdin.resume()`,
  `process.stdin.on('end', () => {`,
  `  const w = (o) => process.stdout.write(JSON.stringify(o) + '\\n')`,
  `  w({ type: 'system', subtype: 'init', session_id: 's', model: 'haiku', tools: [] })`,
  `  w({ type: 'result', subtype: 'success', result: 'ok', usage: { input_tokens: 1, output_tokens: 1 } })`,
  `})`,
].join('\n')

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

/** Run the adapter once in a real sandbox. Returns the argv and bridged tools. */
async function run(toolChoice: ToolChoice) {
  const sbx = await provider.create({})
  try {
    await sbx.fs.write('/workspace/fake-claude.mjs', FAKE_CLAUDE)
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
    const adapter = claudeCodeText('haiku', {
      claudeExecutable: 'node fake-claude.mjs',
      streamPartials: false,
      emitDiff: false,
    })
    const chunks = await collect(
      adapter.chatStream({
        model: 'haiku',
        messages: [{ role: 'user', content: 'hi' }],
        logger: loggerWith(() => {}),
        capabilities,
        tools,
        toolChoice,
      }),
    )
    expect(chunks.find((chunk) => chunk.type === 'RUN_ERROR')).toBeUndefined()
    const argv: unknown = JSON.parse(await sbx.fs.read('/workspace/argv.json'))
    return { argv, bridged }
  } finally {
    await sbx.destroy()
  }
}

describe('claude-code toolChoice', () => {
  it("'none' bridges no chat() tool and turns off every other tool", async () => {
    const { argv, bridged } = await run('none')
    expect(bridged).toEqual([])
    expect(argv).toEqual(
      expect.arrayContaining(['--tools', '', '--strict-mcp-config']),
    )
  })

  it('a named tool bridges only that tool and turns off the others', async () => {
    const { argv, bridged } = await run({ type: 'tool', name: 'getTime' })
    expect(bridged).toEqual([['getTime']])
    expect(argv).toEqual(
      expect.arrayContaining(['--tools', '', '--strict-mcp-config']),
    )
  })

  it("'auto' bridges every chat() tool and keeps the built-in tools", async () => {
    const { argv, bridged } = await run('auto')
    expect(bridged).toEqual([['getWeather', 'getTime']])
    expect(argv).not.toContain('--tools')
    expect(argv).not.toContain('--strict-mcp-config')
  })

  // The warning comes before the sandbox lookup, so these calls need no
  // sandbox. They end with a RUN_ERROR for the missing sandbox.
  async function callWithoutSandbox(
    adapter: ReturnType<typeof claudeCodeText>,
    warn: (message: string) => void,
    toolChoice: ToolChoice | undefined,
  ) {
    await collect(
      adapter.chatStream({
        model: 'haiku',
        messages: [{ role: 'user', content: 'hi' }],
        logger: loggerWith(warn),
        tools,
        ...(toolChoice !== undefined && { toolChoice }),
      }),
    )
  }

  it("'required' warns once per adapter instance", async () => {
    const warn = vi.fn()
    const adapter = claudeCodeText('haiku')
    await callWithoutSandbox(adapter, warn, 'required')
    await callWithoutSandbox(adapter, warn, 'required')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toContain(
      "claude-code: toolChoice 'required' is not supported",
    )
  })

  it("'auto', unset, 'none', and a named tool do not warn", async () => {
    const warn = vi.fn()
    const adapter = claudeCodeText('haiku')
    await callWithoutSandbox(adapter, warn, 'auto')
    await callWithoutSandbox(adapter, warn, undefined)
    await callWithoutSandbox(adapter, warn, 'none')
    await callWithoutSandbox(adapter, warn, { type: 'tool', name: 'getTime' })
    expect(warn).not.toHaveBeenCalled()
  })
})
