import { defineCommand, definePlugin } from '@tanstack/ai-harness'
import { connectTransport } from './client'
import type { ElicitResult } from '@modelcontextprotocol/client'
import type { AnyTool, JSONSchema, Logger } from '@tanstack/ai'
import type {
  AnyCommand,
  PluginPrompt,
  PluginResources,
  PluginSessionApi,
  PluginSetupContext,
  RunContext,
  TurnInfo,
} from '@tanstack/ai-harness'
import type { MCPClient, OnElicit } from './client'
import type { McpConnectorOptions } from './connector'
import type { AskInput } from './tools'
import type { MCPClientOptions } from './types'
import type { HttpTransportConfig, StdioTransportConfig } from './transport'

/** One server of {@link mcp}, keyed by its name. */
export type McpServerConfig = (
  | StdioTransportConfig
  | (HttpTransportConfig & {
      /**
       * Sign in with OAuth, like `mcpConnector`. This adds `/connect <name>`
       * and `/disconnect <name>`. The tools of the server come after the
       * sign-in, and the tools that are not read-only ask for approval.
       * `headers` and `authProvider` do not apply then.
       */
      oauth?: boolean
    })
) & {
  /**
   * The time in milliseconds that this server can take to connect, to send
   * its tool list, or to answer a tool call. Default: the MCP SDK default,
   * 60,000.
   */
  timeoutMs?: number
  /**
   * Give the tools of this server to code mode: the `codeMode()` plugin of
   * `@tanstack/ai-code-mode` takes them out of the tool list and lets the
   * model call them from `execute_typescript`. Without that plugin, nothing
   * changes.
   */
  codeMode?: boolean
  /**
   * Ask the user for approval before a tool of this server runs. `true` asks
   * for every tool. A function gets the MCP tool definition and returns
   * `true` to ask. Default: no approval, and for `oauth: true` every tool
   * that the server does not mark `readOnlyHint`.
   */
  needsApproval?: boolean | McpConnectorOptions['needsApproval']
  /**
   * The name the model sees for each tool of this server. It gets the MCP
   * tool definition. Default: `<server>_<tool>`.
   */
  toolName?: MCPClientOptions['toolName']
}

/**
 * The status of one server. UIs read the list from
 * `snapshot().plugins['tanstack/mcp'].servers`. A server is `reconnecting`
 * after its connection closed, until a new connection is open.
 */
export type McpServerStatus = {
  name: string
  /** How many tools the server gives the model. */
  toolCount: number
} & (
  | { status: 'connecting' | 'connected' | 'reconnecting' }
  | { status: 'failed'; error: string }
)

/**
 * A harness plugin that connects MCP servers and gives the model their
 * tools, named `<server>_<tool>`.
 *
 * - Each server connects on its own. A server that fails does not stop the
 *   others: it gets the status `failed` with the error.
 * - The servers connect in the background. The first turn waits for them.
 * - `/mcp` lists the servers and their status. UIs read the same list from
 *   the plugin state.
 * - A `stdio` server runs as one child process (Node only) for every
 *   session of the harness on the host that uses this `mcp()` object. It
 *   stops when the last of those sessions closes, or at `host.close()`.
 *   Create the plugin once, outside the `plugins` factory: a factory that
 *   calls `mcp()` for each session starts a process for each session. The
 *   other servers connect for each session.
 * - An `http` server with `oauth: true` signs in through `/connect <name>`.
 * - When the connection of a server closes, the server is `reconnecting`.
 *   The plugin connects again after 0.5 s, 1 s, 2 s, and so on (at most
 *   30 s), until it is connected or its session or host closes. The wait
 *   starts again at 0.5 s only after a connection stayed open for 30 s, so a
 *   server that crashes right after it connects waits longer each time. The
 *   next turn gets the tools of the new connection. A server that fails its
 *   first connect is `failed`, and connects again the same way.
 * - A spec 2025 server that asks for input (`elicitation/create`) does not
 *   name the tool call that asks. The user of the call is asked only when
 *   all the calls of that server that run now belong to one run. Else the
 *   request is declined, so a question never goes to another user.
 * - When a server sends `tools/list_changed`, the next turn lists its tools
 *   again.
 * - When two servers give a tool with the same name, the model gets the
 *   tool of the server that comes first in `servers`. The plugin warns once,
 *   to the host logger (`createHarnessHost({ logger })`). With
 *   `onDuplicateTool: 'error'`, the later server fails instead.
 *
 * @param options.servers - The servers, keyed by name. The name is the tool
 *   prefix.
 * @param options.onDuplicateTool - What happens when a server gives a tool
 *   name that a server earlier in `servers` gives too. `'warn'` (default):
 *   the model does not get that one tool, and the plugin warns once.
 *   `'error'`: the later server gets the status `failed` with an error that
 *   names both servers and the tool, and the model gets none of its tools.
 *   The other servers keep working.
 *
 * @example
 * ```ts
 * import { mcp } from '@tanstack/ai-mcp/harness'
 *
 * // Once, so the sessions share the stdio process.
 * const tools = mcp({
 *   servers: {
 *     files: { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '.'] },
 *     docs: { type: 'http', url: 'https://mcp.example.com/mcp', timeoutMs: 10_000 },
 *     notion: { type: 'http', url: 'https://mcp.notion.com/mcp', oauth: true },
 *   },
 * })
 *
 * plugins: () => [tools]
 * ```
 */
