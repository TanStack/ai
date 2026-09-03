import { afterEach, describe, expect, it, vi } from 'vitest'
import { toolDefinition } from '@tanstack/ai/client'
import { z } from 'zod'
import { registerWebMCPTools } from '../src/web-mcp-tools'

interface RegisteredWebMCPTool {
  name: string
  title?: string
  description: string
  inputSchema?: unknown
  annotations?: {
    readOnlyHint?: boolean
    untrustedContentHint?: boolean
  }
  execute: (
    input: object,
    options?: { signal?: AbortSignal },
  ) => Promise<unknown>
}

interface ModelContextOptions {
  failOn?: string
}

function installModelContext(options: ModelContextOptions = {}) {
  const tools = new Map<string, RegisteredWebMCPTool>()
  const modelContext = {
    tools,
    async registerTool(
      tool: RegisteredWebMCPTool,
      registrationOptions: { signal: AbortSignal },
    ) {
      if (registrationOptions.signal.aborted) {
        throw registrationOptions.signal.reason
      }
      if (tool.name === options.failOn) {
        throw new Error(`${tool.name} registration failed`)
      }
      if (tools.has(tool.name)) {
        throw new Error(`Tool ${tool.name} is already registered`)
      }

      tools.set(tool.name, tool)
      registrationOptions.signal.addEventListener(
        'abort',
        () => tools.delete(tool.name),
        { once: true },
      )
    },
  }

  vi.stubGlobal('document', { modelContext })
  return modelContext
}

