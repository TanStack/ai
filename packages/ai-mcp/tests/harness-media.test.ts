import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, sep } from 'node:path'
import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client'
import { EventType, defineAgent } from '@tanstack/ai'
import { createHarnessHost, defineHarness } from '@tanstack/ai-harness'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createHarnessMcpServer } from '../src/harness'
import type {
  AnyTextAdapter,
  ImageAdapter,
  ModelMessage,
  StreamChunk,
} from '@tanstack/ai'
import type { AnyHarness } from '@tanstack/ai-harness'
import type { HarnessMcpServerOptions } from '../src/harness'

const serverUrl = new URL('https://harness.example.com/mcp')
const now = () => Date.now()
/** The bytes "hello", and their base64. */
const hello = new TextEncoder().encode('hello')
const helloBase64 = 'aGVsbG8='
/** One byte over the 5 MB inline limit. */
const bigImage = new Uint8Array(5 * 1024 * 1024 + 1)

const mediaListShape = z.object({
  media: z.array(z.object({ id: z.string(), uri: z.string() })),
})
const linkShape = z.object({ uri: z.string() })

function textTurn(text: string): Array<StreamChunk> {
  return [
    {
      type: EventType.RUN_STARTED,
      runId: 'r',
      threadId: 't',
      timestamp: now(),
    },
    {
      type: EventType.TEXT_MESSAGE_START,
      messageId: `m-${text}`,
      role: 'assistant',
      timestamp: now(),
    },
    {
      type: EventType.TEXT_MESSAGE_CONTENT,
      messageId: `m-${text}`,
      delta: text,
      timestamp: now(),
    },
    {
      type: EventType.TEXT_MESSAGE_END,
      messageId: `m-${text}`,
      timestamp: now(),
    },
    {
      type: EventType.RUN_FINISHED,
      runId: 'r',
      threadId: 't',
      timestamp: now(),
      metadata: { tanstack: { finishReason: 'stop' } },
    },
  ]
}

/** One model call that calls the tool `name` with no input. */
function toolCallTurn(name: string): Array<StreamChunk> {
  return [
    {
      type: EventType.RUN_STARTED,
      runId: 'r',
      threadId: 't',
      timestamp: now(),
    },
    {
      type: EventType.TOOL_CALL_START,
      toolCallId: 'call-0',
      toolCallName: name,
      timestamp: now(),
    },
    {
      type: EventType.TOOL_CALL_ARGS,
      toolCallId: 'call-0',
      delta: '{}',
      timestamp: now(),
    },
    { type: EventType.TOOL_CALL_END, toolCallId: 'call-0', timestamp: now() },
    {
      type: EventType.RUN_FINISHED,
      runId: 'r',
      threadId: 't',
      timestamp: now(),
      metadata: { tanstack: { finishReason: 'tool_calls' } },
    },
  ]
}

/** A model that plays `turns` in order and keeps the messages of each call. */
function scripted(turns: Array<Array<StreamChunk>> = []) {
  const calls: Array<Array<ModelMessage>> = []
  const adapter: AnyTextAdapter = {
    kind: 'text',
    name: 'mock',
    model: 'mock',
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
    structuredOutput: async () => ({ data: {}, rawText: '{}' }),
    chatStream: (options) => {
      const turn = turns[calls.length] ?? textTurn('ok')
      calls.push(options.messages)
      return (async function* () {
        yield* turn
      })()
    },
  }
  return { adapter, calls }
}

/** An image model that returns `bytes` as one image. */
function imageModel(bytes: Uint8Array): ImageAdapter<string> {
  return {
    kind: 'image',
    name: 'fake-image',
    model: 'fake-image-model',
    '~types': {
      providerOptions: {},
      modelProviderOptionsByName: {},
      modelSizeByName: {},
      modelInputModalitiesByName: {},
    },
    generateImages: async () => ({
      id: 'image-1',
      model: 'fake-image-model',
      images: [{ b64Json: Buffer.from(bytes).toString('base64') }],
    }),
  }
}

/** An agent that paints one image with `bytes`. */
function painter(bytes: Uint8Array) {
  return defineAgent({
    name: 'painter',
    description: 'Paints',
    run: async (ctx) => {
      await ctx.generateImage({ adapter: imageModel(bytes), prompt: 'a cat' })
      return 'painted'
    },
  })
}

const cleanups: Array<() => Promise<unknown>> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

type ServerOptions = Omit<HarnessMcpServerOptions, 'host' | 'harness'>

