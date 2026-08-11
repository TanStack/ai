import { describe, expect, it } from 'vitest'
import { mapSbxError, parseSbxLs, runSbx } from '../src/sbx/cli'
import type { SbxSpawn } from '../src/sbx/cli'

function fakeSpawn(result: {
  stdout?: string
  stderr?: string
  exitCode?: number
  err?: NodeJS.ErrnoException
}): SbxSpawn {
  return (_bin, _args, opts) => {
    queueMicrotask(() => {
      if (result.err) {
        opts.onError(result.err)
        return
      }
      opts.onClose({
        stdout: result.stdout ?? '',
        stderr: result.stderr ?? '',
        exitCode: result.exitCode ?? 0,
      })
    })
    return { kill: () => {} }
  }
}

describe('runSbx', () => {
  it('returns stdout on exit 0', async () => {
    const result = await runSbx(['ls', '--json'], {
      binary: 'sbx',
      spawn: fakeSpawn({ stdout: '[]' }),
    })
    expect(result.stdout).toBe('[]')
    expect(result.exitCode).toBe(0)
  })

  it('throws with install help when the binary is missing', async () => {
    const err = Object.assign(new Error('spawn sbx ENOENT'), {
      code: 'ENOENT',
    })
    await expect(
      runSbx(['ls'], { binary: 'sbx', spawn: fakeSpawn({ err }) }),
    ).rejects.toThrow(/brew|winget|apt/)
  })

  it('throws with login help when stderr says not logged in', async () => {
    await expect(
      runSbx(['ls'], {
        binary: 'sbx',
        spawn: fakeSpawn({
          exitCode: 1,
          stderr: 'Error: not logged in. Run sbx login',
        }),
      }),
    ).rejects.toThrow(/sbx login --password-stdin/)
  })

  it('throws with stderr on any other non-zero exit', async () => {
    await expect(
      runSbx(['create'], {
        binary: 'sbx',
        spawn: fakeSpawn({
          exitCode: 2,
          stderr: 'unknown template',
        }),
      }),
    ).rejects.toThrow(/unknown template/)
  })
})

describe('parseSbxLs', () => {
  it('reads a top-level array of { name }', () => {
    expect(parseSbxLs('[{"name":"abc","status":"running"}]')).toEqual([
      { name: 'abc', status: 'running' },
    ])
  })

  it('reads { sandboxes: [...] }', () => {
    expect(
      parseSbxLs('{"sandboxes":[{"Name":"xyz","State":"stopped"}]}'),
    ).toEqual([{ name: 'xyz', status: 'stopped' }])
  })
})

describe('mapSbxError', () => {
  it('does not swallow a generic Error', () => {
    expect(mapSbxError(new Error('boom'), 'sbx').message).toContain('boom')
  })
})
