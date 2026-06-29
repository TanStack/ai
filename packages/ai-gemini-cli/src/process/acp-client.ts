import { spawn } from 'node:child_process'
import { Readable, Writable } from 'node:stream'
import {
  ClientSideConnection,
  PROTOCOL_VERSION,
  ndJsonStream,
} from '@agentclientprotocol/sdk'
import type {
  Client,
  McpServer,
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionNotification,
} from '@agentclientprotocol/sdk'
import type { ChildProcess } from 'node:child_process'
import type {
  AcpPermissionOutcome,
  AcpPermissionRequest,
  AcpSessionUpdate,
  AcpStopReason,
  AcpUsage,
} from '../stream/acp-types'

/** A live ACP session backed by a `gemini --acp` subprocess. */
export interface AcpSessionHandle {
  sessionId: string
  /** Whether an existing session was actually resumed via `session/load`. */
  resumed: boolean
  /** Run one prompt turn; resolves with the harness's stop reason. */
  prompt: (
    text: string,
  ) => Promise<{ stopReason: AcpStopReason; usage?: AcpUsage }>
  /** Ask the harness to cancel the in-flight prompt turn. */
  cancel: () => Promise<void>
  /** Tear down the subprocess (SIGTERM, then SIGKILL after a grace period). */
  dispose: () => Promise<void>
}

export interface StartAcpSessionOptions {
  /** Path to the Gemini CLI executable. Defaults to `gemini` on PATH. */
  executablePath?: string
  /** Extra CLI arguments appended after `--acp`. */
  extraArgs?: Array<string>
  /** Model id passed via `-m`. */
  model?: string
  /** Working directory for the session (absolute path). */
  cwd: string
  /** Extra environment variables merged over `process.env`. */
  env?: Record<string, string>
  /**
   * ACP auth method to select (via `authenticate`) before opening a session.
   * The agent advertises the available method ids in its `initialize`
   * response (e.g. `'oauth-personal'`, `'gemini-api-key'`, `'vertex-ai'`).
   * Required when the installed CLI isn't already authenticated for headless
   * use — without it, `prompt` fails with an auth error.
   */
  authMethodId?: string
  /** MCP servers (e.g. the TanStack tool bridge) for the session. */
  mcpServers?: Array<{ name: string; url: string }>
  /** Session id to resume via `session/load`, when supported by the CLI. */
  resumeSessionId?: string
  onUpdate: (update: AcpSessionUpdate) => void
  onPermissionRequest: (
    request: AcpPermissionRequest,
  ) => Promise<AcpPermissionOutcome> | AcpPermissionOutcome
}

const KILL_GRACE_MS = 2000

function waitForExit(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve()
      return
    }
    child.once('exit', () => resolve())
  })
}

/**
 * Spawn `gemini --acp` and drive it over the Agent Client Protocol
 * (JSON-RPC 2.0 on stdio).
 *
 * This module is the only place that touches `@agentclientprotocol/sdk`; the
 * rest of the package works with the structural types in `acp-types.ts`.
 *
 * Resume semantics: when `resumeSessionId` is set and the CLI advertises the
 * `loadSession` capability, the session is loaded by id — the CLI streams
 * the prior conversation back as `session/update` notifications, which are
 * deliberately swallowed (the TanStack client already has that history).
 * When loading is unsupported or fails, a fresh session is created and
 * `resumed: false` tells the adapter to send the flattened transcript.
 */
