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
  /** Stop the server process. */
  dispose: () => Promise<void>
}

export interface StartServerOptions {
  port: number
  hostname?: string
  cwd: string
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
    ...(options.signal ? { signal: options.signal } : {}),
  })

  await waitForReady(proc, options.timeoutMs ?? 30_000)

  const channel = await sandbox.ports.connect(options.port)
  return {
    baseUrl: channel.url,
    dispose: () => proc.kill(),
  }
}

function waitForReady(proc: SpawnHandle, timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let buffer = ''
    // Holder object so reads stay typed as `boolean` across async closures
    // (a plain `let` gets flow-narrowed to a literal and trips lint).
    const state = { settled: false }
    const settle = (fn: () => void): void => {
      if (state.settled) return
      state.settled = true
      clearTimeout(timer)
      fn()
    }
    const timer = setTimeout(
      () =>
        settle(() =>
          reject(
            new Error(`opencode serve did not become ready within ${timeoutMs}ms`),
          ),
        ),
      timeoutMs,
    )

    void (async () => {
      try {
        for await (const chunk of proc.stdout) {
          buffer += chunk
          if (buffer.includes(READY_MARKER)) {
            settle(resolve)
            return
          }
        }
        settle(() =>
          reject(
            new Error(
              `opencode serve exited before becoming ready: ${buffer.slice(-500)}`,
            ),
          ),
        )
      } catch (error) {
        settle(() => reject(error))
      }
    })()
  })
}
