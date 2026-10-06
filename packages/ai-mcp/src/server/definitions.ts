import type {
  AuthInfo,
  ListResourcesResult,
  Variables,
} from '@modelcontextprotocol/server'

/**
 * What a resource `read` and `list` receive. `context` holds the values
 * from `handle(request, { context })` and the verified `authInfo`.
 */
export type MCPResourceContext = {
  context: Record<string, unknown> & { authInfo?: AuthInfo }
}

/** Lists the concrete resources of a template for `resources/list`. */
export type MCPResourceList = (
  ctx: MCPResourceContext,
) => ListResourcesResult | Promise<ListResourcesResult>

/** Reads one resource. `variables` is `{}` for a resource with `uri`. */
export type MCPResourceRead<TContents = unknown> = (
  uri: URL,
  variables: Variables,
  ctx: MCPResourceContext,
) => TContents | Promise<TContents>

type PromptMessage = {
  role: string
  content: string
}

type PromptArgsSchema<TArgs> = {
  parse: (input: unknown) => TArgs
}

/**
 * Builds a resource definition for the MCP server.
 *
 * `config` takes `name`, `mimeType`, and one of `uri` or `uriTemplate`.
 * If `uri` and `uriTemplate` are both missing, this function throws a TypeError.
 * Only a template can take `list(ctx)`. It returns the concrete resources
 * for `resources/list`.
 * Call `.read` with a function that returns the resource contents.
 * It gets the requested `uri`, the template `variables`, and `ctx`.
 * `ctx.context` holds the values from `handle(request, { context })` and
 * the verified `authInfo`. A tool gets the same values on its `ctx.context`.
 *
 * @param config - The resource `name`, `mimeType`, `uri` or `uriTemplate`, and `list`.
 * @throws {TypeError} When `uri` and `uriTemplate` are both missing.
 *
 * @example
 * ```ts
 * const readme = resourceDefinition({
 *   uri: 'file:///readme.md',
 *   name: 'readme',
 *   mimeType: 'text/markdown',
 * }).read(async () => ({ text: '# Hello' }))
 *
 * const summary = resourceDefinition({
 *   uriTemplate: 'myapp://items/{itemId}/summary',
 *   name: 'item-summary',
 *   mimeType: 'text/plain',
 * }).read(async (_uri, { itemId }) => ({ text: `Summary of ${String(itemId)}` }))
 * ```
 */
export function resourceDefinition<
  const TConfig extends
    | {
        name: string
        mimeType: string
        uri: string
        uriTemplate?: never
        list?: never
      }
    | {
        name: string
        mimeType: string
        uriTemplate: string
        uri?: never
        list?: MCPResourceList
      },
>(config: TConfig) {
  const hasUri = config.uri !== undefined
  const hasUriTemplate = config.uriTemplate !== undefined
  if (!hasUri && !hasUriTemplate) {
    throw new TypeError(
      'This resource has no uri and no uriTemplate. Pass a uri or a uriTemplate.',
    )
  }

  return {
    ...config,
    read<TContents>(readContents: MCPResourceRead<TContents>) {
      return {
        ...config,
        read: readContents,
      }
    },
  }
}

/**
 * Builds a prompt definition for the MCP server.
 *
 * `config` takes `name`, `description`, and `argsSchema`.
 * `argsSchema.parse` runs before the render function receives the arguments.
 * Call `.render` with a function that returns an array of messages.
 * Each message has `role` and `content`.
 *
 * @param config - The prompt `name`, `description`, and `argsSchema`.
 *
 * @example
 * ```ts
 * const summarize = promptDefinition({
 *   name: 'summarize',
 *   description: 'Summarize a topic',
 *   argsSchema: z.object({ topic: z.string() }),
 * }).render(async (args) => [{ role: 'user', content: args.topic }])
 * ```
 */
export function promptDefinition<const TName extends string, TArgs>(config: {
  name: TName
  description: string
  argsSchema: PromptArgsSchema<TArgs>
}) {
  const definition = {
    name: config.name,
    description: config.description,
    argsSchema: config.argsSchema,
  }

  return {
    ...definition,
    render(
      renderPrompt: (
        args: TArgs,
      ) => ReadonlyArray<PromptMessage> | Promise<ReadonlyArray<PromptMessage>>,
    ) {
      return {
        ...definition,
        async render(input: TArgs) {
          const args = config.argsSchema.parse(input)
          return renderPrompt(args)
        },
      }
    },
  }
}
