// `/unstable` because turn `usage` on `session/prompt` responses (and the
// `usage_update` session update) are unstable ACP v1 fields; the stable
// entrypoint strips them.
import {
  PROTOCOL_VERSION,
  client,
  methods,
  ndJsonStream,
} from '@agentclientprotocol/sdk/unstable'
import { isRecord } from '../utils'
import { spawnHandleToAcpTransport } from '../transport/stdio'
import type {
  Implementation,
  McpServer,
} from '@agentclientprotocol/sdk/unstable'
import type {
  AcpPermissionOutcome,
  AcpPermissionRequest,
  AcpSessionUpdate,
  AcpStopReason,
  AcpUsage,
} from '../types/acp-types'
import type { AcpJsonRpcStream, AcpSessionTransport } from '../transport/types'

/**
 * Identifies this client to the agent in the ACP `initialize` handshake. The
 * `version` is informational (sent in `clientInfo`); keep it loosely in step
 * with the package version. `clientInfo` is currently optional in the protocol
 * but will become required, so we always send it.
 * ponytail: hardcoded — clientInfo is diagnostic; a stale patch version is harmless.
 */
const CLIENT_INFO: Implementation = {
  name: '@tanstack/ai-acp',
  title: 'TanStack AI',
  version: '0.1.0',
}

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

  const app = client({ name: CLIENT_INFO.name })
    .onRequest(methods.client.session.requestPermission, async ({ params }) => {
      const outcome = await options.onPermissionRequest(params)
      return { outcome }
    })
    .onNotification(methods.client.session.update, ({ params }) => {
      if (!replaying) {
        options.onUpdate(params.update as AcpSessionUpdate)
      }
    })
    // Raw fallback: runs only for notifications without a typed handler, i.e.
    // vendor extensions such as Grok's `_x.ai/session_notification`.
    .onNotification('*', ({ method, params }) => {
      if (isRecord(params)) options.onExtNotification?.(method, params)
    })

  const race = <T>(work: Promise<T>): Promise<T> =>
    exited !== undefined ? Promise.race([work, exited]) : work

  try {
    const connection = app.connect(stream).agent

    const initResult = await race(
      connection.request(methods.agent.initialize, {
        protocolVersion: PROTOCOL_VERSION,
        clientInfo: CLIENT_INFO,
        clientCapabilities: {
          // The agent runs inside the sandbox with direct filesystem + shell
          // access, so it never needs to delegate file/terminal I/O back to the
          // client. We advertise these as unsupported; per the ACP spec the
          // agent MUST then treat them as unavailable and not call them.
          fs: { readTextFile: false, writeTextFile: false },
        },
      }),
    )

    // Protocol-version negotiation: the agent echoes the version it will speak.
    // The spec says a client SHOULD close the connection if that version is one
    // it doesn't support. We only implement the current PROTOCOL_VERSION, so a
    // higher number means the agent needs a newer client than this one.
    if (
      typeof initResult.protocolVersion === 'number' &&
      initResult.protocolVersion > PROTOCOL_VERSION
    ) {
      throw new Error(
        `ACP agent negotiated protocol version ${initResult.protocolVersion}, ` +
          `but this client supports up to ${PROTOCOL_VERSION}. Update @tanstack/ai-acp.`,
      )
    }

    if (options.authMethodId !== undefined) {
      const available = initResult.authMethods ?? []
      if (!available.some((method) => method.id === options.authMethodId)) {
        throw new Error(
          `Harness does not advertise the ACP auth method '${options.authMethodId}'. Available: ${
            available.map((method) => method.id).join(', ') || '(none)'
          }.`,
        )
      }
      await race(
        connection.request(methods.agent.authenticate, {
          methodId: options.authMethodId,
        }),
      )
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
          connection.request(methods.agent.session.load, {
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
        connection.request(methods.agent.session.new, {
          cwd: options.cwd,
          mcpServers,
        }),
      )
      sessionId = session.sessionId
    }

    return {
      sessionId,
      resumed,
      prompt: async (text: string) => {
        const response = await race(
          connection.request(methods.agent.session.prompt, {
            sessionId,
            prompt: [{ type: 'text', text }],
          }),
        )
        return {
          stopReason: response.stopReason,
          ...(response.usage != null && { usage: response.usage }),
        }
      },
      cancel: () =>
        connection.notify(methods.agent.session.cancel, { sessionId }),
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
