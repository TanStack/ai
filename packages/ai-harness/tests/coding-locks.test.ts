import {
  mkdtemp,
  readFile,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hostBackend } from '../src/first-party/coding/backend'
import { createWorkspaceTools } from '../src/first-party/coding/workspace'
import { gate } from './helpers'
import type { WorkspaceBackend } from '../src/first-party/coding/backend'

// Coverage runs in CI are slow, so polled checks wait up to 5 s.
const waitFor = <T>(
  check: () => T | Promise<T>,
  options?: { timeout?: number; interval?: number },
) => vi.waitFor(check, { timeout: 5_000, ...options })

let root = ''

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'harness-locks-'))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

const put = (path: string, text: string) => writeFile(join(root, path), text)
const read = (path: string) => readFile(join(root, path), 'utf8')

/**
 * The workspace tools of one session on `at` (default: `root`). Runs a tool
 * by its name. With `signal`, the call runs in the chat run of that signal.
 */
function openSession(backend: WorkspaceBackend = hostBackend, at = root) {
  const { tools } = createWorkspaceTools({ root: at, backend, web: false })
  return async (name: string, args: object, signal?: AbortSignal) => {
    const tool = tools.find((each) => each.name === name)
    if (!tool?.execute) throw new Error(`No tool ${name}.`)
    const result: unknown = await tool.execute(
      args,
      signal && { emitCustomEvent: () => undefined, abortSignal: signal },
    )
    return result
  }
}

/**
 * The host backend, with a count of the `realpath` and `stat` calls. With
 * `held`, each write waits for `release`, and `reached` resolves at the
 * first write.
 */
function watchedBackend({ held = false } = {}) {
  const reached = gate()
  const released = gate()
  const calls = { realpath: 0, stat: 0 }
  const backend: WorkspaceBackend = {
    ...hostBackend,
    realpath: (path) => {
      calls.realpath += 1
      return hostBackend.realpath(path)
    },
    stat: (path) => {
      calls.stat += 1
      return hostBackend.stat(path)
    },
    writeFile: async (path, data) => {
      if (held) {
        reached.open()
        await released.opened
      }
      return hostBackend.writeFile(path, data)
    },
  }
  return { backend, calls, reached: reached.opened, release: released.open }
}

/** Long enough for a call that does not wait at the lock to go past it. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 50))

/** A promise, and whether it settled. */
function tracked<T>(promise: Promise<T>) {
  const state = { settled: false }
  const done = promise.finally(() => {
    state.settled = true
  })
  return { done, state }
}

