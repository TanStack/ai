import {
  ClientSideConnection,
  PROTOCOL_VERSION,
  ndJsonStream,
} from '@agentclientprotocol/sdk'
import { spawnHandleToAcpTransport } from '../transport/stdio'
import type {
  Client,
  McpServer,
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionNotification,
} from '@agentclientprotocol/sdk'
import type {
  AcpPermissionOutcome,
  AcpPermissionRequest,
  AcpSessionUpdate,
  AcpStopReason,
  AcpUsage,
} from '../types/acp-types'
import type { AcpJsonRpcStream, AcpSessionTransport } from '../transport/types'

export interface AcpSessionHandle {
  sessionId: string
  resumed: boolean
  prompt: (
    text: string,
  ) => Promise<{ stopReason: AcpStopReason; usage?: AcpUsage }>
  cancel: () => Promise<void>
  dispose: () => Promise<void>
}

export interface StartAcpSessionOptions {
  transport: AcpSessionTransport
  cwd: string
  authMethodId?: string
  mcpServers?: Array<{
    name: string
    url: string
    headers?: Array<{ name: string; value: string }>
  }>
  resumeSessionId?: string
  onUpdate: (update: AcpSessionUpdate) => void
  onPermissionRequest: (
    request: AcpPermissionRequest,
  ) => Promise<AcpPermissionOutcome> | AcpPermissionOutcome
  /**
   * Harness-specific JSON-RPC notifications (e.g. Grok `_x.ai/session_notification`).
   * Return without throwing — unknown vendor extensions must not tear down the session.
   */
  onExtNotification?: (method: string, params: Record<string, unknown>) => void
}

function streamFromTransport(transport: AcpSessionTransport): {
  stream: AcpJsonRpcStream
  teardown: () => Promise<void>
  exited: Promise<never> | undefined
  stderrTail: () => string
} {
  if (transport.kind === 'stdio') {
    const byteTransport = spawnHandleToAcpTransport(transport.process)
    return {
      stream: ndJsonStream(byteTransport.writable, byteTransport.readable),
      teardown: () => byteTransport.kill(),
      exited: byteTransport.exited,
      stderrTail: byteTransport.stderrTail,
    }
  }

  return {
    stream: transport.stream,
    teardown: transport.dispose,
    exited: undefined,
    stderrTail: transport.stderrTail ?? (() => ''),
  }
}

/**
 * Drive an ACP harness over stdio or a pre-connected JSON-RPC stream.
 */
export async function startAcpSession(
  options: StartAcpSessionOptions,
): Promise<AcpSessionHandle> {
  const { stream, teardown, exited, stderrTail } = streamFromTransport(
    options.transport,
  )

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
    extNotification: (method, params) => {
      options.onExtNotification?.(method, params)
      return Promise.resolve()
    },
  }

  const race = <T>(work: Promise<T>): Promise<T> =>
    exited !== undefined ? Promise.race([work, exited]) : work

  try {
    const connection = new ClientSideConnection(() => client, stream)

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
          `Harness does not advertise the ACP auth method '${options.authMethodId}'. Available: ${
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
        // Session unknown — fall through to a fresh one.
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
    const tail = stderrTail().trim()
    if (
      error instanceof Error &&
      tail !== '' &&
      !error.message.includes(tail)
    ) {
      throw new Error(`${error.message}\nstderr: ${tail}`, { cause: error })
    }
    throw error
  }
}
