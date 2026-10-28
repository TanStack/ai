import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import {
  createDevConfig,
  createPrintableConfig,
  createSpawnConfig,
  getPnpmCommand,
  loadEnvFileIntoEnv,
  pickLanAddress,
  spawnProcess,
} from './dev.mjs'

const packageJson = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
)

test('pickLanAddress prefers non-internal private IPv4 addresses', () => {
  const address = pickLanAddress({
    loopback: [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
    wifi: [{ family: 'IPv4', address: '192.168.1.23', internal: false }],
    vpn: [{ family: 'IPv4', address: '100.64.0.8', internal: false }],
  })

  assert.equal(address, '192.168.1.23')
})

test('pickLanAddress prefers Wi-Fi over earlier WSL virtual adapters', () => {
  const address = pickLanAddress({
    'vEthernet (WSL)': [
      { family: 'IPv4', address: '172.28.48.1', internal: false },
    ],
    'Wi-Fi': [{ family: 'IPv4', address: '192.168.1.68', internal: false }],
  })

  assert.equal(address, '192.168.1.68')
})

test('createDevConfig uses provided backend URL before auto-detecting LAN IP', () => {
  const config = createDevConfig({
    env: { EXPO_PUBLIC_TANSTACK_AI_BASE_URL: 'http://10.0.2.2:8787' },
    networkInterfaces: {
      wifi: [{ family: 'IPv4', address: '192.168.1.23', internal: false }],
    },
    platform: 'win32',
  })

  assert.equal(config.baseUrl, 'http://10.0.2.2:8787')
  assert.equal(config.pnpmCommand, 'pnpm.cmd')
})

test('createDevConfig sets Expo backend URL from detected LAN IP', () => {
  const config = createDevConfig({
    env: {},
    networkInterfaces: {
      'Wi-Fi': [{ family: 'IPv4', address: '192.168.1.23', internal: false }],
    },
    platform: 'linux',
  })

  assert.equal(config.baseUrl, 'http://192.168.1.23:8787')
  assert.equal(config.lanInterfaceName, 'Wi-Fi')
  assert.equal(config.serverEnv.PORT, '8787')
  assert.equal(config.expoEnv.EXPO_PUBLIC_TANSTACK_AI_BASE_URL, config.baseUrl)
  assert.equal(config.expoEnv.EXPO_NO_DOTENV, '1')
  assert.equal(config.packagerHostname, undefined)
  assert.equal(config.metroHostSource, 'expo')
  assert.equal(config.expoEnv.REACT_NATIVE_PACKAGER_HOSTNAME, undefined)
})

test('createDevConfig preserves user-provided packager hostname', () => {
  const config = createDevConfig({
    env: { REACT_NATIVE_PACKAGER_HOSTNAME: '10.0.0.50' },
    networkInterfaces: {
      wifi: [{ family: 'IPv4', address: '192.168.1.23', internal: false }],
    },
  })

  assert.equal(config.packagerHostname, '10.0.0.50')
  assert.equal(config.metroHostSource, 'environment')
  assert.equal(config.expoEnv.REACT_NATIVE_PACKAGER_HOSTNAME, '10.0.0.50')
})

test('createDevConfig omits packager hostname when no LAN IP or override exists', () => {
  const config = createDevConfig({
    env: {},
    networkInterfaces: {
      loopback: [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
    },
  })

  assert.equal(config.packagerHostname, undefined)
  assert.equal(config.metroHostSource, 'expo')
  assert.equal(config.expoEnv.REACT_NATIVE_PACKAGER_HOSTNAME, undefined)
})

test('createDevConfig uses PORT for server env and generated Expo backend URL', () => {
  const config = createDevConfig({
    env: { PORT: '9999' },
    networkInterfaces: {
      wifi: [{ family: 'IPv4', address: '192.168.1.23', internal: false }],
    },
  })

  assert.equal(config.baseUrl, 'http://192.168.1.23:9999')
  assert.equal(config.serverEnv.PORT, '9999')
  assert.equal(config.expoEnv.EXPO_PUBLIC_TANSTACK_AI_BASE_URL, config.baseUrl)
})

test('loadEnvFileIntoEnv loads server-only env values without exposing them to Expo', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'tanstack-ai-rn-env-'))
  const envFile = path.join(tempDir, '.env')

  try {
    await writeFile(
      envFile,
      [
        'OPENAI_API_KEY=sk-test-from-env-file',
        'OPENAI_MODEL=gpt-5.2',
        'SERVER_ONLY_FLAG=private',
        'EXPO_PUBLIC_TANSTACK_AI_BASE_URL=http://10.0.2.2:8787',
      ].join('\n'),
    )

    const env = { PATH: 'test-path' }
    const loaded = loadEnvFileIntoEnv(envFile, env)
    const config = createDevConfig({
      env,
      networkInterfaces: {
        wifi: [{ family: 'IPv4', address: '192.168.1.23', internal: false }],
      },
    })

    assert.equal(loaded, true)
    assert.equal(config.serverEnv.OPENAI_API_KEY, 'sk-test-from-env-file')
    assert.equal(config.serverEnv.OPENAI_MODEL, 'gpt-5.2')
    assert.equal(config.serverEnv.SERVER_ONLY_FLAG, 'private')
    assert.equal(config.expoEnv.OPENAI_API_KEY, undefined)
    assert.equal(config.expoEnv.OPENAI_MODEL, undefined)
    assert.equal(config.expoEnv.SERVER_ONLY_FLAG, undefined)
    assert.equal(
      config.expoEnv.EXPO_PUBLIC_TANSTACK_AI_BASE_URL,
      config.baseUrl,
    )
    assert.equal(config.expoEnv.EXPO_NO_DOTENV, '1')
    assert.equal(config.baseUrl, 'http://10.0.2.2:8787')
  } finally {
    await rm(tempDir, { force: true, recursive: true })
  }
})