describe('file locks across sessions', () => {
  it('makes the second edit wait, then fails it: the file changed since its read', async () => {
    await put('a.txt', 'one\n')
    const first = watchedBackend({ held: true })
    const second = watchedBackend()
    const firstCall = openSession(first.backend)
    const secondCall = openSession(second.backend)
    await firstCall('read_file', { path: 'a.txt' })
    await secondCall('read_file', { path: 'a.txt' })

    const firstEdit = firstCall('edit_file', {
      path: 'a.txt',
      old: 'one',
      new: 'first',
    })
    await first.reached
    const before = second.calls.realpath
    const secondEdit = tracked(
      secondCall('edit_file', { path: 'a.txt', old: 'one', new: 'second' }),
    )
    // `reach` resolves the path once. The lock resolves it again only when
    // the first edit is done.
    await waitFor(() => expect(second.calls.realpath).toBe(before + 1))
    await settle()
    expect(second.calls.realpath).toBe(before + 1)
    expect(secondEdit.state.settled).toBe(false)

    first.release()
    await firstEdit
    await expect(secondEdit.done).rejects.toThrow(
      'a.txt changed since it was read. Read it again before you edit it.',
    )
    expect(await read('a.txt')).toBe('first\n')
  })

  it('makes an edit through another spelling of the root wait for the lock', async () => {
    await put('a.txt', 'one\n')
    const link = `${root}-link`
    await symlink(root, link, 'junction')
    try {
      const first = watchedBackend({ held: true })
      const firstCall = openSession(first.backend)
      const secondCall = openSession(hostBackend, link)
      await firstCall('read_file', { path: 'a.txt' })
      await secondCall('read_file', { path: 'a.txt' })

      const firstEdit = firstCall('edit_file', {
        path: 'a.txt',
        old: 'one',
        new: 'first',
      })
      await first.reached
      const secondEdit = tracked(
        secondCall('edit_file', { path: 'a.txt', old: 'one', new: 'second' }),
      )
      // One folder, one lock: the second edit waits for the first.
      await settle()
      expect(secondEdit.state.settled).toBe(false)

      first.release()
      await firstEdit
      await expect(secondEdit.done).rejects.toThrow(
        'a.txt changed since it was read.',
      )
      expect(await read('a.txt')).toBe('first\n')
    } finally {
      await unlink(link)
    }
  })

  it('lets the second session edit after it reads the file again', async () => {
    await put('a.txt', 'one two\n')
    const firstCall = openSession()
    const secondCall = openSession()
    await firstCall('read_file', { path: 'a.txt' })
    await secondCall('read_file', { path: 'a.txt' })
    await firstCall('edit_file', { path: 'a.txt', old: 'one', new: 'ONE' })
    await expect(
      secondCall('edit_file', { path: 'a.txt', old: 'two', new: 'TWO' }),
    ).rejects.toThrow('a.txt changed since it was read.')

    await secondCall('read_file', { path: 'a.txt' })
    await secondCall('edit_file', { path: 'a.txt', old: 'two', new: 'TWO' })

    expect(await read('a.txt')).toBe('ONE TWO\n')
  })

  it('fails write_file when another session created the file while it waited', async () => {
    const first = watchedBackend({ held: true })
    const second = watchedBackend()
    const firstWrite = openSession(first.backend)('write_file', {
      path: 'new.txt',
      content: 'first',
    })
    await first.reached
    const secondWrite = tracked(
      openSession(second.backend)('write_file', {
        path: 'new.txt',
        content: 'second',
      }),
    )
    // One `stat` before the lock sees no file. The check under the lock
    // waits for the first write.
    await waitFor(() => expect(second.calls.stat).toBe(1))
    await settle()
    expect(secondWrite.state.settled).toBe(false)

    first.release()
    await firstWrite
    await expect(secondWrite.done).rejects.toThrow(
      'new.txt was created while the tool waited. Read it before you edit it.',
    )
    expect(await read('new.txt')).toBe('first')
  })
})

describe('the unchanged check of each chat run', () => {
  it('fails a write of the lead after a subagent of the session changed the file', async () => {
    await put('a.txt', 'one\n')
    const call = openSession()
    const lead = new AbortController().signal
    const subagent = new AbortController().signal
    await call('read_file', { path: 'a.txt' }, lead)
    await call('read_file', { path: 'a.txt' }, subagent)
    await call('write_file', { path: 'a.txt', content: 'the fix\n' }, subagent)

    await expect(
      call('write_file', { path: 'a.txt', content: 'one, again\n' }, lead),
    ).rejects.toThrow('a.txt changed since it was read.')
    expect(await read('a.txt')).toBe('the fix\n')
  })
})

describe('the unchanged check', () => {
  it.each([
    ['edit_file', { path: 'a.txt', old: 'one', new: 'two' }],
    ['write_file', { path: 'a.txt', content: 'two\n' }],
    [
      'patch',
      {
        patch: [
          '*** Begin Patch',
          '*** Update File: a.txt',
          '@@',
          '-one',
          '+two',
          '*** End Patch',
        ].join('\n'),
      },
    ],
  ])(
    '%s fails for a file that changed on disk after the read',
    async (name, args) => {
      await put('a.txt', 'one\n')
      const call = openSession()
      await call('read_file', { path: 'a.txt' })
      await put('a.txt', 'changed on disk\n')

      await expect(call(name, args)).rejects.toThrow(
        'a.txt changed since it was read. Read it again before you edit it.',
      )
      expect(await read('a.txt')).toBe('changed on disk\n')
    },
  )

  it("keeps the session's own writes: a second edit after the first works", async () => {
    await put('a.txt', 'one two\n')
    const call = openSession()
    await call('read_file', { path: 'a.txt' })

    await call('edit_file', { path: 'a.txt', old: 'one', new: 'ONE' })
    await call('edit_file', { path: 'a.txt', old: 'two', new: 'TWO' })

    expect(await read('a.txt')).toBe('ONE TWO\n')
  })

  it('lets write_file replace a file that the session never read', async () => {
    await put('a.txt', 'one\n')

    await openSession()('write_file', { path: 'a.txt', content: 'two\n' })

    expect(await read('a.txt')).toBe('two\n')
  })
})
