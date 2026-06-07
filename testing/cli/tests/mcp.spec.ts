import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const BIN = fileURLToPath(
  new URL('../../../packages/ai-cli/dist/bin/bin.js', import.meta.url),
)
// Run the server from a directory with no `.env`, so the shelled-out ts-ai has
// no API key and deterministically returns the structured no-key error rather
// than making a real provider call.
const NO_ENV_CWD = resolve(dirname(fileURLToPath(import.meta.url)), '..')

let client: Client

beforeAll(async () => {
  client = new Client({ name: 'mcp-spec', version: '1.0.0' })
  await client.connect(
    new StdioClientTransport({
      command: process.execPath,
      args: [BIN, 'mcp'],
      cwd: NO_ENV_CWD,
    }),
  )
})

afterAll(async () => {
  await client?.close()
})

function toolResultJson(res: { content?: Array<{ type: string; text?: string }> }): any {
  const text = res.content?.find((c) => c.type === 'text')?.text ?? ''
  return JSON.parse(text)
}

describe('ts-ai mcp server', () => {
  it('registers every generation command as a tool', async () => {
    const { tools } = await client.listTools()
    const names = tools.map((t) => t.name).sort()
    expect(names).toEqual(
      ['audio', 'chat', 'image', 'speech', 'summarize', 'transcribe', 'video'].sort(),
    )
  })

  it('round-trips a tool call: client -> server -> ts-ai -> structured JSON', async () => {
    // options -> --config blob; with a model but no key, ts-ai resolves the
    // model then fails on the missing key — proving the whole pipeline ran.
    const res = await client.callTool({
      name: 'chat',
      arguments: { prompt: 'hi', options: { model: 'openai/gpt-5.5' } },
    })
    const payload = toolResultJson(res as never)
    expect(payload.error.code).toBe('USAGE')
    expect(payload.error.message).toMatch(/api key/i)
  })

  it('does not let the prompt smuggle CLI flags through the tool call', async () => {
    const res = await client.callTool({
      name: 'chat',
      arguments: { prompt: '--version', options: { model: 'openai/gpt-5.5' } },
    })
    const payload = toolResultJson(res as never)
    // If --version had been parsed as a flag, this would be a version string,
    // not a structured key error.
    expect(payload.error.code).toBe('USAGE')
  })
})