export function mcp(options: {
  servers: Readonly<Record<string, McpServerConfig>>
  onDuplicateTool?: 'warn' | 'error'
}) {
  const servers = Object.entries(options.servers)
  return definePlugin({
    name: 'tanstack/mcp',
    // The stdio servers connect once for the host. The rest is per session.
    lifetime: 'host',
    setup: (host) => {
      // The tool calls of a shared server that run now, newest last.
      const calling: Array<Caller> = []
      // A spec 2025 request of a shared server goes to the run that calls,
      // only when one run calls. Else it is declined (see `elicitFor`).
      const askCaller = elicitFor(calling)
      const shared = new Map<string, SharedServer>()
      for (const [name, server] of servers) {
        if (server.type !== 'stdio') continue
        shared.set(name, openServer(host.resources, name, server, askCaller))
      }
      // The tool name clashes that were warned about, for all sessions.
      const warned = new Set<string>()
      const onDuplicate = options.onDuplicateTool ?? 'warn'
      return {
        session: (ctx) =>
          sessionPart(ctx, servers, shared, calling, warned, onDuplicate),
      }
    },
  })
}

/** The part of {@link mcp} that each session sets up. */
async function sessionPart(
  ctx: PluginSetupContext,
  servers: ReadonlyArray<[string, McpServerConfig]>,
  shared: ReadonlyMap<string, SharedServer>,
  calling: Array<Caller>,
  warned: Set<string>,
  onDuplicate: 'warn' | 'error',
) {
  const statuses = new Map<string, McpServerStatus>()
  for (const [name] of servers) {
    statuses.set(name, { name, status: 'connecting', toolCount: 0 })
  }
  const state = ctx.state({ servers: [...statuses.values()] })
  const setStatus = async (status: McpServerStatus) => {
    const old = JSON.stringify(statuses.get(status.name))
    statuses.set(status.name, status)
    if (old === JSON.stringify(status)) return
    await state.update(() => ({ servers: [...statuses.values()] }))
  }
  // State from an earlier run of this session is out of date.
  await state.update(() => ({ servers: [...statuses.values()] }))

  /**
   * Connect one server in the background. Returns the tools of the server
   * for each turn. A stdio server is the shared one of the host. Never
   * rejects.
   */
  const connect = (name: string, server: McpServerConfig) => {
    const sharedServer = shared.get(name)
    // The tool calls of this server for this session that run now.
    const own: Array<Caller> = []
    const opened =
      sharedServer ?? openServer(ctx.resources, name, server, elicitFor(own))
    // After the session closed, the state store can be gone. `/mcp`
    // reads `statuses`, which is set first.
    const opening = opened.then(async (link) => {
      if (link instanceof Error) {
        await setStatus({
          name,
          status: 'failed',
          error: link.message,
          toolCount: 0,
        }).catch(() => undefined)
        return undefined
      }
      const update = () => setStatus(link.status()).catch(() => undefined)
      link.watch(() => void update(), ctx.resources.signal)
      await update()
      return link
    })
    return async (_turn: TurnInfo) => {
      const link = await opening
      if (!link) return []
      const tools = trackCaller(
        await link.tools(),
        ctx.session,
        sharedServer ? calling : own,
      )
      return askForInput(tools, ctx.session)
    }
  }

  const commands: Record<string, AnyCommand> = {
    mcp: defineCommand({
      description: 'Show the MCP servers and their status',
      run: () => [...statuses.values()].map(statusLine).join('\n'),
    }),
  }
  const prompts: Array<PluginPrompt> = []
  // One tool list for each server, in the order of `servers`.
  const lists = await Promise.all(
    servers.map(async (entry) => {
      const [name, server] = entry
      const isOAuth = server.type === 'http' && server.oauth === true
      if (!isOAuth) return { name, list: connect(name, server) }
      // Loaded here: the connector needs node:crypto and node:http.
      const { mcpConnector } = await import('./connector')
      const connector = await mcpConnector({
        id: name,
        label: name,
        url: server.url,
        toolName: server.toolName,
        needsApproval: approvalOf(server),
        requestOptions: requestOptionsOf(server),
        ...(server.fetch ? { fetch: server.fetch } : {}),
      }).setup(ctx)
      Object.assign(commands, connector.commands)
      prompts.push(...connector.prompts)
      // The sign-in belongs to the sender of the turn, so the status is
      // the one of the last turn.
      const list = async (turn: TurnInfo) => {
        try {
          const tools = await connector.discoverTools(turn)
          const signedIn =
            tools.length > 0 || (await turn.run.credentials.get(name)) !== null
          await setStatus(
            signedIn
              ? { name, status: 'connected', toolCount: tools.length }
              : {
                  name,
                  status: 'failed',
                  error: `Not signed in. Run /connect ${name}.`,
                  toolCount: 0,
                },
          )
          return forCodeMode(server, tools)
        } catch (error) {
          // One server that fails must not hide the tools of the others.
          await setStatus({
            name,
            status: 'failed',
            error: errorText(error),
            toolCount: 0,
          })
          return []
        }
      }
      return { name, list }
    }),
  )

  return {
    commands,
    prompts,
    discoverTools: async (turn: TurnInfo) => {
      const found = await Promise.all(
        lists.map(async ({ name, list }) => ({
          name,
          tools: await list(turn),
        })),
      )
      return onDuplicate === 'error'
        ? failOnDuplicate(found, setStatus)
        : keepFirstTools(found, warned, ctx.logger)
    },
  }
}

