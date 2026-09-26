import { PassThrough } from 'node:stream'
import { describe, expect, it } from 'vitest'
import { EventType } from '@tanstack/ai'
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { runInteractive } from '../src/interactive'
import type { AnyTextAdapter } from '@tanstack/ai'

const now = () => Date.now()
const adapter: AnyTextAdapter = {
  kind: 'text',
  name: 'mock',
  model: 'test-model',
  '~types': {
    providerOptions: {} as Record<string, unknown>,
    inputModalities: ['text'] as readonly ['text'],
    messageMetadataByModality: {
      text: undefined as unknown,
      image: undefined as unknown,
      audio: undefined as unknown,
      video: undefined as unknown,
      document: undefined as unknown,
    },
    toolCapabilities: [] as ReadonlyArray<string>,
    toolCallMetadata: undefined as unknown,
    systemPromptMetadata: undefined as never,
  },
  chatStream: () =>
    (async function* () {
      yield {
        type: EventType.RUN_STARTED,
        runId: 'r',
        threadId: 't',
        timestamp: now(),
      }
      yield {
        type: EventType.TEXT_MESSAGE_START,
        messageId: 'm',
        role: 'assistant',
        timestamp: now(),
      }
      yield {
        type: EventType.TEXT_MESSAGE_CONTENT,
        messageId: 'm',
        delta: 'Hi from the Ink UI',
        timestamp: now(),
      }
      yield {
        type: EventType.TEXT_MESSAGE_END,
        messageId: 'm',
        timestamp: now(),
      }
      yield {
        type: EventType.RUN_FINISHED,
        runId: 'r',
        threadId: 't',
        timestamp: now(),
        metadata: { tanstack: { finishReason: 'stop' } },
      }
    })(),
  structuredOutput: async () => ({ data: {}, rawText: '{}' }),
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

describe('interactive UI', () => {
  it('sends a typed line, shows the answer, and quits on /exit', async () => {
    const harness = defineHarness({ name: 'test/ink', adapter })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(harness, { threadId: 'ink' })

    const stdin = Object.assign(new PassThrough(), {
      isTTY: true,
      setRawMode: () => stdin,
      ref: () => stdin,
      unref: () => stdin,
    })
    let output = ''
    const stdout = Object.assign(new PassThrough(), {
      isTTY: true,
      columns: 100,
      rows: 30,
    })
    stdout.on('data', (data: Buffer) => {
      output += data.toString()
    })

    const done = runInteractive(session, harness, {
      stdin: stdin as unknown as NodeJS.ReadStream,
      stdout: stdout as unknown as NodeJS.WriteStream,
      // Vitest's console cannot be patched.
      patchConsole: false,
    })
    await wait(100)
    // One chunk with a line break, the way a paste arrives.
    stdin.write('hello\r')
    await wait(300)
    stdin.write('/exit\r')
    await done

    const plain = output.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
    expect(plain).toContain('> hello')
    expect(plain).toContain('Hi from the Ink UI')
    await host.close()
  })
})
