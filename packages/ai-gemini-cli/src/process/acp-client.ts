import {
  ClientSideConnection,
  PROTOCOL_VERSION,
  ndJsonStream,
} from '@agentclientprotocol/sdk'
import { spawnHandleToAcpTransport } from './sandbox-transport'
import type {
  Client,
  McpServer,
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionNotification,
} from '@agentclientprotocol/sdk'
import type { SpawnHandle } from '@tanstack/ai-sandbox'
import type {
  AcpPermissionOutcome,
  AcpPermissionRequest,
  AcpSessionUpdate,
  AcpStopReason,
  AcpUsage,
} from '../stream/acp-types'

/** A live ACP session backed by a `gemini --acp` process inside the sandbox. */
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
  /** Tear down the process. */
  dispose: () => Promise<void>
}

export interface StartAcpSessionOptions {
  /** The already-spawned `gemini --acp` process (via sandbox.process.spawn). */
  process: SpawnHandle
  /** Working directory inside the sandbox (used for ACP session params). */
  cwd: string
  /**
   * ACP auth method to select (via `authenticate`) before opening a session.
   * The agent advertises the available method ids in its `initialize`
   * response (e.g. `'oauth-personal'`, `'gemini-api-key'`, `'vertex-ai'`).
   */
  authMethodId?: string
  /** MCP servers (e.g. a host tool bridge) for the session. */
  mcpServers?: Array<{
    name: string
    url: string
    headers?: Array<{ name: string; value: string }>
  }>
  /** Session id to resume via `session/load`, when supported by the CLI. */
  resumeSessionId?: string
  onUpdate: (update: AcpSessionUpdate) => void
  onPermissionRequest: (
    request: AcpPermissionRequest,
  ) => Promise<AcpPermissionOutcome> | AcpPermissionOutcome
}

/**
 * Drive a sandbox-spawned `gemini --acp` process over the Agent Client
 * Protocol (JSON-RPC 2.0 on stdio). The transport is adapted from the
 * sandbox {@link SpawnHandle}; all ACP protocol handling is reused.
 *
 * Resume semantics: when `resumeSessionId` is set and the CLI advertises the
 * `loadSession` capability, the session is loaded by id and its replayed
 * history is swallowed; otherwise a fresh session is created and
 * `resumed: false` tells the adapter to send the flattened transcript.
 */
export async function startAcpSession(
  options: StartAcpSessionOptions,
): Promise<AcpSessionHandle> {
  const transport = spawnHandleToAcpTransport(options.process)

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
    await transport.kill()
  }

  try {
    const connection = new ClientSideConnection(
      () => client,
      ndJsonStream(transport.writable, transport.readable),
    )

    const race = <T>(work: Promise<T>): Promise<T> =>
      Promise.race([work, transport.exited])

    const initResult = await race(
      connection.initialize({
        protocolVersion: PROTOCOL_VERSION,
        clientCapabilities: {
          fs: { readTextFile: false, writeTextFile: false },
        },
      }),
    )

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
        headers: server.headers ?? [],
      }),
    )

    let sessionId: string | undefined
    let resumed = false
    if (
      options.resumeSessionId !== undefined &&
      initResult.agentCapabilities?.loadSession === true
    ) {
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
