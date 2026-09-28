import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { EventType, defineAgent, toolDefinition } from '@tanstack/ai'
import {
  configOption,
  createHarnessHost,
  defineCommand,
  defineHarness,
  definePlugin,
} from '@tanstack/ai-harness'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { EXIT, parseCliArgs, runCli } from '../src'
import { serve } from '../src/serve'
import type { AnyTextAdapter, StreamChunk } from '@tanstack/ai'

const now = () => Date.now()
const textTurn = (text: string): Array<StreamChunk> => [
  { type: EventType.RUN_STARTED, runId: 'r', threadId: 't', timestamp: now() },
  {
    type: EventType.TEXT_MESSAGE_START,
    messageId: 'm',
    role: 'assistant',
    timestamp: now(),
  },
  {
    type: EventType.TEXT_MESSAGE_CONTENT,
    messageId: 'm',
    delta: text,
    timestamp: now(),
  },
  { type: EventType.TEXT_MESSAGE_END, messageId: 'm', timestamp: now() },
  {
    type: EventType.RUN_FINISHED,
    runId: 'r',
    threadId: 't',
    timestamp: now(),
    metadata: { tanstack: { finishReason: 'stop' } },
  },
]
const toolTurn = (name: string, args: string): Array<StreamChunk> => [
  { type: EventType.RUN_STARTED, runId: 'r', threadId: 't', timestamp: now() },
  {
    type: EventType.TOOL_CALL_START,
    toolCallId: 'call_1',
    toolCallName: name,
    timestamp: now(),
  },
  {
    type: EventType.TOOL_CALL_ARGS,
    toolCallId: 'call_1',
    delta: args,
    timestamp: now(),
  },
  { type: EventType.TOOL_CALL_END, toolCallId: 'call_1', timestamp: now() },
  {
    type: EventType.RUN_FINISHED,
    runId: 'r',
    threadId: 't',
    timestamp: now(),
    metadata: { tanstack: { finishReason: 'tool_calls' } },
  },
]

function scripted(turns: Array<Array<StreamChunk>>) {
  let call = 0
  const seen: Array<Array<{ role: string; content: unknown }>> = []
  const adapter: AnyTextAdapter = {
    kind: 'text',
    name: 'mock',
    model: 'test-model',
    // `~types` holds types only. Its values are never read, so they are casts.
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
    chatStream: (options) => {
      seen.push(options.messages)
      const chunks = turns[call] ?? textTurn('')
      call += 1
      return (async function* () {
        yield* chunks
      })()
    },
    structuredOutput: async () => ({ data: {}, rawText: '{}' }),
  }
  return { adapter, seen }
}

function capture() {
  let text = ''
  return {
    write: (chunk: string) => (text += chunk),
    get text() {
      return text
    },
  }
}

/** A stdin that reads `lines`, as a terminal or as a pipe. */
function stdinFrom(lines: Array<string>, { isTTY }: { isTTY: boolean }) {
  // NodeJS.ReadStream is a TTY socket. A test cannot make one without a real
  // terminal, and runCli only reads the lines and `isTTY`, so this casts.
  return Object.assign(Readable.from(lines), {
    isTTY,
  }) as unknown as NodeJS.ReadStream
}

describe('parseCliArgs', () => {
  it('reads flags and rejects bad values', () => {
    expect(parseCliArgs(['-p', 'hi', '--output', 'ndjson'])).toMatchObject({
      print: 'hi',
      output: 'ndjson',
      thread: 'main',
    })
    expect(() => parseCliArgs(['--output', 'xml'])).toThrow('--output')
    expect(() => parseCliArgs(['--nope'])).toThrow()
  })
})