/** A server that the sessions of a host share: its connection, or its error. */
type SharedServer = ReturnType<typeof openServer>

/**
 * Connect one server in `resources`. It never rejects: an error that stops
 * the setup itself resolves to that error.
 *
 * When the first connect fails, the status is `failed` with the error, and
 * the server connects again with backoff. When the connection closes later,
 * the status is `reconnecting`, with the same backoff. Both go on until a
 * connection is open or `resources` is disposed. After
 * `tools/list_changed`, the next `tools()` lists the tools again.
 */
function openServer(
  resources: PluginResources,
  name: string,
  server: McpServerConfig,
  onElicit: OnElicit,
) {
  const { signal } = resources
  const watchers = new Set<() => void>()
  let status: McpServerStatus = { name, status: 'connecting', toolCount: 0 }
  let client: MCPClient | undefined
  let tools: ReadonlyArray<AnyTool> = []
  // Set by tools/list_changed. The next `tools()` lists the tools again.
  let stale = false
  let listing: Promise<void> | undefined
  // The backoff goes on across drops, so a server that crashes right after
  // it connects waits longer each time. It resets only after a connection
  // stayed open for `stableMs`.
  let attempt = 0
  let openedAt = 0

  const setStatus = (next: McpServerStatus) => {
    status = next
    for (const watcher of watchers) watcher()
  }

  /** One connection with its tool list. Throws when the server fails. */
  const open = async () => {
    // Loaded here: the stdio transport needs node:child_process.
    const transport =
      server.type === 'stdio'
        ? (await import('./stdio')).stdioTransport(server)
        : server
    const next = await connectTransport(
      {
        transport,
        prefix: name,
        toolName: server.toolName,
        needsApproval: approvalOf(server),
        requestOptions: requestOptionsOf(server),
        clientOptions: harnessClientOptions,
        onClose: () => dropped(),
        onToolListChanged: () => {
          stale = true
        },
      },
      onElicit,
    )
    let listed: ReadonlyArray<AnyTool>
    try {
      listed = forCodeMode(server, await next.tools())
    } catch (error) {
      // Connected, but no tool list: the server failed.
      await next.close().catch(() => undefined)
      throw error
    }
    // Disposed while this connect ran: nothing uses the connection.
    if (signal.aborted) {
      await next.close().catch(() => undefined)
      throw signal.reason
    }
    client = next
    tools = listed
    stale = false
    openedAt = Date.now()
    setStatus({ name, status: 'connected', toolCount: listed.length })
  }

  /** The connection closed, and this plugin did not close it. */
  const dropped = () => {
    if (status.status !== 'connected' || signal.aborted) return
    client = undefined
    tools = []
    if (Date.now() - openedAt >= stableMs) attempt = 0
    setStatus({ name, status: 'reconnecting', toolCount: 0 })
    void reconnect()
  }

  const reconnect = async () => {
    for (;;) {
      await delay(backoffMs(attempt++), signal)
      if (signal.aborted) return
      const isOpen = await open().then(
        () => true,
        () => false,
      )
      if (isOpen) return
    }
  }

  /** List the tools of `current` again. On a failure, the old list stays. */
  const relist = async (current: MCPClient) => {
    stale = false
    const listed = await current.tools().then(
      (found) => forCodeMode(server, found),
      () => undefined,
    )
    // The connection closed while it listed.
    if (client !== current) return
    if (listed === undefined) {
      stale = true
      return
    }
    tools = listed
    setStatus({ name, status: 'connected', toolCount: listed.length })
  }

  const link = {
    status: () => status,
    /** The tools of the open connection. Never rejects. */
    tools: async () => {
      if (stale && client) {
        listing ??= relist(client).finally(() => {
          listing = undefined
        })
        await listing
      }
      return tools
    },
    /** Calls `watcher` after each status change, until `until` aborts. */
    watch: (watcher: () => void, until: AbortSignal) => {
      if (until.aborted) return
      watchers.add(watcher)
      until.addEventListener('abort', () => watchers.delete(watcher), {
        once: true,
      })
    },
  }

  return resources
    .acquire(
      async () => {
        try {
          await open()
        } catch (error) {
          if (signal.aborted) throw error
          // A server that is not up yet (a slow `npx`, a short outage) gets
          // its tools at a later turn.
          setStatus({
            name,
            status: 'failed',
            error: errorText(error),
            toolCount: 0,
          })
          void reconnect()
        }
        return link
      },
      () => client?.close(),
    )
    .catch((error: unknown) => new Error(errorText(error)))
}