test('createDevConfig strips inherited OpenAI env from Expo process env', () => {
  const config = createDevConfig({
    env: {
      OPENAI_API_KEY: 'sk-inherited',
      OPENAI_MODEL: 'gpt-5.2',
      PATH: 'test-path',
    },
    networkInterfaces: {
      wifi: [{ family: 'IPv4', address: '192.168.1.23', internal: false }],
    },
  })

  assert.equal(config.serverEnv.OPENAI_API_KEY, 'sk-inherited')
  assert.equal(config.serverEnv.OPENAI_MODEL, 'gpt-5.2')
  assert.equal(config.expoEnv.OPENAI_API_KEY, undefined)
  assert.equal(config.expoEnv.OPENAI_MODEL, undefined)
  assert.equal(config.expoEnv.PATH, 'test-path')
  assert.equal(config.expoEnv.EXPO_NO_DOTENV, '1')
})

test('createPrintableConfig reports secret presence without secret values', () => {
  const config = createDevConfig({
    env: {
      OPENAI_API_KEY: 'sk-secret-value',
      PATH: 'test-path',
    },
    networkInterfaces: {
      wifi: [{ family: 'IPv4', address: '192.168.1.23', internal: false }],
    },
  })
  const printable = createPrintableConfig(config)
  const serialized = JSON.stringify(printable)

  assert.equal(printable.serverOpenAIKeyLoaded, true)
  assert.equal(serialized.includes('sk-secret-value'), false)
  assert.equal(serialized.includes('OPENAI_API_KEY'), false)
})

test('getPnpmCommand resolves Windows command shim', () => {
  assert.equal(getPnpmCommand('win32'), 'pnpm.cmd')
  assert.equal(getPnpmCommand('linux'), 'pnpm')
})

test('createSpawnConfig routes Windows command shims through cmd.exe', () => {
  const config = createSpawnConfig({
    command: 'pnpm.cmd',
    args: ['exec', 'expo', 'start', '--lan', '--clear'],
    cwd: 'C:\\repo\\examples\\ts-react-native-chat',
    env: { PATH: 'C:\\Windows\\System32' },
    platform: 'win32',
  })

  assert.equal(config.command, 'cmd.exe')
  assert.deepEqual(config.args, [
    '/d',
    '/s',
    '/c',
    'pnpm.cmd',
    'exec',
    'expo',
    'start',
    '--lan',
    '--clear',
  ])
  assert.equal(config.options.cwd, 'C:\\repo\\examples\\ts-react-native-chat')
  assert.deepEqual(config.options.env, { PATH: 'C:\\Windows\\System32' })
  assert.equal(config.options.stdio, 'inherit')
  assert.equal(config.options.windowsHide, false)
})

test('createSpawnConfig preserves direct spawning on non-Windows platforms', () => {
  const config = createSpawnConfig({
    command: 'pnpm',
    args: ['--version'],
    cwd: '/repo/examples/ts-react-native-chat',
    env: { PATH: '/usr/bin' },
    platform: 'linux',
  })

  assert.equal(config.command, 'pnpm')
  assert.deepEqual(config.args, ['--version'])
  assert.equal(config.options.cwd, '/repo/examples/ts-react-native-chat')
  assert.deepEqual(config.options.env, { PATH: '/usr/bin' })
  assert.equal(config.options.stdio, 'inherit')
  assert.equal(config.options.windowsHide, undefined)
})

test('direct Expo package scripts disable dotenv loading and strip OpenAI env', () => {
  const directExpoScripts = ['dev:app', 'smoke:expo']

  for (const scriptName of directExpoScripts) {
    const script = packageJson.scripts[scriptName]

    assert.match(script, /EXPO_NO_DOTENV/u)
    assert.match(script, /delete env\.OPENAI_API_KEY/u)
    assert.match(script, /delete env\.OPENAI_MODEL/u)
    assert.match(script, /pnpm/u)
    assert.match(script, /exec/u)
    assert.match(script, /expo/u)
  }
})

test(
  'spawnProcess can run a Windows command shim',
  { skip: process.platform !== 'win32' },
  async () => {
    const child = spawnProcess(
      getPnpmCommand('win32'),
      ['--version'],
      {
        ...process.env,
      },
      {
        stdio: 'pipe',
      },
    )

    let output = ''
    child.stdout?.on('data', (chunk) => {
      output += chunk
    })

    const exitCode = await new Promise((resolve, reject) => {
      child.on('error', reject)
      child.on('exit', resolve)
    })

    assert.equal(exitCode, 0)
    assert.match(output.trim(), /^\d+\.\d+\.\d+/u)
  },
)
