import { describe, expect, it, vi } from 'vitest'
import { toolDefinition } from '@tanstack/ai'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, definePlugin } from '../src'
import {
  PermissionDecisionCapability,
  PermissionResources,
  PermissionRules,
  decidePermission,
  deleteSavedPermission,
  listSavedPermissions,
  permissions,
} from '../src/first-party/permissions'
import { gate, mockAdapter, questionsOf, text, toolCall } from './helpers'
import type { MetadataStore } from '@tanstack/ai-persistence'
import type {
  HarnessPersistence,
  HarnessPlugin,
  HarnessSession,
  HarnessUser,
} from '../src'
import type {
  CallResources,
  PermissionDecision,
  PermissionMode,
  PermissionRule,
} from '../src/first-party/permissions'
import type { Reply } from './helpers'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(
  check: () => T | Promise<T>,
  options?: { timeout?: number; interval?: number },
) => vi.waitFor(check, { timeout: 5_000, ...options })

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
  user?: HarnessUser,
) {
  const { adapter, calls } = mockAdapter([...replies, () => text('done')])
  const host = createHarnessHost({ persistence })
  const session = await host.open(
    defineHarness({
      name: 'test/permissions',
      adapter,
      plugins: () => plugins,
    }),
    {
      threadId,
      ...(user ? { user } : {}),
    },
  )
  return { host, session, calls }
}

/**
 * Wait for the one open approval of the turn, then answer it through
 * `resolve`, and wait for the turn that resumes. Returns its message.
 */
