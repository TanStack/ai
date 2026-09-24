import {
  convertSchemaToJsonSchema,
  validateWithStandardSchema,
} from '@tanstack/ai/client'
import type { AnyClientTool } from '@tanstack/ai/client'
import type {
  ClientContextOptionFromTools,
  InferredClientContext,
} from './types'

interface WebMCPTool {
  name: string
  title?: string
  description: string
  inputSchema?: object
  annotations?: WebMCPToolAnnotations
  execute: (input: object, options: { signal: AbortSignal }) => Promise<unknown>
}

interface WebMCPModelContext {
  registerTool: (
    tool: WebMCPTool,
    options: { signal: AbortSignal },
  ) => Promise<void>
}

/** WebMCP behavior hints for one registered tool. */
export interface WebMCPToolAnnotations {
  /** Indicates that the tool does not modify state. */
  readOnlyHint?: boolean
  /** Indicates that the tool can return content that the application does not trust. */
  untrustedContentHint?: boolean
}

/** Display and behavior options for one WebMCP tool. */
export interface WebMCPToolOptions {
  /** A human-readable title for browser user interfaces. */
  title?: string
  /** Optional behavior hints for browser agents. */
  annotations?: WebMCPToolAnnotations
}

/** WebMCP options keyed by the inferred names in a client tool list. */
export type WebMCPToolOptionsByName<
  TTools extends ReadonlyArray<AnyClientTool>,
> = Partial<{
  [TName in TTools[number]['name']]: WebMCPToolOptions
}>

/**
 * Options for {@link registerWebMCPTools}.
 *
 * The signal controls the registration lifetime. Context is required when a
 * client tool declares a required runtime context.
 */
export type RegisterWebMCPToolsOptions<
  TTools extends ReadonlyArray<AnyClientTool>,
  TContext = InferredClientContext<TTools>,
> = {
  /** Removes all tools from this call when the signal aborts. */
  signal: AbortSignal
  /** Per-tool display and behavior options. */
  toolOptions?: WebMCPToolOptionsByName<TTools>
} & ClientContextOptionFromTools<TTools, TContext>

function isWebMCPModelContext(value: unknown): value is WebMCPModelContext {
  return (
    value !== null &&
    typeof value === 'object' &&
    'registerTool' in value &&
    typeof value.registerTool === 'function'
  )
}

function getToolOptions<TName extends string>(
  toolOptions: Partial<Record<TName, WebMCPToolOptions>> | undefined,
  name: TName,
) {
  return toolOptions?.[name]
}

async function validateSchemaValue(schema: unknown, value: unknown) {
  const result = await validateWithStandardSchema(schema, value)
  if (result.success) {
    return result.data
  }

  throw new Error(
    `Validation failed: ${result.issues.map((issue) => issue.message).join(', ')}`,
  )
}

/**
 * Registers executable TanStack client tools with the browser WebMCP API.
 *
 * Unsupported browsers and server environments resolve without registration.
 * Abort `options.signal` to remove every tool registered by this call.
 *
 * @param tools - The executable client tools to expose through WebMCP.
 * @param options - The registration signal, runtime context, and per-tool options.
 *
 * @example
 * ```ts
 * const controller = new AbortController()
 * await registerWebMCPTools(tools, { signal: controller.signal })
 * controller.abort()
 * ```
 */
export async function registerWebMCPTools<
  const TTools extends ReadonlyArray<AnyClientTool>,
  TContext = InferredClientContext<TTools>,
