import { describe, expect, it, vi } from 'vitest'
import { toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, definePlugin } from '../src'
import {
  PermissionDecisionCapability,
  PermissionResources,
  PermissionRules,
  decidePermission,
  permissions,
} from '../src/first-party/permissions'
import { mockAdapter, text, toolCall } from './helpers'
import type { HarnessPersistence, HarnessPlugin, HarnessSession } from '../src'
import type {
  PermissionDecision,
  PermissionMode,
  PermissionRule,
} from '../src/first-party/permissions'
import type { Reply } from './helpers'

const ROOT = '/work/repo'
const WINDOWS_ROOT = 'C:\\work\\repo'
const readAllowed: Array<PermissionRule> = [
  { tool: 'read_file', decision: 'allow', kind: 'read' },
]

function read(
  path: string,
  options: { root?: string; rules?: Array<PermissionRule> } = {},
) {
  return decidePermission(
    options.rules ?? readAllowed,
    'read_file',
    'default',
    {
      resources: { paths: [path] },
      root: options.root ?? ROOT,
    },
  )
}

/** Run `fn` as if the host were `platform`. Letter case rules depend on it. */
function onPlatform<T>(platform: NodeJS.Platform, fn: () => T) {
  const real = process.platform
  Object.defineProperty(process, 'platform', { value: platform })
  try {
    return fn()
  } finally {
    Object.defineProperty(process, 'platform', { value: real })
  }
}

function run(commands: Array<string>, rules: Array<PermissionRule>) {
  return decidePermission(rules, 'bash', 'default', {
    resources: { commands },
  })
}

