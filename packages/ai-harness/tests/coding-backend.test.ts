import { mkdtemp, rm, writeFile } from 'node:fs/promises'
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
import { commandEnv } from '../src/first-party/coding/backend'
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

  it('removes a file, and refuses a folder', async () => {
    const file = join(dir, 'a', 'b.txt')
    await hostBackend.writeFile(file, 'hi')
    await expect(hostBackend.remove(join(dir, 'a'))).rejects.toThrow()
    await hostBackend.remove(file)
    expect(await hostBackend.stat(file)).toBeUndefined()
    expect(await hostBackend.stat(join(dir, 'a'))).toMatchObject({
      type: 'dir',
    })
  })

  it('runs a command with added env, and resolves with its exit code', async () => {
    expect(
      await hostBackend.exec(
        `node -e "console.log(process.env.HARNESS_VALUE); process.exit(2)"`,
        { cwd: dir, env: { HARNESS_VALUE: 'set' } },
      ),
    ).toEqual({ exitCode: 2, stdout: 'set\n', stderr: '' })
  })

  // The command sleeps for one second. On Windows, `exec` waits for it even
  // after the timeout kills the shell, so keep it short. It runs outside
  // `dir`: on Windows, a running command keeps its folder from removal.
  const sleep = `node -e "setTimeout(function () {}, 1000)"`

  it('gives exit code 124 when the timeout kills a command', async () => {
    const result = await hostBackend.exec(sleep, { timeoutMs: 100 })
    expect(result.exitCode).toBe(124)
  })

  it('gives exit code 1 when the signal stops a command', async () => {
    const controller = new AbortController()
    const running = hostBackend.exec(sleep, { signal: controller.signal })
    controller.abort()
    expect((await running).exitCode).toBe(1)
  })

  it('starts a background command, then gives its exit code and output', async () => {
    // --no-warnings: a runner that sets NO_COLOR and FORCE_COLOR makes node
    // print a warning to the output.
    const job = hostBackend.spawn(
      `node --no-warnings -e "console.log('done')"`,
      {
        cwd: dir,
      },
    )
    expect(await job.wait()).toEqual({ exitCode: 0 })
    expect(job.output()).toBe('done\n')
  })

  it('kills a background command', async () => {
    const job = hostBackend.spawn(`node -e "setTimeout(function () {}, 60000)"`)
    job.kill()
    expect((await job.wait()).exitCode).not.toBe(0)
  })

  // cmd.exe looks in the current folder before the PATH. A cloned repo can
  // put an `rg.cmd` there, and grep runs `rg` with no question.
  it.runIf(process.platform === 'win32')(
    'does not run a program from the working folder by its name',
    async () => {
      // A host can set the variable already. Test the host that does not.
      const before = process.env.NoDefaultCurrentDirectoryInExePath
      delete process.env.NoDefaultCurrentDirectoryInExePath
      try {
        await writeFile(join(dir, 'rg.cmd'), '@echo ran> "%~dp0ran.txt"\r\n')
        await hostBackend.exec('rg --version', { cwd: dir })
        await hostBackend.spawn('rg --version', { cwd: dir }).wait()
        expect(await hostBackend.stat(join(dir, 'ran.txt'))).toBeUndefined()
      } finally {
        if (before !== undefined) {
          process.env.NoDefaultCurrentDirectoryInExePath = before
        }
      }
    },
  )

  it('sets NoDefaultCurrentDirectoryInExePath in the env of commands on Windows only', () => {
    expect(commandEnv(undefined, 'win32')).toMatchObject({
      NoDefaultCurrentDirectoryInExePath: '1',
    })
    expect(
      commandEnv(
        { AGENT: '1', NoDefaultCurrentDirectoryInExePath: '' },
        'win32',
      ),
    ).toMatchObject({ AGENT: '1', NoDefaultCurrentDirectoryInExePath: '1' })
    // Off Windows, only `env` is added to the environment of this process.
    expect(commandEnv(undefined, 'linux')).toBeUndefined()
    expect(commandEnv({ AGENT: '1' }, 'linux')).toEqual({
      ...process.env,
      AGENT: '1',
    })
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
