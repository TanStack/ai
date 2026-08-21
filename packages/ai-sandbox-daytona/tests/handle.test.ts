import { describe, expect, it, vi } from 'vitest'
import { journalReadStrategy } from '@tanstack/ai-sandbox'
import { DaytonaHandle } from '../src/handle'
import type { Sandbox } from '@daytona/sdk'

function fakeSandbox(preview: {
  url: string
  token?: string
  signedUrl?: string
  signedToken?: string
}): Sandbox {
  return {
    id: 'sbx-1',
    getPreviewLink: vi.fn(async () => ({
      url: preview.url,
      token: preview.token,
    })),
    getSignedPreviewUrl: vi.fn(async () => ({
      url: preview.signedUrl ?? preview.url,
      token: preview.signedToken ?? preview.token,
    })),
    delete: vi.fn(async () => {}),
  } as unknown as Sandbox
}

/**
 * A sandbox whose session command never reports an exit code, i.e. a process that
 * is still running — the only state in which "is it killable?" means anything.
 */
function fakeRunningSandbox(): {
  sandbox: Sandbox
  deleteSession: ReturnType<typeof vi.fn>
} {
  const deleteSession = vi.fn(async (_sessionId: string) => undefined)
  const sandbox = {
    id: 'sbx-1',
    process: {
      createSession: vi.fn(async (_id: string) => undefined),
      executeSessionCommand: vi.fn(async () => ({ cmdId: 'cmd-1' })),
      getSessionCommandLogs: vi.fn(async () => ({ stdout: '', stderr: '' })),
      // `exitCode: undefined` == still running, forever.
      getSessionCommand: vi.fn(async () => ({ exitCode: undefined })),
      deleteSession,
    },
    delete: vi.fn(async () => {}),
  } as unknown as Sandbox
  return { sandbox, deleteSession }
}

describe('DaytonaHandle capabilities', () => {
  it('does NOT advertise killableProcesses: kill() only aborts the client-side poll loop', () => {
    const sandbox = fakeSandbox({
      url: 'https://5173-sbx-1.proxy.daytona.work',
    })
    const handle = new DaytonaHandle({
      sandbox,
      workdir: '/home/daytona/workspace',
    })
    // Asserted as BEHAVIOR downstream, not just as a constant: the capability
    // selects the journal read strategy, and a wrong `true` would hand this
    // provider an unstoppable `tail -f` per run.
    expect(handle.capabilities.killableProcesses).toBe(false)
    expect(journalReadStrategy(handle)).toBe('poll')
  })

  it('kill() resolves BEFORE anything has tried to terminate the remote command', async () => {
    const { sandbox, deleteSession } = fakeRunningSandbox()
    const handle = new DaytonaHandle({
      sandbox,
      workdir: '/home/daytona/workspace',
    })

    const proc = await handle.process.spawn('sleep 987654321')
    await proc.kill()
    // This is the measurement that makes `killableProcesses: false` the honest
    // declaration. `kill()` has already resolved and the session — the only
    // mechanism that could terminate the command at all — has not been touched.
    expect(deleteSession).not.toHaveBeenCalled()

    // The delete does eventually happen, from the pump's `finally`, well after
    // `kill()` told the caller it was done.
    await proc.wait()
    expect(deleteSession).toHaveBeenCalled()
  }, 10_000)
})