describe('print mode', () => {
  it('prints the answer and exits 0', async () => {
    const { adapter } = scripted([textTurn('Hello from the harness.')])
    const stdout = capture()
    const code = await runCli(defineHarness({ name: 'test/print', adapter }), {
      argv: ['-p', 'hi'],
      stdout,
      stderr: capture(),
      persistence: memoryPersistence(),
    })
    expect(code).toBe(EXIT.ok)
    expect(stdout.text).toBe('Hello from the harness.\n')
  })

  it('prints NDJSON AG-UI events', async () => {
    const { adapter } = scripted([textTurn('x')])
    const stdout = capture()
    await runCli(defineHarness({ name: 'test/ndjson', adapter }), {
      argv: ['-p', 'hi', '--output', 'ndjson'],
      stdout,
      stderr: capture(),
      persistence: memoryPersistence(),
    })
    const events = stdout.text
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
    expect(events.map((event) => event.type)).toContain('TEXT_MESSAGE_CONTENT')
    expect(events.at(-1).name).toBe('harness.operation.finished')
  })

  it('exits 2 when the turn waits for an approval', async () => {
    const { adapter } = scripted([toolTurn('remove', '{}')])
    const stderr = capture()
    const code = await runCli(
      defineHarness({
        name: 'test/approval',
        adapter,
        tools: [
          toolDefinition({
            name: 'remove',
            description: 'Remove',
            needsApproval: true,
          }).server(async () => 'ok'),
        ],
      }),
      {
        argv: ['-p', 'remove it'],
        stdout: capture(),
        stderr,
        persistence: memoryPersistence(),
      },
    )
    expect(code).toBe(EXIT.needsAction)
    expect(stderr.text).toContain('approval')
  })
})

describe('line mode', () => {
  it('runs piped lines as turns, answers approvals, and runs commands', async () => {
    const remove = vi.fn(async () => 'removed')
    const pricer = defineAgent({
      name: 'pricer',
      description: 'Prices a vendor',
      run: async () => 'twelve dollars',
    })
    const { adapter } = scripted([
      textTurn('First answer.'),
      toolTurn('remove', '{}'),
      textTurn('Done removing.'),
    ])
    const stdout = capture()
    const code = await runCli(
      defineHarness({
        name: 'test/lines',
        adapter,
        agents: [pricer],
        tools: [
          toolDefinition({
            name: 'remove',
            description: 'Remove',
            needsApproval: true,
          }).server(remove),
        ],
      }),
      {
        argv: [],
        stdin: stdinFrom(
          ['hello\n', 'remove the file\n', 'y\n', '/agents\n', '/exit\n'],
          { isTTY: false },
        ),
        stdout,
        stderr: capture(),
        persistence: memoryPersistence(),
      },
    )
    expect(code).toBe(EXIT.ok)
    expect(remove).toHaveBeenCalledTimes(1)
    expect(stdout.text).toContain('First answer.')
    expect(stdout.text).toContain('[y/n]')
    expect(stdout.text).toContain('Done removing.')
    expect(stdout.text).toContain('pricer: Prices a vendor')
  })
})

describe('plugin commands in line mode', () => {
  it('runs plugin commands, answers questions, and changes settings', async () => {
    const tools = definePlugin({
      name: 'test/tools',
      setup: (ctx) => ({
        config: {
          tone: configOption.select({
            options: ['plain', 'warm'],
            default: 'plain',
          }),
        },
        commands: {
          greet: defineCommand({
            description: 'Greet someone',
            run: (input: unknown) =>
              `Hello, ${typeof input === 'object' && input !== null && 'name' in input ? String(input.name) : 'you'}!`,
          }),
          confirm: defineCommand({
            description: 'Ask first',
            run: async () => {
              const sure = await ctx.session.ask({
                message: 'Really?',
                schema: { type: 'boolean' },
              })
              return sure === true ? 'Confirmed.' : 'Stopped.'
            },
          }),
        },
      }),
    })
    const { adapter } = scripted([])
    const stdout = capture()
    await runCli(
      defineHarness({
        name: 'test/plugin-lines',
        adapter,
        plugins: () => [tools],
      }),
      {
        argv: [],
        stdin: stdinFrom(
          [
            '/greet {"name":"Ada"}\n',
            '/confirm\n',
            'yes\n',
            '/config tone warm\n',
            '/config\n',
            '/help\n',
            '/exit\n',
          ],
          { isTTY: false },
        ),
        stdout,
        stderr: capture(),
        persistence: memoryPersistence(),
      },
    )
    expect(stdout.text).toContain('Hello, Ada!')
    expect(stdout.text).toContain('? Really?')
    expect(stdout.text).toContain('Confirmed.')
    expect(stdout.text).toContain('tone changed.')
    expect(stdout.text).toContain('tone = "warm"')
    expect(stdout.text).toContain('/greet  Greet someone')
  })
})

