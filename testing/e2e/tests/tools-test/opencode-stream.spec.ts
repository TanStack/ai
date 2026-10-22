import { createServer } from 'node:http'
import type { ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { chat, defineChatMiddleware } from '@tanstack/ai'
import type { StreamChunk } from '@tanstack/ai'
import { opencodeText } from '@tanstack/ai-opencode'
import { provideSandbox, SandboxCapability } from '@tanstack/ai-sandbox'
import type { SandboxHandle, SpawnHandle } from '@tanstack/ai-sandbox'
import { expect, test } from '@playwright/test'

const MODEL = 'anthropic/claude-sonnet-4-5'

const assistantMessage = {
  id: 'assistant-message',
  sessionID: 'session-1',
  role: 'assistant',
  finish: 'stop',
  tokens: { input: 2, output: 2 },
}

const opencodeEvents = [
  {
    type: 'message.part.updated',
    properties: {
      part: {
        id: 'user-part',
        sessionID: 'session-1',
        messageID: 'user-message',
        type: 'text',
        text: 'user prompt',
      },
      delta: 'user prompt',
    },
  },
  {
    type: 'message.updated',
    properties: {
      info: { id: 'user-message', sessionID: 'session-1', role: 'user' },
    },
  },
  {
    type: 'message.part.updated',
    properties: {
      part: {
        id: 'assistant-part',
        sessionID: 'session-1',
        messageID: 'assistant-message',
        type: 'text',
        text: 'assistant answer',
      },
      delta: 'assistant answer',
    },
  },
  {
    type: 'message.updated',
    properties: {
      info: assistantMessage,
    },
  },
  {
    type: 'message.part.updated',
    properties: {
      part: {
        id: 'tool-part',
        sessionID: 'session-1',
        messageID: 'assistant-message',
        type: 'tool',
        callID: 'call-1',
        tool: 'bash',
        state: { status: 'pending', input: {} },
      },
    },
  },
  {
    type: 'message.part.updated',
    properties: {
      part: {
        id: 'tool-part',
        sessionID: 'session-1',
        messageID: 'assistant-message',
        type: 'tool',
        callID: 'call-1',
        tool: 'bash',
        state: { status: 'running', input: { command: 'ls' } },
      },
    },
  },
  {
    type: 'message.part.updated',
    properties: {
      part: {
        id: 'tool-part',
        sessionID: 'session-1',
        messageID: 'assistant-message',
        type: 'tool',
        callID: 'call-1',
        tool: 'bash',
        state: {
          status: 'completed',
          input: { command: 'ls' },
          output: 'file.txt',
        },
      },
    },
  },
]

async function createMockOpenCodeServer(): Promise<{
  url: string
  close: () => Promise<void>
}> {
  let eventStream: ServerResponse | undefined
  let resolveEventStream: () => void = () => {}
  const eventStreamReady = new Promise<void>((resolve) => {
    resolveEventStream = resolve
  })

  const server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
    if (request.method === 'POST' && pathname === '/session') {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ id: 'session-1' }))
      return
    }

    if (request.method === 'GET' && pathname === '/event') {
      response.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      })
      eventStream = response
      resolveEventStream()
      return
    }

    if (
      request.method === 'POST' &&
      pathname === '/session/session-1/message'
    ) {
      void (async () => {
        await eventStreamReady
        for (const event of opencodeEvents) {
          eventStream?.write(`data: ${JSON.stringify(event)}\n\n`)
        }
        eventStream?.end()
        await new Promise((resolve) => setTimeout(resolve, 50))
        response.writeHead(200, { 'Content-Type': 'application/json' })
        response.end(
          JSON.stringify({
            info: assistantMessage,
            parts: [
              {
                id: 'assistant-part',
                sessionID: 'session-1',
                messageID: 'assistant-message',
                type: 'text',
                text: 'assistant answer',
              },
            ],
          }),
        )
      })()
      return
    }

    response.writeHead(404)
    response.end()
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address() as AddressInfo
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      }),
  }
}

async function* output(values: Array<string>): AsyncIterable<string> {
  yield* values
}

function mockSandbox(url: string): SandboxHandle {
  const spawnHandle: SpawnHandle = {
    pid: 1,
    stdout: output(['opencode server listening on http://127.0.0.1:4096\n']),
    stderr: output([]),
    stdin: { write: async () => {}, end: async () => {} },
    wait: async () => 0,
    kill: async () => {},
  }

  return {
    id: 'opencode-e2e',
    provider: 'opencode-e2e',
    capabilities: {} as SandboxHandle['capabilities'],
    fs: {} as SandboxHandle['fs'],
    git: {} as SandboxHandle['git'],
    process: {
      exec: async () => {
        throw new Error('Unexpected process.exec call')
      },
      spawn: async () => spawnHandle,
    },
    ports: { connect: async () => ({ url }) },
    env: { set: async () => {} },
    destroy: async () => {},
  }
}

test('filters user parts and waits for tool input before streaming a tool call', async () => {
  const mockServer = await createMockOpenCodeServer()
  const sandbox = mockSandbox(mockServer.url)
  const provideTestSandbox = defineChatMiddleware({
    name: 'opencode-e2e-sandbox',
    provides: [SandboxCapability],
    setup(ctx) {
      provideSandbox(ctx, sandbox)
    },
  })

  try {
    const chunks: Array<StreamChunk> = []
    for await (const chunk of chat({
      adapter: opencodeText(MODEL),
      middleware: [provideTestSandbox],
      messages: [{ role: 'user', content: 'user prompt' }],
    })) {
      chunks.push(chunk)
    }

    expect(
      chunks
        .filter((chunk) => chunk.type === 'TEXT_MESSAGE_CONTENT')
        .map((chunk) => chunk.delta),
    ).toEqual(['assistant answer'])
    expect(
      chunks.filter((chunk) => chunk.type === 'TOOL_CALL_START'),
    ).toHaveLength(1)
    expect(
      chunks
        .filter((chunk) => chunk.type === 'TOOL_CALL_ARGS')
        .map((chunk) => chunk.delta),
    ).toEqual([JSON.stringify({ command: 'ls' })])
    expect(
      chunks.find((chunk) => chunk.type === 'TOOL_CALL_RESULT'),
    ).toMatchObject({ content: 'file.txt' })
  } finally {
    await mockServer.close()
  }
})
