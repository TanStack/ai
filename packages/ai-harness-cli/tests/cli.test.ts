import { Readable } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { EventType, defineAgent, toolDefinition } from '@tanstack/ai'
import { defineByokProvider } from '@tanstack/ai/byok'
import {
  configOption,
  createHarnessHost,
  defineCommand,
  defineHarness,
  definePlugin,
} from '@tanstack/ai-harness'
import { providerKeys } from '@tanstack/ai-harness/plugins'
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

  it('reads --mcp and --yes, both off by default', () => {
    expect(parseCliArgs(['--mcp', '--yes'])).toMatchObject({
      mcp: true,
      yes: true,
    })
    expect(parseCliArgs([])).toMatchObject({ mcp: false, yes: false })
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

describe('secret answers in line mode', () => {
  const acme = defineByokProvider({ id: 'acme', label: 'Acme' })

  /** Run `/connect acme` and answer with `key`. Returns what was printed and saved. */
  async function connect(
    key: string,
    stdin: (lines: Array<string>) => NodeJS.ReadStream,
  ) {
    const stdout = capture()
    const persistence = memoryPersistence()
    await runCli(
      defineHarness({
        name: 'test/secret',
        adapter: scripted([]).adapter,
        plugins: () => [providerKeys({ providers: [acme] })],
      }),
      {
        argv: [],
        stdin: stdin(['/connect acme\n', `${key}\n`, '/exit\n']),
        stdout,
        stderr: capture(),
        persistence,
      },
    )
    const saved = await persistence.stores.credentials.get(
      { threadId: 'main' },
      'acme',
    )
    return { printed: stdout.text, saved }
  }

  it('saves a pasted key as typed and never prints it', async () => {
    const { printed, saved } = await connect('12345678', (lines) =>
      stdinFrom(lines, { isTTY: false }),
    )
    expect(saved).toEqual({ type: 'api_key', value: '12345678' })
    expect(printed).toContain('[? Paste your Acme API key]')
    expect(printed).toContain('Connected to Acme (key ...5678).')
    expect(printed).not.toContain('12345678')
  })

  it('hides typing in a terminal while the key question waits', async () => {
    const rawModes: Array<boolean> = []
    const { printed, saved } = await connect('sk-acme-x\u007fy-4321', (lines) =>
      Object.assign(stdinFrom(lines, { isTTY: true }), {
        setRawMode: (mode: boolean) => rawModes.push(mode),
      }),
    )
    expect(rawModes).toEqual([true, false])
    // Raw mode does not edit the line, so line mode applies the backspace.
    expect(saved).toEqual({ type: 'api_key', value: 'sk-acme-y-4321' })
    expect(printed).toContain('[? Paste your Acme API key (typing is hidden)]')
    expect(printed).not.toContain('sk-acme')
  })
})

describe('a host and a principal', () => {
  const acme = defineByokProvider({ id: 'acme', label: 'Acme' })

  it('uses the given host, leaves it open, and saves keys for the principal', async () => {
    const persistence = memoryPersistence()
    const host = createHarnessHost({ persistence })
    const close = vi.spyOn(host, 'close')
    const code = await runCli(
      defineHarness({
        name: 'test/host',
        adapter: scripted([]).adapter,
        plugins: () => [providerKeys({ providers: [acme] })],
      }),
      {
        argv: [],
        stdin: stdinFrom(['/connect acme\n', 'sk-ada\n', '/exit\n'], {
          isTTY: false,
        }),
        stdout: capture(),
        stderr: capture(),
        host,
        principal: { id: 'ada' },
      },
    )
    expect(code).toBe(EXIT.ok)
    expect(close).not.toHaveBeenCalled()
    const saved = (userId?: string) =>
      persistence.stores.credentials.get(
        { threadId: 'main', ...(userId ? { userId } : {}) },
        'acme',
      )
    expect(await saved('ada')).toEqual({ type: 'api_key', value: 'sk-ada' })
    expect(await saved()).toBeNull()
    await host.close()
  })

  it('opens the session as the principal', async () => {
    const { adapter } = scripted([textTurn('ok')])
    const seen: Array<string | undefined> = []
    const code = await runCli(
      defineHarness({
        name: 'test/principal',
        adapter,
        plugins: () => [
          definePlugin({
            name: 'test/whoami',
            setup: (ctx) => void seen.push(ctx.session.principal?.id),
          }),
        ],
      }),
      {
        argv: ['-p', 'hi'],
        stdout: capture(),
        stderr: capture(),
        persistence: memoryPersistence(),
        principal: { id: 'ada' },
      },
    )
    expect(code).toBe(EXIT.ok)
    expect(seen).toEqual(['ada'])
  })

  it('refuses a host and persistence together', async () => {
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const stderr = capture()
    const code = await runCli(
      defineHarness({ name: 'test/both', adapter: scripted([]).adapter }),
      {
        argv: ['-p', 'hi'],
        stdout: capture(),
        stderr,
        host,
        persistence: memoryPersistence(),
      },
    )
    expect(code).toBe(EXIT.failed)
    expect(stderr.text).toContain('host or persistence')
    await host.close()
  })

  it('serves as the principal', async () => {
    const persistence = memoryPersistence()
    const host = createHarnessHost({ persistence })
    const server = await serve({
      host,
      harness: defineHarness({
        name: 'test/serve-principal',
        adapter: scripted([]).adapter,
        plugins: () => [providerKeys({ providers: [acme] })],
        expose: { commands: ['connect:acme'] },
      }),
      port: 0,
      hostname: '127.0.0.1',
      token: 'secret',
      principal: { id: 'ada' },
    })
    try {
      const control = (input: unknown) =>
        fetch(`${server.url}/control`, {
          method: 'POST',
          headers: {
            authorization: 'Bearer secret',
            'content-type': 'application/json',
          },
          body: JSON.stringify({ threadId: 't', input }),
        })
      await control({ op: 'command', name: 'connect:acme' })
      const question = await vi.waitFor(async () => {
        const snapshot = await fetch(`${server.url}/snapshot?threadId=t`, {
          headers: { authorization: 'Bearer secret' },
        })
        const [pending] = (await snapshot.json()).pendingQuestions
        expect(pending).toBeDefined()
        return pending
      })
      await control({
        op: 'answer',
        questionId: question.questionId,
        value: 'sk-ada',
      })
      await vi.waitFor(async () =>
        expect(
          await persistence.stores.credentials.get(
            { threadId: 't', userId: 'ada' },
            'acme',
          ),
        ).toEqual({ type: 'api_key', value: 'sk-ada' }),
      )
    } finally {
      await server.close()
      await host.close()
    }
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

  it('serves the harness as an MCP server at /mcp behind the same token', async () => {
    const { adapter } = scripted([])
    const harness = defineHarness({ name: 'test/serve-mcp', adapter })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const server = await serve({
      host,
      harness,
      port: 0,
      hostname: '127.0.0.1',
      token: 'secret',
    })
    const initialize = (headers: Record<string, string>) =>
      fetch(`${server.url}/mcp`, {
        method: 'POST',
        headers: {
          ...headers,
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-11-25',
            capabilities: {},
            clientInfo: { name: 'raw', version: '1.0.0' },
          },
        }),
      })
    try {
      const denied = await initialize({})
      expect(denied.status).toBe(401)
      const answered = await initialize({ authorization: 'Bearer secret' })
      expect(answered.status).toBe(200)
      expect((await answered.json()).result.serverInfo.name).toBe(
        'test/serve-mcp',
      )
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
