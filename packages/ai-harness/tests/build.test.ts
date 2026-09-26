import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { PassThrough } from 'node:stream'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { EventType, chat } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  createHarnessHandler,
  createHarnessHost,
  defineHarness,
  harnessText,
} from '../src'
import { artifactText, buildHarness, readManifest } from '../src/build'
import { runHarnessWorker } from '../src/worker'
import { mockAdapter, text } from './helpers'
import type { StreamChunk } from '@tanstack/ai'

async function textOf(stream: AsyncIterable<StreamChunk>): Promise<string> {
  let out = ''
  for await (const chunk of stream) {
    if (chunk.type === EventType.TEXT_MESSAGE_CONTENT) out += chunk.delta
    if (chunk.type === EventType.RUN_ERROR) throw new Error(chunk.message)
  }
  return out
}

describe('worker mode', () => {
  it('speaks session frames over NDJSON', async () => {
    const { adapter } = mockAdapter([() => text('from the worker')])
    const input = new PassThrough()
    const lines: Array<any> = []
    const running = runHarnessWorker(
      defineHarness({ name: 'test/worker', adapter }),
      {
        input,
        output: { write: (line: string) => lines.push(JSON.parse(line)) },
        persistence: memoryPersistence(),
      },
    )
    input.write('{"type":"harness.subscribe","threadId":"w1"}\n')
    input.write(
      '{"type":"harness.input","requestId":"r1","input":{"op":"prompt","message":"hi"}}\n',
    )
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (
          lines.some(
            (frame) => frame.event?.name === 'harness.operation.finished',
          )
        ) {
          clearInterval(check)
          resolve()
        }
      }, 10)
    })
    input.end()
    await running
    expect(lines[0]).toMatchObject({ type: 'harness.hello', threadId: 'w1' })
    expect(
      lines.find((frame) => frame.type === 'harness.receipt'),
    ).toMatchObject({ requestId: 'r1', status: 'accepted' })
    expect(JSON.stringify(lines)).toContain('from the worker')
  })
})

describe('harnessText({ url })', () => {
  it('uses a harness served over HTTP as a model', async () => {
    const { adapter } = mockAdapter([() => text('from far away')])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const handler = createHarnessHandler({
      host,
      harness: defineHarness({ name: 'test/remote', adapter }),
      authorize: (request) =>
        request.headers.get('authorization') === 'Bearer t'
          ? { id: 'u' }
          : null,
    })
    const remote = harnessText({
      url: 'http://remote.test/api',
      token: 't',
      fetch: (input, init) => handler(new Request(input, init)),
    })
    const answer = await textOf(
      chat({
        adapter: remote,
        messages: [{ role: 'user', content: 'hi' }],
        threadId: 'r',
      }) as AsyncIterable<StreamChunk>,
    )
    expect(answer).toBe('from far away')
    await host.close()
  })
})

const tmp = fileURLToPath(new URL('./.tmp-build/', import.meta.url))

describe('buildHarness and artifactText', () => {
  afterAll(async () => {
    await rm(tmp, { recursive: true, force: true })
  })

  it(
    'bundles a harness, writes a manifest, and runs it as a worker process',
    { timeout: 60_000 },
    async () => {
      await mkdir(tmp, { recursive: true })
      const entry = join(tmp, 'studio.ts')
      await writeFile(
        entry,
        `
import { EventType, defineAgent } from '@tanstack/ai'
import { defineHarness } from '../../src/index'

let calls = 0
const adapter = {
  kind: 'text',
  name: 'inline',
  model: 'inline-model',
  '~types': {},
  structuredOutput: async () => ({ data: {}, rawText: '{}' }),
  chatStream: (options) =>
    (async function* () {
      calls += 1
      const now = Date.now()
      const messageId = 'm-' + calls
      yield { type: EventType.RUN_STARTED, runId: 'r', threadId: 't', timestamp: now }
      yield { type: EventType.TEXT_MESSAGE_START, messageId, role: 'assistant', timestamp: now }
      yield { type: EventType.TEXT_MESSAGE_CONTENT, messageId, delta: 'worker saw ' + options.messages.length + ' messages', timestamp: now }
      yield { type: EventType.TEXT_MESSAGE_END, messageId, timestamp: now }
      yield { type: EventType.RUN_FINISHED, runId: 'r', threadId: 't', timestamp: now, metadata: { tanstack: { finishReason: 'stop' } } }
    })(),
}

export const studio = defineHarness({
  name: 'acme/built',
  adapter,
  agents: [defineAgent({ name: 'painter', description: 'Paints', produces: 'image', run: async () => 'art' })],
})
`,
      )

      const outDir = join(tmp, 'out')
      const { manifest, bundle } = await buildHarness({
        entry,
        export: 'studio',
        outDir,
      })
      expect(manifest).toMatchObject({
        format: 'tanstack-ai-harness',
        version: 1,
        name: 'acme/built',
        entry: 'harness.js',
        agents: [{ name: 'painter', produces: 'image' }],
        requires: {
          filesystem: false,
          processExecution: false,
          network: 'model-only',
        },
      })
      expect(manifest.digest).toMatch(/^[0-9a-f]{64}$/)
      expect(await readManifest(outDir)).toEqual(manifest)
      expect((await readFile(bundle)).length).toBeGreaterThan(1000)

      const model = await artifactText(outDir)
      try {
        const ask = (content: string) =>
          textOf(
            chat({
              adapter: model,
              messages: [{ role: 'user', content }],
              threadId: 'outer',
            }) as AsyncIterable<StreamChunk>,
          )
        expect(await ask('first')).toBe('worker saw 1 messages')
        // The worker keeps the conversation between calls.
        expect(await ask('second')).toBe('worker saw 3 messages')
      } finally {
        model.dispose()
      }
    },
  )

  it(
    'refuses a bundle that does not match its manifest',
    { timeout: 60_000 },
    async () => {
      const outDir = join(tmp, 'out')
      await writeFile(join(outDir, 'harness.js'), '// changed\n')
      await expect(artifactText(outDir)).rejects.toThrow(
        'does not match its manifest digest',
      )
    },
  )
})