>(tools: TTools, options: RegisterWebMCPToolsOptions<TTools, TContext>) {
  if (
    typeof document === 'undefined' ||
    (typeof isSecureContext !== 'undefined' && !isSecureContext) ||
    !('modelContext' in document) ||
    !isWebMCPModelContext(document.modelContext)
  ) {
    return
  }
  if (tools.length === 0) {
    return
  }

  const names = new Set<string>()
  const webMCPTools = tools.map((tool) => {
    if (!/^[A-Za-z0-9_.-]{1,128}$/.test(tool.name)) {
      throw new Error(
        `WebMCP tool name "${tool.name}" must contain 1 to 128 ASCII letters, numbers, underscores, hyphens, or periods.`,
      )
    }
    if (names.has(tool.name)) {
      throw new Error(`Duplicate WebMCP tool name "${tool.name}".`)
    }
    if (tool.description.trim() === '') {
      throw new Error(`WebMCP tool "${tool.name}" must have a description.`)
    }
    if (typeof tool.execute !== 'function') {
      throw new Error(
        `WebMCP tool "${tool.name}" must have an execute handler.`,
      )
    }
    if (tool.needsApproval === true) {
      throw new Error(
        `WebMCP tool "${tool.name}" cannot use needsApproval: true.`,
      )
    }

    names.add(tool.name)
    const toolOptions = getToolOptions(options.toolOptions, tool.name)
    const inputSchema = tool.inputSchema
    const outputSchema = tool.outputSchema
    const convertedInputSchema = convertSchemaToJsonSchema(inputSchema)
    const inputSchemaType = convertedInputSchema?.type
    const requiresNonObjectInput =
      (typeof inputSchemaType === 'string' && inputSchemaType !== 'object') ||
      (Array.isArray(inputSchemaType) && !inputSchemaType.includes('object'))
    if (requiresNonObjectInput) {
      throw new Error(
        `WebMCP tool "${tool.name}" input schema must accept an object.`,
      )
    }
    const execute = tool.execute

    return {
      name: tool.name,
      description: tool.description,
      ...(toolOptions?.title !== undefined ? { title: toolOptions.title } : {}),
      ...(convertedInputSchema !== undefined
        ? { inputSchema: convertedInputSchema }
        : {}),
      ...(toolOptions?.annotations !== undefined
        ? { annotations: toolOptions.annotations }
        : {}),
      async execute(
        input: object,
        executionOptions?: { signal?: AbortSignal },
      ) {
        const validatedInput = await validateSchemaValue(inputSchema, input)
        const output = await execute(validatedInput, {
          abortSignal: executionOptions?.signal,
          context: options.context,
          emitCustomEvent() {},
        })
        return validateSchemaValue(outputSchema, output)
      },
    }
  })

  const registrationController = new AbortController()
  const abortRegistration = () =>
    registrationController.abort(options.signal.reason)

  if (options.signal.aborted) {
    abortRegistration()
  } else {
    options.signal.addEventListener('abort', abortRegistration, { once: true })
  }

  try {
    for (const tool of webMCPTools) {
      await document.modelContext.registerTool(tool, {
        signal: registrationController.signal,
      })
    }
  } catch (error) {
    registrationController.abort(error)
    options.signal.removeEventListener('abort', abortRegistration)
    throw error
  }
}

/** A tool that a page registered with WebMCP, as `getTools()` returns it. */
export interface WebMCPPageTool {
  name: string
  title?: string
  description: string
  /** A JSON Schema object for the tool input. */
  inputSchema?: object
  /** The origin of the document that registered the tool. */
  origin: string
  annotations?: WebMCPToolAnnotations
}

interface WebMCPToolReader {
  getTools: () => Promise<Array<WebMCPPageTool>>
  executeTool: (
    tool: WebMCPPageTool,
    input: unknown,
    options: { signal?: AbortSignal },
  ) => Promise<string>
  addEventListener: EventTarget['addEventListener']
  removeEventListener: EventTarget['removeEventListener']
}

/** Options for {@link getWebMCPTools}. */
export interface GetWebMCPToolsOptions {
  /** Return `false` to skip a tool. */
  filter?: (tool: WebMCPPageTool) => boolean
}

/** Options for {@link subscribeWebMCPTools}. */
export interface SubscribeWebMCPToolsOptions extends GetWebMCPToolsOptions {
  /** Stops the subscription when it aborts. */
  signal: AbortSignal
  /** Receives a failure from the WebMCP `getTools()` call. */
  onError?: (error: unknown) => void
}