describe('serve mode', () => {
  it('serves the session protocol and requires the token', async () => {
    const { adapter } = scripted([textTurn('served')])
    const harness = defineHarness({ name: 'test/serve', adapter })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const server = await serve({
      host,
      harness,
      port: 0,
      hostname: '127.0.0.1',
      token: 'secret',
    })
    try {
      const denied = await fetch(`${server.url}/capabilities`)
      expect(denied.status).toBe(401)
      const wrong = await fetch(`${server.url}/capabilities`, {
        headers: { authorization: 'Bearer nope' },
      })
      expect(wrong.status).toBe(401)
      const capabilities = await fetch(`${server.url}/capabilities`, {
        headers: { authorization: 'Bearer secret' },
      })
      expect((await capabilities.json()).identity.name).toBe('test/serve')
      const receipt = await fetch(`${server.url}/control`, {
        method: 'POST',
        headers: {
          authorization: 'Bearer secret',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          threadId: 't',
          input: { op: 'prompt', message: 'hi' },
        }),
      })
      expect((await receipt.json()).status).toBe('accepted')
    } finally {
      await server.close()
      await host.close()
    }
  })
})

describe('custom ui', () => {
  it('gives an interactive terminal a ready session view and waits for the ui', async () => {
    const { adapter } = scripted([textTurn('Hi from the ui.')])
    const seen: Array<string> = []
    const code = await runCli(defineHarness({ name: 'test/ui', adapter }), {
      argv: [],
      stdin: stdinFrom([], { isTTY: true }),
      stdout: capture(),
      stderr: capture(),
      persistence: memoryPersistence(),
      ui: async (view) => {
        seen.push(view.store.get().threadId)
        await view.send('hello')
        await vi.waitFor(() =>
          expect(JSON.stringify(view.store.get().messages)).toContain(
            'Hi from the ui.',
          ),
        )
      },
    })
    expect(code).toBe(EXIT.ok)
    expect(seen).toEqual(['main'])
  })

  it('uses line mode for piped input, even with a ui', async () => {
    const { adapter } = scripted([textTurn('Piped answer.')])
    const stdout = capture()
    const ui = vi.fn()
    const code = await runCli(
      defineHarness({ name: 'test/ui-piped', adapter }),
      {
        argv: [],
        stdin: stdinFrom(['hello\n'], { isTTY: false }),
        stdout,
        stderr: capture(),
        persistence: memoryPersistence(),
        ui,
      },
    )
    expect(code).toBe(EXIT.ok)
    expect(ui).not.toHaveBeenCalled()
    expect(stdout.text).toContain('Piped answer.')
  })

  it('uses line mode in a terminal without a ui', async () => {
    const { adapter } = scripted([textTurn('Terminal answer.')])
    const stdout = capture()
    const code = await runCli(
      defineHarness({ name: 'test/ui-none', adapter }),
      {
        argv: [],
        stdin: stdinFrom(['hello\n'], { isTTY: true }),
        stdout,
        stderr: capture(),
        persistence: memoryPersistence(),
      },
    )
    expect(code).toBe(EXIT.ok)
    expect(stdout.text).toContain('Terminal answer.')
  })
})
