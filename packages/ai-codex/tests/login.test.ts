import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import * as fsp from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { codexPlanLogin } from '../src/index'
import { codexAuthFile } from '../src/login'
import type { DeviceCode } from '@tanstack/ai-sandbox/host-login'

const baseDir = path.join(os.tmpdir(), `tanstack-ai-codex-login-${Date.now()}`)

// Stand-in for the codex CLI: records its arguments, then prints a device
// URL and code like `codex login --device-auth`.
const FAKE_CLI = [
  `import { writeFileSync } from 'node:fs'`,
  `writeFileSync(process.env.ARGS_FILE, process.argv.slice(2).join(' '))`,
  `console.log('Open https://auth.example.com/device and enter ABCD-1234')`,
].join('\n')

afterEach(() => {
  vi.unstubAllEnvs()
})

afterAll(async () => {
  await fsp.rm(baseDir, { recursive: true, force: true })
})

/** A fresh CODEX_HOME dir. `signedIn` writes an `auth.json` into it. */
async function codexHome(options: { signedIn: boolean }) {
  await fsp.mkdir(baseDir, { recursive: true })
  const dir = await fsp.mkdtemp(path.join(baseDir, 'codex-home-'))
  if (options.signedIn) {
    await fsp.writeFile(path.join(dir, 'auth.json'), '{}')
  }
  return dir
}

async function fakeCli() {
  await fsp.mkdir(baseDir, { recursive: true })
  const script = path.join(baseDir, 'fake-codex.mjs')
  await fsp.writeFile(script, FAKE_CLI)
  return {
    executable: [process.execPath, script],
    argsFile: path.join(baseDir, 'args.txt'),
  }
}

describe('codexAuthFile', () => {
  it('uses $CODEX_HOME/auth.json when CODEX_HOME is set', () => {
    expect(codexAuthFile({ CODEX_HOME: path.join('home', 'me') })).toBe(
      path.join('home', 'me', 'auth.json'),
    )
  })

  it('uses ~/.codex/auth.json when CODEX_HOME is not set', () => {
    expect(codexAuthFile({})).toBe(
      path.join(os.homedir(), '.codex', 'auth.json'),
    )
  })
})

describe('codexPlanLogin', () => {
  it('has the ChatGPT plan label', () => {
    expect(codexPlanLogin().planLabel).toBe('ChatGPT plan')
  })

  it('status reads the login file in CODEX_HOME from options.env', async () => {
    const signedIn = await codexHome({ signedIn: true })
    const signedOut = await codexHome({ signedIn: false })

    expect(
      await codexPlanLogin({ env: { CODEX_HOME: signedIn } }).status(),
    ).toBe(true)
    expect(
      await codexPlanLogin({ env: { CODEX_HOME: signedOut } }).status(),
    ).toBe(false)
  })

  it('status reads CODEX_HOME from process.env when options.env has none', async () => {
    vi.stubEnv('CODEX_HOME', await codexHome({ signedIn: true }))

    expect(await codexPlanLogin().status()).toBe(true)
  })

  it('signIn runs "login --device-auth" and reports the device code', async () => {
    const { executable, argsFile } = await fakeCli()
    const codes: Array<DeviceCode> = []

    await codexPlanLogin({ executable, env: { ARGS_FILE: argsFile } }).signIn({
      onCode: (code) => codes.push(code),
    })

    expect(await fsp.readFile(argsFile, 'utf8')).toBe('login --device-auth')
    expect(codes).toEqual([
      {
        verificationUri: 'https://auth.example.com/device',
        userCode: 'ABCD-1234',
      },
    ])
  })

  it('signOut runs "logout"', async () => {
    const { executable, argsFile } = await fakeCli()

    await codexPlanLogin({ executable, env: { ARGS_FILE: argsFile } }).signOut()

    expect(await fsp.readFile(argsFile, 'utf8')).toBe('logout')
  })
})