/** A real MCP client (spec 2026) on a harness MCP server. */
async function serve(harness: AnyHarness, options: ServerOptions = {}) {
  const host = createHarnessHost({ persistence: memoryPersistence() })
  cleanups.push(() => host.close())
  const server = await createHarnessMcpServer({ host, harness, ...options })
  const client = new Client(
    { name: 'tester', version: '1.0.0' },
    { versionNegotiation: { mode: { pin: '2026-07-28' } } },
  )
  const transport = new StreamableHTTPClientTransport(serverUrl, {
    fetch: async (input, init) => server.fetch(new Request(input, init)),
  })
  await client.connect(transport)
  cleanups.push(() => client.close())
  return client
}

/** A chat harness on an MCP server. `calls` has the messages of each model call. */
async function chatServer(options: ServerOptions = {}) {
  const model = scripted()
  const harness = defineHarness({
    name: 'test/mcp-media',
    adapter: model.adapter,
  })
  const client = await serve(harness, options)
  return { client, calls: model.calls }
}

function chat(client: Client, args: Record<string, unknown>) {
  return client.callTool({ name: 'chat', arguments: args })
}

/** The content of the last user message that a model call got. */
function userContent(messages: Array<ModelMessage> | undefined) {
  return messages?.findLast((message) => message.role === 'user')?.content
}

/** The MCP result of a tool call that threw an error with `message`. */
function toolError(message: string) {
  return { isError: true, content: [{ type: 'text', text: message }] }
}

/** The model content for the question "What is this?" with the image "hello". */
const helloImageQuestion = [
  { type: 'text', content: 'What is this?' },
  {
    type: 'image',
    source: { type: 'data', value: helloBase64, mimeType: 'image/png' },
  },
]

/**
 * A temp folder with `allowed/cat.png` ("hello"), `allowed/notes.xyz`, and
 * `outside/secret.png`.
 */
async function folders() {
  const root = await mkdtemp(join(tmpdir(), 'harness-mcp-media-'))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  const allowed = join(root, 'allowed')
  const outside = join(root, 'outside')
  await mkdir(allowed)
  await mkdir(outside)
  await writeFile(join(allowed, 'cat.png'), hello)
  await writeFile(join(allowed, 'notes.xyz'), 'notes')
  await writeFile(join(outside, 'secret.png'), 'secret')
  return { allowed, outside }
}

const outsideRefusal = (path: string) =>
  `Cannot read ${path}. It must be a file inside the folders this server may read.`

