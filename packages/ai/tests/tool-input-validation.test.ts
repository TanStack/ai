import { describe, expect, it, vi } from 'vitest'
import { Compile } from 'typebox/compile'
import { z } from 'zod'
import { executeToolCalls } from '../src/activities/chat/tools/tool-calls'
import { validateToolInput } from '../src/activities/chat/tools/input-validation'
import type { ToolExecutionMiddlewareHooks } from '../src/activities/chat/tools/tool-calls'
import type { ToolApprovalResolution } from '../src/interrupts'
import type { JSONSchema, SchemaInput, Tool, ToolCall } from '../src/types'

async function runTool(
  argumentsValue: unknown,
  inputSchema: SchemaInput,
  options: {
    client?: boolean
    needsApproval?: boolean
    approvals?: Map<string, ToolApprovalResolution>
    middleware?: ToolExecutionMiddlewareHooks
    clientResults?: Map<string, unknown>
  } = {},
) {
  let executions = 0
  const execute = (input: unknown) => {
    executions++
    return input
  }
  const tool: Tool = {
    name: 'check',
    description: 'Check input',
    inputSchema,
    needsApproval: options.needsApproval,
    ...(options.client ? {} : { execute }),
  }
  const call: ToolCall = {
    id: 'call-1',
    type: 'function',
    function: { name: 'check', arguments: JSON.stringify(argumentsValue) },
  }
  const generator = executeToolCalls(
    [call],
    [tool],
    options.approvals,
    options.clientResults,
    undefined,
    options.middleware,
  )
  while (true) {
    const next = await generator.next()
    if (next.done) return { ...next.value, executions }
  }
}