async function answer(session: HarnessSession, value: unknown) {
  await waitFor(() => expect(session.snapshot().pendingWaits).toHaveLength(1))
  const [wait] = session.snapshot().pendingWaits
  if (!wait) throw new Error('No approval.')
  expect(wait.kind).toBe('approval')
  const inputId = `answer:${wait.waitId}`
  await session.resolve({
    resume: [{ interruptId: wait.waitId, status: 'resolved', payload: value }],
    inputId,
  })
  await session.settled({ inputId })
  return wait.message ?? ''
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

    const turn = first.session.send('read it twice')
    expect(await answer(first.session, { answer: 'always' })).toContain('.env')
    await turn

    expect(tools.ran).toEqual(['read_file', 'read_file'])
    expect(
      await persistence.stores.metadata.get(
        'tanstack/permissions',
        'permissions:saved::/work/repo',
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
    const next = second.session.send('read again')
    // `.env` runs at once. `other.env` has no saved answer, so it asks.
    expect(await answer(second.session, { answer: 'once' })).toContain(
      'other.env',
    )
    await next

    expect(tools.ran).toHaveLength(4)
    await second.host.close()
  })

  it('decides on the final arguments: a middleware before it cannot rewrite a call past a deny', async () => {
    const tools = fakeTools()
    // It runs before permissions(), and its onBeforeToolCall wins first.
    const rewrite = definePlugin({
      name: 'test/rewrite',
      setup: () => ({
        middleware: [
          {
            name: 'test/rewrite',
            onBeforeToolCall: (_run, hook) =>
              hook.toolName === 'read_file'
                ? { type: 'transformArgs', args: { path: 'secrets/key' } }
                : undefined,
          },
        ],
      }),
    })
    const deny: PermissionRule = {
      tool: 'read_file',
      resource: 'secrets/**',
      decision: 'deny',
    }
    const { host, session, calls } = await open(
      memoryPersistence(),
      [rewrite, permissions({ root: ROOT, rules: [deny] }), tools.plugin],
      [() => toolCall('read_file', { path: 'src/a.ts' }, 'c1')],
    )

    await session.send('Read a file.')

    expect(tools.ran).toEqual([])
    expect(JSON.stringify(calls[1].messages)).toContain(
      'A permission rule denies this tool.',
    )
    await host.close()
  })

  it('keeps an always answer for the session when there is no metadata store', async () => {
    const { stores } = memoryPersistence()
    const tools = fakeTools()
    const { host, session } = await open(
      { stores: { log: stores.log } },
      [permissions({ root: ROOT }), tools.plugin],
      [
        () => toolCall('read_file', { path: '../shared.txt' }, 'c1'),
        () => toolCall('read_file', { path: '../shared.txt' }, 'c2'),
      ],
    )

    const turn = session.send('read it twice')
    await answer(session, { answer: 'always' })
    await turn

    expect(tools.ran).toEqual(['read_file', 'read_file'])
    expect(session.snapshot().pendingWaits).toEqual([])
    await host.close()
  })

  it('takes a yes or a no, as every approval does', async () => {
    const tools = fakeTools()
    const { host, session } = await open(
      memoryPersistence(),
      [permissions({ root: ROOT }), tools.plugin],
      [
        () => toolCall('read_file', { path: '../a.txt' }, 'c1'),
        () => toolCall('read_file', { path: '../b.txt' }, 'c2'),
      ],
    )

    const turn = session.send('read two files')
    // A client that knows only yes or no (a view, the CLI, ACP, MCP).
    await answer(session, true)
    await answer(session, false)
    await turn

    expect(tools.ran).toEqual(['read_file'])
    await host.close()
  })

  it('keeps the mode of a turn until it ends: a change applies at the next turn', async () => {
    const tools = fakeTools()
    const started = gate()
    const release = gate()
    const { host, session } = await open(
      memoryPersistence(),
      [permissions({ root: ROOT }), tools.plugin],
      [
        () =>
          (async function* () {
            started.open()
            await release.opened
            yield* toolCall('bash', { command: 'ls' }, 'c1')
          })(),
        () => text('listed'),
        () => toolCall('bash', { command: 'ls' }, 'c2'),
      ],
    )

    const turn = session.send('list it')
    await started.opened
    await session.setPluginSetting({ key: 'mode', value: 'bypass' })
    expect(session.pluginSettings().mode?.value).toBe('bypass')
    release.open()
    // The running turn still has the default mode, so bash asks.
    await answer(session, { answer: 'once' })
    await turn

    // The next turn has bypass, so bash runs with no question.
    await session.send('list it again')
    expect(questionsOf(session.snapshot())).toHaveLength(0)
    expect(tools.ran).toEqual(['bash', 'bash'])
    await host.close()
  })

  it('gives the model a tool error with the message of a reject', async () => {
    const tools = fakeTools()
    const { host, session, calls } = await open(
      memoryPersistence(),
      [permissions({ root: ROOT }), tools.plugin],
      [() => toolCall('read_file', { path: '../secret.txt' }, 'c1')],
    )

    const turn = session.send('read outside')
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

  it('says in the question when the arguments are cut', async () => {
    const tools = fakeTools()
    const command = `echo ${'a'.repeat(400)} && rm -rf x`
    const { host, session } = await open(
      memoryPersistence(),
      [permissions({ root: ROOT }), tools.plugin],
      [() => toolCall('bash', { command }, 'c1')],
    )

    const turn = session.send('run it')
    const message = await answer(session, { answer: 'reject' })
    await turn

    expect(message).toMatch(/\.\.\. \(\d+ more characters not shown\)\?/)
    expect(message).not.toContain('rm -rf x')
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

    const turn = session.send('list, then clean')
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

    await session.send('hi')

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

    await session.send('read nothing')

    expect(tools.ran).toEqual([])
    expect(session.snapshot().pendingWaits).toEqual([])
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

    const turn = session.send('read a file')
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
    const turn = session.send('look up, then deploy')
    expect(await answer(session, { answer: 'reject' })).toContain('deploy')
    await turn
    expect(ran).toEqual(['lookup'])
    expect(decide?.('lookup', 'default')).toBe('allow')
    expect(decide?.('deploy', 'default')).toBe('ask')

    // Plan mode denies what would ask.
    await session.runCommand({ name: 'mode', input: 'plan' })
    await session.send('again, in plan mode')
    expect(ran).toEqual(['lookup', 'lookup'])
    expect(JSON.stringify(calls.at(-1).messages)).toContain(
      'This tool is not allowed in plan mode.',
    )
    expect(decide?.('lookup', 'plan')).toBe('allow')
    expect(decide?.('deploy', 'plan')).toBe('deny')
    await host.close()
  })

  it('tells other plugins the decision for a call that touches resources, from the root', async () => {
    let decide:
      | ((
          tool: string,
          mode: PermissionMode,
          resources?: CallResources,
        ) => PermissionDecision)
      | undefined
    const reader = definePlugin({
      name: 'test/reader',
      optionalRequires: [PermissionDecisionCapability],
      setup: (ctx) => {
        decide = ctx.getOptional(PermissionDecisionCapability)
        return {}
      },
    })
    const rules: Array<PermissionRule> = [
      ...readAllowed,
      { tool: 'read_file', resource: 'secrets/**', decision: 'deny' },
    ]
    const { host } = await open(
      memoryPersistence(),
      [permissions({ root: ROOT, rules }), reader],
      [],
    )
    const read = (mode: PermissionMode, ...paths: Array<string>) =>
      decide?.('read_file', mode, { paths })

    expect(read('default', `${ROOT}/src/a.ts`)).toBe('allow')
    expect(read('default', `${ROOT}/.env`)).toBe('ask')
    expect(read('plan', `${ROOT}/.env`)).toBe('deny')
    expect(read('default', `${ROOT}/src/a.ts`, `${ROOT}/secrets/key`)).toBe(
      'deny',
    )
    await host.close()
  })

  it('never lets a saved answer beat a deny', async () => {
    const persistence = memoryPersistence()
    await persistence.stores.metadata.set(
      'tanstack/permissions',
      'permissions:saved::/work/repo',
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

    await session.send('read the secret')

    expect(tools.ran).toEqual([])
    await host.close()
  })

  it('keeps the saved rules of each tenant apart', async () => {
    const persistence = memoryPersistence()
    const tools = fakeTools()
    const first = await open(
      persistence,
      [permissions({ root: ROOT }), tools.plugin],
      [() => toolCall('read_file', { path: '.env' }, 'c1')],
      't',
      { id: 'u-1', tenantId: 'org-a' },
    )
    const turn = first.session.send('read it')
    await answer(first.session, { answer: 'always' })
    await turn
    await first.host.close()

    const saved = [{ tool: 'read_file', resource: '.env', decision: 'allow' }]
    expect(
      await listSavedPermissions(persistence.stores, ROOT, {
        tenantId: 'org-a',
      }),
    ).toEqual(saved)
    expect(await listSavedPermissions(persistence.stores, ROOT)).toEqual([])

    // The same project in another tenant asks again.
    const other = await open(
      persistence,
      [permissions({ root: ROOT }), tools.plugin],
      [() => toolCall('read_file', { path: '.env' }, 'c2')],
      't',
      { id: 'u-2', tenantId: 'org-b' },
    )
    const otherTurn = other.session.send('read it')
    expect(await answer(other.session, { answer: 'once' })).toContain('.env')
    await otherTurn
    await other.host.close()
    expect(
      await listSavedPermissions(persistence.stores, ROOT, {
        tenantId: 'org-b',
      }),
    ).toEqual([])
  })

  it('keeps a rule that another host saves while a delete runs', async () => {
    const base = memoryPersistence().stores.metadata
    const { getVersioned, setIf } = base
    if (!getVersioned || !setIf) throw new Error('No compare-and-set.')
    const kept: PermissionRule = {
      tool: 'bash',
      resource: 'git status',
      decision: 'allow',
    }
    const gone: PermissionRule = {
      tool: 'read_file',
      resource: '.env',
      decision: 'allow',
    }
    const added: PermissionRule = { tool: 'deploy', decision: 'allow' }
    let raced = false
    // After the delete reads, another host saves `added`.
    const racing: MetadataStore = {
      get: (namespace, key) => base.get(namespace, key),
      set: (namespace, key, value) => base.set(namespace, key, value),
      delete: (namespace, key) => base.delete(namespace, key),
      getVersioned: async (namespace, key) => {
        const read = await getVersioned.call(base, namespace, key)
        if (!raced) {
          raced = true
          await base.set(namespace, key, [kept, gone, added])
        }
        return read
      },
      setIf: (namespace, key, value, revision) =>
        setIf.call(base, namespace, key, value, revision),
    }
    const stores = { metadata: racing }
    await base.set('tanstack/permissions', 'permissions:saved::/work/repo', [
      kept,
      gone,
    ])

    await deleteSavedPermission(stores, ROOT, gone)

    expect(await listSavedPermissions(stores, ROOT)).toEqual([kept, added])
  })

  it('lists the saved rules of a project, and deletes one by its fields', async () => {
    const persistence = memoryPersistence()
    const tools = fakeTools()
    const { host, session } = await open(
      persistence,
      [permissions({ root: ROOT }), tools.plugin],
      [
        () => toolCall('read_file', { path: '.env' }, 'c1'),
        () => toolCall('bash', { command: 'git status' }, 'c2'),
      ],
    )

    const turn = session.send('read, then run')
    await answer(session, { answer: 'always' })
    await answer(session, { answer: 'always' })
    await turn
    await host.close()

    expect(await listSavedPermissions(persistence.stores, ROOT)).toEqual([
      { tool: 'read_file', resource: '.env', decision: 'allow' },
      { tool: 'bash', resource: 'git status', decision: 'allow' },
    ])
    expect(await listSavedPermissions(persistence.stores, '/other')).toEqual([])

    await deleteSavedPermission(persistence.stores, ROOT, {
      tool: 'bash',
      resource: 'git *',
      decision: 'allow',
    })
    await deleteSavedPermission(persistence.stores, ROOT, {
      tool: 'read_file',
      resource: '.env',
      decision: 'allow',
    })
    expect(await listSavedPermissions(persistence.stores, ROOT)).toEqual([
      { tool: 'bash', resource: 'git status', decision: 'allow' },
    ])
  })

  it('lists saved rules with /permissions, and forgets one with /permissions forget', async () => {
    const persistence = memoryPersistence()
    await persistence.stores.metadata.set(
      'tanstack/permissions',
      'permissions:saved::/work/repo',
      [
        { tool: 'bash', resource: 'git status', decision: 'allow' },
        { tool: 'deploy', decision: 'allow' },
      ],
    )
    const tools = fakeTools()
    const { host, session } = await open(
      persistence,
      [permissions({ root: ROOT }), tools.plugin],
      [],
    )

    expect(await session.runCommand({ name: 'permissions' })).toBe(
      'Saved rules:\n1. bash git status\n2. deploy',
    )
    expect(
      await session.runCommand({ name: 'permissions', input: 'forget 3' }),
    ).toBe('No saved rule 3. Run /permissions to see the list.')
    expect(
      await session.runCommand({ name: 'permissions', input: 'forget 1' }),
    ).toBe('Forgot rule 1: bash git status.')
    expect(await listSavedPermissions(persistence.stores, ROOT)).toEqual([
      { tool: 'deploy', decision: 'allow' },
    ])
    await session.runCommand({ name: 'permissions', input: 'forget 1' })
    expect(await session.runCommand({ name: 'permissions' })).toBe(
      'No saved rules.',
    )
    await host.close()
  })

  it('asks again in the open session after /permissions forget', async () => {
    const tools = fakeTools()
    const { host, session } = await open(
      memoryPersistence(),
      [permissions({ root: ROOT }), tools.plugin],
      [
        () => toolCall('bash', { command: 'git status' }, 'c1'),
        () => text('ran'),
        () => toolCall('bash', { command: 'git status' }, 'c2'),
      ],
    )

    const first = session.send('run it')
    await answer(session, { answer: 'always' })
    await first
    expect(
      await session.runCommand({ name: 'permissions', input: 'forget 1' }),
    ).toBe('Forgot rule 1: bash git status.')

    const second = session.send('run it again')
    expect(await answer(session, { answer: 'once' })).toContain('git status')
    await second
    expect(tools.ran).toEqual(['bash', 'bash'])
    await host.close()
  })

  it('decides the other actions of a call, like a formatter, with the call, by the mode', async () => {
    const persistence = memoryPersistence()
    const ran: Array<string> = []
    // A tool that writes, and a plugin like formatter(): it adds an ask
    // rule, and names the action that the call runs after the write.
    const writer = definePlugin({
      name: 'test/writer',
      setup: () => ({
        tools: [
          toolDefinition({ name: 'write_doc', description: 'Write' }).server(
            async () => {
              ran.push('write_doc')
              return 'written'
            },
          ),
        ],
        contribute: [
          PermissionRules.item({
            tool: 'write_doc',
            decision: 'allow',
            kind: 'edit',
          }),
          PermissionResources.item({ write_doc: { paths: () => ['a.md'] } }),
        ],
      }),
    })
    const runner = definePlugin({
      name: 'test/runner',
      setup: () => ({
        contribute: [
          PermissionRules.item({
            tool: 'formatter:*',
            decision: 'ask',
            kind: 'execute',
          }),
          PermissionResources.item({
            write_doc: {
              actions: async (input) => [`formatter:${field(input, 'with')}`],
            },
          }),
        ],
      }),
    })
    const { host, session } = await open(
      persistence,
      [
        permissions({
          root: ROOT,
          rules: [{ tool: 'formatter:biome', decision: 'allow' }],
        }),
        writer,
        runner,
      ],
      [
        () => toolCall('write_doc', { with: 'biome' }, 'c1'),
        () => toolCall('write_doc', { with: 'prettier' }, 'c2'),
        () => text('done'),
        () => toolCall('write_doc', { with: 'prettier' }, 'c3'),
        () => text('done'),
        () => toolCall('write_doc', { with: 'prettier' }, 'c4'),
        () => text('done'),
      ],
    )
    await session.runCommand({ name: 'mode', input: 'acceptEdits' })

    // A user rule allows biome. prettier asks, also in acceptEdits mode,
    // before the call runs: one approval for the call and its formatter.
    await session.send('write twice')
    expect(ran).toEqual(['write_doc'])
    expect(await answer(session, { answer: 'reject' })).toContain(
      'Allow write_doc {"with":"prettier"}?',
    )
    expect(ran).toEqual(['write_doc'])

    // always saves the rule of the formatter for the project.
    await session.send('write again')
    await answer(session, { answer: 'always' })
    expect(ran).toEqual(['write_doc', 'write_doc'])
    expect(
      await persistence.stores.metadata.get(
        'tanstack/permissions',
        'permissions:saved::/work/repo',
      ),
    ).toEqual([
      { tool: 'write_doc', resource: 'a.md', decision: 'allow' },
      { tool: 'formatter:prettier', decision: 'allow' },
    ])
    await session.send('and again')
    expect(ran).toHaveLength(3)
    expect(session.snapshot().pendingWaits).toEqual([])
    await host.close()
  })

  it('tells other plugins the decision for the actions of a call', async () => {
    let decide:
      | ((
          tool: string,
          mode: PermissionMode,
          resources?: CallResources,
        ) => PermissionDecision)
      | undefined
    const reader = definePlugin({
      name: 'test/reader',
      optionalRequires: [PermissionDecisionCapability],
      setup: (ctx) => {
        decide = ctx.getOptional(PermissionDecisionCapability)
        return {}
      },
    })
    const { host } = await open(
      memoryPersistence(),
      [
        permissions({
          rules: [
            { tool: 'write_doc', decision: 'allow', kind: 'edit' },
            { tool: 'formatter:*', decision: 'ask', kind: 'execute' },
            { tool: 'formatter:biome', decision: 'allow' },
          ],
        }),
        reader,
      ],
      [],
    )
    const actions = (name: string) => ({ actions: [`formatter:${name}`] })
    expect(decide?.('write_doc', 'default', actions('biome'))).toBe('allow')
    expect(decide?.('write_doc', 'acceptEdits', actions('oxfmt'))).toBe('ask')
    expect(decide?.('write_doc', 'plan', actions('oxfmt'))).toBe('deny')
    expect(decide?.('write_doc', 'bypass', actions('oxfmt'))).toBe('allow')
    await host.close()
  })
})

describe('permissions() at the turn boundary', () => {
  it('stops the turn before the tools run, with one approval for each call that asks, and runs only the approved call', async () => {
    const tools = fakeTools()
    const first = toolCall('bash', { command: 'ls' }, 'c1')
    const second = toolCall('bash', { command: 'rm x' }, 'c2')
    const { host, session, calls } = await open(
      memoryPersistence(),
      [permissions({ root: ROOT }), tools.plugin],
      // One model message with both calls.
      [() => [...first.slice(0, -1), ...second.slice(1)]],
    )

    const turn = await session.send('clean up')
    expect(turn.interrupts).toHaveLength(2)
    // No tool ran, and no process waits: the turn ended for the waits.
    expect(tools.ran).toEqual([])
    const waits = session.snapshot().pendingWaits
    expect(waits.map((wait) => wait.kind)).toEqual(['approval', 'approval'])
    expect(waits.map((wait) => wait.message)).toEqual([
      expect.stringContaining('ls'),
      expect.stringContaining('rm x'),
    ])

    await session.resolve({
      resume: [
        {
          interruptId: waits[0]!.waitId,
          status: 'resolved',
          payload: { answer: 'once' },
        },
        {
          interruptId: waits[1]!.waitId,
          status: 'resolved',
          payload: { answer: 'reject' },
        },
      ],
      inputId: 'answers',
    })
    await session.settled({ inputId: 'answers' })

    expect(tools.ran).toEqual(['bash'])
    const seen = JSON.stringify(calls[1]?.messages)
    expect(seen).toContain('bash done')
    expect(seen).toContain('The user denied this tool call.')
    await host.close()
  })
})
