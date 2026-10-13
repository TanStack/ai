import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { EventType, defineAgent } from '@tanstack/ai'
import { defineHarness } from '@tanstack/ai-harness'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { EXIT, runCli } from '../src'
import type { AnyTextAdapter, ImageAdapter, StreamChunk } from '@tanstack/ai'

// ponytail: `textTurn`, `toolTurn`, `scripted`, `capture`, and `stdinFrom`
// repeat the ones in cli.test.ts. Move them to a helpers file when a third
// test file needs them.
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

/** An image model that paints the bytes "hello". */
function imageAdapter(): ImageAdapter<string> {
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
    // 'aGVsbG8=' is base64 for "hello".
    generateImages: async () => ({
      id: 'image-1',
      model: 'fake-image-model',
      images: [{ b64Json: 'aGVsbG8=' }],
    }),
  }
}

const painter = defineAgent({
  name: 'painter',
  description: 'Paints',
  run: async (ctx) => {
    await ctx.generateImage({ adapter: imageAdapter(), prompt: 'a cat' })
    return 'painted'
  },
})

/**
 * Run a harness whose lead calls the painter once, then answers, with
 * `argv` and the piped `lines`. Gives the exit code and the output.
 */
async function paint(argv: Array<string>, lines: Array<string> = []) {
  const { adapter } = scripted([
    toolTurn('painter', '{}'),
    textTurn('Here is your cat.'),
  ])
  const harness = defineHarness({
    name: 'test/painting',
    adapter,
    subagents: { agents: [painter] },
  })
  const stdout = capture()
  const stderr = capture()
  const code = await runCli(harness, {
    argv,
    stdin: stdinFrom(lines, { isTTY: false }),
    stdout,
    stderr,
    persistence: memoryPersistence(),
  })
  return { code, stdout: stdout.text, stderr: stderr.text }
}

let root = ''

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'harness-cli-media-'))
  await writeFile(join(root, 'cat.png'), 'hello')
  await writeFile(join(root, 'notes.xyz'), 'plain')
})

afterAll(async () => {
  await rm(root, { recursive: true, force: true })
})

/** A prompt that sends cat.png by its full path, quoted for spaces. */
const aboutCat = () => `what is @"${join(root, 'cat.png')}"`

/** What the model sees for `aboutCat()`: the text, then the bytes. */
const seenAboutCat = [
  { type: 'text', content: 'what is' },
  {
    type: 'image',
    source: { type: 'data', value: 'aGVsbG8=', mimeType: 'image/png' },
  },
]

/** The one file in `dir`, as its path and its text. */
async function onlyFile(dir: string) {
  const names = await readdir(dir)
  expect(names).toHaveLength(1)
  const path = join(dir, names[0] ?? '')
  return { path, text: await readFile(path, 'utf8') }
}

describe('media in line mode', () => {
  it('saves a new image into the media folder once and prints where', async () => {
    const mediaDir = join(root, 'lines')

    const { code, stdout } = await paint(
      ['--media-dir', mediaDir],
      ['paint a cat\n'],
    )

    expect(code).toBe(EXIT.ok)
    const saved = await onlyFile(mediaDir)
    expect(saved.text).toBe('hello')
    expect(stdout).toContain(`[image saved: ${saved.path}]\n`)
    expect(stdout).toContain('Here is your cat.')
  })

  it('prints why a file cannot go, and does not call the model', async () => {
    const { adapter, seen } = scripted([])
    const stdout = capture()

    await runCli(defineHarness({ name: 'test/media-refused', adapter }), {
      argv: [],
      stdin: stdinFrom([`read @"${join(root, 'notes.xyz')}"\n`], {
        isTTY: false,
      }),
      stdout,
      stderr: capture(),
      persistence: memoryPersistence(),
    })

    expect(stdout.text).toContain(
      'Cannot attach notes.xyz: the file type is not known.',
    )
    expect(seen).toHaveLength(0)
  })
})

describe('media in print mode', () => {
  it('prints the media event with the saved path in ndjson', async () => {
    const mediaDir = join(root, 'ndjson')

    const { stdout } = await paint([
      '-p',
      'paint a cat',
      '--output',
      'ndjson',
      '--media-dir',
      mediaDir,
    ])

    const saved = await onlyFile(mediaDir)
    const media = stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line))
      .filter((event) => event.name === 'harness.media')
    expect(media).toEqual([
      expect.objectContaining({
        type: 'CUSTOM',
        value: expect.objectContaining({
          kind: 'image',
          source: 'generated',
          size: 5,
          path: saved.path,
        }),
      }),
    ])
  })

  it('prints the saved line to stderr and only the answer to stdout', async () => {
    const mediaDir = join(root, 'text')

    const { code, stdout, stderr } = await paint([
      '-p',
      'paint a cat',
      '--media-dir',
      mediaDir,
    ])

    expect(code).toBe(EXIT.ok)
    const saved = await onlyFile(mediaDir)
    expect(stdout).toBe('Here is your cat.\n')
    expect(stderr).toBe(`[image saved: ${saved.path}]\n`)
  })

  it('sends an @file to the model as data', async () => {
    const { adapter, seen } = scripted([textTurn('A cat.')])

    const code = await runCli(defineHarness({ name: 'test/attach', adapter }), {
      argv: ['-p', aboutCat()],
      stdout: capture(),
      stderr: capture(),
      persistence: memoryPersistence(),
    })

    expect(code).toBe(EXIT.ok)
    expect(seen[0]?.at(-1)?.content).toEqual(seenAboutCat)
  })
})

describe('media in a custom ui', () => {
  it('sends an @file of view.send to the model', async () => {
    const { adapter, seen } = scripted([textTurn('A cat.')])

    await runCli(defineHarness({ name: 'test/ui-attach', adapter }), {
      argv: [],
      stdin: stdinFrom([], { isTTY: true }),
      stdout: capture(),
      stderr: capture(),
      persistence: memoryPersistence(),
      ui: async (view) => {
        await view.send(aboutCat())
        await vi.waitFor(() => expect(seen).toHaveLength(1))
      },
    })

    expect(seen[0]?.at(-1)?.content).toEqual(seenAboutCat)
  })
})
