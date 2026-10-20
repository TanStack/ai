import { watch } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fakeText } from '@tanstack/ai/testing'
import {
  createHarnessHost,
  defineCommand,
  defineHarness,
  definePlugin,
} from '@tanstack/ai-harness'
import { skills } from '../src/harness'
import type { FSWatcher } from 'node:fs'
import type { TextOptions } from '@tanstack/ai'
import type { FakeResponse } from '@tanstack/ai/testing'
import type {
  HarnessHost,
  HarnessPlugin,
  HostLifecycleOptions,
} from '@tanstack/ai-harness'
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
      return {
        ...source,
        list: () => {
          if (failing.list.has(key)) {
            return Promise.reject(new Error(`cannot read ${key}`))
          }
          return source.list()
        },
      }
    },
  }
})

const fixtures = fileURLToPath(new URL('./fixtures/skills', import.meta.url))

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
  vi.restoreAllMocks()
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
    (result, index) =>
      result.type === 'return' && spy.mock.calls[index]?.[0] === path,
  )
}

/** Is `watcher` closed? Read it after {@link nextLoop}: the close event comes then. */
function closedFlag(watcher: FSWatcher | undefined) {
  const flag = { closed: false }
  watcher?.on('close', () => (flag.closed = true))
  return flag
}

/** Wait one turn of the event loop. */
const nextLoop = () => new Promise((resolve) => setImmediate(resolve))

/** Stop the warnings in the test output, and keep them. */
const warnings = () => vi.spyOn(console, 'warn').mockImplementation(() => {})

/** An answer of the fake model, or a function that makes it. */
type Answer = FakeResponse | (() => Promise<FakeResponse>)

/**
 * A harness with the skills plugin and `others` after it. The model gives
 * `answers` first and then answers "ok". It keeps each request.
 */
function harnessOf(
  options: SkillsPluginOptions,
  {
    others = [],
    answers = [],
  }: { others?: Array<HarnessPlugin>; answers?: Array<Answer> } = {},
) {
  const requests: Array<TextOptions> = []
  const fake = fakeText()
  const ok: Answer = { text: 'ok' }
  const steps = [...answers, ...Array.from({ length: 10 }, () => ok)]
  fake.setResponses(
    steps.map((answer) => async ({ request }: { request: TextOptions }) => {
      requests.push(request)
      return typeof answer === 'function' ? answer() : answer
    }),
  )
  // One plugin object, so the sessions of a host share its watchers.
  const plugin = skills(options)
  const harness = defineHarness({
    name: 'test/skills',
    adapter: fake,
    plugins: () => [plugin, ...others],
  })
  return { harness, requests }
}

/** A host that the test closes at its end. */
function hostOf(lifecycle: HostLifecycleOptions = {}) {
  const host = createHarnessHost({ lifecycle })
  hosts.push(host)
  return host
}

/** Open the session `threadId` of `harness` on `host`. */
async function openOn(
  host: HarnessHost,
  harness: ReturnType<typeof harnessOf>['harness'],
  threadId = 't',
) {
  const session = await host.open(harness, { threadId })
  const names = () => session.commands().map((command) => command.name)
  // `/skills` syncs the commands with the folders first.
  const list = async () => String(await session.runCommand({ name: 'skills' }))
  return { session, names, list }
}

/** A session of a new host, with a harness from {@link harnessOf}. */
async function open(
  options: SkillsPluginOptions,
  extra: Parameters<typeof harnessOf>[1] = {},
) {
  const { harness, requests } = harnessOf(options, extra)
  return { ...(await openOn(hostOf(), harness)), requests }
}

/** The system prompt text of a model request. */
const promptOf = (request: TextOptions | undefined) =>
  JSON.stringify(request?.systemPrompts ?? [])

/** The tool result text that a model request gives back to the model. */
const toolResultOf = (request: TextOptions | undefined) =>
  String(request?.messages.find((message) => message.role === 'tool')?.content)