function getRegisteredTool(
  modelContext: ReturnType<typeof installModelContext>,
  name: string,
) {
  const tool = modelContext.tools.get(name)
  if (!tool) {
    throw new Error(`Tool ${name} was not registered`)
  }
  return tool
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('registerWebMCPTools', () => {
  it('registers, executes, and removes an executable client tool', async () => {
    const modelContext = installModelContext()
    const lifecycle = new AbortController()
    const execution = new AbortController()
    const emittedEvents: Array<unknown> = []
    const echoDefinition = toolDefinition({
      name: 'echo',
      description: 'Echo a value',
      inputSchema: z.object({ value: z.string() }),
      outputSchema: z.object({
        value: z.string(),
        tenantId: z.string(),
        aborted: z.boolean(),
        hasToolCallId: z.boolean(),
      }),
    })
    const tool = echoDefinition.client<{ tenantId: string }>(
      async (input, toolContext) => {
        toolContext.emitCustomEvent('ignored', { value: input.value })
        emittedEvents.push('handler ran')
        return {
          value: input.value,
          tenantId: toolContext.context.tenantId,
          aborted: toolContext.abortSignal === execution.signal,
          hasToolCallId: Object.hasOwn(toolContext, 'toolCallId'),
        }
      },
    )

    await registerWebMCPTools([tool], {
      signal: lifecycle.signal,
      context: { tenantId: 'tenant-1' },
      toolOptions: {
        echo: {
          title: 'Echo value',
          annotations: {
            readOnlyHint: true,
            untrustedContentHint: true,
          },
        },
      },
    })

    const registered = getRegisteredTool(modelContext, 'echo')
    expect(registered).toMatchObject({
      name: 'echo',
      title: 'Echo value',
      description: 'Echo a value',
      annotations: {
        readOnlyHint: true,
        untrustedContentHint: true,
      },
    })
    expect(registered.inputSchema).toEqual({
      type: 'object',
      properties: { value: { type: 'string' } },
      required: ['value'],
    })
    await expect(
      registered.execute({ value: 'hello' }, { signal: execution.signal }),
    ).resolves.toEqual({
      value: 'hello',
      tenantId: 'tenant-1',
      aborted: true,
      hasToolCallId: false,
    })
    expect(emittedEvents).toEqual(['handler ran'])

    lifecycle.abort()
    expect(modelContext.tools.size).toBe(0)
  })

  it('executes when the host omits the execution options argument', async () => {
    const modelContext = installModelContext()
    const lifecycle = new AbortController()
    const tool = toolDefinition({
      name: 'host_omits_options',
      description: 'Run without host options',
      inputSchema: z.object({ value: z.string() }),
      outputSchema: z.object({ value: z.string() }),
    }).client(async (input) => input)

    await registerWebMCPTools([tool], { signal: lifecycle.signal })
    const registered = getRegisteredTool(modelContext, 'host_omits_options')

    await expect(registered.execute({ value: 'ok' })).resolves.toEqual({
      value: 'ok',
    })
  })

  it('validates Standard Schema input before execution', async () => {
    const modelContext = installModelContext()
    const lifecycle = new AbortController()
    const execute = vi.fn(async () => ({ ok: true }))
    const tool = toolDefinition({
      name: 'validate_input',
      description: 'Validate input',
      inputSchema: z.object({ value: z.string() }),
    }).client(execute)

    await registerWebMCPTools([tool], { signal: lifecycle.signal })
    const registered = getRegisteredTool(modelContext, 'validate_input')

    await expect(
      registered.execute(
        { value: 1 },
        { signal: new AbortController().signal },
      ),
    ).rejects.toThrow('Validation failed')
    expect(execute).not.toHaveBeenCalled()
  })

  it('validates Standard Schema output after execution', async () => {
    const modelContext = installModelContext()
    const lifecycle = new AbortController()
    const outputSchema = z
      .unknown()
      .refine(
        (value) =>
          value !== null &&
          typeof value === 'object' &&
          'ok' in value &&
          typeof value.ok === 'boolean',
        'Expected a boolean ok value',
      )
    const tool = toolDefinition({
      name: 'validate_output',
      description: 'Validate output',
      outputSchema,
    }).client(async () => ({ ok: 'no' }))

    await registerWebMCPTools([tool], { signal: lifecycle.signal })
    const registered = getRegisteredTool(modelContext, 'validate_output')

    await expect(
      registered.execute({}, { signal: new AbortController().signal }),
    ).rejects.toThrow('Validation failed')
  })

  it('passes transformed Standard Schema values through execution', async () => {
    const modelContext = installModelContext()
    const lifecycle = new AbortController()
    const receivedInputs: Array<{ value: string }> = []
    const tool = toolDefinition({
      name: 'transform_values',
      description: 'Transform values',
      inputSchema: z
        .object({ value: z.string() })
        .transform(({ value }) => ({ value: value.trim() })),
      outputSchema: z
        .object({ value: z.string() })
        .transform(({ value }) => ({ result: value.toUpperCase() })),
    }).client(async (input) => {
      receivedInputs.push(input)
      return { value: `${input.value}!` }
    })

    await registerWebMCPTools([tool], { signal: lifecycle.signal })
    const registered = getRegisteredTool(modelContext, 'transform_values')

    await expect(
      registered.execute(
        { value: '  hello  ' },
        { signal: new AbortController().signal },
      ),
    ).resolves.toEqual({ result: 'HELLO!' })
    expect(receivedInputs).toEqual([{ value: 'hello' }])
  })

  it('uses the schemas captured during registration', async () => {
    const modelContext = installModelContext()
    const lifecycle = new AbortController()
    const tool = toolDefinition({
      name: 'captured_schemas',
      description: 'Use captured schemas',
      inputSchema: z.object({ value: z.string() }),
      outputSchema: z.object({ value: z.string() }),
    }).client(async (input) => input)

    await registerWebMCPTools([tool], { signal: lifecycle.signal })
    tool.inputSchema = z
      .object({ value: z.string() })
      .refine(() => false, 'Mutated input schema')
    tool.outputSchema = z
      .object({ value: z.string() })
      .refine(() => false, 'Mutated output schema')
    const registered = getRegisteredTool(modelContext, 'captured_schemas')

    await expect(
      registered.execute(
        { value: 'original' },
        { signal: new AbortController().signal },
      ),
    ).resolves.toEqual({ value: 'original' })
  })

  it('leaves raw JSON Schema validation to the client handler', async () => {
    const modelContext = installModelContext()
    const lifecycle = new AbortController()
    const rawSchema = {
      type: ['object', 'null'],
      properties: { value: { type: 'string' } },
      required: ['value'],
    }
    const tool = toolDefinition({
      name: 'raw_schema',
      description: 'Use a raw schema',
      inputSchema: rawSchema,
    }).client(async (input) => input)

    await registerWebMCPTools([tool], { signal: lifecycle.signal })
    const registered = getRegisteredTool(modelContext, 'raw_schema')

    await expect(
      registered.execute(
        { value: 1 },
        { signal: new AbortController().signal },
      ),
    ).resolves.toEqual({ value: 1 })
  })

  it('rejects a scalar top-level input schema', async () => {
    const modelContext = installModelContext()
    const lifecycle = new AbortController()
    const tool = toolDefinition({
      name: 'scalar_input',
      description: 'Use scalar input',
      inputSchema: z.string(),
    }).client(async (input) => input)

    await expect(
      registerWebMCPTools([tool], { signal: lifecycle.signal }),
    ).rejects.toThrow('input schema must accept an object')
    expect(modelContext.tools.size).toBe(0)
  })

  it('resolves without registration when WebMCP is unavailable', async () => {
    const lifecycle = new AbortController()
    const tool = toolDefinition({
      name: 'unsupported',
      description: 'Do not register',
    }).client(async () => ({ ok: true }))

    vi.stubGlobal('document', {})
    await expect(
      registerWebMCPTools([tool], { signal: lifecycle.signal }),
    ).resolves.toBeUndefined()

    vi.stubGlobal('document', { modelContext: {} })
    await expect(
      registerWebMCPTools([tool], { signal: lifecycle.signal }),
    ).resolves.toBeUndefined()

    const modelContext = installModelContext()
    vi.stubGlobal('isSecureContext', false)
    await expect(
      registerWebMCPTools([tool], { signal: lifecycle.signal }),
    ).resolves.toBeUndefined()
    expect(modelContext.tools.size).toBe(0)
  })

  it('does not register tools for an already-aborted lifetime', async () => {
    const modelContext = installModelContext()
    const lifecycle = new AbortController()
    const abortReason = new Error('registration stopped')
    const tool = toolDefinition({
      name: 'already_aborted',
      description: 'Do not register after abort',
    }).client(async () => ({ ok: true }))
    lifecycle.abort(abortReason)

    await expect(
      registerWebMCPTools([tool], { signal: lifecycle.signal }),
    ).rejects.toBe(abortReason)
    expect(modelContext.tools.size).toBe(0)
  })

  it('does not link the lifecycle signal for an empty tool list', async () => {
    installModelContext()
    const lifecycle = new AbortController()
    const addEventListener = vi.spyOn(lifecycle.signal, 'addEventListener')

    await registerWebMCPTools([], { signal: lifecycle.signal })

    expect(addEventListener).not.toHaveBeenCalled()
  })

  it('removes partial registrations when registration fails', async () => {
    const modelContext = installModelContext({ failOn: 'second' })
    const lifecycle = new AbortController()
    const first = toolDefinition({
      name: 'first',
      description: 'First tool',
    }).client(async () => 'first')
    const second = toolDefinition({
      name: 'second',
      description: 'Second tool',
    }).client(async () => 'second')

    await expect(
      registerWebMCPTools([first, second], { signal: lifecycle.signal }),
    ).rejects.toThrow('second registration failed')
    expect(modelContext.tools.size).toBe(0)
  })

  it.each([
    {
      label: 'a missing execute handler',
      tools: [
        toolDefinition({
          name: 'missing_execute',
          description: 'Missing execute',
        }).client(),
      ],
      error: 'execute',
    },
    {
      label: 'an approval tool',
      tools: [
        toolDefinition({
          name: 'approval',
          description: 'Approval tool',
          needsApproval: true,
        }).client(async () => 'approved'),
      ],
      error: 'needsApproval',
    },
    {
      label: 'an invalid name',
      tools: [
        toolDefinition({
          name: 'invalid name',
          description: 'Invalid name',
        }).client(async () => 'invalid'),
      ],
      error: 'WebMCP tool name',
    },
    {
      label: 'a name longer than 128 characters',
      tools: [
        toolDefinition({
          name: 'a'.repeat(129),
          description: 'Long name',
        }).client(async () => 'invalid'),
      ],
      error: 'WebMCP tool name',
    },
    {
      label: 'an empty description',
      tools: [
        toolDefinition({ name: 'empty_description', description: '' }).client(
          async () => 'invalid',
        ),
      ],
      error: 'description',
    },
  ])('rejects $label before registration', async ({ tools, error }) => {
    const modelContext = installModelContext()
    const lifecycle = new AbortController()

    await expect(
      registerWebMCPTools(tools, { signal: lifecycle.signal }),
    ).rejects.toThrow(error)
    expect(modelContext.tools.size).toBe(0)
  })

  it('rejects duplicate names before registration', async () => {
    const modelContext = installModelContext()
    const lifecycle = new AbortController()
    const first = toolDefinition({
      name: 'duplicate',
      description: 'First duplicate',
    }).client(async () => 'first')
    const duplicate = toolDefinition({
      name: 'duplicate',
      description: 'Second duplicate',
    }).client(async () => 'second')

    await expect(
      registerWebMCPTools([first, duplicate], { signal: lifecycle.signal }),
    ).rejects.toThrow('Duplicate WebMCP tool name')
    expect(modelContext.tools.size).toBe(0)
  })

  it('preserves a foreign registration with the same name', async () => {
    const modelContext = installModelContext()
    const lifecycle = new AbortController()
    const foreignTool: RegisteredWebMCPTool = {
      name: 'foreign_owned',
      description: 'Foreign tool',
      async execute(input) {
        return input
      },
    }
    modelContext.tools.set(foreignTool.name, foreignTool)
    const tool = toolDefinition({
      name: 'foreign_owned',
      description: 'Conflicting tool',
    }).client(async () => 'local')

    await expect(
      registerWebMCPTools([tool], { signal: lifecycle.signal }),
    ).rejects.toThrow('already registered')
    expect(modelContext.tools.get(foreignTool.name)).toBe(foreignTool)
  })
})
