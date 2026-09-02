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
      async execute(input: object, executionOptions: { signal: AbortSignal }) {
        const validatedInput = await validateSchemaValue(inputSchema, input)
        const output = await execute(validatedInput, {
          abortSignal: executionOptions.signal,
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