describe('DaytonaHandle.ports.connect', () => {
  it('returns a signed preview URL for private sandboxes', async () => {
    const sandbox = fakeSandbox({
      url: 'https://5173-sbx-1.proxy.daytona.work',
      token: 'standard-tok',
      signedUrl: 'https://5173-signed-tok.proxy.daytona.work',
      signedToken: 'signed-tok',
    })
    const handle = new DaytonaHandle({
      sandbox,
      workdir: '/home/daytona/workspace',
    })

    const channel = await handle.ports.connect(5173)

    expect(sandbox.getPreviewLink).toHaveBeenCalledWith(5173)
    expect(sandbox.getSignedPreviewUrl).toHaveBeenCalledWith(5173, 3600)
    expect(channel).toEqual({
      url: 'https://5173-signed-tok.proxy.daytona.work',
      token: 'signed-tok',
    })
    expect(channel.headers).toBeUndefined()
  })

  it('returns the plain preview URL for public sandboxes', async () => {
    const sandbox = fakeSandbox({
      url: 'https://5173-sbx-1.proxy.daytona.work',
    })
    const handle = new DaytonaHandle({
      sandbox,
      workdir: '/home/daytona/workspace',
    })

    const channel = await handle.ports.connect(5173)

    expect(sandbox.getSignedPreviewUrl).not.toHaveBeenCalled()
    expect(channel).toEqual({
      url: 'https://5173-sbx-1.proxy.daytona.work',
    })
  })
})

// Native Daytona git takes a path argument, not a shell string. A virtual
// clone target must still land under the real workdir.
// Issues #1081 item 4, #1085 item 4.
describe('DaytonaHandle.git.clone remaps /workspace', () => {
  it('clones a virtual /workspace dir into the real workdir', async () => {
    const clone = vi.fn(async () => {})
    const createFolder = vi.fn(async () => {})
    const sandbox = {
      id: 'sbx-1',
      git: { clone },
      fs: { createFolder, uploadFile: vi.fn(async () => {}) },
      process: {
        executeCommand: vi.fn(async () => ({ result: '', exitCode: 0 })),
      },
      delete: vi.fn(async () => {}),
    } as unknown as Sandbox
    const handle = new DaytonaHandle({
      sandbox,
      workdir: '/home/daytona/workspace',
    })

    await handle.git.clone({
      url: 'https://github.com/owner/skills-pack',
      dir: '/workspace/.tanstack-skills/skills-pack',
    })

    expect(createFolder).toHaveBeenCalledWith(
      '/home/daytona/workspace/.tanstack-skills',
      '755',
    )
    expect(clone).toHaveBeenCalledWith(
      'https://github.com/owner/skills-pack',
      '/home/daytona/workspace/.tanstack-skills/skills-pack',
      undefined,
      undefined,
      undefined,
      undefined,
    )
    expect(sandbox.process.executeCommand).not.toHaveBeenCalled()
  })

  it('passes git auth as native username/password, not a command env export', async () => {
    const clone = vi.fn(async () => {})
    const sandbox = {
      id: 'sbx-1',
      git: { clone },
      process: {
        executeCommand: vi.fn(async () => ({ result: '', exitCode: 0 })),
      },
      delete: vi.fn(async () => {}),
    } as unknown as Sandbox
    const handle = new DaytonaHandle({
      sandbox,
      workdir: '/home/daytona/workspace',
    })

    await handle.git.clone({
      url: 'https://github.com/owner/private-repo',
      dir: '/workspace/app',
      auth: { username: 'x-access-token', token: 'ghs_secret' },
    })

    expect(clone).toHaveBeenCalledWith(
      'https://github.com/owner/private-repo',
      '/home/daytona/workspace/app',
      undefined,
      undefined,
      'x-access-token',
      'ghs_secret',
    )
    expect(sandbox.process.executeCommand).not.toHaveBeenCalled()
  })
})

