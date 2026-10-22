import { PassThrough } from 'node:stream'
import { memoryCredentialStore } from '@tanstack/ai/byok/server'
import { describe, expect, it, vi } from 'vitest'
import { defineAgent, toolDefinition } from '@tanstack/ai'
import { z } from 'zod'
import {
  configOption,
  createHarnessHost,
  defineCommand,
  defineHarness,
  definePlugin,
  durableTool,
  membersOnly,
} from '@tanstack/ai-harness'
import { question as questionTool } from '@tanstack/ai-harness/plugins'
import { createMCPClient } from '@tanstack/ai-mcp'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { EXIT, parseCliArgs, runCli } from '../src'
import { serve } from '../src/serve'
import {
  asStdin,
  capture,
  gate,
  heldTurn,
  scripted,
  stdinFrom,
  textTurn,
  toolTurn,
} from './helpers'
import type { AnyHarness } from '@tanstack/ai-harness'

/** `/connect acme` asks for a key as a secret question, then saves it. */
const acmeKeys = definePlugin({
  name: 'test/acme-keys',
  setup: () => ({
    commands: {
      'connect:acme': defineCommand({
        description: 'Save an Acme API key',
        run: async (_input, { credentials, step }) => {
          const key = await step.ask({
            name: 'key',
            message: 'Paste your Acme API key',
            schema: z.string(),
            secret: true,
          })
          await credentials.set({
            id: 'acme',
            credential: { type: 'api_key', value: key },
          })
          return `Connected to Acme (key ...${key.slice(-4)}).`
        },
      }),
    },
  }),
})

const olga = { id: 'olga' }
const cid = { id: 'cid' }
const users = new Map([olga, cid].map((user) => [user.id, user]))

