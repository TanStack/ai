import { execSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const exampleDir = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const outputPath = path.join(exampleDir, 'public', 'servers.json')

/** @type {const} */
export const SERVER_CATALOG = [
  {
    id: 'go',
    label: 'Go',
    port: 8001,
    detect: ['go', 'version'],
    devScript: 'dev:go',
    setup: {
      summary: 'Install Go 1.22+ and ensure `go` is on PATH.',
      installUrl: 'https://go.dev/dl/',
      verify: 'go version',
      run: 'pnpm dev:go',
    },
  },
  {
    id: 'rust',
    label: 'Rust',
    port: 8002,
    detect: ['cargo', '--version'],
    devScript: 'dev:rust',
    setup: {
      summary: 'Install Rust stable via rustup and ensure `cargo` is on PATH.',
      installUrl: 'https://rustup.rs/',
      verify: 'cargo --version',
      run: 'pnpm dev:rust',
    },
  },
  {
    id: 'php',
    label: 'PHP',
    port: 8003,
    detect: ['php', '-v'],
    devScript: 'dev:php',
    setup: {
      summary: 'Install PHP 8.2+ CLI and ensure `php` is on PATH.',
      installUrl: 'https://www.php.net/downloads',
      verify: 'php -v',
      run: 'pnpm dev:php',
    },
  },
  {
    id: 'zig',
    label: 'Zig',
    port: 8004,
    detect: ['zig', 'version'],
    devScript: 'dev:zig',
    setup: {
      summary: 'Install Zig and ensure `zig` is on PATH.',
      installUrl: 'https://ziglang.org/download/',
      verify: 'zig version',
      run: 'pnpm dev:zig',
    },
  },
]

function parseDisabledServers() {
  const raw = process.env.AGUI_DISABLE_SERVERS ?? ''
  return new Set(
    raw
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  )
}

function hasToolchain(detect) {
  try {
    execSync(detect.join(' '), { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

export function detectServers(env = process.env) {
  const disabled = parseDisabledServers()

  return SERVER_CATALOG.map((server) => {
    const disabledByEnv = disabled.has(server.id)
    const toolchainPresent = hasToolchain(server.detect)
    const available = toolchainPresent && !disabledByEnv

    return {
      id: server.id,
      label: server.label,
      port: server.port,
      available,
      disabledByEnv,
      toolchainPresent,
      devScript: server.devScript,
      setup: server.setup,
    }
  })
}

export function writeServersJson(env = process.env) {
  const servers = detectServers(env).map(
    ({ devScript: _devScript, toolchainPresent: _toolchainPresent, ...rest }) =>
      rest,
  )

  const payload = {
    generatedAt: new Date().toISOString(),
    servers,
  }

  mkdirSync(path.dirname(outputPath), { recursive: true })
  writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')

  return { payload, outputPath, servers }
}

export function logDetectionSummary(servers) {
  for (const server of servers) {
    if (server.available) {
      console.log(`[ag-ui] ${server.label} available on :${server.port}`)
      continue
    }

    if (server.disabledByEnv) {
      console.log(
        `[ag-ui] ${server.label} disabled via AGUI_DISABLE_SERVERS (toolchain ${server.toolchainPresent ? 'present' : 'missing'})`,
      )
      continue
    }

    console.log(
      `[ag-ui] ${server.label} unavailable — ${server.setup.verify} not found`,
    )
  }
}

export { exampleDir, outputPath }