/** The model's call of the `load_skill` tool for `name`. */
const loadSkill = (name: string): FakeResponse => ({
  toolCalls: [{ name: 'load_skill', input: { name } }],
})

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
      { others: [picker] },
    )

    const listed = await list()
    expect(names()).toEqual(
      expect.arrayContaining(['skill:model', 'skill:help', 'alpha']),
    )
    expect(names()).not.toContain('help')
    expect(await session.runCommand({ name: 'model' })).toBe('picked')
    expect(listed).toContain(`/skill:model  ${dir} (/model is taken)`)
  })

  it('starts a turn that asks for the skill, with or without a task', async () => {
    const dir = await tempDir()
    await addSkill(dir, 'alpha')
    const { session, list, requests } = await open({ dirs: [dir] })
    await list()

    await session.runCommand({ name: 'alpha', input: 'make a banner' })
    await vi.waitFor(() => expect(requests).toHaveLength(1))
    expect(JSON.stringify(requests[0]?.messages)).toContain(
      'Use the alpha skill: make a banner',
    )
    expect(promptOf(requests[0])).toContain('Helps with alpha.')
    expect(promptOf(requests[0])).not.toContain('Second sentence here.')

    await session.runCommand({ name: 'alpha' })
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
    await session.send('hi')
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
    await vi.waitFor(
      async () => {
        await list()
        expect(names()).toContain('alpha')
      },
      { timeout: 5000 },
    )
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

    await session.send('hi')
    expect(promptOf(requests[0])).toContain('alpha')
    expect(promptOf(requests[0])).not.toContain('zeta')

    await session.runCommand({ name: 'zeta' })
    await vi.waitFor(() => expect(requests).toHaveLength(2))
    expect(promptOf(requests[1])).toContain('zeta')
  })

  it('loads a skill, with its files, from the folder that has it', async () => {
    const first = await tempDir()
    await addSkill(first, 'beta')
    const { session, requests } = await open(
      { dirs: [first, fixtures] },
      { answers: [loadSkill('alpha')] },
    )

    await session.send('use alpha')
    expect(JSON.parse(toolResultOf(requests[1]))).toEqual({
      skill: 'alpha',
      content: '# Alpha\n\nDo the alpha thing.',
      resources: ['references/note.md'],
      scripts: [
        { path: 'scripts/run.py', executable: false, reason: 'no-runtime' },
      ],
      compatibility: 'any runtime',
    })
  })

  it('tells the model when a skill is gone before it loads', async () => {
    const dir = await tempDir()
    await addSkill(dir, 'alpha')
    const removeThenLoad = async () => {
      await rm(join(dir, 'alpha'), { recursive: true, force: true })
      return loadSkill('alpha')
    }
    const { session, requests } = await open(
      { dirs: [dir] },
      { answers: [removeThenLoad] },
    )

    await session.send('use alpha')
    expect(JSON.parse(toolResultOf(requests[1]))).toEqual({
      error: `No skill named "alpha" in ${dir}.`,
    })
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
      {
        answers: [
          { toolCalls: [{ name: 'load_skill', input: { name: 'alpha' } }] },
        ],
      },
    )

    await session.send('use alpha')
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
    await vi.waitFor(
      async () => expect(await read('alpha')).toBe('first guide'),
      {
        timeout: 5000,
      },
    )
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

  it('watches the parent of a removed folder, and the folder once it is back', async () => {
    const root = await tempDir()
    const dir = join(root, 'skills')
    await addSkill(dir, 'alpha')
    const { names, list } = await open({ dirs: [dir] })
    await list()
    expect(watchersOf(dir)).toHaveLength(1)

    await rm(dir, { recursive: true, force: true })
    await list()
    expect(watchersOf(dirname(dir))).toHaveLength(1)
    await addSkill(dir, 'gamma')
    await list()
    expect(watchersOf(dir)).toHaveLength(2)
    expect(names()).toContain('gamma')
  })

  it('watches the nearest folder that exists when the parent is missing too', async () => {
    const root = await tempDir()
    const dir = join(root, 'a', 'b', 'skills')
    const { names, list } = await open({ dirs: [dir] })
    await list()
    expect(watchersOf(root)).toHaveLength(1)

    await mkdir(join(root, 'a', 'b'), { recursive: true })
    await list()
    expect(watchersOf(join(root, 'a', 'b'))).toHaveLength(1)
    await addSkill(dir, 'gamma')
    await list()
    expect(watchersOf(dir)).toHaveLength(1)
    expect(names()).toContain('gamma')
  })

  it('watches a folder without recursive where the platform has none', async () => {
    const warn = warnings()
    const dir = await tempDir()
    await addSkill(dir, 'alpha')
    vi.mocked(watch).mockImplementationOnce(() => {
      throw Object.assign(new Error('no recursive watch'), {
        code: 'ERR_FEATURE_UNAVAILABLE_ON_PLATFORM',
      })
    })
    const { names, list } = await open({ dirs: [dir] })
    await list()

    const calls = vi
      .mocked(watch)
      .mock.calls.map(([path, options]) => [path, options])
    expect(calls).toEqual([
      [dir, { recursive: true, persistent: false }],
      [dir, { recursive: false, persistent: false }],
    ])
    expect(names()).toContain('alpha')
    expect(warn.mock.calls).toEqual([
      [
        `skills: cannot watch the subfolders of ${dir} on this platform. An edited SKILL.md shows at the next turn.`,
      ],
    ])
    // Without a recursive watcher, an edited SKILL.md shows at the next read.
    await addSkill(dir, 'alpha', 'an edit')
    expect(await list()).toContain(`/alpha  ${dir}`)
    expect(
      seen.sources.at(-1) && (await seen.sources.at(-1)?.list())?.[0],
    ).toMatchObject({
      description: 'Helps with an edit. Second sentence here.',
    })
  })

  it('watches each folder once for all the sessions of a host', async () => {
    const dir = await tempDir()
    await addSkill(dir, 'alpha')
    const { harness } = harnessOf({ dirs: [dir] })
    const host = hostOf()
    const first = await openOn(host, harness, 't-0')
    const second = await openOn(host, harness, 't-1')

    expect(await first.list()).toBe(`/alpha  ${dir}`)
    expect(await second.list()).toBe(`/alpha  ${dir}`)
    expect(watchersOf(dir)).toHaveLength(1)
    await addSkill(dir, 'gamma')
    await vi.waitFor(
      () => {
        expect(first.names()).toContain('gamma')
        expect(second.names()).toContain('gamma')
      },
      { timeout: 5000 },
    )
  })

  it('warns once, and reads the folder at each turn, when it cannot be watched', async () => {
    const warn = warnings()
    const dir = await tempDir()
    await addSkill(dir, 'alpha')
    vi.mocked(watch).mockImplementationOnce(() => {
      throw Object.assign(new Error('too many open files'), { code: 'EMFILE' })
    })
    const { list } = await open({ dirs: [dir] })

    expect(await list()).toBe(`/alpha  ${dir}`)
    await addSkill(dir, 'gamma')
    expect(await list()).toContain(`/gamma  ${dir}`)
    await list()
    expect(vi.mocked(watch)).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls).toEqual([
      [
        `skills: cannot watch ${dir} (too many open files). Its skills change at the next turn.`,
      ],
    ])
  })

  it('closes the folder watcher after the last session, and at host.close()', async () => {
    const dir = await tempDir()
    await addSkill(dir, 'alpha')
    const { harness } = harnessOf({ dirs: [dir] })
    const host = hostOf({ closeIdleSessionsAfterMs: 0 })
    const first = await openOn(host, harness, 't-0')
    const second = await openOn(host, harness, 't-1')
    const shared = closedFlag(watchersOf(dir)[0]?.value)

    await first.session.close()
    await nextLoop()
    expect(shared.closed).toBe(false)
    await second.session.close()
    await nextLoop()
    expect(shared.closed).toBe(true)

    // The next session watches the folder again, until the host closes.
    await openOn(host, harness, 't-2')
    expect(watchersOf(dir)).toHaveLength(2)
    const again = closedFlag(watchersOf(dir)[1]?.value)
    await Promise.all(hosts.splice(0).map((open) => open.close()))
    await nextLoop()
    expect(again.closed).toBe(true)
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
