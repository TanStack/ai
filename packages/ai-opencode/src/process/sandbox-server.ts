/**
 * Boot an `opencode serve` HTTP server INSIDE a sandbox and expose its port so
 * the host `@opencode-ai/sdk` client can connect over `baseUrl`. Mirrors the
 * SDK's own server launch (`opencode serve --hostname=H --port=P`, ready when
 * stdout logs `opencode server listening`).
 */
import type { SandboxHandle, SpawnHandle } from '@tanstack/ai-sandbox'

const READY_MARKER = 'opencode server listening'

export interface SandboxOpencodeServer {
  /** URL the host uses to reach the in-sandbox server. */
  baseUrl: string
  /**
   * Headers that authenticate requests to {@link baseUrl}, when the provider's
   * channel is token-gated (e.g. Daytona's `x-daytona-preview-token`). The host
   * opencode client must send these on every request or the preview proxy 404s.
   */
  headers?: Record<string, string>
  /** Stop the server process. */
  dispose: () => Promise<void>
}

export interface StartServerOptions {
  port: number
  hostname?: string
  cwd: string
  /** Extra env for the server process (e.g. `OPENCODE_CONFIG_CONTENT`). */
  env?: Record<string, string>
  timeoutMs?: number
  signal?: AbortSignal
}

export async function startOpencodeServerInSandbox(
  sandbox: SandboxHandle,
  options: StartServerOptions,
): Promise<SandboxOpencodeServer> {
  const hostname = options.hostname ?? '0.0.0.0'
  const command = `opencode serve --hostname=${hostname} --port=${options.port}`
  const proc: SpawnHandle = await sandbox.process.spawn(command, {
    cwd: options.cwd,
    ...(options.env ? { env: options.env } : {}),
    ...(options.signal ? { signal: options.signal } : {}),
  })

  await waitForReady(proc, options.timeoutMs ?? 30_000)

  const channel = await sandbox.ports.connect(options.port)
  // Carry the channel's auth so the host client can reach a token-gated preview.
  // Prefer ready-made `headers`; fall back to a bearer token if that's all the
  // provider issued.
  const headers =
    channel.headers ??
    (channel.token ? { Authorization: `Bearer ${channel.token}` } : undefined)
  return {
    baseUrl: channel.url,
    ...(headers ? { headers } : {}),
    dispose: () => proc.kill(),
  }
}

function waitForReady(proc: SpawnHandle, timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let stdout = ''
    // Capture stderr too: opencode logs startup failures (e.g. "address already
    // in use" when a previous run's server still holds the port) to stderr, not
    // stdout. Without this the error message is empty and the real cause is lost.
    let stderr = ''
    // Holder object so reads stay typed as `boolean` across async closures
    // (a plain `let` gets flow-narrowed to a literal and trips lint).
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
              `opencode serve did not become ready within ${timeoutMs}ms${
                diagnostics() ? `: ${diagnostics()}` : ''
              }`,
            ),
          ),
        ),
      timeoutMs,
    )

    // Drain stderr in the background so its text is available for diagnostics.
    void (async () => {
      try {
        for await (const chunk of proc.stderr) stderr += chunk
      } catch {
        // Ignore: stderr drain errors are non-fatal; stdout drives readiness.
      }
    })()

    void (async () => {
      try {
        for await (const chunk of proc.stdout) {
          stdout += chunk
          if (stdout.includes(READY_MARKER)) {
            settle(resolve)
            return
          }
        }
        settle(() =>
          reject(
            new Error(
              `opencode serve exited before becoming ready${
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
