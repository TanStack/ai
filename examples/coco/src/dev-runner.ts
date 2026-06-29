/**
 * Spawn the project's dev server (default `pnpm dev`) as a subprocess, sniff
 * its stdout for the local URL it printed, and wait until the URL accepts
 * TCP connections. We forward all output so the user still sees the dev
 * server's startup logs.
 */
import { spawn } from 'node:child_process'
import net from 'node:net'
import { URL } from 'node:url'
import type { ChildProcess } from 'node:child_process'

const LOCAL_URL_RE =
  /\bhttps?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\])(?::(\d+))?(?:\/\S*)?/i

export interface DevServer {
  /** Target URL the proxy should forward to (e.g. `http://localhost:5173`). */
  target: string
  /**
   * The spawned dev-server child process. `null` when Coco was started with
   * `--target` against an already-running dev server (we don't manage that
   * server's lifecycle).
   */
  child: ChildProcess | null
}

export interface StartDevServerOptions {
  command: string
  cwd: string
  /** Override the auto-detected target URL. */
  fixedTarget?: string
  /** Max milliseconds to wait for the dev server to print/accept connections. */
  timeoutMs?: number
}

const probeTcp = (host: string, port: number, timeoutMs = 1000) =>
  new Promise<boolean>((resolve) => {
    const socket = new net.Socket()
    let done = false
    const finish = (ok: boolean) => {
      if (done) return
      done = true
      socket.destroy()
      resolve(ok)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
    socket.connect(port, host)
  })

const waitForReachable = async (
  url: string,
  timeoutMs: number,
): Promise<void> => {
  const parsed = new URL(url)
  const host = parsed.hostname || 'localhost'
  const port = Number(
    parsed.port || (parsed.protocol === 'https:' ? '443' : '80'),
  )
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await probeTcp(host, port)) return
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(
    `Timed out waiting for dev server at ${url} (host=${host} port=${port})`,
  )
}

/**
 * Spawn the dev command and resolve once we know its target URL and it's
 * reachable. If `fixedTarget` is set, skip sniffing and just wait for it.
 */
export const startDevServer = async ({
  command,
  cwd,
  fixedTarget,
  timeoutMs = 60_000,
}: StartDevServerOptions): Promise<DevServer> => {
  // If the user pointed Coco at an existing dev server, don't spawn anything
  // — just wait for it to be reachable.
  if (fixedTarget) {
    await waitForReachable(fixedTarget, timeoutMs)
    return { target: fixedTarget, child: null }
  }

  const [bin, ...args] = command.trim().split(/\s+/)
  if (!bin) throw new Error(`Empty dev command: ${JSON.stringify(command)}`)

  const child = spawn(bin, args, {
    cwd,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: process.platform === 'win32',
  })

  // Forward output to the parent terminal verbatim so users still see Vite/
  // Next/whatever logs.
  child.stdout.on('data', (chunk: Buffer) => process.stdout.write(chunk))
  child.stderr.on('data', (chunk: Buffer) => process.stderr.write(chunk))

  child.on('error', (err) => {
    console.error(`[coco] failed to spawn "${command}":`, err)
  })

  // Sniff stdout for the first localhost URL the dev server prints.
  const target = await new Promise<string>((resolve, reject) => {
    let resolved = false
    const onChunk = (chunk: Buffer) => {
      if (resolved) return
      const text = chunk.toString('utf8')
      const match = text.match(LOCAL_URL_RE)
      if (match) {
        try {
          // Normalize to scheme://host:port (strip any path the dev server
          // may have decorated the URL with).
          const url = new URL(match[0])
          url.pathname = '/'
          url.search = ''
          url.hash = ''
          let normalized = url.toString()
          if (normalized.endsWith('/')) {
            normalized = normalized.slice(0, -1)
          }
          resolved = true
          resolve(normalized)
        } catch {
          // Ignore parse failures and keep listening.
        }
      }
    }
    child.stdout.on('data', onChunk)
    child.stderr.on('data', onChunk)
    child.once('exit', (code) => {
      if (!resolved) {
        reject(
          new Error(
            `Dev command "${command}" exited with code ${code} before printing a local URL.`,
          ),
        )
      }
    })
    setTimeout(() => {
      if (!resolved) {
        reject(
          new Error(
            `Timed out (${timeoutMs}ms) waiting for "${command}" to print a localhost URL. ` +
              `Pass --target=http://localhost:<port> to skip auto-detection.`,
          ),
        )
      }
    }, timeoutMs).unref()
  })

  await waitForReachable(target, timeoutMs)
  return { target, child }
}
