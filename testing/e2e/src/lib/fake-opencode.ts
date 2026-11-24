import { createServer } from 'node:http'
import { defineSandbox, defineWorkspace } from '@tanstack/ai-sandbox'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import type {
  SandboxHandle,
  SandboxProvider,
  SpawnHandle,
} from '@tanstack/ai-sandbox'

/**
 * A fake `opencode serve` for the e2e app. It answers the parts of the
 * OpenCode HTTP API that `@tanstack/ai-opencode` uses, with the event shapes
 * of OpenCode 1.19.6:
 *
 * - `text`: the answer `ONE` streams as two `message.part.delta` events. The
 *   prompt response comes first. The last `message.part.updated` and
 *   `session.idle` come 20 ms later.
 * - `permission`: the agent asks to run `echo one` with `permission.asked`,
 *   and waits up to 5 s for the reply.
 *
 * Provider-free: no model and no `opencode` binary (exempt from aimock).
 */
export type FakeOpencodeMode = 'text' | 'permission'

const SESSION_ID = 'ses-e2e'
const MESSAGE_ID = 'msg-e2e'
const PART_ID = 'prt-e2e'
const PERMISSION_ID = 'per-e2e'

function json(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(body))
}

async function readBody(req: IncomingMessage): Promise<unknown> {
  let text = ''
  for await (const chunk of req) text += String(chunk)
  return text === '' ? undefined : JSON.parse(text)
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Start a fake OpenCode server on a free port. `onReply` gets the reply to
 * the permission request of the `permission` mode.
 */
async function startFakeOpencode(
  mode: FakeOpencodeMode,
  onReply: (reply: string) => void,
) {
  const subscribers = new Set<ServerResponse>()
  let subscribed: () => void = () => undefined
  const firstSubscriber = new Promise<void>((resolve) => {
    subscribed = resolve
  })
  let answer: (reply: string | undefined) => void = () => undefined
  const replied = new Promise<string | undefined>((resolve) => {
    answer = resolve
  })

  const emit = (type: string, properties: Record<string, unknown>) => {
    const line = `data: ${JSON.stringify({ type, properties })}\n\n`
    for (const res of subscribers) res.write(line)
  }
  const textPart = (text: string) => ({
    part: {
      id: PART_ID,
      sessionID: SESSION_ID,
      messageID: MESSAGE_ID,
      type: 'text',
      text,
    },
  })
  const assistant = {
    id: MESSAGE_ID,
    sessionID: SESSION_ID,
    role: 'assistant',
    finish: 'stop',
    tokens: { input: 1, output: 1, reasoning: 0, cache: { read: 0, write: 0 } },
    cost: 0,
  }

  async function prompt(res: ServerResponse) {
    // The adapter subscribes before it prompts. Wait for the stream to open.
    await firstSubscriber
    emit('message.updated', { info: assistant })
    if (mode === 'text') {
      emit('message.part.updated', textPart(''))
      for (const delta of ['ON', 'E']) {
        emit('message.part.delta', {
          sessionID: SESSION_ID,
          messageID: MESSAGE_ID,
          partID: PART_ID,
          field: 'text',
          delta,
        })
      }
      json(res, 200, { info: assistant, parts: [textPart('ONE').part] })
      await wait(20)
      emit('message.part.updated', textPart('ONE'))
      emit('session.idle', { sessionID: SESSION_ID })
      return
    }
    emit('permission.asked', {
      id: PERMISSION_ID,
      sessionID: SESSION_ID,
      permission: 'bash',
      patterns: ['echo one'],
      metadata: { command: 'echo one' },
      always: ['echo *'],
      tool: { messageID: MESSAGE_ID, callID: 'call-e2e' },
    })
    await Promise.race([replied, wait(5_000)])
    json(res, 200, { info: assistant, parts: [] })
    emit('session.idle', { sessionID: SESSION_ID })
  }

  const server = createServer((req, res) => {
    void (async () => {
      const path = (req.url ?? '/').split('?')[0]
      if (req.method === 'GET' && path === '/event') {
        res.writeHead(200, { 'content-type': 'text/event-stream' })
        res.write(
          `data: ${JSON.stringify({ type: 'server.connected', properties: {} })}\n\n`,
        )
        subscribers.add(res)
        req.on('close', () => subscribers.delete(res))
        subscribed()
        return
      }
      if (req.method === 'POST' && path === '/session') {
        json(res, 200, { id: SESSION_ID, title: 'e2e', version: '1.19.6' })
        return
      }
      if (req.method === 'POST' && path === `/session/${SESSION_ID}/message`) {
        await prompt(res)
        return
      }
      const reply = `/session/${SESSION_ID}/permissions/${PERMISSION_ID}`
      if (req.method === 'POST' && path === reply) {
        const body = await readBody(req)
        const response =
          typeof body === 'object' &&
          body !== null &&
          'response' in body &&
          typeof body.response === 'string'
            ? body.response
            : undefined
        if (response !== undefined) onReply(response)
        answer(response)
        json(res, 200, true)
        return
      }
      if (req.method === 'POST' && path === `/session/${SESSION_ID}/abort`) {
        json(res, 200, true)
        return
      }
      json(res, 404, { name: 'NotFoundError' })
    })()
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => {
      for (const res of subscribers) res.end()
      server.close()
    },
  }
}

/**
 * A sandbox whose `opencode serve` is the fake server above. `reply()` gives
 * the reply that the adapter sent to the permission request, if any.
 */
export function fakeOpencodeSandbox(mode: FakeOpencodeMode) {
  let reply: string | undefined
  let server: Awaited<ReturnType<typeof startFakeOpencode>> | undefined

  const handle = (id: string): SandboxHandle => ({
    id,
    provider: 'fake-opencode',
    capabilities: {
      fs: true,
      exec: true,
      env: true,
      ports: true,
      backgroundProcesses: true,
      writableStdin: false,
      killableProcesses: true,
      snapshots: false,
      networkPolicy: false,
      durableFilesystem: false,
      fork: false,
    },
    fs: {
      read: () => Promise.resolve(''),
      readBytes: () => Promise.resolve(new Uint8Array()),
      write: () => Promise.resolve(),
      list: () => Promise.resolve([]),
      mkdir: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      rename: () => Promise.resolve(),
      exists: () => Promise.resolve(false),
    },
    git: {
      clone: () => Promise.resolve(),
      status: () => Promise.resolve(''),
      add: () => Promise.resolve(),
      commit: () => Promise.resolve(),
      push: () => Promise.resolve(),
      pull: () => Promise.resolve(),
      branch: () => Promise.resolve('main'),
    },
    process: {
      exec: () => Promise.resolve({ stdout: '', stderr: '', exitCode: 0 }),
      spawn: async (command): Promise<SpawnHandle> => {
        if (!command.startsWith('opencode serve')) {
          throw new Error(`not supported: ${command}`)
        }
        const started = await startFakeOpencode(mode, (value) => {
          reply = value
        })
        server = started
        return {
          pid: 1,
          stdout: (async function* () {
            yield `opencode server listening on ${started.url}\n`
          })(),
          stderr: (async function* () {})(),
          stdin: {
            write: () => Promise.resolve(),
            end: () => Promise.resolve(),
          },
          wait: () => Promise.resolve(0),
          kill: () => {
            started.close()
            return Promise.resolve()
          },
        }
      },
    },
    ports: {
      connect: () =>
        server
          ? Promise.resolve({ url: server.url })
          : Promise.reject(
              new Error('the fake opencode server is not running'),
            ),
    },
    env: { set: () => Promise.resolve() },
    destroy: () => {
      server?.close()
      return Promise.resolve()
    },
  })

  const provider: SandboxProvider = {
    name: 'fake-opencode',
    capabilities: () => handle('probe').capabilities,
    create: (input) => Promise.resolve(handle(input.id ?? 'fake-opencode')),
    resume: (input) => Promise.resolve(handle(input.id)),
    destroy: () => Promise.resolve(),
  }

  return {
    sandbox: defineSandbox({
      id: 'opencode-e2e',
      provider,
      workspace: defineWorkspace({ source: { type: 'none' } }),
      fileEvents: false,
    }),
    reply: () => reply,
  }
}