describe('decidePermission with resources', () => {
  it('lets the last matching rule win, and needs every resource allowed', () => {
    const rules: Array<PermissionRule> = [
      ...readAllowed,
      { tool: 'read_file', resource: 'secrets/**', decision: 'deny' },
      { tool: 'read_file', resource: 'secrets/public/**', decision: 'allow' },
    ]
    const decide = (paths: Array<string>) =>
      decidePermission(rules, 'read_file', 'default', {
        resources: { paths },
        root: ROOT,
      })

    expect(decide(['src/a.ts'])).toBe('allow')
    expect(decide(['secrets/key'])).toBe('deny')
    expect(decide(['secrets/public/logo.png'])).toBe('allow')
    expect(decide(['src/a.ts', 'secrets/key'])).toBe('deny')
  })

  it.each([
    ['darwin', 'deny'],
    ['win32', 'deny'],
    ['linux', 'allow'],
  ] as const)(
    'on %s, a deny rule for a posix path matches another letter case: %s',
    (platform, expected) => {
      const rules: Array<PermissionRule> = [
        ...readAllowed,
        { tool: 'read_file', resource: 'secrets/**', decision: 'deny' },
      ]
      expect(onPlatform(platform, () => read('Secrets/key', { rules }))).toBe(
        expected,
      )
    },
  )

  it('fails closed when the resources of a call are not known', () => {
    const rules: Array<PermissionRule> = [
      ...readAllowed,
      { tool: 'read_file', resource: 'secrets/**', decision: 'ask' },
    ]

    expect(decidePermission(rules, 'read_file', 'default')).toBe('ask')
  })

  it('matches command rules against each part, and * spans slashes', () => {
    const rules: Array<PermissionRule> = [
      { tool: 'bash', decision: 'ask', kind: 'execute' },
      { tool: 'bash', resource: 'ls*', decision: 'allow' },
      { tool: 'bash', resource: 'git *', decision: 'allow' },
    ]

    expect(run(['ls -la'], rules)).toBe('allow')
    expect(run(['git add src/a.ts'], rules)).toBe('allow')
    expect(run(['ls', 'rm x'], rules)).toBe('ask')
  })

  it.each([
    ['a command that was not split', 'ls && rm x'],
    ['command substitution', 'echo $(rm x)'],
    ['a backtick', 'echo `rm x`'],
    ['process substitution', 'diff <(rm x) y'],
    ['a heredoc', 'cat <<EOF\nrm x\nEOF'],
    // The splitter keeps these in one part. They must still ask.
    ['a lone & (background, or a separator in cmd.exe)', 'ls & rm -rf x'],
    ['a carriage return', 'ls\rrm -rf x'],
    ['an output redirect', 'ls > ~/.bashrc'],
  ])('asks for %s even when * is allowed', (_name, part) => {
    expect(
      run([part], [{ tool: 'bash', resource: '*', decision: 'allow' }]),
    ).toBe('ask')
  })

  it('still denies a part with shell syntax when a deny matches', () => {
    const rules: Array<PermissionRule> = [
      { tool: 'bash', resource: '*', decision: 'allow' },
      { tool: 'bash', resource: 'echo *', decision: 'deny' },
    ]

    expect(run(['echo $(rm x)'], rules)).toBe('deny')
  })

  it.each([
    ['..', '../secret.txt'],
    ['.. in the middle', 'src/../../secret.txt'],
    ['an absolute path', '/etc/passwd'],
    ['a folder that only starts like the root', '/work/repo-evil/a.ts'],
  ])('asks for a path that leaves the workspace: %s', (_name, path) => {
    expect(read(path)).toBe('ask')
  })

  it('asks for another letter case of the root on a case-sensitive system', () => {
    expect(onPlatform('linux', () => read('/work/Repo/a.ts'))).toBe('ask')
  })

  it.each([
    ['another drive', 'D:\\other\\x.txt'],
    ['a sibling folder in another letter case', 'C:/Work/Other/x.txt'],
    ['a folder that only starts like the root', 'C:\\WORK\\REPO-evil\\x.txt'],
    ['a path relative to the current folder of a drive', 'C:secret.txt'],
    ['a stream of a file', 'notes.txt:hidden'],
    ['a name that ends in a dot', 'notes.txt.'],
  ])('asks for a Windows path that leaves the workspace: %s', (_name, path) => {
    expect(read(path, { root: WINDOWS_ROOT })).toBe('ask')
  })

  it('compares Windows paths without letter case, for allows and denies', () => {
    const rules: Array<PermissionRule> = [
      ...readAllowed,
      { tool: 'read_file', resource: 'secrets/**', decision: 'deny' },
    ]

    expect(read('c:\\WORK\\Repo\\src\\a.ts', { root: WINDOWS_ROOT })).toBe(
      'allow',
    )
    expect(read('SECRETS\\key', { root: WINDOWS_ROOT, rules })).toBe('deny')
  })

  it('lets a rule with a resource allow a path outside the workspace', () => {
    const rules: Array<PermissionRule> = [
      ...readAllowed,
      { tool: 'read_file', resource: '/shared/**', decision: 'allow' },
    ]

    expect(read('/shared/notes.md', { rules })).toBe('allow')
  })

  it.each(['.env', 'config/prod.env', '.env.local', 'Prod.ENV'])(
    'asks before reading %s',
    (path) => {
      expect(read(path)).toBe('ask')
    },
  )

  it('reads other files, and a .env file a rule names', () => {
    const rules: Array<PermissionRule> = [
      ...readAllowed,
      { tool: 'read_file', resource: '.env.example', decision: 'allow' },
    ]

    expect(read('environment.ts')).toBe('allow')
    expect(read('.env.example', { rules })).toBe('allow')
  })

  it('keeps the edit kind in plan mode when a later rule allows the tool', () => {
    const rules: Array<PermissionRule> = [
      { tool: 'write_file', decision: 'ask', kind: 'edit' },
      { tool: 'write_file', decision: 'allow' },
    ]

    expect(decidePermission(rules, 'write_file', 'plan')).toBe('deny')
  })

  it('in acceptEdits mode, still asks for an edit outside the workspace', () => {
    const rules: Array<PermissionRule> = [
      { tool: 'write_file', decision: 'ask', kind: 'edit' },
    ]
    const write = (path: string, mode: PermissionMode) =>
      decidePermission(rules, 'write_file', mode, {
        resources: { paths: [path] },
        root: ROOT,
      })

    expect(write('src/a.ts', 'acceptEdits')).toBe('allow')
    expect(write('../a.ts', 'acceptEdits')).toBe('ask')
  })
})

/** The string `key` of a call input. Throws when it is missing. */
function field(input: unknown, key: string) {
  const value =
    typeof input === 'object' && input !== null
      ? Reflect.get(input, key)
      : undefined
  if (typeof value !== 'string') throw new Error(`No ${key}.`)
  return value
}

/**
 * `read_file` and `bash` stand-ins that say what each call touches. `ran`
 * lists the tools that ran. The `bash` splitter splits on ` && ` only.
 */
function fakeTools() {
  const ran: Array<string> = []
  const tool = (name: string) =>
    toolDefinition({ name, description: name }).server(async () => {
      ran.push(name)
      return `${name} done`
    })
  const plugin = definePlugin({
    name: 'test/tools',
    setup: () => ({
      tools: [tool('read_file'), tool('bash'), tool('deploy')],
      contribute: [
        PermissionRules.item({
          tool: 'read_file',
          decision: 'allow',
          kind: 'read',
        }),
        PermissionRules.item({
          tool: 'bash',
          decision: 'ask',
          kind: 'execute',
        }),
        PermissionResources.item({
          read_file: { paths: (input) => [field(input, 'path')] },
          bash: { commands: (input) => field(input, 'command').split(' && ') },
        }),
      ],
    }),
  })
  return { plugin, ran }
}

