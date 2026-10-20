import { mkdtemp, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { memoryPersistence } from '@tanstack/ai-persistence'
import {
  createExtensionPoint,
  createHarnessHost,
  defineCommand,
  defineHarness,
  definePlugin,
} from '../src'
import { decidePermission } from '../src/first-party/permissions'
import { projectInstructions } from '../src/first-party/node'
import { mockAdapter, text } from './helpers'
import type { HarnessHost, HarnessPlugin } from '../src'
import type { PermissionRule } from '../src/first-party/permissions'
import type * as NodeFs from 'node:fs'

// The sync calls a turn must not make. They wrap the real ones.
const sync = vi.hoisted(() => ({
  statSync: vi.fn(),
  readFileSync: vi.fn(),
}))
vi.mock('node:fs', async (importOriginal) => {
  const fs = await importOriginal<typeof NodeFs>()
  sync.statSync.mockImplementation(fs.statSync)
  sync.readFileSync.mockImplementation(fs.readFileSync)
  return { ...fs, statSync: sync.statSync, readFileSync: sync.readFileSync }
})

const hosts: Array<HarnessHost> = []
afterEach(async () => {
  vi.restoreAllMocks()
  await Promise.all(hosts.splice(0).map((host) => host.close()))
})

/** Open a session whose plugin list the test can change before a reload. */
async function open(plugins: Array<HarnessPlugin>) {
  const { adapter, calls } = mockAdapter(() => text('ok'))
  const host = createHarnessHost({ persistence: memoryPersistence() })
  hosts.push(host)
  const session = await host.open(
    defineHarness({
      name: 'test/hotpaths',
      adapter,
      plugins: () => [...plugins],
    }),
    { threadId: 't' },
  )
  return { session, calls }
}

describe('ctx.collect', () => {
  const Rules = createExtensionPoint<{ tool: string }>('test/hot-rules')
  const writer = (name: string, tool: string) =>
    definePlugin({
      name,
      setup: () => ({ contribute: [Rules.item({ tool })] }),
    })

  it('gives the same array at run time until the contributions change', async () => {
    let view: ReadonlyArray<{ tool: string }> = []
    const reader = definePlugin({
      name: 'test/reader',
      setup: (ctx) => {
        view = ctx.collect(Rules)
        return {
          commands: {
            snap: defineCommand({
              description: 'Collect the rules',
              run: () => ctx.collect(Rules),
            }),
          },
        }
      },
    })
    const plugins = [reader, writer('test/a', 'bash')]
    const { session } = await open(plugins)

    const first = await session.runCommand({ name: 'snap' })
    const second = await session.runCommand({ name: 'snap' })
    expect(second).toBe(first)
    expect(first).toEqual([{ tool: 'bash' }])
    // The view from setup filled as the later plugin set up.
    expect([...view]).toEqual([{ tool: 'bash' }])

    plugins.push(writer('test/b', 'write_file'))
    await session.reloadPlugins()
    const changed = await session.runCommand({ name: 'snap' })
    expect(changed).not.toBe(first)
    expect(changed).toEqual([{ tool: 'bash' }, { tool: 'write_file' }])
  })
})

describe('permission rule patterns', () => {
  it('compiles each rule pattern once for many calls', () => {
    // Patterns no other test uses, so the cache has none of them yet.
    const rules: Array<PermissionRule> = [
      { tool: 'bash', decision: 'allow', resource: 'hotpath-tool *' },
      { tool: 'edit_file', decision: 'allow', resource: 'hotpath/**/*.ts' },
    ]
    const call = () => [
      decidePermission(rules, 'bash', 'default', {
        resources: { commands: ['hotpath-tool run'] },
        fallback: 'ask',
      }),
      decidePermission(rules, 'edit_file', 'default', {
        resources: { paths: ['/root/hotpath/src/a.ts'] },
        root: '/root',
        fallback: 'ask',
      }),
    ]
    expect(call()).toEqual(['allow', 'allow'])

    const compiled = vi.spyOn(globalThis, 'RegExp')
    const results = Array.from({ length: 50 }, call)
    const compiledCount = compiled.mock.calls.length
    compiled.mockRestore()

    expect(compiledCount).toBe(0)
    expect(new Set(results.map((result) => result.join()))).toEqual(
      new Set(['allow,allow']),
    )
  })
})

describe('projectInstructions file checks', () => {
  let dir = ''
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('finds a changed file with no sync file call in a turn', async () => {
    dir = await mkdtemp(join(tmpdir(), 'harness-hotpaths-'))
    const file = join(dir, 'AGENTS.md')
    await writeFile(file, 'Use tabs.')
    const { session, calls } = await open([
      projectInstructions({ root: dir, env: false }),
    ])
    sync.statSync.mockClear()
    sync.readFileSync.mockClear()

    await session.send('one')
    await writeFile(file, 'Use spaces.')
    const later = Date.now() / 1000 + 60
    await utimes(file, later, later)
    await session.send('two')

    expect(calls[1].systemPrompts).toEqual([
      'Project instructions from AGENTS.md:\nUse tabs.',
      'Project instructions from AGENTS.md changed. Follow this text instead:\nUse spaces.',
    ])
    expect(sync.statSync).not.toHaveBeenCalled()
    expect(sync.readFileSync).not.toHaveBeenCalled()
  })
})
