import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cliPlanLogin, mountHostLogin } from '../src/host-login'
import { makeFakeHandle } from './fakes'
import type { SandboxFs } from '../src/contracts'

// A fake vendor CLI. The first argument picks what it does.
const FAKE_CLI = `
import { writeFileSync } from 'node:fs'
const [mode, pidFile] = process.argv.slice(2)
const prompt = 'Open https://auth.example.com/device and enter ABCD-1234'
switch (mode) {
  case 'ok':
    console.log(prompt)
    process.exit(0)
  case 'split':
    console.log('Open https://auth.example.com/device')
    setTimeout(() => {
      console.log('then enter ABCD-1234')
      process.exit(0)
    }, 100)
    break
  case 'url-only':
    console.log('Open https://auth.example.com/device')
    setTimeout(() => process.exit(0), 1500)
    break
  case 'fail':
    console.log(prompt)
    console.error('access denied')
    process.exit(1)
  case 'no-url':
    console.error('unknown flag --device-auth')
    process.exit(1)
  case 'wait':
    writeFileSync(pidFile, String(process.pid))
    console.log(prompt)
    setInterval(() => {}, 1000)
    break
  case 'logout':
    process.exit(0)
  case 'logout-fail':
    console.error('not signed in')
    process.exit(2)
}
`

let dir = ''

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'host-login-'))
  await writeFile(join(dir, 'cli.mjs'), FAKE_CLI)
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

function fakeLogin(options?: {
  loginArgs?: Array<string>
  logoutArgs?: Array<string>
}) {
  return cliPlanLogin({
    executable: [process.execPath, join(dir, 'cli.mjs')],
    loginArgs: options?.loginArgs ?? ['ok'],
    logoutArgs: options?.logoutArgs ?? ['logout'],
    authFile: () => join(dir, 'auth.json'),
    planLabel: 'Test plan',
  })
}