describe('tool input validation', () => {
  const schema: JSONSchema = {
    type: 'object',
    properties: { count: { type: 'integer', minimum: 1 } },
    required: ['count'],
    additionalProperties: false,
  }

  it('works when runtime code generation is blocked', async () => {
    vi.stubGlobal('Function', function blockedCodeGeneration() {
      throw new Error('Code generation is blocked')
    })
    try {
      const validator = Compile({ type: 'integer' })
      expect(validator.IsAccelerated()).toBe(false)
      const result = await runTool({ count: '2' }, schema)
      expect(result.results[0]?.result).toEqual({ count: 2 })
      expect(result.executions).toBe(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('coerces a numeric field before execution', async () => {
    const result = await runTool({ count: '2' }, schema)
    expect(result.results[0]?.result).toEqual({ count: 2 })
    expect(result.executions).toBe(1)
  })

  it.each([{}, { count: 'wrong' }, { count: 2, extra: true }, 2])(
    'rejects invalid input without executing: %j',
    async (input) => {
      const result = await runTool(input, schema)
      expect(result.results[0]?.state).toBe('output-error')
      expect(result.executions).toBe(0)
    },
  )

  it('checks local references and keeps nullable fields', async () => {
    const result = await runTool(
      { count: '3', label: null, omitted: null },
      {
        type: 'object',
        $defs: { count: { type: 'integer', minimum: 1 } },
        properties: {
          count: { $ref: '#/$defs/count' },
          label: { type: ['string', 'null'] },
          omitted: { type: 'string' },
        },
        required: ['count'],
      },
    )
    expect(result.results[0]?.result).toEqual({ count: 3, label: null })
    expect(result.executions).toBe(1)
  })

  it('keeps a valid union branch without converting its string', async () => {
    const result = await runTool('12', {
      anyOf: [{ type: 'integer' }, { type: 'string' }],
    })
    expect(result.results[0]?.input).toBe('12')
    expect(result.executions).toBe(1)
  })

  it('checks conditional required fields', async () => {
    const result = await runTool(
      { mode: 'count' },
      {
        type: 'object',
        properties: { mode: { type: 'string' }, count: { type: 'integer' } },
        if: { properties: { mode: { const: 'count' } }, required: ['mode'] },
        then: { required: ['count'] },
      },
    )
    expect(result.results[0]?.state).toBe('output-error')
    expect(result.executions).toBe(0)
  })

  it('includes original arguments in errors', async () => {
    const result = await runTool({ count: '0' }, schema)
    expect(result.results[0]?.result).toEqual({
      error: expect.stringContaining('"count": "0"'),
    })
    expect(result.executions).toBe(0)
  })

  it('does not change the received arguments', async () => {
    const received = { count: '2' }
    expect(await validateToolInput(schema, received, 'check')).toEqual({
      count: 2,
    })
    expect(received).toEqual({ count: '2' })
  })

  const parsedCases: Array<[unknown, JSONSchema, unknown]> = [
    [3, { type: 'integer' }, 3],
    [['1', '2'], { type: 'array', items: { type: 'integer' } }, [1, 2]],
    [false, {}, false],
    [null, { type: 'null' }, null],
  ]
  it.each(parsedCases)(
    'keeps parsed values for explicit schemas: %j',
    async (input, inputSchema, expected) => {
      const result = await runTool(input, inputSchema)
      expect(result.results[0]?.input).toEqual(expected)
      expect(result.executions).toBe(1)
    },
  )

  it('runs null as {} for an object schema with no required fields', async () => {
    // A literal null is an empty tool_use block (issue #265).
    const result = await runTool(null, { type: 'object', properties: {} })
    expect(result.results[0]?.input).toEqual({})
    expect(result.executions).toBe(1)
  })

  it('rejects null for an object schema with required fields', async () => {
    const result = await runTool(null, {
      type: 'object',
      properties: { city: { type: 'string' } },
      required: ['city'],
    })
    expect(result.results[0]?.state).toBe('output-error')
    expect(result.executions).toBe(0)
  })

  it('coerces fields required by intersections without deleting null', async () => {
    const result = await runTool(
      { count: null },
      {
        type: 'object',
        allOf: [
          { properties: { count: { type: 'integer' } } },
          { required: ['count'] },
        ],
      },
    )
    expect(result.results[0]?.input).toEqual({ count: 0 })
    expect(result.executions).toBe(1)
  })

  it('coerces conditional branch fields', async () => {
    const result = await runTool(
      { mode: 'count', count: '4' },
      {
        type: 'object',
        if: { properties: { mode: { const: 'count' } }, required: ['mode'] },
        then: {
          properties: { count: { type: 'integer' } },
          required: ['count'],
        },
      },
    )
    expect(result.results[0]?.input).toEqual({ mode: 'count', count: 4 })
    expect(result.executions).toBe(1)
  })

  it('keeps fields required by a conditional branch', async () => {
    const result = await runTool(
      { mode: 'count', count: null },
      {
        type: 'object',
        properties: { mode: { type: 'string' }, count: { type: 'integer' } },
        if: { properties: { mode: { const: 'count' } }, required: ['mode'] },
        then: { required: ['count'] },
      },
    )
    expect(result.results[0]?.input).toEqual({ mode: 'count', count: 0 })
    expect(result.executions).toBe(1)
  })

  it('keeps fields required outside a union branch', async () => {
    const result = await runTool(
      { count: null },
      {
        type: 'object',
        required: ['count'],
        anyOf: [{ properties: { count: { type: 'integer' } } }],
      },
    )
    expect(result.results[0]?.input).toEqual({ count: 0 })
    expect(result.executions).toBe(1)
  })

  it('keeps valid referenced union branches', async () => {
    const result = await runTool(
      { count: '12' },
      {
        type: 'object',
        $defs: { numeric: { type: 'integer' }, text: { type: 'string' } },
        properties: {
          count: {
            anyOf: [{ $ref: '#/$defs/numeric' }, { $ref: '#/$defs/text' }],
          },
        },
        required: ['count'],
      },
    )
    expect(result.results[0]?.input).toEqual({ count: '12' })
    expect(result.executions).toBe(1)
  })

  it('coerces schema-valued additional properties', async () => {
    const result = await runTool(
      { extra: '4' },
      {
        type: 'object',
        additionalProperties: { type: 'integer' },
      },
    )
    expect(result.results[0]?.input).toEqual({ extra: 4 })
    expect(result.executions).toBe(1)
  })

  it('keeps valid values in a type union', async () => {
    const result = await runTool('12', { type: ['integer', 'string'] })
    expect(result.results[0]?.input).toBe('12')
  })

  it('rejects a primitive that cannot be coerced', async () => {
    const result = await runTool('wrong', { type: 'integer' })
    expect(result.results[0]?.state).toBe('output-error')
    expect(result.executions).toBe(0)
  })

  it.each([false, true])(
    'checks approval edits for a client tool: %s',
    async (resumed) => {
      const approvals = new Map<string, ToolApprovalResolution>([
        ['call-1', { approved: true, editedArgs: { count: 'wrong' } }],
      ])
      const result = await runTool({ count: 2 }, schema, {
        client: true,
        needsApproval: true,
        approvals,
        clientResults: resumed
          ? new Map([['call-1', 'client result']])
          : new Map(),
      })
      expect(result.results[0]?.state).toBe('output-error')
      expect(result.needsClientExecution).toEqual([])
    },
  )

  it('coerces approved server input before execution', async () => {
    const result = await runTool({ count: 2 }, schema, {
      needsApproval: true,
      approvals: new Map([
        ['call-1', { approved: true, editedArgs: { count: '4' } }],
      ]),
    })
    expect(result.results[0]?.input).toEqual({ count: 4 })
    expect(result.executions).toBe(1)
  })

  it.each([false, true])(
    'rejects middleware replacement before server or client execution: %s',
    async (client) => {
      const result = await runTool({ count: 2 }, schema, {
        client,
        middleware: {
          onBeforeToolCall: async () => ({
            type: 'transformArgs',
            args: { count: 'wrong' },
          }),
        },
      })
      expect(result.results[0]?.state).toBe('output-error')
      expect(result.executions).toBe(0)
      expect(result.needsClientExecution).toEqual([])
    },
  )

  it('rejects middleware edits made in place', async () => {
    const result = await runTool({ count: 2 }, schema, {
      middleware: {
        onBeforeToolCall: async (_call, _tool, input) => {
          if (typeof input === 'object' && input !== null)
            Reflect.set(input, 'count', 'wrong')
        },
      },
    })
    expect(result.results[0]?.state).toBe('output-error')
    expect(result.executions).toBe(0)
  })

  it('checks in-place edits that JSON serialization would omit', async () => {
    const result = await runTool({ count: 2 }, schema, {
      middleware: {
        onBeforeToolCall: async (_call, _tool, input) => {
          if (typeof input === 'object' && input !== null)
            Reflect.set(input, 'extra', undefined)
        },
      },
    })
    expect(result.results[0]?.state).toBe('output-error')
    expect(result.executions).toBe(0)
  })

  it('coerces middleware replacement before client requests', async () => {
    const result = await runTool({ count: 2 }, schema, {
      client: true,
      middleware: {
        onBeforeToolCall: async () => ({
          type: 'transformArgs',
          args: { count: '5' },
        }),
      },
    })
    expect(result.needsClientExecution).toEqual([
      { toolCallId: 'call-1', toolName: 'check', input: { count: 5 } },
    ])
  })

  it('runs an input transform once when middleware leaves input unchanged', async () => {
    const seen: Array<unknown> = []
    let transforms = 0
    const inputSchema = z.object({
      count: z.string().transform((value) => {
        transforms++
        return Number(value)
      }),
    })
    const result = await runTool({ count: '2' }, inputSchema, {
      middleware: {
        onBeforeToolCall: async (_call, _tool, input) => {
          seen.push(input)
        },
      },
    })
    expect(seen).toEqual([{ count: '2' }])
    expect(result.results[0]?.input).toEqual({ count: 2 })
    expect(transforms).toBe(1)
    expect(result.executions).toBe(1)
  })

  it.each([false, true])(
    'preserves transformed approval edits for server or client tools: %s',
    async (client) => {
      const result = await runTool('2', z.string().transform(Number), {
        client,
        needsApproval: true,
        approvals: new Map([['call-1', { approved: true, editedArgs: '4' }]]),
      })
      if (client) {
        expect(result.needsClientExecution).toEqual([
          { toolCallId: 'call-1', toolName: 'check', input: 4 },
        ])
      } else {
        expect(result.results[0]?.input).toBe(4)
        expect(result.executions).toBe(1)
      }
    },
  )

  it('allows middleware to repair invalid parsed input', async () => {
    const result = await runTool({ count: 'wrong' }, schema, {
      middleware: {
        onBeforeToolCall: async () => ({
          type: 'transformArgs',
          args: { count: '4' },
        }),
      },
    })
    expect(result.results[0]?.input).toEqual({ count: 4 })
    expect(result.executions).toBe(1)
  })

  it.each([false, true])(
    'does not run middleware or dispatch while approval is pending: %s',
    async (client) => {
      let middlewareCalls = 0
      const result = await runTool({ count: '2' }, schema, {
        client,
        needsApproval: true,
        middleware: {
          onBeforeToolCall: async () => {
            middlewareCalls++
          },
        },
      })
      expect(result.needsApproval).toEqual([
        {
          toolCallId: 'call-1',
          toolName: 'check',
          input: { count: 2 },
          approvalId: 'approval_call-1',
        },
      ])
      expect(result.needsClientExecution).toEqual([])
      expect(middlewareCalls).toBe(0)
      expect(result.executions).toBe(0)
    },
  )

  it.each([false, true])(
    'does not run middleware or dispatch denied tools: %s',
    async (client) => {
      let middlewareCalls = 0
      const result = await runTool({ count: 2 }, schema, {
        client,
        needsApproval: true,
        approvals: new Map([['call-1', false]]),
        middleware: {
          onBeforeToolCall: async () => {
            middlewareCalls++
          },
        },
      })
      expect(result.results[0]?.outcome).toBe('denied')
      expect(result.needsClientExecution).toEqual([])
      expect(middlewareCalls).toBe(0)
      expect(result.executions).toBe(0)
    },
  )
})
