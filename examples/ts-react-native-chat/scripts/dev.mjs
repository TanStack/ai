import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { networkInterfaces } from 'node:os'
import path from 'node:path'
import { config as loadDotenv } from 'dotenv'

const BACKEND_PORT = 8787
const EXAMPLE_DIR = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const DEFAULT_ENV_FILE = path.join(EXAMPLE_DIR, '.env')
const loadedEnvKeysByEnv = new WeakMap()

export function loadEnvFileIntoEnv(
  envFile = DEFAULT_ENV_FILE,
  env = process.env,
) {
  const result = loadDotenv({
    path: envFile,
    processEnv: env,
    quiet: true,
  })

  loadedEnvKeysByEnv.set(env, Object.keys(result.parsed ?? {}))

  return Boolean(result.parsed)
}

export function getPnpmCommand(platform = process.platform) {
  return platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
}

function isPrivateIpv4(address) {
  const parts = address.split('.').map((part) => Number.parseInt(part, 10))
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return false
  }

  const [first, second] = parts
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  )
}

function isUsableIpv4(info) {
  return (
    info?.family === 'IPv4' &&
    !info.internal &&
    typeof info.address === 'string' &&
    !info.address.startsWith('127.') &&
    !info.address.startsWith('169.254.')
  )
}

function isLikelyPhysicalInterface(name) {
  return /\b(wi-?fi|wireless|wlan|ethernet)\b|^(en|eth)\d+/iu.test(name)
}

function isLikelyVirtualInterface(name) {
  return /vEthernet|WSL|Hyper-V|Docker|Default Switch|VirtualBox|VMware|VPN|Tailscale|ZeroTier|WireGuard|loopback|\blo\b|bridge|\bbr-|tunnel|\btun|tap/iu.test(
    name,
  )
}

function enumerateIpv4Candidates(interfaces) {
  return Object.entries(interfaces).flatMap(([interfaceName, items]) =>
    (items ?? []).map((info) => ({
      ...info,
      interfaceName,
    })),
  )
}

function scoreLanCandidate(candidate) {
  let score = 0

  if (isPrivateIpv4(candidate.address)) score += 100
  if (isLikelyPhysicalInterface(candidate.interfaceName)) score += 50
  if (isLikelyVirtualInterface(candidate.interfaceName)) score -= 100

  return score
}

export function pickLanAddressInfo(interfaces = networkInterfaces()) {
  const usable = enumerateIpv4Candidates(interfaces).filter(isUsableIpv4)
  const ranked = usable
    .map((candidate, index) => ({
      ...candidate,
      index,
      score: scoreLanCandidate(candidate),
    }))
    .sort((left, right) => right.score - left.score || left.index - right.index)

  return ranked[0]
}

export function pickLanAddress(interfaces = networkInterfaces()) {
  return pickLanAddressInfo(interfaces)?.address
}

function isPublicMobileEnvKey(key) {
  return (
    key.startsWith('EXPO_PUBLIC_') || key === 'REACT_NATIVE_PACKAGER_HOSTNAME'
  )
}

function shouldStripFromExpoEnv(key, loadedEnvKeys) {
  return (
    key.startsWith('OPENAI_') ||
    (loadedEnvKeys.has(key) && !isPublicMobileEnvKey(key))
  )
}

function createExpoEnv({
  baseUrl,
  env,
  hasProvidedPackagerHostname,
  packagerHostname,
}) {
  const loadedEnvKeys = new Set(loadedEnvKeysByEnv.get(env) ?? [])
  const expoEnv = { ...env }

  for (const key of Object.keys(expoEnv)) {
    if (shouldStripFromExpoEnv(key, loadedEnvKeys)) {
      delete expoEnv[key]
    }
  }

  return {
    ...expoEnv,
    EXPO_NO_DOTENV: '1',
    EXPO_PUBLIC_TANSTACK_AI_BASE_URL: baseUrl,
    ...(hasProvidedPackagerHostname
      ? { REACT_NATIVE_PACKAGER_HOSTNAME: packagerHostname }
      : {}),
  }
}

export function createDevConfig({
  env = process.env,
  networkInterfaces: interfaces = networkInterfaces(),
  platform = process.platform,
} = {}) {
  const providedBaseUrl = env.EXPO_PUBLIC_TANSTACK_AI_BASE_URL
  const providedPackagerHostname = env.REACT_NATIVE_PACKAGER_HOSTNAME
  const hasProvidedPackagerHostname = Object.hasOwn(
    env,
    'REACT_NATIVE_PACKAGER_HOSTNAME',
  )
  const port = env.PORT ?? String(BACKEND_PORT)
  const lanAddressInfo = pickLanAddressInfo(interfaces)
  const lanAddress = lanAddressInfo?.address
  const baseUrl =
    providedBaseUrl ??
    (lanAddress ? `http://${lanAddress}:${port}` : `http://127.0.0.1:${port}`)
  const packagerHostname = hasProvidedPackagerHostname
    ? providedPackagerHostname
    : undefined
  const metroHostSource = hasProvidedPackagerHostname ? 'environment' : 'expo'
  const serverEnv = {
    ...env,
    PORT: port,
  }
  const expoEnv = createExpoEnv({
    baseUrl,
    env,
    hasProvidedPackagerHostname,
    packagerHostname,
  })

  return {
    baseUrl,
    lanAddress,
    lanInterfaceName: lanAddressInfo?.interfaceName,
    metroHostSource,
    packagerHostname,
    port,
    pnpmCommand: getPnpmCommand(platform),
    serverOpenAIKeyLoaded: Boolean(serverEnv.OPENAI_API_KEY),
    usedProvidedBaseUrl: Boolean(providedBaseUrl),
    usedProvidedPackagerHostname: hasProvidedPackagerHostname,
    serverEnv,
    expoEnv,
  }
}

