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
 * `config` takes `name`, `mimeType`, and `uri` or `uriTemplate`.
 * If `uri` and `uriTemplate` are both missing, this function throws a TypeError.
 * Call `.read` with a function that returns the resource contents.
 *
 * @param config - The resource `name`, `mimeType`, and `uri` or `uriTemplate`.
 * @throws {TypeError} When `uri` and `uriTemplate` are both missing.
 *
 * @example
 * ```ts
 * const readme = resourceDefinition({
 *   uri: 'file:///readme.md',
 *   name: 'readme',
 *   mimeType: 'text/markdown',
 * }).read(async () => ({ text: '# Hello' }))
 * ```
 */
export function resourceDefinition<
  const TConfig extends {
    name: string
    mimeType: string
    uri?: string
    uriTemplate?: string
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
    read<TContents>(readContents: () => TContents | Promise<TContents>) {
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