describe('chat attachments', () => {
  it('sends a data attachment to the model', async () => {
    const { client, calls } = await chatServer()

    await chat(client, {
      message: 'What is this?',
      attachments: [
        { data: helloBase64, mimeType: 'image/png', name: 'cat.png' },
      ],
    })

    expect(userContent(calls[0])).toEqual(helloImageQuestion)
  })

  it('sends a path attachment inside filePaths to the model', async () => {
    const { allowed } = await folders()
    const { client, calls } = await chatServer({ filePaths: [allowed] })

    await chat(client, {
      message: 'What is this?',
      attachments: [{ path: join(allowed, 'cat.png') }],
    })

    expect(userContent(calls[0])).toEqual(helloImageQuestion)
  })

  it.each([
    {
      given: "a '..' path out of filePaths",
      filePaths: true,
      // Not `join`: it would remove the '..'.
      path: (allowed: string) =>
        `${allowed}${sep}..${sep}outside${sep}secret.png`,
      refusal: outsideRefusal,
    },
    {
      given: 'a path when the server has no filePaths',
      filePaths: false,
      path: (allowed: string) => join(allowed, 'cat.png'),
      refusal: () =>
        'This server does not read files. Send the file as data or url.',
    },
    {
      given: 'a file type it does not know',
      filePaths: true,
      path: (allowed: string) => join(allowed, 'notes.xyz'),
      refusal: () =>
        'Unknown file type: notes.xyz. Send the file as data with its mimeType.',
    },
  ])('refuses $given', async ({ filePaths, path, refusal }) => {
    const { allowed } = await folders()
    const { client, calls } = await chatServer(
      filePaths ? { filePaths: [allowed] } : {},
    )

    const reply = await chat(client, {
      message: 'Read this',
      attachments: [{ path: path(allowed) }],
    })

    expect(reply).toMatchObject(toolError(refusal(path(allowed))))
    expect(calls).toEqual([])
  })

  it('refuses a path through a symlink out of filePaths', async (ctx) => {
    const { allowed, outside } = await folders()
    // A junction needs no admin rights on Windows. Other systems make a
    // normal symlink to the folder.
    const linked = await symlink(outside, join(allowed, 'link'), 'junction')
      .then(() => true)
      .catch(() => false)
    ctx.skip(!linked, 'This system cannot make a symlink.')
    const { client, calls } = await chatServer({ filePaths: [allowed] })
    const path = join(allowed, 'link', 'secret.png')

    const reply = await chat(client, {
      message: 'Read this',
      attachments: [{ path }],
    })

    expect(reply).toMatchObject(toolError(outsideRefusal(path)))
    expect(calls).toEqual([])
  })

  it('passes a url attachment to the model and does not fetch it', async () => {
    // A fetch fails, so the test never reaches the network.
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockRejectedValue(new Error('No network in this test.'))
    cleanups.push(async () => fetchSpy.mockRestore())
    const { client, calls } = await chatServer()

    await chat(client, {
      message: 'Look',
      attachments: [{ url: 'https://cdn.example.com/cat.png' }],
    })

    expect(userContent(calls[0])).toEqual([
      { type: 'text', content: 'Look' },
      {
        type: 'image',
        source: {
          type: 'url',
          value: 'https://cdn.example.com/cat.png',
          mimeType: 'image/png',
        },
      },
    ])
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('refuses a url when neither mimeType nor the path gives a kind', async () => {
    const { client, calls } = await chatServer()

    const reply = await chat(client, {
      message: 'Look',
      attachments: [{ url: 'https://example.com/download' }],
    })

    expect(reply).toMatchObject(
      toolError(
        'Cannot tell the kind of https://example.com/download. Add its mimeType.',
      ),
    )
    expect(calls).toEqual([])
  })

  it('returns the refusal of the media store as a tool error', async () => {
    const { client, calls } = await chatServer()

    const reply = await chat(client, {
      message: 'Open this',
      attachments: [{ data: helloBase64, mimeType: 'application/zip' }],
    })

    expect(reply).toMatchObject(
      toolError('Files of type application/zip are not supported.'),
    )
    expect(calls).toEqual([])
  })
})

describe('media in results', () => {
  it('chat returns a small image of the turn inline and lists it', async () => {
    const lead = scripted([toolCallTurn('painter'), textTurn('Here it is.')])
    const client = await serve(
      defineHarness({
        name: 'test/mcp-media',
        adapter: lead.adapter,
        subagents: { agents: [painter(hello)] },
      }),
    )

    const reply = await chat(client, { message: 'Paint a cat' })

    expect(reply.structuredContent).toEqual({
      status: 'completed',
      text: 'Here it is.',
      interrupts: [],
      questions: [],
      media: [
        {
          id: expect.any(String),
          kind: 'image',
          name: expect.any(String),
          mimeType: 'image/png',
          size: 5,
          uri: expect.any(String),
        },
      ],
    })
    const [media] = mediaListShape.parse(reply.structuredContent).media
    expect(media?.uri).toBe(`harness-media://main/${media?.id}`)
    expect(reply.content).toEqual([
      { type: 'text', text: JSON.stringify(reply.structuredContent) },
      { type: 'image', data: helloBase64, mimeType: 'image/png' },
    ])
  })

  /** Runs `agent_painter` with an image over 5 MB. `uri` is its media link. */
  async function paintBig() {
    const client = await serve(
      defineHarness({
        name: 'test/mcp-media',
        adapter: scripted().adapter,
        agents: [painter(bigImage)],
        expose: { agents: ['painter'] },
      }),
    )
    const reply = await client.callTool({
      name: 'agent_painter',
      arguments: {},
    })
    const link = z.array(z.unknown()).parse(reply.content)[1]
    return { client, reply, uri: linkShape.parse(link).uri }
  }

  it('returns an image over 5 MB as a resource link', async () => {
    const { reply } = await paintBig()

    expect(reply.content).toEqual([
      { type: 'text', text: 'painted' },
      {
        type: 'resource_link',
        uri: expect.stringMatching(/^harness-media:\/\/main\/[^/]+$/),
        name: expect.any(String),
        mimeType: 'image/png',
      },
    ])
  })

  it('reads the bytes of a media link with resources/read', async () => {
    const { client, uri } = await paintBig()

    const read = await client.readResource({ uri })

    const [contents] = read.contents
    expect(contents).toMatchObject({ uri, mimeType: 'image/png' })
    const blob = z.object({ blob: z.string() }).parse(contents).blob
    expect(Buffer.from(blob, 'base64').equals(Buffer.from(bigImage))).toBe(true)
  })

  it('refuses to read a media link with the thread of another conversation', async () => {
    const { client, uri } = await paintBig()
    const id = uri.slice('harness-media://main/'.length)

    const read = client.readResource({ uri: `harness-media://other/${id}` })

    await expect(read).rejects.toThrow(
      `Media ${id} was not found in thread other.`,
    )
  })
})