function isWebMCPToolReader(value: unknown): value is WebMCPToolReader {
  return (
    value !== null &&
    typeof value === 'object' &&
    'getTools' in value &&
    typeof value.getTools === 'function' &&
    'executeTool' in value &&
    typeof value.executeTool === 'function' &&
    'addEventListener' in value &&
    typeof value.addEventListener === 'function' &&
    'removeEventListener' in value &&
    typeof value.removeEventListener === 'function'
  )
}

function getWebMCPToolReader() {
  if (
    typeof document === 'undefined' ||
    (typeof isSecureContext !== 'undefined' && !isSecureContext) ||
    !('modelContext' in document) ||
    !isWebMCPToolReader(document.modelContext)
  ) {
    return undefined
  }
  return document.modelContext
}

function parseToolResult(result: string): unknown {
  try {
    return JSON.parse(result)
  } catch {
    return result
  }
}

async function readWebMCPTools(
  reader: WebMCPToolReader,
  options: GetWebMCPToolsOptions | undefined,
): Promise<Array<AnyClientTool>> {
  const pageTools = await reader.getTools()
  const names = new Set<string>()
  return pageTools
    .filter((tool) => options?.filter?.(tool) ?? true)
    .map((tool) => {
      if (names.has(tool.name)) {
        throw new Error(
          `Duplicate WebMCP tool name "${tool.name}". Use a filter or register tools with unique names.`,
        )
      }
      names.add(tool.name)
      return {
        __toolSide: 'client' as const,
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema ?? { type: 'object' },
        async execute(input: unknown, context?: { abortSignal?: AbortSignal }) {
          const result = await reader.executeTool(
            tool,
            input,
            context?.abortSignal ? { signal: context.abortSignal } : {},
          )
          return parseToolResult(result)
        },
      }
    })
}

/**
 * Reads the WebMCP tools on the page and returns them as client tools.
 *
 * Pass the result to a chat as `tools`. Each tool runs through the WebMCP
 * `executeTool()` call. Unsupported browsers and server environments return
 * an empty array.
 *
 * @param options - A filter that skips tools.
 *
 * @example
 * ```ts
 * const tools = await getWebMCPTools({
 *   filter: (tool) => tool.origin === location.origin,
 * })
 * ```
 */
export async function getWebMCPTools(
  options?: GetWebMCPToolsOptions,
): Promise<Array<AnyClientTool>> {
  const reader = getWebMCPToolReader()
  return reader ? readWebMCPTools(reader, options) : []
}

/**
 * Calls `listener` with the page WebMCP tools now and after each
 * `toolchange` event, until `options.signal` aborts.
 *
 * Unsupported browsers and server environments call `listener` once with an
 * empty array. When a read fails, `options.onError` gets the error and the
 * listener keeps the last list.
 *
 * @param listener - Receives the current client tools.
 * @param options - The subscription signal, a filter, and an error callback.
 *
 * @example
 * ```ts
 * const controller = new AbortController()
 * subscribeWebMCPTools((tools) => client.updateOptions({ tools }), {
 *   signal: controller.signal,
 * })
 * ```
 */
export function subscribeWebMCPTools(
  listener: (tools: Array<AnyClientTool>) => void,
  options: SubscribeWebMCPToolsOptions,
): void {
  if (options.signal.aborted) return
  const reader = getWebMCPToolReader()
  if (!reader) {
    listener([])
    return
  }

  let latestRead = 0
  const refresh = () => {
    const read = ++latestRead
    const isCurrent = () => read === latestRead && !options.signal.aborted
    readWebMCPTools(reader, options).then(
      (tools) => {
        if (isCurrent()) listener(tools)
      },
      (error: unknown) => {
        if (isCurrent()) options.onError?.(error)
      },
    )
  }

  // Remove the listener by hand: Zone.js breaks the `signal` listener option.
  reader.addEventListener('toolchange', refresh)
  options.signal.addEventListener(
    'abort',
    () => reader.removeEventListener('toolchange', refresh),
    { once: true },
  )
  refresh()
}