async function open(
  persistence: HarnessPersistence,
  plugins: Array<HarnessPlugin>,
  replies: Array<Reply>,
  threadId = 't',
) {
  const { adapter, calls } = mockAdapter([...replies, () => text('done')])
  const host = createHarnessHost({ persistence })
  const session = await host.open(
    defineHarness({
      name: 'test/permissions',
      adapter,
      plugins: () => plugins,
    }),
    { threadId },
  )
  return { host, session, calls }
}

/** Wait for the one open question, then answer it. Returns its message. */
async function answer(session: HarnessSession, value: unknown) {
  await vi.waitFor(() =>
    expect(session.snapshot().pendingQuestions).toHaveLength(1),
  )
  const [question] = session.snapshot().pendingQuestions
  if (!question) throw new Error('No question.')
  await session.answer(question.questionId, value)
  return question.message
}

describe('permissions()', () => {
  it('saves an always answer for the project, for the next call and a new session', async () => {
    const persistence = memoryPersistence()
    const tools = fakeTools()
    const plugins = [permissions({ root: ROOT }), tools.plugin]
    const first = await open(persistence, plugins, [
      () => toolCall('read_file', { path: '.env' }, 'c1'),
      () => toolCall('read_file', { path: '.env' }, 'c2'),
    ])

    const turn = first.session.prompt('read it twice')
    expect(await answer(first.session, { answer: 'always' })).toContain('.env')
    await turn

    expect(tools.ran).toEqual(['read_file', 'read_file'])
    expect(
      await persistence.stores.metadata.get(
        'tanstack/permissions',
        'permissions:saved:/work/repo',
      ),
    ).toEqual([{ tool: 'read_file', resource: '.env', decision: 'allow' }])
    await first.host.close()

    const second = await open(
      persistence,
      [permissions({ root: ROOT }), tools.plugin],
      [
        () => toolCall('read_file', { path: '.env' }, 'c3'),
        () => toolCall('read_file', { path: 'other.env' }, 'c4'),
      ],
      't2',
    )
    const next = second.session.prompt('read again')
    // `.env` runs at once. `other.env` has no saved answer, so it asks.
    expect(await answer(second.session, { answer: 'once' })).toContain(
      'other.env',
    )
    await next

    expect(tools.ran).toHaveLength(4)
    await second.host.close()
  })

  it('keeps an always answer for the session when there is no metadata store', async () => {
    const { stores } = memoryPersistence()
    const tools = fakeTools()
    const { host, session } = await open(
      { stores: { messages: stores.messages, runs: stores.runs } },
      [permissions({ root: ROOT }), tools.plugin],
      [
        () => toolCall('read_file', { path: '../shared.txt' }, 'c1'),
        () => toolCall('read_file', { path: '../shared.txt' }, 'c2'),
      ],
    )

    const turn = session.prompt('read it twice')
    await answer(session, { answer: 'always' })
    await turn

    expect(tools.ran).toEqual(['read_file', 'read_file'])
    expect(session.snapshot().pendingQuestions).toHaveLength(0)
    await host.close()
  })

  it('gives the model a tool error with the message of a reject', async () => {
    const tools = fakeTools()
    const { host, session, calls } = await open(
      memoryPersistence(),
      [permissions({ root: ROOT }), tools.plugin],
      [() => toolCall('read_file', { path: '../secret.txt' }, 'c1')],
    )

    const turn = session.prompt('read outside')
    await answer(session, {
      answer: 'reject',
      message: 'Stay inside the repo.',
    })
    await turn

    expect(tools.ran).toEqual([])
    expect(JSON.stringify(calls[1].messages)).toContain(
      '{\\"error\\":\\"Stay inside the repo.\\"}',
    )
    await host.close()
  })

  it('asks for ls && rm x when only ls* is allowed', async () => {
    const tools = fakeTools()
    const { host, session, calls } = await open(
      memoryPersistence(),
      [
        permissions({
          rules: [{ tool: 'bash', resource: 'ls*', decision: 'allow' }],
        }),
        tools.plugin,
      ],
      [
        () => toolCall('bash', { command: 'ls -la' }, 'c1'),
        () => toolCall('bash', { command: 'ls && rm x' }, 'c2'),
      ],
    )

    const turn = session.prompt('list, then clean')
    expect(await answer(session, { answer: 'reject' })).toContain('rm x')
    await turn

    expect(tools.ran).toEqual(['bash'])
    expect(JSON.stringify(calls[2].messages)).toContain(
      'The user denied this tool call.',
    )
    await host.close()
  })

  it('hides a tool that its last rule denies, and keeps one a later rule allows in part', async () => {
    const tools = fakeTools()
    const { host, session, calls } = await open(
      memoryPersistence(),
      [
        permissions({
          rules: [
            { tool: 'deploy', decision: 'deny' },
            { tool: 'bash', decision: 'deny' },
            { tool: 'bash', resource: 'ls*', decision: 'allow' },
          ],
        }),
        tools.plugin,
      ],
      [],
    )

    await session.prompt('hi')

    const names = calls[0].tools.map((tool: { name: string }) => tool.name)
    expect(names.sort()).toEqual(['bash', 'read_file'])
    await host.close()
  })

  it('refuses a call whose resources cannot be read', async () => {
    const tools = fakeTools()
    const { host, session, calls } = await open(
      memoryPersistence(),
      [permissions({ root: ROOT }), tools.plugin],
      [() => toolCall('read_file', {}, 'c1')],
    )

    await session.prompt('read nothing')

    expect(tools.ran).toEqual([])
    expect(session.snapshot().pendingQuestions).toHaveLength(0)
    expect(JSON.stringify(calls[1].messages)).toContain(
      'Cannot check the permissions of this call: No path.',
    )
    await host.close()
  })

  it('shares its rules with other plugins, and they still beat the rules of tool plugins', async () => {
    const tools = fakeTools()
    let seen: Array<PermissionRule> = []
    // Another plugin that reads the rules, like codeMode() does.
    const reader = definePlugin({
      name: 'test/reader',
      setup: (ctx) => {
        const rules = ctx.collect(PermissionRules)
        return {
          prepareTools: ({ tools: list }) => {
            seen = [...rules]
            return list
          },
        }
      },
    })
    const rule: PermissionRule = { tool: 'read_file', decision: 'ask' }
    const { host, session } = await open(
      memoryPersistence(),
      // The tool plugin comes after permissions(), and it allows read_file.
      [permissions({ root: ROOT, rules: [rule] }), tools.plugin, reader],
      [() => toolCall('read_file', { path: 'src/a.ts' }, 'c1')],
    )

    const turn = session.prompt('read a file')
    expect(await answer(session, { answer: 'reject' })).toContain('src/a.ts')
    await turn

    expect(tools.ran).toEqual([])
    expect(seen).toContainEqual(rule)
    await host.close()
  })

  it('tells other plugins the decision a call gets, for a rule, the default, and plan mode', async () => {
    const ran: Array<string> = []
    const tool = (name: string) =>
      toolDefinition({ name, description: name }).server(async () => {
        ran.push(name)
        return `${name} done`
      })
    let decide:
      | ((tool: string, mode: PermissionMode) => PermissionDecision)
      | undefined
    // Another plugin that asks permissions(), like codeMode() does.
    const reader = definePlugin({
      name: 'test/reader',
      optionalRequires: [PermissionDecisionCapability],
      setup: (ctx) => {
        decide = ctx.getOptional(PermissionDecisionCapability)
        return { tools: [tool('lookup'), tool('deploy')] }
      },
    })
    const { host, session, calls } = await open(
      memoryPersistence(),
      [
        permissions({
          default: 'ask',
          rules: [{ tool: 'lookup', decision: 'allow' }],
        }),
        reader,
      ],
      [
        () => toolCall('lookup', {}, 'c1'),
        () => toolCall('deploy', {}, 'c2'),
        () => text('asked'),
        () => toolCall('lookup', {}, 'c3'),
        () => toolCall('deploy', {}, 'c4'),
      ],
    )

    // The rule allows lookup, and deploy has no rule, so it asks.
    const turn = session.prompt('look up, then deploy')
    expect(await answer(session, { answer: 'reject' })).toContain('deploy')
    await turn
    expect(ran).toEqual(['lookup'])
    expect(decide?.('lookup', 'default')).toBe('allow')
    expect(decide?.('deploy', 'default')).toBe('ask')

    // Plan mode denies what would ask.
    await session.command('mode', 'plan')
    await session.prompt('again, in plan mode')
    expect(ran).toEqual(['lookup', 'lookup'])
    expect(JSON.stringify(calls.at(-1).messages)).toContain(
      'This tool is not allowed in plan mode.',
    )
    expect(decide?.('lookup', 'plan')).toBe('allow')
    expect(decide?.('deploy', 'plan')).toBe('deny')
    await host.close()
  })

  it('never lets a saved answer beat a deny', async () => {
    const persistence = memoryPersistence()
    await persistence.stores.metadata.set(
      'tanstack/permissions',
      'permissions:saved:/work/repo',
      [{ tool: 'read_file', resource: 'secret.txt', decision: 'allow' }],
    )
    const tools = fakeTools()
    const { host, session } = await open(
      persistence,
      [
        permissions({
          root: ROOT,
          rules: [
            { tool: 'read_file', resource: 'secret.txt', decision: 'deny' },
          ],
        }),
        tools.plugin,
      ],
      [() => toolCall('read_file', { path: 'secret.txt' }, 'c1')],
    )

    await session.prompt('read the secret')

    expect(tools.ran).toEqual([])
    await host.close()
  })
})
