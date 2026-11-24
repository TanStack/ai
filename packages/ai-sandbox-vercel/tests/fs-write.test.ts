import { describe, expect, it, vi } from 'vitest'
import { VercelHandle } from '../src/handle'
import type { Sandbox } from '@vercel/sandbox'

function recordingSandbox() {
  const runCommand = vi.fn(async () => ({
    exitCode: 0,
    output: async () => '',
  }))
  const writeFiles = vi.fn(
    async (
      _files: Array<{ path: string; content: string | Uint8Array }>,
      _opts?: { signal?: AbortSignal },
    ) => undefined,
  )
  const sandbox = {
    name: 'sbx-1',
    runCommand,
    writeFiles,
  } as unknown as Sandbox
  const handle = new VercelHandle({
    sandbox,
    workdir: '/vercel/sandbox',
    ports: [],
  })
  return { handle, runCommand, writeFiles }
}

describe('VercelHandle.fs.write', () => {
  it('uploads a large file in one writeFiles call, with no exec', async () => {
    const { handle, runCommand, writeFiles } = recordingSandbox()
    const payload = new Uint8Array(1024 * 1024).fill(0x61)

    await handle.fs.write('/workspace/big.bin', payload)

    expect(runCommand).not.toHaveBeenCalled()
    expect(writeFiles).toHaveBeenCalledTimes(1)
    expect(writeFiles).toHaveBeenCalledWith(
      [{ path: '/vercel/sandbox/big.bin', content: payload }],
      undefined,
    )
  })

  it('resolves a relative path against the workdir', async () => {
    const { handle, writeFiles } = recordingSandbox()

    await handle.fs.write('nested/note.txt', 'hello')

    expect(writeFiles.mock.calls[0]?.[0]).toEqual([
      { path: '/vercel/sandbox/nested/note.txt', content: 'hello' },
    ])
  })

  it('forwards the abort signal to the upload', async () => {
    const { handle, writeFiles } = recordingSandbox()
    const ac = new AbortController()

    await handle.fs.write('/tmp/x.txt', 'x', { signal: ac.signal })

    expect(writeFiles.mock.calls[0]?.[1]).toEqual({ signal: ac.signal })
  })
})
