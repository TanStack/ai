import { createOpencode, createOpencodeClient } from '@opencode-ai/sdk'
import type { Config, Event, OpencodeClient, Part } from '@opencode-ai/sdk'
import type {
  OpencodeAssistantMessage,
  OpencodeEvent,
} from '../stream/sdk-types'
import type {
  OpencodePermissionRequest,
  OpencodePermissionResponse,
} from './permissions'

/** A live OpenCode session backed by an `opencode serve` HTTP server. */
export interface OpencodeSessionHandle {
  sessionId: string
  /** Whether an existing session was actually resumed. */
  resumed: boolean
  /**
   * Run one prompt turn. Resolves with the final assistant message (finish
   * reason, token usage, error) and its concatenated text once the harness
   * goes idle. Streaming deltas arrive via `onEvent` while this is pending.
   *
   * Pass `outputSchema` (a JSON Schema) to constrain the answer via OpenCode's
   * `json_schema` output format; the schema-conformant result then arrives on
   * `message.structured`.
   */
  prompt: (
    text: string,
    opts?: { outputSchema?: unknown },
  ) => Promise<{ message: OpencodeAssistantMessage; text: string }>
  /** Ask the harness to abort the in-flight prompt turn. */
  abort: () => Promise<void>
  /** Tear down the event subscription and (if owned) the server. */
  dispose: () => Promise<void>
}

export interface StartOpencodeSessionOptions {
  /** Connect to an already-running server instead of spawning one. */
  baseUrl?: string
  /**
   * Headers attached to every request to the opencode server — used to
   * authenticate a token-gated preview channel (e.g. Daytona). Without them a
   * gated preview proxy rejects the requests (404 "Not found.").
   */
  headers?: Record<string, string>
  /** Hostname for the spawned server. Defaults to the SDK default. */
  hostname?: string
  /** Port for the spawned server. Defaults to the SDK default. */
  port?: number
  /**
   * Directory the opencode HTTP API scopes the session to. Omit to use the
   * server's own launch cwd (the common case): the server is spawned with the
   * correct working dir per-provider, so passing a directory here is only needed
   * to override it. Passing a VIRTUAL sandbox path (e.g. `/workspace`) is wrong
   * for host-running providers (local-process), where that path doesn't exist —
   * the API then stalls on it. Leave undefined and rely on the server cwd.
   */
  directory?: string
  /** Provider id (the part before `/` in the model id). */
  providerID: string
  /** Model id (the part after `/` in the model id). */
  modelID: string
  /** Extra OpenCode config merged with the adapter's mcp/permission config. */
  config?: Config
  /** Baseline permission policy applied to the spawned server. */
  permission?: Config['permission']
  /** MCP servers (e.g. the TanStack tool bridge) for the session. */
  mcpServers?: Array<{ name: string; url: string }>
  /** Session id to resume; falls back to a fresh session when not found. */
  resumeSessionId?: string
  onEvent: (event: OpencodeEvent) => void
  onPermissionRequest: (
    request: OpencodePermissionRequest,
  ) => Promise<OpencodePermissionResponse> | OpencodePermissionResponse
  /** Called when the event subscription fails mid-turn. */
  onError?: (error: unknown) => void
}

/** Locate the session id an OpenCode event belongs to, when it carries one. */
function sessionIdOf(event: Event): string | undefined {
  const props = event.properties as { sessionID?: string } | undefined
  if (props?.sessionID !== undefined) return props.sessionID
  if (event.type === 'message.part.updated') {
    return event.properties.part.sessionID
  }
  if (event.type === 'message.updated') {
    return event.properties.info.sessionID
  }
  if (event.type === 'permission.updated') {
    return event.properties.sessionID
  }
  return undefined
}

function buildConfig(options: StartOpencodeSessionOptions): Config {
  const mcp: NonNullable<Config['mcp']> = { ...options.config?.mcp }
  for (const server of options.mcpServers ?? []) {
    mcp[server.name] = { type: 'remote', url: server.url, enabled: true }
  }
  return {
    ...options.config,
    ...(Object.keys(mcp).length > 0 && { mcp }),
    ...(options.permission !== undefined && { permission: options.permission }),
  }
}

/**
 * Boot (or attach to) an OpenCode HTTP server, resolve a session, and wire its
 * event subscription + permission replies.
 *
 * This module is the only place that touches `@opencode-ai/sdk`; the rest of
 * the package works with the structural types in `sdk-types.ts`.
 *
 * Resume semantics: when `resumeSessionId` is set and the server still knows
 * the session (same machine, same data dir), it is reused. Otherwise a fresh
 * session is created and `resumed: false` tells the adapter to send the
 * flattened transcript.
 */