// Issue #1084: secrets must not appear in the command string Daytona stores.
// Issue #1085 item 4: fs uses the native SDK, not base64-over-exec.
describe('DaytonaHandle env and native fs', () => {
  it('sends per-command env through executeCommand, not export prefixes', async () => {
    const executeCommand = vi.fn(
      async (
        _command: string,
        _cwd?: string,
        _env?: Record<string, string>,
      ) => ({ result: '', exitCode: 0 }),
    )
    const sandbox = {
      id: 'sbx-1',
      process: { executeCommand },
      delete: vi.fn(async () => {}),
    } as unknown as Sandbox
    const handle = new DaytonaHandle({
      sandbox,
      workdir: '/home/daytona/workspace',
    })

    await handle.env.set({ ANTHROPIC_API_KEY: 'sk-secret-value' })
    await handle.process.exec('echo hello', {
      env: { GIT_ASKPASS_TOKEN: 'ghs_secret' },
    })

    expect(executeCommand).toHaveBeenCalledWith(
      'echo hello',
      '/home/daytona/workspace',
      {
        ANTHROPIC_API_KEY: 'sk-secret-value',
        GIT_ASKPASS_TOKEN: 'ghs_secret',
      },
    )
    const command = executeCommand.mock.calls[0]?.[0]
    expect(command).not.toContain('sk-secret-value')
    expect(command).not.toContain('ghs_secret')
    expect(command).not.toContain('export ')
  })

  it('writes files through native uploadFile, not a base64 exec command', async () => {
    const uploadFile = vi.fn(async () => {})
    const createFolder = vi.fn(async () => {})
    const executeCommand = vi.fn(async () => ({ result: '', exitCode: 0 }))
    const sandbox = {
      id: 'sbx-1',
      fs: { uploadFile, createFolder },
      process: { executeCommand },
      delete: vi.fn(async () => {}),
    } as unknown as Sandbox
    const handle = new DaytonaHandle({
      sandbox,
      workdir: '/home/daytona/workspace',
    })

    await handle.fs.write('/workspace/note.txt', 'inside the sandbox')

    expect(createFolder).toHaveBeenCalledWith('/home/daytona/workspace', '755')
    expect(uploadFile).toHaveBeenCalledWith(
      Buffer.from('inside the sandbox', 'utf8'),
      '/home/daytona/workspace/note.txt',
    )
    expect(executeCommand).not.toHaveBeenCalled()
  })

  it('reads files through native downloadFile', async () => {
    const downloadFile = vi.fn(async () =>
      Buffer.from('inside the sandbox', 'utf8'),
    )
    const executeCommand = vi.fn(async () => ({ result: '', exitCode: 0 }))
    const sandbox = {
      id: 'sbx-1',
      fs: { downloadFile },
      process: { executeCommand },
      delete: vi.fn(async () => {}),
    } as unknown as Sandbox
    const handle = new DaytonaHandle({
      sandbox,
      workdir: '/home/daytona/workspace',
    })

    await expect(handle.fs.read('/workspace/note.txt')).resolves.toBe(
      'inside the sandbox',
    )
    expect(downloadFile).toHaveBeenCalledWith(
      '/home/daytona/workspace/note.txt',
    )
    expect(executeCommand).not.toHaveBeenCalled()
  })
})

