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
import type { HarnessHost, HarnessPlugin } from '@tanstack/ai-harness'
import type { SkillsPluginOptions } from '../src/harness'

const temps: Array<string> = []
const hosts: Array<HarnessHost> = []
afterEach(async () => {
  await Promise.all(hosts.splice(0).map((host) => host.close()))
  await Promise.all(
    temps.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
  )
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

/**
 * A session with the skills plugin and `others` after it. The model answers
 * "ok" and keeps each request.
 */
async function open(
  options: SkillsPluginOptions,
  others: Array<HarnessPlugin> = [],
) {
  const requests: Array<TextOptions> = []
  const fake = fakeText()
  fake.setResponses(
    Array.from(
      { length: 10 },
      () =>
        ({ request }: { request: TextOptions }) => {
          requests.push(request)
          return { text: 'ok' }
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
})
