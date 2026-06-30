import { randomBytes } from 'node:crypto'
import {
  buildGrokServeWebSocketUrl,
  resolveAcpTransportMode,
  startAcpServerInSandbox,
} from '@tanstack/ai-acp'
import type { AcpSandboxServer, AcpSessionTransport } from '@tanstack/ai-acp'
import type { SandboxHandle } from '@tanstack/ai-sandbox'

export const DEFAULT_GROK_ACP_PORT = 2419

export interface GrokAcpConnection {
  transport: AcpSessionTransport
  dispose: () => Promise<void>
  server?: AcpSandboxServer
}

export interface OpenGrokAcpConnectionOptions {
  sandbox: SandboxHandle
  exe: string
  cliModel: string
  cwd: string
  env?: Record<string, string>
  extraArgs?: Array<string>
  port?: number
  transportPreference?: 'auto' | 'stdio' | 'websocket'
  signal?: AbortSignal
}

function q(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

function buildAgentPrefix(
  exe: string,
  cliModel: string,
  extraArgs: Array<string> | undefined,
): string {
  // ACP path: keep `--always-approve` for now. Sandbox policy is mapped only on
  // the legacy NDJSON `buildCommand` path; ACP uses `permissionMode` on the
  // session instead (see `chatStreamAcp`).
  const args = ['agent', '-m', q(cliModel), '--always-approve']
  for (const arg of extraArgs ?? []) args.push(arg)
  return `${exe} ${args.join(' ')}`
}

export function buildGrokAcpStdioCommand(options: {
  exe: string
  cliModel: string
  extraArgs?: Array<string>
}): string {
  return `${buildAgentPrefix(options.exe, options.cliModel, options.extraArgs)} stdio`
}

export function buildGrokAcpServeCommand(options: {
  exe: string
  cliModel: string
  port: number
  secret: string
  hostname?: string
  extraArgs?: Array<string>
}): string {
  const hostname = options.hostname ?? `0.0.0.0:${options.port}`
  return `${buildAgentPrefix(options.exe, options.cliModel, options.extraArgs)} serve --bind ${q(hostname)} --secret ${q(options.secret)}`
}

/**
 * Open an ACP connection to `grok agent` over stdio or in-sandbox WebSocket.
 */
export async function openGrokAcpConnection(
  options: OpenGrokAcpConnectionOptions,
): Promise<GrokAcpConnection> {
  const mode = resolveAcpTransportMode(
    options.sandbox,
    options.transportPreference ?? 'auto',
  )
  const spawnEnv = options.env
  const signal = options.signal

  if (mode === 'stdio') {
    const command = buildGrokAcpStdioCommand({
      exe: options.exe,
      cliModel: options.cliModel,
      extraArgs: options.extraArgs,
    })
    const proc = await options.sandbox.process.spawn(command, {
      cwd: options.cwd,
      ...(spawnEnv ? { env: spawnEnv } : {}),
      ...(signal ? { signal } : {}),
    })
    return {
      transport: { kind: 'stdio', process: proc },
      dispose: () => proc.kill(),
    }
  }

  const port = options.port ?? DEFAULT_GROK_ACP_PORT
  const secret = randomBytes(16).toString('hex')
  const server = await startAcpServerInSandbox(options.sandbox, {
    port,
    cwd: options.cwd,
    command: buildGrokAcpServeCommand({
      exe: options.exe,
      cliModel: options.cliModel,
      port,
      secret,
      extraArgs: options.extraArgs,
    }),
    ...(spawnEnv ? { env: spawnEnv } : {}),
    ...(signal ? { signal } : {}),
    buildWsUrl: ({ channel }) =>
      buildGrokServeWebSocketUrl(channel.url, secret),
    readyMarker: 'WebSocket URL:',
    framing: 'frame',
  })

  const ws = await server.connect(signal)
  return {
    transport: {
      kind: 'stream',
      stream: ws.stream,
      dispose: async () => {
        ws.close()
        await server.dispose()
      },
    },
    dispose: async () => {
      ws.close()
      await server.dispose()
    },
    server,
  }
}
