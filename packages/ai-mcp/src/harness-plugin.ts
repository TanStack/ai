import { defineCommand, definePlugin } from '@tanstack/ai-harness'
import { createMCPClient } from './client'
import { isMCPInputRequiredError } from './input-required'
import type { AnyTool, JSONSchema } from '@tanstack/ai'
import type {
  AnyCommand,
  PluginPrompt,
  PluginSessionApi,
} from '@tanstack/ai-harness'
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
}

/**
 * The status of one server. UIs read the list from
 * `snapshot().plugins['tanstack/mcp'].servers`.
 */
export type McpServerStatus = {
  name: string
  /** How many tools the server gives the model. */
  toolCount: number
} & (
  | { status: 'connecting' | 'connected' }
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
 * - A `stdio` server runs as a child process (Node only). It stops when the
 *   session closes.
 * - An `http` server with `oauth: true` signs in through `/connect <name>`.
 *
 * @param options.servers - The servers, keyed by name. The name is the tool
 *   prefix.
 *
 * @example
 * ```ts
 * import { mcp } from '@tanstack/ai-mcp/harness'
 *
 * plugins: () => [
 *   mcp({
 *     servers: {
 *       files: { type: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '.'] },
 *       docs: { type: 'http', url: 'https://mcp.example.com/mcp', timeoutMs: 10_000 },
 *       notion: { type: 'http', url: 'https://mcp.notion.com/mcp', oauth: true },
 *     },
 *   }),
 * ]
 * ```
 */
export function mcp(options: {
  servers: Readonly<Record<string, McpServerConfig>>
}) {
  const servers = Object.entries(options.servers)
  return definePlugin({
    name: 'tanstack/mcp',
    setup: async (ctx) => {
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

      /** Connects one server, in the background. Never rejects. */
      const connect = async (name: string, server: McpServerConfig) => {
        const opened = await ctx.resources
          .acquire(
            async () => {
              // Loaded here: the stdio transport needs node:child_process.
              const transport =
                server.type === 'stdio'
                  ? (await import('./stdio')).stdioTransport(server)
                  : server
              const client = await createMCPClient({
                transport,
                prefix: name,
                requestOptions: requestOptionsOf(server),
                clientOptions: harnessClientOptions,
              })
              try {
                const tools = askForInput(
                  forCodeMode(server, await client.tools()),
                  ctx.session,
                )
                return { client, tools }
              } catch (error) {
                // Connected, but no tool list: the server failed.
                await client.close().catch(() => undefined)
                throw error
              }
            },
            ({ client }) => client.close(),
          )
          .catch((error: unknown) => new Error(errorText(error)))
        const failed = opened instanceof Error
        const status: McpServerStatus = failed
          ? { name, status: 'failed', error: opened.message, toolCount: 0 }
          : { name, status: 'connected', toolCount: opened.tools.length }
        // After the session closed, the state store can be gone. `/mcp`
        // reads `statuses`, which is set first.
        await setStatus(status).catch(() => undefined)
        return failed ? [] : opened.tools
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
          if (!isOAuth) {
            const connecting = connect(name, server)
            return () => connecting
          }
          // Loaded here: the connector needs node:crypto and node:http.
          const { mcpConnector } = await import('./connector')
          const connector = await mcpConnector({
            id: name,
            label: name,
            url: server.url,
            requestOptions: requestOptionsOf(server),
            ...(server.fetch ? { fetch: server.fetch } : {}),
          }).setup(ctx)
          Object.assign(commands, connector.commands)
          prompts.push(...connector.prompts)
          // The sign-in belongs to the sender of the turn, so the status is
          // the one of the last turn.
          return async () => {
            try {
              const tools = await connector.discoverTools()
              const signedIn =
                tools.length > 0 || (await ctx.credentials.get(name)) !== null
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
        }),
      )

      return {
        commands,
        prompts,
        discoverTools: async () => {
          const found = await Promise.all(lists.map((list) => list()))
          return found.flat()
        },
      }
    },
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
 * server. The answer is the form content, or an MCP result such as
 * `{ action: 'decline' }` or `{ action: 'cancel' }`.
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
      execute: async (args, context) => {
        try {
          return await execute(args, context)
        } catch (error) {
          // A resumed `mcp_input` interrupt already carries its answer.
          const resumed =
            isRecord(context) && context.inputResponse !== undefined
          if (
            !isMCPInputRequiredError(error) ||
            error.kind !== 'form' ||
            resumed
          ) {
            throw error
          }
          const request = isRecord(error.request) ? error.request : {}
          const url =
            request.mode === 'url' && typeof request.url === 'string'
              ? request.url
              : undefined
          const answer = await session.ask({
            message:
              typeof request.message === 'string'
                ? request.message
                : 'The MCP server asks for input.',
            schema: isJsonSchema(request.requestedSchema)
              ? request.requestedSchema
              : undefined,
            ...(url ? { url } : {}),
          })
          // A URL request has no content: the answer only says "done".
          const payload =
            url !== undefined && !(isRecord(answer) && 'action' in answer)
              ? { action: 'accept' }
              : answer
          return execute(args, {
            ...(isRecord(context) ? context : {}),
            inputResponse: { status: 'resolved', payload },
          })
        }
      },
    }
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
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
