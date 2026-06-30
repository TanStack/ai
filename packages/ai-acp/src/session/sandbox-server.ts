import { connectAcpWebSocket } from '../transport/websocket'
import type { SandboxChannel, SandboxHandle, SpawnHandle } from '@tanstack/ai-sandbox'
import type { AcpMessageFraming } from '../transport/types'
import type { AcpWebSocketConnection } from '../transport/websocket'

export interface AcpSandboxServer {
  /** WebSocket URL the orchestrator uses to reach the in-sandbox ACP server. */
  wsUrl: string
  /** Sandbox channel used to build {@link wsUrl} (auth headers, when issued). */
  channel: SandboxChannel
  /** Open the ACP JSON-RPC stream over WebSocket. */
  connect: (
    signal?: AbortSignal,
  ) => Promise<AcpWebSocketConnection>
  /** Stop the in-sandbox server process. */
  dispose: () => Promise<void>
}

export interface StartAcpServerOptions {
  port: number
  cwd: string
  /** Full shell command that starts the harness ACP server inside the sandbox. */
  command: string
  /** Build the WebSocket URL once the server is ready and the port is exposed. */
  buildWsUrl: (input: {
    channel: SandboxChannel
    port: number
    stdout: string
  }) => string
  /**
   * Return true once {@link buildWsUrl} can be called. Receives accumulated
   * stdout from the server process.
   */
  isReady?: (stdout: string) => boolean
  /** Substring/regex marker used when {@link isReady} is omitted. */
  readyMarker?: string
  env?: Record<string, string>
  timeoutMs?: number
  signal?: AbortSignal
  framing?: AcpMessageFraming
  hostname?: string
}

const DEFAULT_READY_MARKER = 'WebSocket URL:'

function waitForReady(
  proc: SpawnHandle,
  options: Pick<
    StartAcpServerOptions,
    'isReady' | 'readyMarker' | 'timeoutMs'
  >,
): Promise<{ stdout: string; stderr: string }> {
  const readyMarker = options.readyMarker ?? DEFAULT_READY_MARKER
  const isReady =
    options.isReady ??
    ((stdout: string) => stdout.includes(readyMarker))

  return new Promise((resolve, reject) => {
    let stdout = ''
    let stderr = ''
    const state = { settled: false }
    const settle = (fn: () => void): void => {
      if (state.settled) return
      state.settled = true
      clearTimeout(timer)
      fn()
    }
    const diagnostics = (): string =>
      [stdout, stderr]
        .map((s) => s.trim())
        .filter(Boolean)
        .join('\n')
        .slice(-500)

    const timer = setTimeout(
      () =>
        settle(() =>
          reject(
            new Error(
              `ACP server did not become ready within ${options.timeoutMs ?? 30_000}ms${
                diagnostics() ? `: ${diagnostics()}` : ''
              }`,
            ),
          ),
        ),
      options.timeoutMs ?? 30_000,
    )

    void (async () => {
      try {
        for await (const chunk of proc.stderr) stderr += chunk
      } catch {
        // non-fatal
      }
    })()

    void (async () => {
      try {
        for await (const chunk of proc.stdout) {
          stdout += chunk
          if (isReady(stdout)) {
            settle(() => resolve({ stdout, stderr }))
            return
          }
        }
        settle(() =>
          reject(
            new Error(
              `ACP server exited before becoming ready${
                diagnostics() ? `: ${diagnostics()}` : ' (no output)'
              }`,
            ),
          ),
        )
      } catch (error) {
        settle(() => reject(error))
      }
    })()
  })
}

/**
 * Boot a harness ACP WebSocket server inside a sandbox and expose its port via
 * {@link SandboxHandle.ports.connect}. Mirrors the `opencode serve` pattern.
 */
export async function startAcpServerInSandbox(
  sandbox: SandboxHandle,
  options: StartAcpServerOptions,
): Promise<AcpSandboxServer> {
  const proc = await sandbox.process.spawn(options.command, {
    cwd: options.cwd,
    ...(options.env ? { env: options.env } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  })

  const { stdout } = await waitForReady(proc, options)
  const channel = await sandbox.ports.connect(options.port)
  const wsUrl = options.buildWsUrl({
    channel,
    port: options.port,
    stdout,
  })

  const headers =
    channel.headers ??
    (channel.token ? { Authorization: `Bearer ${channel.token}` } : undefined)

  return {
    wsUrl,
    channel,
    connect: (signal?: AbortSignal) =>
      connectAcpWebSocket(wsUrl, {
        ...(headers ? { headers } : {}),
        ...(signal ? { signal } : {}),
        framing: options.framing ?? 'frame',
      }),
    dispose: () => proc.kill(),
  }
}

/** Parse a `WebSocket URL: ws://…` line printed by `grok agent serve`. */
export function parseWebSocketUrlFromServeOutput(
  stdout: string,
): string | undefined {
  const match = stdout.match(/WebSocket URL:\s*(ws\S+)/i)
  return match?.[1]
}

/** Build a Grok `agent serve` WebSocket URL from a sandbox channel + secret. */
export function buildGrokServeWebSocketUrl(
  channelUrl: string,
  secret: string,
): string {
  const wsBase = channelUrl.replace(/^http/i, 'ws').replace(/\/$/, '')
  return `${wsBase}/ws?server-key=${encodeURIComponent(secret)}`
}