export async function startOpencodeSession(
  options: StartOpencodeSessionOptions,
): Promise<OpencodeSessionHandle> {
  const { directory } = options
  // Spread into a `query` object only when set; omitting lets opencode use the
  // server's launch cwd (correct for every provider — see `directory` docs).
  const dirQuery = directory !== undefined ? { directory } : {}

  let client: OpencodeClient
  let ownedServer: { close: () => void } | undefined

  if (options.baseUrl !== undefined) {
    client = createOpencodeClient({
      baseUrl: options.baseUrl,
      ...(options.headers !== undefined && { headers: options.headers }),
      ...(directory !== undefined && { directory }),
    })
  } else {
    const config = buildConfig(options)
    const result = await createOpencode({
      ...(options.hostname !== undefined && { hostname: options.hostname }),
      ...(options.port !== undefined && { port: options.port }),
      ...(Object.keys(config).length > 0 && { config }),
    })
    client = result.client
    ownedServer = result.server
  }

  // Mutated from several closures (the subscription loop, dispose, teardown);
  // a holder object keeps reads typed as `boolean` rather than being
  // flow-narrowed to a literal across those boundaries.
  const lifecycle = { disposed: false }

  const teardown = async (): Promise<void> => {
    if (lifecycle.disposed) return
    lifecycle.disposed = true
    ownedServer?.close()
    await Promise.resolve()
  }

  try {
    // Resolve the session before subscribing so the event filter has an id.
    let sessionId: string | undefined
    let resumed = false
    if (options.resumeSessionId !== undefined) {
      const existing = await client.session.get({
        path: { id: options.resumeSessionId },
        query: dirQuery,
      })
      if (existing.data) {
        sessionId = options.resumeSessionId
        resumed = true
      }
    }
    if (sessionId === undefined) {
      const created = await client.session.create({
        query: dirQuery,
        body: {},
        throwOnError: true,
      })
      sessionId = created.data.id
    }
    const resolvedSessionId = sessionId

    const handlePermission = async (
      permission: Extract<Event, { type: 'permission.updated' }>['properties'],
    ): Promise<void> => {
      try {
        const response = await options.onPermissionRequest({
          id: permission.id,
          sessionID: permission.sessionID,
          type: permission.type,
          title: permission.title,
          ...(permission.callID !== undefined && { callID: permission.callID }),
        })
        await client.postSessionIdPermissionsPermissionId({
          path: { id: permission.sessionID, permissionID: permission.id },
          query: dirQuery,
          body: { response },
          throwOnError: true,
        })
      } catch (error) {
        if (!lifecycle.disposed) options.onError?.(error)
      }
    }

    const subscription = await client.event.subscribe()
    const stream = subscription.stream

    void (async () => {
      try {
        for await (const event of stream) {
          if (lifecycle.disposed) break
          const sid = sessionIdOf(event)
          if (sid !== undefined && sid !== resolvedSessionId) continue
          if (event.type === 'permission.updated') {
            void handlePermission(event.properties)
            continue
          }
          // The SDK event union is a structural superset of the subset the
          // translator consumes; unknown event types match no translator
          // branch and are ignored.
          options.onEvent(event as OpencodeEvent)
        }
      } catch (error) {
        if (!lifecycle.disposed) options.onError?.(error)
      }
    })()

    return {
      sessionId: resolvedSessionId,
      resumed,
      prompt: async (text: string, opts?: { outputSchema?: unknown }) => {
        const result = await client.session.prompt({
          path: { id: resolvedSessionId },
          query: dirQuery,
          body: {
            model: { providerID: options.providerID, modelID: options.modelID },
            parts: [{ type: 'text', text }],
            ...(opts?.outputSchema !== undefined && {
              format: {
                type: 'json_schema',
                schema: opts.outputSchema as Record<string, unknown>,
              },
            }),
          },
          throwOnError: true,
        })
        const data = result.data
        const message = data.info as OpencodeAssistantMessage
        const responseText = data.parts
          .filter(
            (part): part is Extract<Part, { type: 'text' }> =>
              part.type === 'text',
          )
          .map((part) => part.text)
          .join('')
        return { message, text: responseText }
      },
      abort: async () => {
        try {
          await client.session.abort({
            path: { id: resolvedSessionId },
            query: dirQuery,
          })
        } catch {
          // Best-effort: the turn may already be finishing.
        }
      },
      dispose: async () => {
        lifecycle.disposed = true
        try {
          await stream.return(undefined)
        } catch {
          // Ignore: stream may already be closed.
        }
        ownedServer?.close()
      },
    }
  } catch (error) {
    await teardown()
    throw error
  }
}
