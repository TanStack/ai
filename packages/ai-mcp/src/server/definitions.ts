type PromptMessage = {
  role: string
  content: string
}

type PromptArgsSchema<TArgs> = {
  parse: (input: unknown) => TArgs
}

/** The variables of a `uriTemplate`, as the MCP SDK matches them. */
type TemplateVariables = Record<string, string | Array<string>>

type ResourceArgsOf<TConfig> = TConfig extends {
  argsSchema: PromptArgsSchema<infer TArgs>
}
  ? TArgs
  : TemplateVariables

/**
 * Builds a resource definition for the MCP server.
 *
 * `config` takes `name`, `mimeType`, and `uri` or `uriTemplate`.
 * If `uri` and `uriTemplate` are both missing, this function throws a TypeError.
 * Call `.read` with a function that returns the resource contents.
 *
 * For a `uriTemplate`, the read function gets the variables of the URI the
 * client asked for, and the URI itself. Pass `argsSchema` to parse the
 * variables first. A body `{ text | blob, mimeType }` sets the MIME type of
 * that answer, for a template whose files have different types.
 *
 * @param config - The resource `name`, `mimeType`, `uri` or `uriTemplate`, and an optional `argsSchema`.
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
 * const user = resourceDefinition({
 *   uriTemplate: 'users://{id}',
 *   name: 'user',
 *   mimeType: 'application/json',
 *   argsSchema: z.object({ id: z.string() }),
 * }).read(async ({ id }) => ({ text: JSON.stringify(await loadUser(id)) }))
 * ```
 */
export function resourceDefinition<
  const TConfig extends {
    name: string
    mimeType: string
    uri?: string
    uriTemplate?: string
    argsSchema?: PromptArgsSchema<unknown>
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
    read<TContents>(
      readContents: (
        args: ResourceArgsOf<TConfig>,
        uri: URL | undefined,
      ) => TContents | Promise<TContents>,
    ) {
      return {
        ...config,
        async read(variables: TemplateVariables = {}, uri?: URL) {
          // Without `argsSchema`, the args are the variables as matched.
          // `ResourceArgsOf` picks the same branch from the config type, which
          // TypeScript cannot follow through the runtime check.
          const args = (
            config.argsSchema ? config.argsSchema.parse(variables) : variables
          ) as ResourceArgsOf<TConfig>
          return readContents(args, uri)
        },
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