/** How long a connection stays open before the backoff starts again at 0.5 s. */
const stableMs = 30_000

/**
 * The wait before reconnect `attempt` (0 is the first): 0.5 s, 1 s, 2 s,
 * and so on, at most 30 s. A random part of up to half the wait keeps the
 * sessions of many hosts from connecting at the same moment.
 */
function backoffMs(attempt: number) {
  const full = Math.min(500 * 2 ** attempt, 30_000)
  return full / 2 + Math.random() * (full / 2)
}

/** Resolves after `ms`, or at once when `signal` aborts. */
function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    // An aborted signal never fires `abort` again.
    if (signal.aborted) return resolve()
    const done = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', done)
      resolve()
    }
    const timer = setTimeout(done, ms)
    signal.addEventListener('abort', done, { once: true })
  })
}

/** The `needsApproval` of a server for the client and the connector. */
function approvalOf(server: McpServerConfig) {
  const { needsApproval } = server
  if (typeof needsApproval !== 'boolean') return needsApproval
  return () => needsApproval
}

/**
 * The tools of all servers, in server order. A tool whose name an earlier
 * server already gives is dropped. Each pair of servers warns once, to
 * `logger`.
 */
function keepFirstTools(
  found: ReadonlyArray<{ name: string; tools: ReadonlyArray<AnyTool> }>,
  warned: Set<string>,
  logger: Logger,
) {
  const owners = new Map<string, string>()
  const kept: Array<AnyTool> = []
  for (const { name, tools } of found) {
    for (const tool of tools) {
      const owner = owners.get(tool.name)
      if (owner === undefined) {
        owners.set(tool.name, name)
        kept.push(tool)
        continue
      }
      const pair = JSON.stringify([owner, name])
      if (warned.has(pair)) continue
      warned.add(pair)
      logger.warn(
        `[@tanstack/ai-mcp] The MCP servers ${JSON.stringify(owner)} and ${JSON.stringify(name)} both give the tool ${JSON.stringify(tool.name)}. The model gets the tool of ${JSON.stringify(owner)}. Set toolName on one of the servers to rename its tools.`,
      )
    }
  }
  return kept
}

