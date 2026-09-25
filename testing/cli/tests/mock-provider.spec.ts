import { spawn } from 'node:child_process'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'

const BIN = fileURLToPath(
  new URL('../../../packages/ai-cli/dist/bin/bin.js', import.meta.url),
)

// ponytail: a tiny OpenAI-shaped mock on node:http. Move this to aimock once
// testing/cli can depend on @copilotkit/aimock.
const AUDIO = Buffer.from('ID3-fake-mp3-bytes')
let server: Server
let baseURL = ''

beforeAll(async () => {
  server = createServer((req, res) => {
    req.resume()
    req.on('end', () => {
      if (req.url === '/v1/audio/speech') {
        res.writeHead(200, { 'content-type': 'audio/mpeg' })
        res.end(AUDIO)
        return
      }
      if (req.url === '/v1/responses') {
        const response = { id: 'resp_1', model: 'gpt-5.6', output: [] }
        const events = [
          { type: 'response.created', response },
          {
            type: 'response.output_text.delta',
            item_id: 'msg_1',
            output_index: 0,
            content_index: 0,
            delta: 'Hello from the mock',
          },
          {
            type: 'response.completed',
            response: {
              ...response,
              status: 'completed',
              usage: { input_tokens: 1, output_tokens: 4, total_tokens: 5 },
            },
          },
        ]
        res.writeHead(200, { 'content-type': 'text/event-stream' })
        for (const event of events) {
          res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`)
        }
        res.end()
        return
      }
      res.writeHead(404).end()
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`
})

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
})

/**
 * Run ts-ai against the mock. stdin stays an open pipe that never ends, the
 * way some agent harnesses leave it. A command that reads stdin hangs here.
 */
function runCli(
  args: Array<string>,
): Promise<{ code: number | null; stdout: Buffer }> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [BIN, ...args, '--config', JSON.stringify({ baseURL })],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { PATH: process.env.PATH ?? '', OPENAI_API_KEY: 'sk-test' },
      },
    )
    // A hung child must not outlive the test.
    const timer = setTimeout(() => child.kill(), 8_000)
    const chunks: Array<Buffer> = []
    child.stdout.on('data', (c: Buffer) => chunks.push(c))
    child.on('error', reject)
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, stdout: Buffer.concat(chunks) })
    })
  })
}

describe('ts-ai against a mock OpenAI server', () => {
  it('chat --json returns the model text', async () => {
    const { code, stdout } = await runCli([
      'chat',
      'hi',
      '--model',
      'openai/gpt-5.6',
      '--json',
    ])
    expect(code).toBe(0)
    expect(JSON.parse(stdout.toString())).toMatchObject({
      text: 'Hello from the mock',
    })
  })

  it('chat --messages does not wait for stdin', async () => {
    const { code, stdout } = await runCli([
      'chat',
      '--model',
      'openai/gpt-5.6',
      '--json',
      '--messages',
      '[{"role":"user","content":"hi"}]',
    ])
    expect(code).toBe(0)
    expect(JSON.parse(stdout.toString()).text).toBe('Hello from the mock')
  }, 10_000)

  it('speech -o - writes only the audio bytes to stdout', async () => {
    const { code, stdout } = await runCli([
      'speech',
      'hello',
      '--model',
      'openai/tts-1',
      '-o',
      '-',
    ])
    expect(code).toBe(0)
    expect(stdout.equals(AUDIO)).toBe(true)
  })
})