export function createSpawnConfig({
  command,
  args,
  cwd,
  env,
  platform = process.platform,
  stdio = 'inherit',
}) {
  if (platform === 'win32') {
    return {
      command: env?.ComSpec ?? 'cmd.exe',
      args: ['/d', '/s', '/c', command, ...args],
      options: {
        cwd,
        env,
        stdio,
        windowsHide: false,
      },
    }
  }

  return {
    command,
    args,
    options: {
      cwd,
      env,
      stdio,
    },
  }
}

function printHelp() {
  console.log(`TanStack AI React Native dev runner

Usage:
  pnpm dev                 Start Hono and Expo in LAN mode
  node scripts/dev.mjs     Start Hono and Expo in LAN mode
  node scripts/dev.mjs --print-config
  node scripts/dev.mjs --help

Environment:
  EXPO_PUBLIC_TANSTACK_AI_BASE_URL
    Optional backend URL override for Expo, for example http://192.168.1.10:8787.
  REACT_NATIVE_PACKAGER_HOSTNAME
    Optional Metro host override for unusual network cases. Expo manages Metro
    host detection by default.
`)
}

export function createPrintableConfig(config) {
  return {
    baseUrl: config.baseUrl,
    lanAddress: config.lanAddress,
    lanInterfaceName: config.lanInterfaceName,
    metroHost:
      config.metroHostSource === 'environment'
        ? config.packagerHostname
        : 'Expo-managed',
    metroHostSource: config.metroHostSource,
    packagerHostname: config.packagerHostname ?? null,
    port: config.port,
    pnpmCommand: config.pnpmCommand,
    serverOpenAIKeyLoaded: config.serverOpenAIKeyLoaded,
    usedProvidedBaseUrl: config.usedProvidedBaseUrl,
    usedProvidedPackagerHostname: config.usedProvidedPackagerHostname,
  }
}

function printConfig(config) {
  console.log(JSON.stringify(createPrintableConfig(config), null, 2))
}

export function spawnProcess(command, args, env, { platform, stdio } = {}) {
  const spawnConfig = createSpawnConfig({
    command,
    args,
    cwd: EXAMPLE_DIR,
    env,
    platform,
    stdio,
  })

  return spawn(spawnConfig.command, spawnConfig.args, spawnConfig.options)
}

function killProcess(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  if (!child.pid) return

  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], {
      stdio: 'ignore',
    })
    return
  }

  child.kill('SIGTERM')
}

function startDev() {
  loadEnvFileIntoEnv()
  const config = createDevConfig()

  console.log(
    `Using EXPO_PUBLIC_TANSTACK_AI_BASE_URL=${config.baseUrl}${
      config.usedProvidedBaseUrl ? ' (from environment)' : ''
    }`,
  )
  console.log(
    config.usedProvidedPackagerHostname
      ? `Using REACT_NATIVE_PACKAGER_HOSTNAME=${config.packagerHostname} (from environment)`
      : 'Using Expo-managed Metro host detection',
  )

  if (!config.lanAddress && !config.usedProvidedBaseUrl) {
    console.warn(
      'No non-internal IPv4 address was detected. Set EXPO_PUBLIC_TANSTACK_AI_BASE_URL manually if your phone cannot reach the backend.',
    )
  }

  const children = [
    spawnProcess(config.pnpmCommand, ['dev:server'], config.serverEnv),
    spawnProcess(
      config.pnpmCommand,
      ['exec', 'expo', 'start', '--lan', '--clear'],
      config.expoEnv,
    ),
  ]

  let shuttingDown = false

  function shutdown(exitCode = 0) {
    if (shuttingDown) return
    shuttingDown = true
    for (const child of children) {
      killProcess(child)
    }
    process.exitCode = exitCode
  }

  for (const child of children) {
    child.on('error', (error) => {
      console.error(error)
      shutdown(1)
    })

    child.on('exit', (code, signal) => {
      if (shuttingDown) return
      if (code === 0 || signal) {
        shutdown(0)
      } else {
        shutdown(code ?? 1)
      }
    })
  }

  process.on('SIGINT', () => shutdown(0))
  process.on('SIGTERM', () => shutdown(0))
}

function main() {
  const args = new Set(process.argv.slice(2))

  if (args.has('--help') || args.has('-h')) {
    printHelp()
    return
  }

  if (args.has('--print-config')) {
    loadEnvFileIntoEnv()
    printConfig(createDevConfig())
    return
  }

  startDev()
}

const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : ''
if (entryPath === fileURLToPath(import.meta.url)) {
  main()
}