// Issue #1085 items 1 and 2: spawn follows the log over the WebSocket form
// and exposes session stdin.
describe('DaytonaHandle spawn stream and stdin', () => {
  it('follows session logs with the streaming getSessionCommandLogs form', async () => {
    const getSessionCommandLogs = vi.fn(
      async (
        _sessionId: string,
        _commandId: string,
        onStdout?: (chunk: string) => void,
        _onStderr?: (chunk: string) => void,
      ) => {
        onStdout?.('streamed-line\n')
      },
    )
    const sandbox = {
      id: 'sbx-1',
      process: {
        createSession: vi.fn(async () => {}),
        executeSessionCommand: vi.fn(async () => ({ cmdId: 'cmd-1' })),
        getSessionCommandLogs,
        getSessionCommand: vi.fn(async () => ({ exitCode: 0 })),
        deleteSession: vi.fn(async () => {}),
        sendSessionCommandInput: vi.fn(async () => {}),
      },
      delete: vi.fn(async () => {}),
    } as unknown as Sandbox
    const handle = new DaytonaHandle({
      sandbox,
      workdir: '/home/daytona/workspace',
    })

    const proc = await handle.process.spawn('echo streamed-line')
    let out = ''
    for await (const chunk of proc.stdout) out += chunk
    expect(out).toContain('streamed-line')
    expect(await proc.wait()).toBe(0)
    expect(getSessionCommandLogs.mock.calls[0]?.length).toBeGreaterThanOrEqual(
      4,
    )
  })

  it('does not put env values into the session command string', async () => {
    const executeSessionCommand = vi.fn(
      async (_sessionId: string, _request: { command: string }) => ({
        cmdId: 'cmd-1',
      }),
    )
    const uploadFile = vi.fn(async (_data: Buffer, _path: string) => {})
    const createFolder = vi.fn(async () => {})
    const sandbox = {
      id: 'sbx-1',
      fs: { createFolder, uploadFile },
      process: {
        createSession: vi.fn(async () => {}),
        executeSessionCommand,
        getSessionCommandLogs: vi.fn(
          async (
            _sessionId: string,
            _commandId: string,
            onStdout?: (chunk: string) => void,
          ) => {
            onStdout?.('')
          },
        ),
        getSessionCommand: vi.fn(async () => ({ exitCode: 0 })),
        deleteSession: vi.fn(async () => {}),
        sendSessionCommandInput: vi.fn(async () => {}),
      },
      delete: vi.fn(async () => {}),
    } as unknown as Sandbox
    const handle = new DaytonaHandle({
      sandbox,
      workdir: '/home/daytona/workspace',
    })

    await handle.env.set({ ANTHROPIC_API_KEY: 'sk-secret-value' })
    const proc = await handle.process.spawn('echo hi')
    await proc.wait()

    expect(uploadFile).toHaveBeenCalledWith(
      expect.any(Buffer),
      '/home/daytona/workspace/.tanstack-ai-env',
    )
    const uploaded = uploadFile.mock.calls[0]?.[0]
    expect(uploaded).toBeInstanceOf(Buffer)
    expect(uploaded?.toString('utf8')).toContain(
      "ANTHROPIC_API_KEY='sk-secret-value'",
    )
    const request = executeSessionCommand.mock.calls[0]?.[1]
    expect(request).toBeDefined()
    expect(request?.command).toContain('.tanstack-ai-env')
    expect(request?.command).not.toContain('sk-secret-value')
    expect(request?.command).not.toContain('export ANTHROPIC_API_KEY')
  })

  it('advertises writableStdin and forwards stdin to the session command', async () => {
    const sendSessionCommandInput = vi.fn(async () => {})
    const sandbox = {
      id: 'sbx-1',
      process: {
        createSession: vi.fn(async () => {}),
        executeSessionCommand: vi.fn(async () => ({ cmdId: 'cmd-1' })),
        getSessionCommandLogs: vi.fn(
          async (
            _sessionId: string,
            _commandId: string,
            onStdout?: (chunk: string) => void,
          ) => {
            onStdout?.('')
          },
        ),
        getSessionCommand: vi.fn(async () => ({ exitCode: 0 })),
        deleteSession: vi.fn(async () => {}),
        sendSessionCommandInput,
      },
      delete: vi.fn(async () => {}),
    } as unknown as Sandbox
    const handle = new DaytonaHandle({
      sandbox,
      workdir: '/home/daytona/workspace',
    })

    expect(handle.capabilities.writableStdin).toBe(true)

    const proc = await handle.process.spawn('cat')
    await proc.stdin.write('prompt-line\n')
    await proc.wait()

    expect(sendSessionCommandInput).toHaveBeenCalledWith(
      expect.stringMatching(/^tanstack-ai-spawn-/),
      'cmd-1',
      'prompt-line\n',
    )
  })
})

