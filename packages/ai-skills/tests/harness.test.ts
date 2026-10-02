import { watch } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fakeText } from '@tanstack/ai/testing'
import {
  createHarnessHost,
  defineCommand,
  defineHarness,
  definePlugin,
} from '@tanstack/ai-harness'
import { skills } from '../src/harness'
import type { TextOptions } from '@tanstack/ai'
import type { FakeResponse } from '@tanstack/ai/testing'
import type { HarnessHost, HarnessPlugin } from '@tanstack/ai-harness'
import type { SkillsPluginOptions } from '../src/harness'
import type { SkillSource } from '../src/types'

/** The sources that the plugin gives to `withSkills`, newest last. */
const seen = vi.hoisted(() => ({ sources: new Array<SkillSource>() }))
/** Folders whose source fails: `list` rejects, or `open` throws when it is made. */
const failing = vi.hoisted(() => ({
  list: new Set<string>(),
  open: new Set<string>(),
}))

// Pass-through spies. The tests reach the plugin's watchers, its skill
// source, and a failing folder through them. Everything else is unchanged.
vi.mock('node:fs', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs')>()
  return { ...original, watch: vi.fn(original.watch) }
})
vi.mock('../src/middleware', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/middleware')>()
  return {
    ...original,
    withSkills: (...args: Parameters<typeof original.withSkills>) => {
      const [sources] = args
      if (!Array.isArray(sources)) seen.sources.push(sources)
      return original.withSkills(...args)
    },
  }
})
vi.mock('../src/node', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/node')>()
  return {
    ...original,
    skillDirectory: (...args: Parameters<typeof original.skillDirectory>) => {
      const key = String(args[0])
      if (failing.open.has(key)) throw new Error(`cannot open ${key}`)
      const source = original.skillDirectory(...args)
      if (!failing.list.has(key)) return source
      return {
        ...source,
        list: () => Promise.reject(new Error(`cannot read ${key}`)),
      }
    },
  }
})

const temps: Array<string> = []
const hosts: Array<HarnessHost> = []
afterEach(async () => {
  await Promise.all(hosts.splice(0).map((host) => host.close()))
  await Promise.all(
    temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  )
  seen.sources.length = 0
  failing.list.clear()
  failing.open.clear()
  vi.mocked(watch).mockClear()
})

async function tempDir() {
  const dir = await mkdtemp(join(tmpdir(), 'skills-harness-'))
  temps.push(dir)
  return dir
}

/** Write the skill `name` into `root`, with a two-sentence description. */
async function addSkill(root: string, name: string, about = name) {
  await mkdir(join(root, name), { recursive: true })
  await writeFile(
    join(root, name, 'SKILL.md'),
    `---\nname: ${name}\ndescription: Helps with ${about}. Second sentence here.\n---\n\nDo ${about}.\n`,
  )
}

/** Write `references/guide.md` with `text` into the skill `name` of `root`. */
async function addGuide(root: string, name: string, text: string) {
  await mkdir(join(root, name, 'references'), { recursive: true })
  await writeFile(join(root, name, 'references', 'guide.md'), text)
}

/** The watchers made for `path`, oldest first. */
function watchersOf(path: string) {
  const spy = vi.mocked(watch)
  return spy.mock.results.filter(
    (_, index) => spy.mock.calls[index]?.[0] === path,
  )
}

/**
 * A session with the skills plugin and `others` after it. The model gives
 * `answers` in order, then "ok", and keeps each request.
 */
async function open(
  options: SkillsPluginOptions,
  others: Array<HarnessPlugin> = [],
  answers: Array<FakeResponse> = [],
) {
  const requests: Array<TextOptions> = []
  const fake = fakeText()
  fake.setResponses(
    Array.from(
      { length: 10 },
      (_, index) =>
        ({ request }: { request: TextOptions }) => {
          requests.push(request)
          return answers[index] ?? { text: 'ok' }
        },
    ),
  )
  const host = createHarnessHost()
  hosts.push(host)
  const session = await host.open(
    defineHarness({
      name: 'test/skills',
      adapter: fake,
      plugins: () => [skills(options), ...others],
    }),
    { threadId: 't' },
  )
  const names = () => session.commands().map((command) => command.name)
  // `/skills` syncs the commands with the folders first, so a test needs
  // no watch event.
  const list = async () => String(await session.command('skills'))
  return { session, names, list, requests }
}

