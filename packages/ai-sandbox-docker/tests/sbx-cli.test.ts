import { describe, expect, it } from 'vitest'
import {
  defaultSpawn,
  mapSbxError,
  parseSbxLs,
  runSbx,
  sbxExecArgs,
} from '../src/sbx/cli'
import type { SbxSpawn } from '../src/sbx/cli'

function trackingSignal(): { signal: AbortSignal; wasRemoved: () => boolean } {
  const real = new AbortController()
  let removed = false
  const signal = Object.create(real.signal) as AbortSignal
  const origAdd = real.signal.addEventListener.bind(real.signal)
  const origRemove = real.signal.removeEventListener.bind(real.signal)
  signal.addEventListener = ((
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    opts?: boolean | AddEventListenerOptions,
  ) => {
    if (listener) origAdd(type, listener, opts)
  }) as AbortSignal['addEventListener']
  signal.removeEventListener = ((
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    opts?: boolean | EventListenerOptions,
  ) => {
    removed = true
    if (listener) origRemove(type, listener, opts)
  }) as AbortSignal['removeEventListener']
  return { signal, wasRemoved: () => removed }
}

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

describe('sbxExecArgs', () => {
  it('puts flags before the sandbox name', () => {
    expect(
      sbxExecArgs('deadbeefdeadbeef', 'pwd', {
        cwd: '/home/user/work',
        env: { XAI_API_KEY: 'secret' },
      }),
    ).toEqual([
      'exec',
      '-w',
      '/home/user/work',
      '-e',
      'XAI_API_KEY=secret',
      '--',
      'deadbeefdeadbeef',
      'sh',
      '-c',
      'pwd',
    ])
  })

  it('omits -w and -e when cwd and env are unset', () => {
    expect(sbxExecArgs('deadbeefdeadbeef', 'pwd')).toEqual([
      'exec',
      '--',
      'deadbeefdeadbeef',
      'sh',
      '-c',
      'pwd',
    ])
  })
})

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
    const error = await runSbx(['ls'], {
      binary: 'sbx',
      spawn: fakeSpawn({ err }),
    }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(Error)
    if (!(error instanceof Error)) {
      throw new Error('expected Error')
    }
    expect(error.message).toContain('brew install docker/tap/sbx')
    expect(error.message).toContain('winget install Docker.sbx')
    expect(error.message).toContain('apt-get install docker-sbx')
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

  it('throws with login help when stderr says not authenticated', async () => {
    await expect(
      runSbx(['ls', '--json'], {
        binary: 'sbx',
        spawn: fakeSpawn({
          exitCode: 1,
          stderr:
            'ERROR: Not authenticated to Docker\n\nSign in with: sbx login',
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

  it('does not treat guest exec stdout 401 Unauthorized as a login error', async () => {
    const result = await runSbx(sbxExecArgs('name', 'echo unauthorized'), {
      allowNonZero: true,
      spawn: fakeSpawn({
        exitCode: 1,
        stdout: '401 Unauthorized',
      }),
    })
    expect(result.exitCode).toBe(1)
    expect(result.stdout).toBe('401 Unauthorized')
  })

  it('exec stderr unauthorized is NOT a login error', async () => {
    const error = await runSbx(
      sbxExecArgs('name', 'curl https://example.invalid'),
      {
        spawn: fakeSpawn({
          exitCode: 1,
          stderr: '401 unauthorized',
        }),
      },
    ).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(Error)
    if (!(error instanceof Error)) {
      throw new Error('expected Error')
    }
    expect(error.message).toMatch(/unauthorized/)
    expect(error.message).not.toContain('sbx login --password-stdin')
  })

  it('host ls stderr auth phrase IS a login error', async () => {
    await expect(
      runSbx(['ls'], {
        binary: 'sbx',
        spawn: fakeSpawn({
          exitCode: 1,
          stderr: 'Not authenticated to Docker',
        }),
      }),
    ).rejects.toThrow(/sbx login --password-stdin/)
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

  it('strips a sandboxd banner then parses a JSON array', () => {
    expect(parseSbxLs('sandboxd starting...\n[{"name":"abc"}]')).toEqual([
      { name: 'abc' },
    ])
  })

  it('strips a banner then parses { sandboxes: [...] }', () => {
    expect(
      parseSbxLs('sandboxd starting...\n{"sandboxes":[{"Name":"xyz"}]}'),
    ).toEqual([{ name: 'xyz' }])
  })
})

describe('mapSbxError', () => {
  it('does not swallow a generic Error', () => {
    expect(mapSbxError(new Error('boom'), 'sbx').message).toContain('boom')
  })
})

describe('defaultSpawn', () => {
  it('removes the abort listener after close', async () => {
    const { signal, wasRemoved } = trackingSignal()
    await new Promise<void>((resolve, reject) => {
      defaultSpawn('node', ['-e', 'process.exit(0)'], {
        signal,
        onClose: () => resolve(),
        onError: (err) => reject(err),
      })
    })
    expect(wasRemoved()).toBe(true)
  })

  it('removes the abort listener when kill() is called before close', async () => {
    const { signal, wasRemoved } = trackingSignal()
    const handle = defaultSpawn(
      'node',
      ['-e', 'setTimeout(() => {}, 30_000)'],
      {
        signal,
        onClose: () => {},
        onError: () => {},
      },
    )
    handle.kill()
    expect(wasRemoved()).toBe(true)
  })
})
