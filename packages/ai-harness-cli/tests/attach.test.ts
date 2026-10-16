import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import {
  createHarnessHost,
  defineHarness,
  mediaIdOf,
} from '@tanstack/ai-harness'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { attach, defaultMediaDir, saveMedia } from '../src/attach'
import type { AnyTextAdapter } from '@tanstack/ai'
import type {
  HarnessHost,
  HarnessSession,
  UserInput,
} from '@tanstack/ai-harness'

// The real file system, with spies, so a test can see which files are read.
vi.mock('node:fs/promises', { spy: true })

/** A model that is never called: these tests only store and save files. */
function idleModel(): AnyTextAdapter {
  return {
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
    chatStream: () => {
      throw new Error('The model must not be called.')
    },
    structuredOutput: async () => ({ data: {}, rawText: '{}' }),
  }
}

/** The part that `attach` makes for a stored PNG. */
const pngPart = {
  type: 'image',
  source: {
    type: 'url',
    value: expect.stringMatching(/^harness-media:./),
    mimeType: 'image/png',
  },
}

let dir = ''
let host: HarnessHost
let session: HarnessSession

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'harness-attach-'))
  await writeFile(join(dir, 'cat.png'), 'hello')
  await writeFile(join(dir, 'my cat.png'), 'meow')
  await writeFile(join(dir, 'notes.xyz'), 'plain')
  await mkdir(join(dir, 'folder.png'))
  host = createHarnessHost({ persistence: memoryPersistence() })
  session = await host.open(
    defineHarness({ name: 'test/attach', adapter: idleModel() }),
    { threadId: 't' },
  )
})

afterAll(async () => {
  await host.close()
  await rm(dir, { recursive: true, force: true })
})

beforeEach(() => {
  vi.clearAllMocks()
})

/** The name and text of each stored file that `input` sends. */
async function storedFiles(input: UserInput) {
  const parts = typeof input === 'string' ? [] : input
  const ids = parts.flatMap((part) => mediaIdOf(part) ?? [])
  return Promise.all(
    ids.map(async (id) => ({
      name: (await session.getMedia(id))?.name,
      text: new TextDecoder().decode(await session.loadMedia(id)),
    })),
  )
}

describe('attach', () => {
  it('sends a file token as a media part and takes the token out of the text', async () => {
    const input = await attach(session, 'what is wrong in @cat.png today', {
      cwd: dir,
    })

    expect(input).toEqual([
      { type: 'text', content: 'what is wrong in today' },
      pngPart,
    ])
    expect(await storedFiles(input)).toEqual([
      { name: 'cat.png', text: 'hello' },
    ])
  })

  it('reads a quoted path with spaces', async () => {
    const input = await attach(session, 'look at @"my cat.png"', { cwd: dir })

    expect(input).toEqual([{ type: 'text', content: 'look at' }, pngPart])
    expect(await storedFiles(input)).toEqual([
      { name: 'my cat.png', text: 'meow' },
    ])
  })

  it('sends no text part for a message that is only a file', async () => {
    expect(await attach(session, '@cat.png', { cwd: dir })).toEqual([pngPart])
  })

  it('keeps an email and a package name as text, and reads no file for the email', async () => {
    const email = 'write to me@acme.dev'
    const packageName = 'install @types/node first'

    expect(await attach(session, email, { cwd: dir })).toBe(email)
    expect(stat).not.toHaveBeenCalled()
    expect(readFile).not.toHaveBeenCalled()
    expect(await attach(session, packageName, { cwd: dir })).toBe(packageName)
    // A token that can be a path is looked up, so the spy above sees reads.
    expect(stat).toHaveBeenCalled()
  })

  it.each([
    ['a missing file', 'see @missing.png now'],
    ['a folder', 'see @folder.png now'],
  ])('keeps %s as text', async (_label, text) => {
    expect(await attach(session, text, { cwd: dir })).toBe(text)
  })

  it('refuses a file of a type it does not know', async () => {
    await expect(
      attach(session, 'read @notes.xyz', { cwd: dir }),
    ).rejects.toThrow(
      'Cannot attach notes.xyz: the file type is not known. To send the path as text, remove the @.',
    )
  })
})

describe('saveMedia', () => {
  it('makes the folder and adds a number instead of overwriting a file', async () => {
    const record = await session.putMedia(new TextEncoder().encode('hello'), {
      mimeType: 'image/png',
      name: 'cat.png',
    })
    const out = join(dir, 'saved', 'media')

    const paths = [
      await saveMedia(session, record, out),
      await saveMedia(session, record, out),
      await saveMedia(session, record, out),
    ]

    expect(paths).toEqual([
      join(out, 'cat.png'),
      join(out, 'cat-1.png'),
      join(out, 'cat-2.png'),
    ])
    expect(await readFile(join(out, 'cat-2.png'), 'utf8')).toBe('hello')
  })

  it.each(['../escaped.png', 'sub/escaped.png', 'sub\\escaped.png', '..'])(
    'refuses the name %s',
    async (name) => {
      const record = await session.putMedia(new TextEncoder().encode('x'), {
        mimeType: 'image/png',
        name,
      })
      const out = join(dir, 'refused')

      await expect(saveMedia(session, record, out)).rejects.toThrow(
        'it is not a plain file name',
      )
      await expect(stat(join(dir, 'escaped.png'))).rejects.toThrow()
    },
  )
})

describe('defaultMediaDir', () => {
  it.each([
    ['acme/coder', 'acme-coder-media'],
    ['@acme/coder', 'acme-coder-media'],
  ])('saves the media of %s into %s', (name, folder) => {
    expect(defaultMediaDir(name)).toBe(folder)
  })
})