/** The system prompt text of a model request. */
const promptOf = (request: TextOptions | undefined) =>
  JSON.stringify(request?.systemPrompts ?? [])

describe('skills()', () => {
  it('makes a command for each skill, from the first folder that has it', async () => {
    const first = await tempDir()
    const second = await tempDir()
    await addSkill(first, 'alpha')
    await addSkill(first, 'shared', 'the first folder')
    await addSkill(second, 'beta')
    await addSkill(second, 'shared', 'the second folder')
    const { session, names, list } = await open({
      dirs: [first, join(first, 'missing'), second],
    })

    const listed = await list()
    expect(names()).toEqual(
      expect.arrayContaining(['skills', 'alpha', 'beta', 'shared']),
    )
    expect(
      session.commands().find((command) => command.name === 'shared')
        ?.description,
    ).toBe('Skill: Helps with the first folder.')
    expect(listed).toContain(`/shared  ${first}`)
    expect(listed).toContain(`/beta  ${second}`)
  })

  it('prefixes a skill whose name another command has', async () => {
    const dir = await tempDir()
    await addSkill(dir, 'model')
    await addSkill(dir, 'help')
    await addSkill(dir, 'alpha')
    const picker = definePlugin({
      name: 'test/picker',
      setup: () => ({
        commands: {
          model: defineCommand({ description: 'Pick', run: () => 'picked' }),
        },
      }),
    })
    const { session, names, list } = await open(
      { dirs: [dir], reserved: ['help'] },
      [picker],
    )

    const listed = await list()
    expect(names()).toEqual(
      expect.arrayContaining(['skill:model', 'skill:help', 'alpha']),
    )
    expect(names()).not.toContain('help')
    expect(await session.command('model')).toBe('picked')
    expect(listed).toContain(`/skill:model  ${dir} (/model is taken)`)
  })

  it('starts a turn that asks for the skill, with or without a task', async () => {
    const dir = await tempDir()
    await addSkill(dir, 'alpha')
    const { session, list, requests } = await open({ dirs: [dir] })
    await list()

    await session.command('alpha', 'make a banner')
    await vi.waitFor(() => expect(requests).toHaveLength(1))
    expect(JSON.stringify(requests[0]?.messages)).toContain(
      'Use the alpha skill: make a banner',
    )
    expect(promptOf(requests[0])).toContain('Helps with alpha.')
    expect(promptOf(requests[0])).not.toContain('Second sentence here.')

    await session.command('alpha')
    await vi.waitFor(() => expect(requests).toHaveLength(2))
    expect(JSON.stringify(requests[1]?.messages)).toContain(
      'Use the alpha skill.',
    )
  })

  it('follows skills that come and go while the session runs', async () => {
    const dir = await tempDir()
    await addSkill(dir, 'alpha')
    const { names } = await open({ dirs: [dir] })
    await vi.waitFor(() => expect(names()).toContain('alpha'))

    await addSkill(dir, 'gamma')
    await vi.waitFor(() => expect(names()).toContain('gamma'), {
      timeout: 5000,
    })
    await rm(join(dir, 'alpha'), { recursive: true, force: true })
    await vi.waitFor(() => expect(names()).not.toContain('alpha'), {
      timeout: 5000,
    })
  })

  it('shows the skills of a folder made after the start', async () => {
    const root = await tempDir()
    const { names } = await open({ dirs: [join(root, 'later')] })

    await addSkill(join(root, 'later'), 'alpha')
    await vi.waitFor(() => expect(names()).toContain('alpha'), {
      timeout: 5000,
    })
  })

  it('uses a folder made after the start, from the next turn', async () => {
    const root = await tempDir()
    const later = join(root, 'later')
    const { session, names } = await open({ dirs: [later] })
    expect(names()).not.toContain('alpha')

    await addSkill(later, 'alpha')
    await session.prompt('hi')
    expect(names()).toContain('alpha')
  })

  it('leaves out a broken SKILL.md until it is fixed', async () => {
    const dir = await tempDir()
    await mkdir(join(dir, 'alpha'))
    await writeFile(join(dir, 'alpha', 'SKILL.md'), '---\nname: alpha\n')
    const { names, list } = await open({ dirs: [dir] })

    expect(await list()).toContain('No skills yet.')
    expect(names()).not.toContain('alpha')
    await addSkill(dir, 'alpha')
    await list()
    expect(names()).toContain('alpha')
  })

  it('keeps the earlier folders, and the called skills, when the list is too long', async () => {
    const first = await tempDir()
    const second = await tempDir()
    // With this description, one skill fits in 36 tokens and two do not.
    const about = 'a topic with a long and wordy name for the test'
    await addSkill(first, 'alpha', about)
    await addSkill(second, 'zeta', about)
    const { session, list, requests } = await open({
      dirs: [first, second],
      maxCatalogTokens: 36,
    })
    await list()

    await session.prompt('hi')
    expect(promptOf(requests[0])).toContain('alpha')
    expect(promptOf(requests[0])).not.toContain('zeta')

    await session.command('zeta')
    await vi.waitFor(() => expect(requests).toHaveLength(2))
    expect(promptOf(requests[1])).toContain('zeta')
  })

  it('stops following the folders when the session closes', async () => {
    const dir = await tempDir()
    await addSkill(dir, 'alpha')
    const opened = await open({ dirs: [dir] })
    await opened.list()
    await Promise.all(hosts.splice(0).map((host) => host.close()))

    await addSkill(dir, 'gamma')
    await new Promise((resolve) => setTimeout(resolve, 500))
    expect(opened.names()).not.toContain('gamma')
  })

  it('loads a skill from its folder when the model calls load_skill', async () => {
    const dir = await tempDir()
    await addSkill(dir, 'alpha')
    await addGuide(dir, 'alpha', 'guide')
    await mkdir(join(dir, 'alpha', 'scripts'))
    await writeFile(join(dir, 'alpha', 'scripts', 'run.sh'), 'echo hi')
    const { session, requests } = await open(
      { dirs: [dir] },
      [],
      [{ toolCalls: [{ name: 'load_skill', input: { name: 'alpha' } }] }],
    )

    await session.prompt('use alpha')
    await vi.waitFor(() => expect(requests).toHaveLength(2))
    const sent = JSON.stringify(requests[1]?.messages)
    expect(sent).toContain('Do alpha.')
    expect(sent).toContain('references/guide.md')
    expect(sent).toContain('scripts/run.sh')
  })

  it('reads a resource from the folder that has the skill now', async () => {
    const first = await tempDir()
    const second = await tempDir()
    await addSkill(second, 'alpha')
    await addGuide(second, 'alpha', 'second guide')
    await open({ dirs: [first, second] })
    const source = seen.sources.at(-1)
    const read = (name: string) =>
      source?.readResource?.(name, 'references/guide.md')

    expect(await read('alpha')).toBe('second guide')
    // The first folder wins a name, also for a skill made after the start.
    await addSkill(first, 'alpha')
    await addGuide(first, 'alpha', 'first guide')
    expect(await read('alpha')).toBe('first guide')
    await expect(read('missing')).rejects.toThrow('No skill named "missing"')
  })

  it('watches a folder again after a watch error', async () => {
    const dir = await tempDir()
    await addSkill(dir, 'alpha')
    const { names, list } = await open({ dirs: [dir] })
    await list()
    expect(watchersOf(dir)).toHaveLength(1)

    watchersOf(dir)[0]?.value.emit('error', new Error('watch failed'))
    await list()
    expect(watchersOf(dir)).toHaveLength(2)
    await addSkill(dir, 'gamma')
    await vi.waitFor(() => expect(names()).toContain('gamma'), {
      timeout: 5000,
    })
  })

  it('skips a folder whose skills cannot be read', async () => {
    const broken = await tempDir()
    const dir = await tempDir()
    await addSkill(broken, 'beta')
    await addSkill(dir, 'alpha')
    failing.list.add(broken)
    const { names, list } = await open({ dirs: [broken, dir] })

    expect(await list()).toContain(`/alpha  ${dir}`)
    expect(names()).toContain('alpha')
    expect(names()).not.toContain('beta')
  })

  it('syncs again after a sync that failed', async () => {
    const dir = await tempDir()
    await addSkill(dir, 'alpha')
    failing.open.add(dir)
    const { names, list } = await open({ dirs: [dir] })

    expect(await list()).toContain('No skills yet.')
    failing.open.delete(dir)
    await list()
    expect(names()).toContain('alpha')
  })
})