/**
 * The tools of all servers, in server order. A server that gives a tool name
 * of an earlier server gets the status `failed`, and none of its tools.
 */
async function failOnDuplicate(
  found: ReadonlyArray<{ name: string; tools: ReadonlyArray<AnyTool> }>,
  setStatus: (status: McpServerStatus) => Promise<void>,
) {
  const owners = new Map<string, string>()
  const kept: Array<AnyTool> = []
  for (const { name, tools } of found) {
    const clash = tools.find((tool) => owners.has(tool.name))
    if (clash) {
      const owner = owners.get(clash.name)
      await setStatus({
        name,
        status: 'failed',
        error: `The MCP servers ${JSON.stringify(owner)} and ${JSON.stringify(name)} both give the tool ${JSON.stringify(clash.name)}. Set toolName on one of the servers to rename its tools.`,
        toolCount: 0,
      })
      continue
    }
    for (const tool of tools) owners.set(tool.name, name)
    kept.push(...tools)
  }
  return kept
}

/** A tool call that runs now: its session, and the run that calls. */
export interface Caller {
  session: PluginSessionApi
  run?: RunContext
}

/**
 * Puts each call of `tools` in `calling` while it runs, with its session
 * and its run, so a spec 2025 elicitation can find the run that calls.
 */
export function trackCaller(
  tools: ReadonlyArray<AnyTool>,
  session: PluginSessionApi,
  calling: Array<Caller>,
) {
  return tools.map((tool): AnyTool => {
    const execute = tool.execute
    if (!execute) return tool
    return {
      ...tool,
      execute: async (args, context) => {
        const run = runOf(context)
        const caller: Caller = { session, ...(run ? { run } : {}) }
        calling.push(caller)
        try {
          return await execute(args, context)
        } finally {
          calling.splice(calling.lastIndexOf(caller), 1)
        }
      },
    }
  })
}

/**
 * The harness asks the user for form and URL elicitations, so its clients
 * declare both. `chat()` clients keep the default: form only.
 */
export const harnessClientOptions = {
  capabilities: { elicitation: { form: {}, url: {} } },
}

/**
 * Ask the session user when an MCP tool asks for input (a form or a URL
 * elicitation). The tool call waits for the answer, then sends it to the
 * server. On spec 2026, a tool call can ask up to 5 times. The answer is the
 * form content, or an MCP result such as `{ action: 'decline' }` or
 * `{ action: 'cancel' }`.
 */
export function askForInput(
  tools: ReadonlyArray<AnyTool>,
  session: PluginSessionApi,
) {
  return tools.map((tool): AnyTool => {
    const execute = tool.execute
    if (!execute) return tool
    return {
      ...tool,
      execute: (args, context) => {
        // The question is a wait of the run of this call.
        const run = runOf(context)
        const askInput: AskInput = async (request) => ({
          status: 'resolved',
          payload: await ask(session, request, run),
        })
        return execute(args, {
          ...(isRecord(context) ? context : {}),
          askInput,
        })
      },
    }
  })
}

/**
 * Answers the `elicitation/create` requests of a spec 2025 server. The
 * request does not name the tool call that it belongs to. So it asks only
 * when the calls of `calling` all belong to one run of one session, as a
 * live wait of that run. With no call, or with calls of more than one run
 * (two users or tenants can share a server), it declines: a question must
 * never go to the user of another run.
 */