/** A membersOnly() host whose users come from the `x-user` header. */
function accessHost() {
  return createHarnessHost({
    persistence: memoryPersistence(),
    access: {
      getUser: ({ request }) =>
        users.get(request.headers.get('x-user') ?? '') ?? null,
      rules: membersOnly(),
    },
  })
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

  it('exits 3 when the turn waits for an approval', async () => {
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
    expect(EXIT.needsAction).toBe(3)
    expect(stderr.text).toContain('approval')
  })

  it('exits 3 when the turn waits for the answer to a question', async () => {
    const { adapter } = scripted([toolTurn('greet', '{}')])
    const greet = durableTool(
      toolDefinition({
        name: 'greet',
        description: 'Ask the user for a name',
        inputSchema: z.object({}),
      }),
      async (_args, { step }) => {
        const name = await step.ask({
          name: 'name',
          message: 'Name?',
          schema: z.string(),
        })
        return `Hello, ${name}.`
      },
    )
    const stderr = capture()
    const code = await runCli(
      defineHarness({ name: 'test/print-question', adapter, tools: [greet] }),
      {
        argv: ['-p', 'greet me'],
        stdout: capture(),
        stderr,
        persistence: memoryPersistence(),
      },
    )
    expect(code).toBe(EXIT.needsAction)
    expect(stderr.text).toContain('an answer: Name?')
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

describe('line mode in a terminal', () => {
  /** Line mode on a terminal that the test types into. */
  function terminal(harness: AnyHarness) {
    const input = new PassThrough()
    const stdout = capture()
    const exit = runCli(harness, {
      argv: [],
      stdin: asStdin(input, { isTTY: true }),
      stdout,
      stderr: capture(),
      persistence: memoryPersistence(),
    })
    return {
      stdout,
      type: (text: string) => input.write(`${text}\n`),
      shows: (text: string) =>
        vi.waitFor(() => expect(stdout.text).toContain(text)),
      quit: () => {
        input.end('/exit\n')
        return exit
      },
    }
  }

  it('cancels the running turn at once with /cancel', async () => {
    // Never opened: only the cancel can end this turn.
    const release = gate()
    const { adapter } = scripted([heldTurn('Working on it.', release.opened)])
    const cli = terminal(defineHarness({ name: 'test/cancel', adapter }))
    cli.type('write a long story')
    await cli.shows('Working on it.')
    cli.type('/cancel')
    await cli.shows('Cancelled.')
    expect(await cli.quit()).toBe(EXIT.ok)
  })

  it('sends a line typed while a turn runs as a steer that the turn sees', async () => {
    const release = gate()
    const { adapter, seen } = scripted([
      heldTurn('Working on it.', release.opened),
      textTurn('Checked the logs too.'),
    ])
    const joined: Array<unknown> = []
    const cli = terminal(
      defineHarness({
        name: 'test/steer',
        adapter,
        turn: {
          canJoin: (candidate) => {
            joined.push(candidate.message)
            return true
          },
        },
      }),
    )
    cli.type('fix the bug')
    await cli.shows('Working on it.')
    cli.type('also check the logs')
    // The steer waits for the next model call of the running turn.
    cli.type('/status')
    await cli.shows('Queued turns: 1.')
    release.open()
    await cli.shows('Checked the logs too.')
    expect(await cli.quit()).toBe(EXIT.ok)
    expect(joined).toEqual(['also check the logs'])
    expect(seen[1]?.at(-1)).toMatchObject({
      role: 'user',
      content: 'also check the logs',
    })
  })

  it('asks for an approval once, and the next line answers it', async () => {
    const remove = vi.fn(async () => 'removed')
    const { adapter } = scripted([
      toolTurn('remove', '{}'),
      textTurn('Done removing.'),
    ])
    const cli = terminal(
      defineHarness({
        name: 'test/approve',
        adapter,
        tools: [
          toolDefinition({
            name: 'remove',
            description: 'Remove',
            needsApproval: true,
          }).server(remove),
        ],
      }),
    )
    cli.type('remove the file')
    await cli.shows('[y/n]')
    cli.type('y')
    await cli.shows('Done removing.')
    expect(await cli.quit()).toBe(EXIT.ok)
    expect(remove).toHaveBeenCalledTimes(1)
    expect(cli.stdout.text.split('[y/n]')).toHaveLength(2)
  })
})

describe('waits in line mode', () => {
  it('answers a question of the question tool by its schema', async () => {
    const { adapter, seen } = scripted([
      toolTurn(
        'question',
        JSON.stringify({
          questions: [
            {
              question: 'Which database?',
              options: [{ label: 'Postgres' }, { label: 'SQLite' }],
            },
          ],
        }),
      ),
      textTurn('Picked.'),
    ])
    const stdout = capture()
    const code = await runCli(
      defineHarness({
        name: 'test/lines-question',
        adapter,
        plugins: () => [questionTool()],
      }),
      {
        argv: [],
        stdin: stdinFrom(['ask me\n', 'SQLite\n', '/exit\n'], {
          isTTY: false,
        }),
        stdout,
        stderr: capture(),
        persistence: memoryPersistence(),
      },
    )
    expect(code).toBe(EXIT.ok)
    expect(stdout.text).toContain('? Which database?')
    expect(stdout.text).toContain('Picked.')
    expect(JSON.stringify(seen[1])).toContain('SQLite')
  })
})

describe('plugin commands in line mode', () => {
  it('runs plugin commands, answers questions, and changes settings', async () => {
    const tools = definePlugin({
      name: 'test/tools',
      setup: () => ({
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
            run: async (_input, { step }) => {
              const sure = await step.ask({
                name: 'sure',
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
  /** Run `/connect acme` and answer with `key`. Returns what was printed and saved. */
  async function connect(
    key: string,
    stdin: (lines: Array<string>) => NodeJS.ReadStream,
  ) {
    const stdout = capture()
    const persistence = memoryPersistence()
    const credentials = memoryCredentialStore()
    await runCli(
      defineHarness({
        name: 'test/secret',
        adapter: scripted([]).adapter,
        plugins: () => [acmeKeys],
      }),
      {
        argv: [],
        stdin: stdin(['/connect acme\n', `${key}\n`, '/exit\n']),
        stdout,
        stderr: capture(),
        persistence,
        credentials,
      },
    )
    const saved = await credentials.get({
      scope: { threadId: 'main' },
      id: 'acme',
    })
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

describe('a host and a user', () => {
  it('uses the given host, leaves it open, and saves keys for the user', async () => {
    const persistence = memoryPersistence()
    const credentials = memoryCredentialStore()
    const host = createHarnessHost({ persistence, credentials })
    const close = vi.spyOn(host, 'close')
    const code = await runCli(
      defineHarness({
        name: 'test/host',
        adapter: scripted([]).adapter,
        plugins: () => [acmeKeys],
      }),
      {
        argv: [],
        stdin: stdinFrom(['/connect acme\n', 'sk-ada\n', '/exit\n'], {
          isTTY: false,
        }),
        stdout: capture(),
        stderr: capture(),
        host,
        user: { id: 'ada' },
      },
    )
    expect(code).toBe(EXIT.ok)
    expect(close).not.toHaveBeenCalled()
    const saved = (userId?: string) =>
      credentials.get({
        scope: { threadId: 'main', ...(userId ? { userId } : {}) },
        id: 'acme',
      })
    expect(await saved('ada')).toEqual({ type: 'api_key', value: 'sk-ada' })
    expect(await saved()).toBeNull()
    await host.close()
  })

  it('opens the session as the user', async () => {
    const { adapter } = scripted([textTurn('ok')])
    const seen: Array<string | undefined> = []
    const code = await runCli(
      defineHarness({
        name: 'test/user',
        adapter,
        plugins: () => [
          definePlugin({
            name: 'test/whoami',
            setup: (ctx) => void seen.push(ctx.session.user?.id),
          }),
        ],
      }),
      {
        argv: ['-p', 'hi'],
        stdout: capture(),
        stderr: capture(),
        persistence: memoryPersistence(),
        user: { id: 'ada' },
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
    expect(stderr.text).toContain('not both')
    await host.close()
  })

  it('serves as the user', async () => {
    const persistence = memoryPersistence()
    const credentials = memoryCredentialStore()
    const host = createHarnessHost({ persistence, credentials })
    const server = await serve({
      host,
      harness: defineHarness({
        name: 'test/serve-user',
        adapter: scripted([]).adapter,
        plugins: () => [acmeKeys],
        expose: { commands: ['connect:acme'] },
      }),
      port: 0,
      hostname: '127.0.0.1',
      token: 'secret',
      user: { id: 'ada' },
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
        const [pending] = (await snapshot.json()).pendingWaits
        expect(pending).toBeDefined()
        return pending
      })
      await control({
        op: 'answer',
        questionId: question.waitId,
        value: 'sk-ada',
      })
      await vi.waitFor(async () =>
        expect(
          await credentials.get({
            scope: { threadId: 't', userId: 'ada' },
            id: 'acme',
          }),
        ).toEqual({ type: 'api_key', value: 'sk-ada' }),
      )
    } finally {
      await server.close()
      await host.close()
    }
  })

  it('serves /mcp as the user', async () => {
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const server = await serve({
      host,
      harness: defineHarness({
        name: 'test/serve-mcp',
        adapter: scripted([textTurn('ok')]).adapter,
      }),
      port: 0,
      hostname: '127.0.0.1',
      token: 'secret',
      user: { id: 'ada' },
    })
    const client = await createMCPClient({
      transport: {
        type: 'http',
        url: `${server.url}/mcp`,
        headers: { authorization: 'Bearer secret' },
      },
    })
    try {
      await client.callTool('chat', { threadId: 't-mcp', message: 'hi' })

      expect(await host.sessions.get({ threadId: 't-mcp' })).toMatchObject({
        members: [{ userId: 'ada', role: 'owner' }],
      })
    } finally {
      await client.close()
      await server.close()
      await host.close()
    }
  })

  it('passes the user to --acp, so a host with access starts', async () => {
    const host = accessHost()
    // The agent reads process.stdin. Ending it ends the agent.
    const ends: Array<() => void> = []
    const on = vi
      .spyOn(process.stdin, 'on')
      .mockImplementation((event: string | symbol, listener: () => void) => {
        if (event === 'end') ends.push(listener)
        return process.stdin
      })
    const stderr = capture()
    try {
      const running = runCli(
        defineHarness({ name: 'test/acp', adapter: scripted([]).adapter }),
        { argv: ['--acp'], stdout: capture(), stderr, host, user: olga },
      )
      await vi.waitFor(() => expect(ends).toHaveLength(1))
      for (const end of ends) end()

      expect(await running).toBe(EXIT.ok)
      expect(stderr.text).toBe('')
    } finally {
      on.mockRestore()
      await host.close()
    }
  })

  it('refuses --mcp on a host with access, as stdio has no login', async () => {
    const host = accessHost()
    const stderr = capture()

    const code = await runCli(
      defineHarness({ name: 'test/mcp', adapter: scripted([]).adapter }),
      { argv: ['--mcp'], stdout: capture(), stderr, host, user: olga },
    )

    expect(code).toBe(EXIT.failed)
    expect(stderr.text).toBe(
      '--mcp serves over stdio, which has no login, so it cannot use a host with access. Give runCli a host without access, and the local user as the user option.\n',
    )
    await host.close()
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

  it('signs media URLs with --media-key, never with the token', async () => {
    expect(parseCliArgs(['--serve', '--media-key', 'k'])).toMatchObject({
      mediaKey: 'k',
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const start = (mediaKey?: string) =>
      serve({
        host,
        harness: defineHarness({
          name: 'test/serve-key',
          adapter: scripted([]).adapter,
        }),
        port: 0,
        hostname: '127.0.0.1',
        token: 'secret',
        ...(mediaKey !== undefined ? { mediaKey } : {}),
      })

    // The key is checked: a short one is refused at the start.
    await expect(start('short')).rejects.toThrow('Media signing key 0 is 5')
    // A short token is fine: it does not sign anything.
    const server = await start()
    await server.close()
    await host.close()
  })

  it('reads the user of each request with getUser on a host with access, behind the token', async () => {
    const host = accessHost()
    const server = await serve({
      host,
      harness: defineHarness({
        name: 'test/serve-access',
        adapter: scripted([textTurn('ok')]).adapter,
      }),
      port: 0,
      hostname: '127.0.0.1',
      token: 'secret',
    })
    const call = (path: string, headers: Record<string, string>) =>
      fetch(`${server.url}/${path}`, { headers })
    const prompt = (headers: Record<string, string>) =>
      fetch(`${server.url}/control`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...headers },
        body: JSON.stringify({
          threadId: 't1',
          input: { op: 'prompt', message: 'hi' },
        }),
      })
    const token = { authorization: 'Bearer secret' }
    try {
      expect((await prompt({ ...token, 'x-user': 'olga' })).status).toBe(200)

      const noToken = await call('transcript?threadId=t1', { 'x-user': 'olga' })
      expect(noToken.status).toBe(401)
      const noUser = await call('transcript?threadId=t1', token)
      expect(noUser.status).toBe(401)
      const stranger = await call('transcript?threadId=t1', {
        ...token,
        'x-user': 'cid',
      })
      expect(stranger.status).toBe(403)
      expect(
        await host.sessions.get({ threadId: 't1', user: olga }),
      ).toMatchObject({ members: [{ userId: 'olga', role: 'owner' }] })
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

  it('changes the thread settings and resets the context from the ui view', async () => {
    const harness = defineHarness({
      name: 'test/ui-actions',
      adapter: scripted([]).adapter,
    })
    const host = createHarnessHost({ persistence: memoryPersistence() })
    let errors: Array<string> = []
    try {
      const code = await runCli(harness, {
        argv: [],
        stdin: stdinFrom([], { isTTY: true }),
        stdout: capture(),
        stderr: capture(),
        host,
        ui: async (view) => {
          await view.updateThreadSettings({
            settings: { instructions: 'Answer in French.' },
          })
          await view.reset({ note: 'Start over.' })
          errors = view.store
            .get()
            .messages.flatMap((message) =>
              message.role === 'notice' && message.kind === 'error'
                ? [message.text]
                : [],
            )
        },
      })
      const session = await host.open(harness, { threadId: 'main' })
      await session.whenIdle()

      expect(code).toBe(EXIT.ok)
      expect(errors).toEqual([])
      expect(session.threadSettings()).toEqual({
        instructions: 'Answer in French.',
      })
      expect(await session.transcript()).toMatchObject([
        {
          role: 'user',
          content: 'Start over.',
          metadata: { harness: { reset: { note: 'Start over.' } } },
        },
      ])
    } finally {
      await host.close()
    }
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
