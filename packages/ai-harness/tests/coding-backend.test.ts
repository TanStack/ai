import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { memoryPersistence } from '@tanstack/ai-persistence'
import { createHarnessHost, defineHarness, definePlugin } from '../src'
import {
  WorkspaceHooks,
  hostBackend,
  workspaceTools,
} from '../src/first-party/coding'
import { mockAdapter, text, toolCall } from './helpers'

let dir = ''
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'harness-backend-'))
})
afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

const decoder = new TextDecoder()

describe('hostBackend', () => {
  it('writes into new folders, then reads, stats, and lists them', async () => {
    const file = join(dir, 'a', 'b.txt')
    await hostBackend.writeFile(file, 'hi')
    expect(decoder.decode(await hostBackend.readFile(file))).toBe('hi')
    expect(await hostBackend.stat(file)).toMatchObject({
      type: 'file',
      size: 2,
    })
    expect(await hostBackend.stat(join(dir, 'a'))).toMatchObject({
      type: 'dir',
    })
    expect(await hostBackend.readdir(dir)).toEqual([{ name: 'a', type: 'dir' }])
  })

  it('stats a missing path as undefined', async () => {
    expect(await hostBackend.stat(join(dir, 'missing'))).toBeUndefined()
  })

  it('runs a command with added env, and resolves with its exit code', async () => {
    expect(
      await hostBackend.exec(
        `node -e "console.log(process.env.HARNESS_VALUE); process.exit(2)"`,
        { cwd: dir, env: { HARNESS_VALUE: 'set' } },
      ),
    ).toEqual({ exitCode: 2, stdout: 'set\n', stderr: '' })
  })

  it('starts a background command, then gives its exit code and output', async () => {
    const job = hostBackend.spawn(`node -e "console.log('done')"`, {
      cwd: dir,
    })
    expect(await job.wait()).toEqual({ exitCode: 0 })
    expect(job.output()).toBe('done\n')
  })

  it('kills a background command', async () => {
    const job = hostBackend.spawn(
      `node -e "setTimeout(function () {}, 60000)"`,
    )
    job.kill()
    expect((await job.wait()).exitCode).not.toBe(0)
  })
})

describe('workspace hooks', () => {
  it('runs afterWrite after each write, and adds afterRead text to read_file', async () => {
    const written: Array<string> = []
    const hooks = definePlugin({
      name: 'test/hooks',
      setup: () => ({
        contribute: [
          WorkspaceHooks.item({
            afterWrite: async (path) => {
              written.push(decoder.decode(await hostBackend.readFile(path)))
            },
            afterRead: async (path) => `read ${basename(path)}`,
          }),
        ],
      }),
    })
    const { adapter, calls } = mockAdapter([
      () => toolCall('write_file', { path: 'a.txt', content: 'one' }, 'c1'),
      () =>
        toolCall('edit_file', { path: 'a.txt', old: 'one', new: 'two' }, 'c2'),
      () => toolCall('read_file', { path: 'a.txt' }, 'c3'),
      () => text('done'),
    ])
    const host = createHarnessHost({ persistence: memoryPersistence() })
    const session = await host.open(
      defineHarness({
        name: 'test/hooks',
        adapter,
        // The hooks plugin comes after the tools: the tools read hooks
        // when they run.
        plugins: () => [workspaceTools({ root: dir }), hooks],
      }),
      { threadId: 't' },
    )

    await session.prompt('work')

    expect(written).toEqual(['one', 'two'])
    expect(JSON.stringify(calls[3].messages)).toContain(
      '1\\ttwo\\n\\nread a.txt',
    )
    await host.close()
  })
})