export async function startAcpSession(
  options: StartAcpSessionOptions,
): Promise<AcpSessionHandle> {
  const args = ['--acp', ...(options.extraArgs ?? [])]
  if (options.model !== undefined) {
    args.push('-m', options.model)
  }

  const child = spawn(options.executablePath ?? 'gemini', args, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  let stderrTail = ''
  child.stderr.on('data', (chunk: Buffer) => {
    stderrTail = (stderrTail + chunk.toString('utf8')).slice(-4096)
  })

  const spawned = new Promise<void>((resolve, reject) => {
    child.once('spawn', () => resolve())
    child.once('error', (error) => reject(error))
  })

  const exited = waitForExit(child).then(() => {
    throw new Error(
      `Gemini CLI exited unexpectedly (code ${child.exitCode ?? 'null'}, signal ${child.signalCode ?? 'null'}).${
        stderrTail !== '' ? `\nstderr: ${stderrTail.trim()}` : ''
      }`,
    )
  })

  /** Suppressed while session/load replays prior history. */
  let replaying = false

  const client: Client = {
    requestPermission: async (
      params: RequestPermissionRequest,
    ): Promise<RequestPermissionResponse> => {
      const outcome = await options.onPermissionRequest(params)
      return { outcome }
    },
    sessionUpdate: (params: SessionNotification): Promise<void> => {
      if (!replaying) {
        options.onUpdate(params.update as AcpSessionUpdate)
      }
      return Promise.resolve()
    },
  }

  const teardown = async (): Promise<void> => {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM')
      const timer = setTimeout(() => child.kill('SIGKILL'), KILL_GRACE_MS)
      await waitForExit(child)
      clearTimeout(timer)
    }
  }

  try {
    await spawned

    const connection = new ClientSideConnection(
      () => client,
      ndJsonStream(
        Writable.toWeb(child.stdin) as WritableStream<Uint8Array>,
        Readable.toWeb(child.stdout) as ReadableStream<Uint8Array>,
      ),
    )

    const race = <T>(work: Promise<T>): Promise<T> =>
      Promise.race([work, exited])

    const initResult = await race(
      connection.initialize({
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {
          fs: { readTextFile: false, writeTextFile: false },
        },
      }),
    )

    // Select an auth method before opening a session. The agent advertises
    // its supported methods in the initialize response; pick the requested
    // one (failing loudly if it isn't offered) so a headless run never hangs
    // on an interactive auth picker.
    if (options.authMethodId !== undefined) {
      const available = initResult.authMethods ?? []
      if (!available.some((method) => method.id === options.authMethodId)) {
        throw new Error(
          `Gemini CLI does not advertise the ACP auth method '${options.authMethodId}'. Available: ${
            available.map((method) => method.id).join(', ') || '(none)'
          }.`,
        )
      }
      await race(connection.authenticate({ methodId: options.authMethodId }))
    }

    const mcpServers: Array<McpServer> = (options.mcpServers ?? []).map(
      (server) => ({
        type: 'http' as const,
        name: server.name,
        url: server.url,
        headers: [],
      }),
    )

    let sessionId: string | undefined
    let resumed = false
    if (
      options.resumeSessionId !== undefined &&
      initResult.agentCapabilities?.loadSession === true
    ) {
      // loadSession streams prior history back as session/update
      // notifications; swallow them so the chat stream only carries the
      // new turn.
      replaying = true
      try {
        await race(
          connection.loadSession({
            sessionId: options.resumeSessionId,
            cwd: options.cwd,
            mcpServers,
          }),
        )
        sessionId = options.resumeSessionId
        resumed = true
      } catch {
        // Session unknown to this CLI install — fall through to a fresh one.
      } finally {
        replaying = false
      }
    }

    if (sessionId === undefined) {
      const session = await race(
        connection.newSession({ cwd: options.cwd, mcpServers }),
      )
      sessionId = session.sessionId
    }

    return {
      sessionId,
      resumed,
      prompt: async (text: string) => {
        const response = await race(
          connection.prompt({
            sessionId,
            prompt: [{ type: 'text', text }],
          }),
        )
        return {
          stopReason: response.stopReason,
          ...(response.usage != null && { usage: response.usage }),
        }
      },
      cancel: () => connection.cancel({ sessionId }),
      dispose: teardown,
    }
  } catch (error) {
    await teardown()
    throw error
  }
}
