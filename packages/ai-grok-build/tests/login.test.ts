/**
 * `grokBuildPlanLogin()` runs the `grok` CLI device login. A fake CLI script
 * stands in for `grok`, and `homedir()` points at a temp dir.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import * as os from 'node:os'
import { join } from 'node:path'
import { grokBuildPlanLogin } from '../src/index'
import type { DeviceCode } from '@tanstack/ai-sandbox/host-login'

const hostHome = vi.hoisted(() => ({ dir: '' }))
vi.mock('node:os', async (importOriginal) => ({
  ...(await importOriginal<typeof os>()),
  homedir: () => hostHome.dir,
}))

// Writes its arguments to $ARGV_FILE, prints a device code, and exits 0.
const FAKE_GROK = [
  `import { writeFileSync } from 'node:fs'`,
  `writeFileSync(process.env.ARGV_FILE, process.argv.slice(2).join(' '))`,
  `console.log('Open https://auth.example.com/device and enter ABCD-1234')`,
].join('\n')

let dir = ''

beforeAll(async () => {
  dir = await mkdtemp(join(os.tmpdir(), 'grok-login-test-'))
  hostHome.dir = join(dir, 'home')
  await writeFile(join(dir, 'fake-grok.mjs'), FAKE_GROK)
})

afterAll(async () => {
  await rm(dir, { recursive: true, force: true })
})

function fakeLogin() {
  return grokBuildPlanLogin({
    executable: [process.execPath, join(dir, 'fake-grok.mjs')],
    env: { ARGV_FILE: join(dir, 'argv.txt') },
  })
}

describe('grokBuildPlanLogin', () => {
  it("is labeled 'SuperGrok plan'", () => {
    expect(fakeLogin().planLabel).toBe('SuperGrok plan')
  })

  it('signs in with grok login --device-auth and reports the device code', async () => {
    const codes: Array<DeviceCode> = []
    await fakeLogin().signIn({ onCode: (code) => codes.push(code) })
    expect(codes).toEqual([
      {
        verificationUri: 'https://auth.example.com/device',
        userCode: 'ABCD-1234',
      },
    ])
    expect(await readFile(join(dir, 'argv.txt'), 'utf8')).toBe(
      'login --device-auth',
    )
  })

  it('signs out with grok logout', async () => {
    await fakeLogin().signOut()
    expect(await readFile(join(dir, 'argv.txt'), 'utf8')).toBe('logout')
  })

  it('reads the status from ~/.grok/auth.json', async () => {
    const login = fakeLogin()
    expect(await login.status()).toBe(false)
    await mkdir(join(hostHome.dir, '.grok'), { recursive: true })
    await writeFile(join(hostHome.dir, '.grok', 'auth.json'), '{}')
    expect(await login.status()).toBe(true)
  })
})
