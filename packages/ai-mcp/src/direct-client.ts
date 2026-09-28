import { parseWithStandardSchema } from '@tanstack/ai'
import type { InferToolInput, InferToolOutput } from '@tanstack/ai'
import { createServerToolContext } from './server/context'
import { optionsOfServer } from './server/registry'
import type { MCPServer } from './server/create-server'

type Named = { name: string }

type ToolNames<TTools extends ReadonlyArray<Named>> = TTools[number]['name']

type ToolByName<
  TTools extends ReadonlyArray<Named>,
  TName extends string,
> = Extract<TTools[number], { name: TName }>

type ResourceUris<TResources extends ReadonlyArray<{ uri?: string }>> = Extract<
  TResources[number],
  { uri: string }
>['uri']

type ResourceByUri<
  TResources extends ReadonlyArray<{ uri?: string }>,
  TUri extends string,
> = Extract<TResources[number], { uri: TUri }>

type PromptNames<TPrompts extends ReadonlyArray<Named>> =
  TPrompts[number]['name']

type PromptByName<
  TPrompts extends ReadonlyArray<Named>,
  TName extends string,
> = Extract<TPrompts[number], { name: TName }>

type ResourceContents<TResource> = TResource extends {
  read: () => infer TResult
}
  ? Awaited<TResult>
  : never

type PromptArgs<TPrompt> = TPrompt extends {
  render: (input: infer TArgs) => unknown
}
  ? TArgs
  : never

type PromptMessages<TPrompt> = TPrompt extends {
  render: (input: never) => infer TResult
}
  ? Awaited<TResult>
  : never

/**
 * The client types of a `createMCPServer` server, for a client that
 * connects over a transport.
 *
 * Pass `typeof server` to `createMCPClient` with a `transport`.
 * Import the server with `import type`, so its code stays out of the client.
 *
 * @example
 * ```ts
 * import type { server } from './mcp-server'
 *
 * const client = await createMCPClient<typeof server>({
 *   transport: { type: 'http', url: 'https://mcp.example.com/mcp' },
 * })
 * await client.callTool('get_weather', { city: 'Paris' })
 * ```
 */
export type DescriptorFromServer<TServer extends MCPServer> = {
  tools: {
    [TTool in TServer['tools'][number] as TTool['name']]: {
      input: InferToolInput<TTool>
      output: InferToolOutput<TTool>
    }
  }
  resources: {
    [TResource in Extract<
      TServer['resources'][number],
      { uri: string }
    > as TResource['uri']]: {
      uri: TResource['uri']
      data: ResourceContents<TResource>
    }
  }
  prompts: {
    [TPrompt in TServer['prompts'][number] as TPrompt['name']]: {
      args: PromptArgs<TPrompt>
      messages: PromptMessages<TPrompt>
    }
  }
  capabilities: Record<string, unknown>
}

// The same context shape that a spec 2026 call on the server gets.
function directToolContext(server: object, signal: AbortSignal | undefined) {
  return {
    context: createServerToolContext({
      era: '2026',
      sample: optionsOfServer(server)?.sample,
    }),
    abortSignal: signal ?? new AbortController().signal,
    emitCustomEvent() {},
  }
}

type DirectToolContext = ReturnType<typeof directToolContext>

type ListedTool = {
  name: string
  inputSchema?: unknown
  execute?: (input: never, context?: DirectToolContext) => unknown
}

type ListedResource = {
  uri?: string
  read: () => unknown
}

type ListedPrompt = {
  name: string
  render: (input: never) => unknown
}

/**
 * Calls the tools, resources, and prompts on one TanStack MCP server.
 *
 * `server` is the object from `createMCPServer`.
 * The tool names, resource URIs, and prompt arguments stay typed.
 * This client does not open a network connection.
 * `callTool` checks `args` with the tool input schema, like the HTTP server.
 * The tool gets the spec 2026 context: `ctx.context.requestInput` throws
 * `ToolInputRequiredError`, and `ctx.context.sample` uses the server
 * `sample` option.
 *
 * @param server - The server object to call
 *
 * @example
 * ```ts
 * const client = directMCPClient(server)
 * await client.callTool('get_weather', { city: 'Paris' })
 * ```
 */
export function directMCPClient<const TServer extends MCPServer>(
  server: TServer,
) {
  const tools = server.tools as ReadonlyArray<ListedTool>
  const resources = server.resources as ReadonlyArray<ListedResource>
  const prompts = server.prompts as ReadonlyArray<ListedPrompt>

  return {
    server,

    async callTool<const TName extends ToolNames<TServer['tools']>>(
      name: TName,
      args: InferToolInput<ToolByName<TServer['tools'], TName>>,
      options?: { signal?: AbortSignal },
    ) {
      const tool = tools.find((item) => item.name === name)
      if (tool === undefined || tool.execute === undefined) {
        throw new Error(`The MCP server has no tool ${name}.`)
      }
      const execute = tool.execute as (
        input: InferToolInput<ToolByName<TServer['tools'], TName>>,
        context?: DirectToolContext,
      ) =>
        | InferToolOutput<ToolByName<TServer['tools'], TName>>
        | Promise<InferToolOutput<ToolByName<TServer['tools'], TName>>>
      // A schema that is not a Standard Schema passes `args` through.
      const input = parseWithStandardSchema<
        InferToolInput<ToolByName<TServer['tools'], TName>>
      >(tool.inputSchema, args)
      return execute(input, directToolContext(server, options?.signal))
    },

    async readResource<const TUri extends ResourceUris<TServer['resources']>>(
      uri: TUri,
    ) {
      const resource = resources.find((item) => item.uri === uri)
      if (resource === undefined) {
        throw new Error(`The MCP server has no resource ${uri}.`)
      }
      const read = resource.read as () =>
        | ResourceContents<ResourceByUri<TServer['resources'], TUri>>
        | Promise<ResourceContents<ResourceByUri<TServer['resources'], TUri>>>
      return read()
    },

    async getPrompt<const TName extends PromptNames<TServer['prompts']>>(
      name: TName,
      args: PromptArgs<PromptByName<TServer['prompts'], TName>>,
    ) {
      const prompt = prompts.find((item) => item.name === name)
      if (prompt === undefined) {
        throw new Error(`The MCP server has no prompt ${name}.`)
      }
      const render = prompt.render as (
        input: PromptArgs<PromptByName<TServer['prompts'], TName>>,
      ) =>
        | PromptMessages<PromptByName<TServer['prompts'], TName>>
        | Promise<PromptMessages<PromptByName<TServer['prompts'], TName>>>
      return render(args)
    },
  }
}

export type DirectMCPClient<TServer extends MCPServer> = ReturnType<
  typeof directMCPClient<TServer>
>

export type DirectClientOptions<TServer extends MCPServer = MCPServer> = {
  server: TServer
}