export function elicitFor(calling: ReadonlyArray<Caller>): OnElicit {
  return async (params) => {
    const [caller] = calling
    if (!caller) return { action: 'decline' }
    const isOneRun = calling.every(
      (other) =>
        other.session === caller.session &&
        other.run !== undefined &&
        other.run.runId === caller.run?.runId,
    )
    if (!isOneRun) return { action: 'decline' }
    return elicitResult(await ask(caller.session, params, caller.run))
  }
}

/**
 * Asks the session user for one MCP elicitation request body, as a live
 * wait of `run`, by the name `mcp-elicitation`. With no run, it declines:
 * only a run can wait for the user.
 */
async function ask(
  session: PluginSessionApi,
  request: unknown,
  run: RunContext | undefined,
) {
  if (!run) return { action: 'decline' }
  const body = isRecord(request) ? request : {}
  const url =
    body.mode === 'url' && typeof body.url === 'string' ? body.url : undefined
  const answer = await session.ask({
    message:
      typeof body.message === 'string'
        ? body.message
        : 'The MCP server asks for input.',
    schema: isJsonSchema(body.requestedSchema)
      ? body.requestedSchema
      : undefined,
    ...(url ? { url } : {}),
    live: { name: 'mcp-elicitation', run },
  })
  // A URL request has no content: the answer only says "done".
  return url !== undefined && !(isRecord(answer) && 'action' in answer)
    ? { action: 'accept' }
    : answer
}

/** Maps an answer to the MCP result: decline, cancel, or accept. */
function elicitResult(answer: unknown): ElicitResult {
  if (
    isRecord(answer) &&
    (answer.action === 'decline' || answer.action === 'cancel')
  ) {
    return { action: answer.action }
  }
  const content =
    isRecord(answer) && answer.action === 'accept' ? answer.content : answer
  return isElicitContent(content)
    ? { action: 'accept', content }
    : { action: 'accept' }
}

// ponytail: the SDK checks the result against the schema of the request.
function isElicitContent(
  value: unknown,
): value is NonNullable<ElicitResult['content']> {
  return isRecord(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

/** The run of a harness tool call, from its context: `ctx.context.run`. */
function runOf(context: unknown): RunContext | undefined {
  const run =
    isRecord(context) && isRecord(context.context)
      ? context.context.run
      : undefined
  return isRunContext(run) ? run : undefined
}

// ponytail: the harness sets `ctx.context.run`. A run id and a signal tell
// it apart from other context values.
function isRunContext(value: unknown): value is RunContext {
  return (
    isRecord(value) &&
    typeof value.runId === 'string' &&
    value.signal instanceof AbortSignal
  )
}

// ponytail: the server owns the schema. The session passes it on as is.
function isJsonSchema(value: unknown): value is JSONSchema {
  return isRecord(value)
}

/** The SDK request options for `timeoutMs`. */
function requestOptionsOf(server: McpServerConfig) {
  return server.timeoutMs === undefined
    ? undefined
    : { timeout: server.timeoutMs }
}

/** Marks the tools of a `codeMode: true` server for the `codeMode()` plugin. */
function forCodeMode(server: McpServerConfig, tools: ReadonlyArray<AnyTool>) {
  if (server.codeMode !== true) return tools
  return tools.map((tool) => ({
    ...tool,
    metadata: { ...tool.metadata, codeMode: true },
  }))
}

function statusLine(server: McpServerStatus) {
  switch (server.status) {
    case 'connecting':
      return `${server.name}: connecting`
    case 'reconnecting':
      return `${server.name}: reconnecting`
    case 'connected': {
      const unit = server.toolCount === 1 ? 'tool' : 'tools'
      return `${server.name}: connected (${server.toolCount} ${unit})`
    }
    case 'failed':
      return `${server.name}: failed: ${server.error}`
  }
}

/** The error text for the status. A connect error keeps its reason in `cause`. */
function errorText(error: unknown) {
  if (!(error instanceof Error)) return String(error)
  const { cause } = error
  return cause instanceof Error
    ? `${error.message}: ${cause.message}`
    : error.message
}