// Daytona container snapshots are cold: the sandbox must be stopped
// before `_experimental_createSnapshot`, then started again so
// `ensure()` still returns a live handle. Names are hyphen-only.
// Issue #1081 item 7.
function fakeSnapshotSandbox(id: string) {
  const calls: Array<string> = []
  const stop = vi.fn(async () => {
    calls.push('stop')
  })
  const start = vi.fn(async () => {
    calls.push('start')
  })
  const createSnapshot = vi.fn(async (_name: string) => {
    calls.push('createSnapshot')
  })
  // Sandbox from @daytona/sdk is a large class. Tests only need these methods.
  const sandbox = {
    id,
    stop,
    start,
    _experimental_createSnapshot: createSnapshot,
    delete: vi.fn(async () => {}),
  } as unknown as Sandbox
  return { sandbox, stop, start, createSnapshot, calls }
}

describe('DaytonaHandle snapshots', () => {
  it('advertises snapshots: true and creates a named snapshot', async () => {
    const { sandbox, createSnapshot } = fakeSnapshotSandbox('sbx-1')
    const handle = new DaytonaHandle({
      sandbox,
      workdir: '/home/daytona/workspace',
    })

    expect(handle.capabilities.snapshots).toBe(true)
    expect(handle.snapshot).toBeTypeOf('function')

    const ref = await handle.snapshot!('after-setup')
    expect(createSnapshot).toHaveBeenCalledWith(
      'tanstack-ai-sandbox-snapshot-sbx-1-after-setup',
    )
    expect(ref.id).toBe('tanstack-ai-sandbox-snapshot-sbx-1-after-setup')
    expect(ref.label).toBe('after-setup')
  })

  it('stops the sandbox, creates the snapshot, then starts it again', async () => {
    const { sandbox, stop, start, createSnapshot, calls } =
      fakeSnapshotSandbox('sbx-1')
    const handle = new DaytonaHandle({
      sandbox,
      workdir: '/home/daytona/workspace',
    })

    await handle.snapshot!('after-setup')

    expect(stop).toHaveBeenCalledOnce()
    expect(createSnapshot).toHaveBeenCalledOnce()
    expect(start).toHaveBeenCalledOnce()
    expect(calls).toEqual(['stop', 'createSnapshot', 'start'])
  })

  it('starts the sandbox again when snapshot creation fails', async () => {
    const { sandbox, start, createSnapshot, calls } =
      fakeSnapshotSandbox('sbx-1')
    createSnapshot.mockImplementationOnce(async () => {
      calls.push('createSnapshot')
      throw new Error('sandbox must be stopped')
    })
    const handle = new DaytonaHandle({
      sandbox,
      workdir: '/home/daytona/workspace',
    })

    await expect(handle.snapshot!('after-setup')).rejects.toThrow(
      'sandbox must be stopped',
    )
    expect(start).toHaveBeenCalledOnce()
    expect(calls).toEqual(['stop', 'createSnapshot', 'start'])
  })

  it('keeps the snapshot error when start also fails', async () => {
    const { sandbox, start, createSnapshot } = fakeSnapshotSandbox('sbx-1')
    createSnapshot.mockImplementationOnce(async () => {
      throw new Error('sandbox must be stopped')
    })
    start.mockRejectedValueOnce(new Error('start timed out'))
    const handle = new DaytonaHandle({
      sandbox,
      workdir: '/home/daytona/workspace',
    })

    await expect(handle.snapshot!('after-setup')).rejects.toThrow(
      'sandbox must be stopped',
    )
  })

  it('names an unlabeled snapshot from the sandbox id', async () => {
    const { sandbox, createSnapshot } = fakeSnapshotSandbox('sbx-abc123def456')
    const handle = new DaytonaHandle({
      sandbox,
      workdir: '/home/daytona/workspace',
    })

    const ref = await handle.snapshot!()
    expect(createSnapshot).toHaveBeenCalledWith(
      'tanstack-ai-sandbox-snapshot-sbx-abc123de-snap',
    )
    expect(ref.id).toBe('tanstack-ai-sandbox-snapshot-sbx-abc123de-snap')
  })
})