function isRunning(pid: number) {
  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

describe('cliPlanLogin.signIn', () => {
  it('reports the URL and the code once, then resolves on exit 0', async () => {
    const onCode = vi.fn()
    await fakeLogin().signIn({ onCode })
    expect(onCode.mock.calls).toEqual([
      [
        {
          verificationUri: 'https://auth.example.com/device',
          userCode: 'ABCD-1234',
        },
      ],
    ])
  })

  it('waits for a code that comes after the URL', async () => {
    const onCode = vi.fn()
    await fakeLogin({ loginArgs: ['split'] }).signIn({ onCode })
    expect(onCode.mock.calls).toEqual([
      [
        {
          verificationUri: 'https://auth.example.com/device',
          userCode: 'ABCD-1234',
        },
      ],
    ])
  })

  it('reports only the URL when the CLI prints no code', async () => {
    const onCode = vi.fn()
    await fakeLogin({ loginArgs: ['url-only'] }).signIn({ onCode })
    expect(onCode.mock.calls).toEqual([
      [{ verificationUri: 'https://auth.example.com/device' }],
    ])
  })

  it('rejects with the raw output on exit 1', async () => {
    const result = fakeLogin({ loginArgs: ['fail'] }).signIn({
      onCode: () => {},
    })
    await expect(result).rejects.toThrow(/exit code 1\.\nOutput:\n/)
    await expect(result).rejects.toThrow(/access denied/)
  })

  it('rejects with the raw output when the CLI prints no URL', async () => {
    const result = fakeLogin({ loginArgs: ['no-url'] }).signIn({
      onCode: () => {},
    })
    await expect(result).rejects.toThrow(/It printed no sign-in URL\./)
    await expect(result).rejects.toThrow(/unknown flag --device-auth/)
  })

  it('rejects with a message naming the CLI when it is not installed', async () => {
    const login = cliPlanLogin({
      executable: 'tanstack-missing-cli',
      loginArgs: ['login'],
      logoutArgs: ['logout'],
      authFile: () => join(dir, 'auth.json'),
      planLabel: 'Test plan',
    })
    await expect(login.signIn({ onCode: () => {} })).rejects.toThrow(
      'Could not start "tanstack-missing-cli". Install the CLI and make sure it is on the PATH.',
    )
  })

  it('kills the CLI and rejects on abort', async () => {
    const pidFile = join(dir, 'pid')
    const controller = new AbortController()
    const result = fakeLogin({ loginArgs: ['wait', pidFile] }).signIn({
      onCode: () => controller.abort(),
      signal: controller.signal,
    })
    await expect(result).rejects.toThrow(/abort/i)
    const pid = Number(await readFile(pidFile, 'utf8'))
    expect(isRunning(pid)).toBe(false)
  })
})

// npm installs CLIs such as `codex` as `.cmd` shims on Windows.
describe.runIf(process.platform === 'win32')('cliPlanLogin on Windows', () => {
  function shimLogin(loginArgs: Array<string>) {
    return cliPlanLogin({
      executable: 'fakecli',
      loginArgs,
      logoutArgs: ['logout'],
      authFile: () => join(dir, 'auth.json'),
      planLabel: 'Test plan',
      env: { PATH: `${dir};${process.env.PATH ?? ''}` },
    })
  }

  beforeEach(async () => {
    await writeFile(
      join(dir, 'fakecli.cmd'),
      `@"${process.execPath}" "%~dp0cli.mjs" %*\r\n`,
    )
  })

  it('finds a .cmd shim on the PATH and signs in through it', async () => {
    const onCode = vi.fn()
    await shimLogin(['ok']).signIn({ onCode })
    expect(onCode).toHaveBeenCalledWith({
      verificationUri: 'https://auth.example.com/device',
      userCode: 'ABCD-1234',
    })
  })

  it('kills the CLI behind the shim on abort', async () => {
    const pidFile = join(dir, 'pid')
    const controller = new AbortController()
    const result = shimLogin(['wait', pidFile]).signIn({
      onCode: () => controller.abort(),
      signal: controller.signal,
    })
    await expect(result).rejects.toThrow(/abort/i)
    const pid = Number(await readFile(pidFile, 'utf8'))
    await vi.waitFor(() => expect(isRunning(pid)).toBe(false))
  })
})

describe('cliPlanLogin.signOut', () => {
  it('runs the logout arguments', async () => {
    await expect(fakeLogin().signOut()).resolves.toBeUndefined()
  })

  it('rejects with the raw output on a non-zero exit', async () => {
    const result = fakeLogin({ logoutArgs: ['logout-fail'] }).signOut()
    await expect(result).rejects.toThrow(
      /exit code 2\.\nOutput:\nnot signed in/,
    )
  })
})

describe('cliPlanLogin.status', () => {
  it('is true only when the login file exists', async () => {
    const login = fakeLogin()
    expect(await login.status()).toBe(false)
    await writeFile(join(dir, 'auth.json'), '{}')
    expect(await login.status()).toBe(true)
  })
})

const SANDBOX_FILE = '/home/user/.codex/auth.json'

function fakeSandbox(options?: {
  provider?: string
  read?: SandboxFs['read']
}) {
  const base = makeFakeHandle('sbx-1', options?.provider ?? 'docker')
  const sandbox = {
    ...base,
    fs: { ...base.fs, read: options?.read ?? base.fs.read },
    process: {
      ...base.process,
      exec: () =>
        Promise.resolve({ stdout: '/home/user', stderr: '', exitCode: 0 }),
    },
  }
  return { sandbox, files: base.files }
}

async function mountWith(sandbox: ReturnType<typeof fakeSandbox>['sandbox']) {
  return mountHostLogin(sandbox, {
    hostPath: join(dir, 'auth.json'),
    sandboxHomePath: '.codex/auth.json',
    label: 'Codex',
    connectCommand: '/connect:codex',
  })
}

describe('mountHostLogin', () => {
  beforeEach(async () => {
    await writeFile(join(dir, 'auth.json'), '{"token":"old"}')
  })

  it('copies the host file to <home>/<sandboxHomePath>', async () => {
    const { sandbox, files } = fakeSandbox()
    await mountWith(sandbox)
    expect(files.get(SANDBOX_FILE)).toBe('{"token":"old"}')
  })

  it('release writes a changed file back to the host and removes the sandbox file', async () => {
    const { sandbox, files } = fakeSandbox()
    const login = await mountWith(sandbox)
    files.set(SANDBOX_FILE, '{"token":"new"}')
    await login.release()
    expect(await readFile(join(dir, 'auth.json'), 'utf8')).toBe(
      '{"token":"new"}',
    )
    expect(files.has(SANDBOX_FILE)).toBe(false)
  })

  it('release does not write back an unchanged file', async () => {
    const { sandbox, files } = fakeSandbox()
    const login = await mountWith(sandbox)
    // Change the host file during the run. An unchanged sandbox file must not
    // overwrite it.
    await writeFile(join(dir, 'auth.json'), '{"token":"terminal"}')
    await login.release()
    expect(await readFile(join(dir, 'auth.json'), 'utf8')).toBe(
      '{"token":"terminal"}',
    )
    expect(files.has(SANDBOX_FILE)).toBe(false)
  })

  it('release removes the sandbox file even if the read-back throws', async () => {
    const { sandbox, files } = fakeSandbox({
      read: () => Promise.reject(new Error('sandbox is gone')),
    })
    const login = await mountWith(sandbox)
    await expect(login.release()).rejects.toThrow('sandbox is gone')
    expect(files.has(SANDBOX_FILE)).toBe(false)
  })

  it('throws when the host has no login file', async () => {
    await rm(join(dir, 'auth.json'))
    const { sandbox, files } = fakeSandbox()
    await expect(mountWith(sandbox)).rejects.toThrow(
      'No Codex login on this machine. Run /connect:codex.',
    )
    expect(files.size).toBe(0)
  })

  it('copies nothing on a local-process sandbox', async () => {
    const { sandbox, files } = fakeSandbox({ provider: 'local-process' })
    const login = await mountWith(sandbox)
    await login.release()
    expect(files.size).toBe(0)
    expect(await readFile(join(dir, 'auth.json'), 'utf8')).toBe(
      '{"token":"old"}',
    )
  })
})
