import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { chat } from '../src/activities/chat/index'
import { defineChatMiddleware } from '../src/activities/chat/middleware/define'
import { defineInterrupt } from '../src/interrupt-definition'
import { executeToolCalls } from '../src/activities/chat/tools/tool-calls'
import { otelMiddleware } from '../src/middlewares/otel'
import { EventType } from '../src/types'
import { collectChunks, createMockAdapter, ev } from './test-utils'
import { createFakeMeter, createFakeTracer } from './middlewares/fake-otel'
import type { StandardSchemaV1 } from '@standard-schema/spec'
import type { ChatMiddleware } from '../src/activities/chat/middleware/types'
import type { ToolExecutionMiddlewareHooks } from '../src/activities/chat/tools/tool-calls'
import type { ToolApprovalResolution } from '../src/interrupts'
import type {
  AnyTool,
  JSONSchema,
  ModelMessage,
  SchemaInput,
  StreamChunk,
  Tool,
  ToolCall,
} from '../src/types'

const schema = z.object({ count: z.number().int().min(1) })

async function runTool(
  rawArguments: string,
  inputSchema: SchemaInput | boolean,
  options: {
    client?: boolean
    needsApproval?: boolean
    approvals?: Map<string, ToolApprovalResolution>
    middleware?: ToolExecutionMiddlewareHooks
    clientResults?: Map<string, unknown>
  } = {},
) {
  const executed: Array<unknown> = []
  const tool: AnyTool = {
    name: 'check',
    description: 'Check input',
    inputSchema,
    needsApproval: options.needsApproval,
    ...(options.client
      ? {}
      : {
          execute: (input: unknown) => {
            executed.push(input)
            return input
          },
        }),
  }
  const call: ToolCall = {
    id: 'call-1',
    type: 'function',
    function: { name: 'check', arguments: rawArguments },
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
    if (next.done) return { ...next.value, executed }
  }
}

describe('final tool input validation', () => {
  it('awaits an async Standard Schema validator', async () => {
    const asyncSchema: StandardSchemaV1<unknown, { count: number }> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: async (value) =>
          typeof value === 'object' &&
          value !== null &&
          'count' in value &&
          typeof value.count === 'number'
            ? { value: { count: value.count * 10 } }
            : { issues: [{ message: 'count must be a number' }] },
      },
    }
    const ok = await runTool('{"count":2}', asyncSchema)
    expect(ok.executed).toEqual([{ count: 20 }])
    const bad = await runTool('{"count":"2"}', asyncSchema)
    expect(bad.executed).toEqual([])
    expect(bad.results[0]?.state).toBe('output-error')
    expect(bad.results[0]?.result).toEqual({
      error: expect.stringContaining('count must be a number'),
    })
  })

  it('includes the received arguments in the error', async () => {
    const result = await runTool('{"count":0}', schema)
    expect(result.results[0]?.result).toEqual({
      error: expect.stringContaining('Input validation failed for tool check'),
    })
    expect(result.results[0]?.result).toEqual({
      error: expect.stringContaining('"count": 0'),
    })
    expect(result.executed).toEqual([])
  })

  it('keeps empty and null arguments as {}', async () => {
    for (const raw of ['', '  ', 'null']) {
      const result = await runTool(raw, z.object({}))
      expect(result.executed).toEqual([{}])
    }
  })

  it.each([false, true])(
    'rejects a middleware replacement before server or client execution: client=%s',
    async (client) => {
      const result = await runTool('{"count":2}', schema, {
        client,
        middleware: {
          onBeforeToolCall: async () => ({
            type: 'transformArgs',
            args: { count: 'wrong' },
          }),
        },
      })
      expect(result.results[0]?.state).toBe('output-error')
      expect(result.executed).toEqual([])
      expect(result.needsClientExecution).toEqual([])
    },
  )

  it('rejects a middleware edit made in place', async () => {
    const result = await runTool('{"count":2}', schema, {
      middleware: {
        onBeforeToolCall: async (_call, _tool, input) => {
          if (typeof input === 'object' && input !== null)
            Reflect.set(input, 'count', 'wrong')
        },
      },
    })
    expect(result.results[0]?.state).toBe('output-error')
    expect(result.executed).toEqual([])
  })

  it('runs onAfterToolCall with the validation error', async () => {
    const after: Array<boolean> = []
    await runTool('{"count":2}', schema, {
      middleware: {
        onBeforeToolCall: async () => ({
          type: 'transformArgs',
          args: { count: 'wrong' },
        }),
        onAfterToolCall: async (info) => {
          after.push(info.ok)
        },
      },
    })
    expect(after).toEqual([false])
  })

  it('lets middleware repair invalid input', async () => {
    const result = await runTool('{"count":"wrong"}', schema, {
      middleware: {
        onBeforeToolCall: async () => ({
          type: 'transformArgs',
          args: { count: 4 },
        }),
      },
    })
    expect(result.executed).toEqual([{ count: 4 }])
  })

  it('shows middleware the raw input and runs a transform once', async () => {
    const seen: Array<unknown> = []
    let transforms = 0
    const inputSchema = z.object({
      count: z.string().transform((value) => {
        transforms++
        return Number(value)
      }),
    })
    const result = await runTool('{"count":"2"}', inputSchema, {
      middleware: {
        onBeforeToolCall: async (_call, _tool, input) => {
          seen.push(structuredClone(input))
        },
      },
    })
    expect(seen).toEqual([{ count: '2' }])
    expect(result.executed).toEqual([{ count: 2 }])
    expect(transforms).toBe(1)
  })

  it('sends the checked middleware input to the client', async () => {
    const result = await runTool('{"count":2}', schema, {
      client: true,
      middleware: {
        onBeforeToolCall: async () => ({
          type: 'transformArgs',
          args: { count: 5 },
        }),
      },
    })
    expect(result.needsClientExecution).toEqual([
      { toolCallId: 'call-1', toolName: 'check', input: { count: 5 } },
    ])
  })

  it.each([false, true])(
    'checks an approval edit for a client tool: resumed=%s',
    async (resumed) => {
      const result = await runTool('{"count":2}', schema, {
        client: true,
        needsApproval: true,
        approvals: new Map([
          ['call-1', { approved: true, editedArgs: { count: 'wrong' } }],
        ]),
        clientResults: resumed
          ? new Map([['call-1', 'client result']])
          : new Map(),
      })
      expect(result.results[0]?.state).toBe('output-error')
      expect(result.needsClientExecution).toEqual([])
    },
  )

  it('rejects an invalid approval edit for a server tool', async () => {
    const result = await runTool('{"count":2}', schema, {
      needsApproval: true,
      approvals: new Map([
        ['call-1', { approved: true, editedArgs: { count: 0 } }],
      ]),
    })
    expect(result.results[0]?.state).toBe('output-error')
    expect(result.executed).toEqual([])
  })

  it.each([false, true])(
    'keeps the transformed approval edit: client=%s',
    async (client) => {
      const result = await runTool('"2"', z.string().transform(Number), {
        client,
        needsApproval: true,
        approvals: new Map([['call-1', { approved: true, editedArgs: '4' }]]),
      })
      if (client) {
        expect(result.needsClientExecution).toEqual([
          { toolCallId: 'call-1', toolName: 'check', input: 4 },
        ])
      } else {
        expect(result.executed).toEqual([4])
      }
    },
  )

  it.each([false, true])(
    'runs no middleware and dispatches nothing while approval is pending: client=%s',
    async (client) => {
      let middlewareCalls = 0
      const result = await runTool('{"count":2}', schema, {
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
      expect(result.executed).toEqual([])
    },
  )

  it.each([false, true])(
    'runs no middleware for a denied tool: client=%s',
    async (client) => {
      let middlewareCalls = 0
      const result = await runTool('{"count":2}', schema, {
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
      expect(result.executed).toEqual([])
    },
  )
})

describe('JSON Schema tool input', () => {
  const jsonSchema: JSONSchema = {
    type: 'object',
    properties: { count: { type: 'integer', minimum: 1 } },
    required: ['count'],
    additionalProperties: false,
  }

  it('runs valid input', async () => {
    const result = await runTool('{"count":2}', jsonSchema)
    expect(result.executed).toEqual([{ count: 2 }])
  })

  it.each(['{}', '{"count":"2"}', '{"count":0}', '{"count":2,"extra":true}'])(
    'rejects invalid input without executing: %s',
    async (raw) => {
      const result = await runTool(raw, jsonSchema)
      expect(result.executed).toEqual([])
      expect(result.results[0]?.state).toBe('output-error')
      expect(result.results[0]?.result).toEqual({
        error: expect.stringContaining(
          'Input validation failed for tool check',
        ),
      })
    },
  )

  it('names the failed location and shows the received arguments', async () => {
    const result = await runTool('{"count":0}', jsonSchema)
    expect(result.results[0]?.result).toEqual({
      error: expect.stringMatching(/#\/count: .*\n.*Received arguments:/s),
    })
    expect(result.results[0]?.result).toEqual({
      error: expect.stringContaining('"count": 0'),
    })
  })

  it('checks local references and conditional fields', async () => {
    const schema: JSONSchema = {
      type: 'object',
      $defs: { count: { type: 'integer' } },
      properties: {
        mode: { type: 'string' },
        count: { $ref: '#/$defs/count' },
      },
      if: { properties: { mode: { const: 'count' } }, required: ['mode'] },
      then: { required: ['count'] },
    }
    expect(
      (await runTool('{"mode":"count","count":3}', schema)).executed,
    ).toEqual([{ mode: 'count', count: 3 }])
    const missing = await runTool('{"mode":"count"}', schema)
    expect(missing.executed).toEqual([])
    // The "then" wrapper error is left out. The nested error says why.
    expect(missing.results[0]?.result).toEqual({
      error: expect.stringContaining(
        'check: #: Instance does not have required property "count".\n',
      ),
    })
    expect((await runTool('{"count":"3"}', schema)).executed).toEqual([])
  })

  it('uses the draft named by $schema', async () => {
    // Draft 4 spells an exclusive bound as a boolean next to `maximum`.
    const schema: JSONSchema = JSON.parse(
      JSON.stringify({
        $schema: 'http://json-schema.org/draft-04/schema#',
        type: 'object',
        properties: {
          count: { type: 'number', maximum: 5, exclusiveMaximum: true },
        },
      }),
    )
    expect((await runTool('{"count":4}', schema)).executed).toEqual([
      { count: 4 },
    ])
    expect((await runTool('{"count":5}', schema)).executed).toEqual([])
  })

  it('runs empty and null arguments as {} when nothing is required', async () => {
    for (const raw of ['', 'null']) {
      const result = await runTool(raw, { type: 'object', properties: {} })
      expect(result.executed).toEqual([{}])
    }
  })

  it('rejects empty arguments when a field is required', async () => {
    const result = await runTool('', jsonSchema)
    expect(result.executed).toEqual([])
    expect(result.results[0]?.state).toBe('output-error')
  })

  it('checks a middleware rewrite and an approval edit', async () => {
    const rewritten = await runTool('{"count":2}', jsonSchema, {
      middleware: {
        onBeforeToolCall: async () => ({
          type: 'transformArgs',
          args: { count: 'wrong' },
        }),
      },
    })
    expect(rewritten.executed).toEqual([])
    const edited = await runTool('{"count":2}', jsonSchema, {
      needsApproval: true,
      approvals: new Map([
        ['call-1', { approved: true, editedArgs: { count: -1 } }],
      ]),
    })
    expect(edited.executed).toEqual([])
    expect(edited.results[0]?.state).toBe('output-error')
  })

  it('turns an unusable schema into a tool error', async () => {
    const result = await runTool('{"count":2}', {
      type: 'object',
      properties: { count: { $ref: 'https://example.com/count.json' } },
    })
    expect(result.executed).toEqual([])
    expect(result.results[0]?.result).toEqual({
      error: expect.stringContaining('Unresolved $ref'),
    })
    expect(JSON.stringify(result.results[0]?.result)).not.toContain(
      'Known schemas',
    )
  })

  it('omits the validator base URI from a schema error', async () => {
    const missing = await runTool('{"count":2}', {
      type: 'object',
      properties: { count: { $ref: '#/$defs/missing' } },
    })
    expect(missing.results[0]?.result).toEqual({
      error: expect.stringContaining('Unresolved $ref "#/$defs/missing"'),
    })
    const missingError = JSON.stringify(missing.results[0]?.result)
    expect(missingError).not.toContain('Absolute URI')
    expect(missingError).not.toContain('github.com')
    expect(missingError).not.toContain('Known schemas')

    const duplicate = await runTool('{"count":2}', {
      type: 'object',
      properties: { count: { $id: 'https://github.com/cfworker' } },
    })
    const duplicateError = JSON.stringify(duplicate.results[0]?.result)
    expect(duplicate.executed).toEqual([])
    expect(duplicateError).toContain('Duplicate schema URI')
    expect(duplicateError).not.toContain('github.com')
  })

  it.each([false, true])(
    'a boolean schema %s runs only when the schema is true',
    async (inputSchema) => {
      const result = await runTool('{"count":2}', inputSchema)
      expect(result.executed).toEqual(inputSchema ? [{ count: 2 }] : [])
      if (!inputSchema) expect(result.results[0]?.state).toBe('output-error')
    },
  )

  it.each([
    undefined,
    'http://json-schema.org/schema#',
    'http://json-schema.org/draft-07/schema#',
    'https://json-schema.org/draft/2019-09/schema',
  ])('reads a boolean exclusive bound with $schema %s', async ($schema) => {
    const schema: JSONSchema = JSON.parse(
      JSON.stringify({
        $schema,
        type: 'object',
        properties: {
          count: { type: 'number', maximum: 5, exclusiveMaximum: true },
        },
      }),
    )
    expect((await runTool('{"count":4}', schema)).executed).toEqual([
      { count: 4 },
    ])
    expect((await runTool('{"count":5}', schema)).executed).toEqual([])
  })

  it('keeps a number bound next to a boolean bound', async () => {
    const schema: JSONSchema = JSON.parse(
      JSON.stringify({
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        type: 'object',
        properties: {
          low: { type: 'number', minimum: 0, exclusiveMinimum: false },
          high: { type: 'number', exclusiveMinimum: 5 },
        },
      }),
    )
    expect((await runTool('{"low":0,"high":6}', schema)).executed).toEqual([
      { low: 0, high: 6 },
    ])
    expect((await runTool('{"high":5}', schema)).executed).toEqual([])
  })

  it('lets an OpenAPI 3.0 nullable reference be null', async () => {
    const schema: JSONSchema = {
      type: 'object',
      definitions: { User: { type: 'object', required: ['id'] } },
      properties: {
        owner: { nullable: true, allOf: [{ $ref: '#/definitions/User' }] },
        editor: { nullable: true, oneOf: [{ $ref: '#/definitions/User' }] },
      },
    }
    expect(
      (await runTool('{"owner":null,"editor":null}', schema)).executed,
    ).toEqual([{ owner: null, editor: null }])
    expect(
      (await runTool('{"owner":{"id":1},"editor":{"id":2}}', schema)).executed,
    ).toEqual([{ owner: { id: 1 }, editor: { id: 2 } }])
    const wrong = await runTool('{"owner":{}}', schema)
    expect(wrong.executed).toEqual([])
    expect(wrong.results[0]?.result).toEqual({
      error: expect.stringContaining(
        'check: #/owner: Instance does not have required property "id".\n',
      ),
    })
  })

  it('moves a percent-encoded $ref and a ref into a nullable root', async () => {
    const schema: JSONSchema = {
      $id: 'https://example.com/tool',
      nullable: true,
      allOf: [{ $ref: '#/definitions/Input' }],
      definitions: {
        Input: {
          type: 'object',
          properties: {
            'my field': {
              nullable: true,
              anyOf: [{ type: 'integer' }, { type: 'string' }],
            },
            'a/b': {
              $ref: '#/definitions/Input/properties/my%20field/anyOf/0',
            },
            '50%': {
              nullable: true,
              allOf: [{ type: 'object', required: ['id'] }],
            },
            copy: { $ref: '#/definitions/Input/properties/50%25/allOf/0' },
          },
        },
      },
    }
    expect(
      (await runTool('{"my field":null,"a/b":3}', schema)).executed,
    ).toEqual([{ 'my field': null, 'a/b': 3 }])
    expect((await runTool('{"a/b":null}', schema)).executed).toEqual([])
    expect((await runTool('{"a/b":"3"}', schema)).executed).toEqual([])
    expect(
      (await runTool('{"50%":null,"copy":{"id":1}}', schema)).executed,
    ).toEqual([{ '50%': null, copy: { id: 1 } }])
    expect((await runTool('{"copy":null}', schema)).executed).toEqual([])
  })

  it('keeps a $ref that points into a nullable schema', async () => {
    // zod-to-json-schema with `target: 'openApi3'` reuses a schema by path.
    const address = {
      type: 'object',
      properties: { city: { type: 'string' } },
      required: ['city'],
    }
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        home: { anyOf: [address, { type: 'string' }], nullable: true },
        work: { $ref: '#/properties/home/anyOf/0' },
        office: { nullable: true, $ref: '#/properties/home/anyOf/0' },
      },
    }
    expect(
      (await runTool('{"home":null,"work":{"city":"x"},"office":null}', schema))
        .executed,
    ).toEqual([{ home: null, work: { city: 'x' }, office: null }])
    expect((await runTool('{"work":null}', schema)).executed).toEqual([])
    expect((await runTool('{"office":{}}', schema)).executed).toEqual([])
    expect((await runTool('{"home":1}', schema)).executed).toEqual([])
  })

  it('moves a $ref through nested nullable schemas', async () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        outer: {
          nullable: true,
          allOf: [
            {
              type: 'object',
              properties: {
                inner: {
                  nullable: true,
                  oneOf: [{ type: 'integer' }, { type: 'string' }],
                },
              },
            },
          ],
        },
        copy: { $ref: '#/properties/outer/allOf/0/properties/inner/oneOf/0' },
      },
    }
    expect(
      (await runTool('{"outer":{"inner":null},"copy":3}', schema)).executed,
    ).toEqual([{ outer: { inner: null }, copy: 3 }])
    expect((await runTool('{"copy":"3"}', schema)).executed).toEqual([])
    expect(
      (await runTool('{"outer":{"inner":true}}', schema)).executed,
    ).toEqual([])
  })

  it('keeps draft-07 $ref siblings ignored in a nullable schema', async () => {
    const schema: JSONSchema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      definitions: { P: { type: 'object' } },
      properties: {
        p: { $ref: '#/definitions/P', nullable: true, required: ['name'] },
      },
    }
    expect((await runTool('{"p":{"id":1}}', schema)).executed).toEqual([
      { p: { id: 1 } },
    ])
    expect((await runTool('{"p":null}', schema)).executed).toEqual([
      { p: null },
    ])
  })

  it('lets an OpenAPI 3.0 nullable field be null', async () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        name: { type: 'string', nullable: true },
        kind: { type: 'string', enum: ['a', 'b'], nullable: true },
        size: { type: 'integer' },
      },
    }
    expect(
      (await runTool('{"name":null,"kind":null}', schema)).executed,
    ).toEqual([{ name: null, kind: null }])
    expect((await runTool('{"kind":"c"}', schema)).executed).toEqual([])
    expect((await runTool('{"size":null}', schema)).executed).toEqual([])
  })

  it('treats format as an annotation', async () => {
    const result = await runTool('{"path":"/tmp/report.txt"}', {
      type: 'object',
      properties: { path: { type: 'string', format: 'uri' } },
      required: ['path'],
    })
    expect(result.executed).toEqual([{ path: '/tmp/report.txt' }])
  })

  it('keeps a format key inside const and enum values', async () => {
    const input = {
      file: { format: 'pdf' },
      kind: { format: 'csv' },
      default: '/tmp/report.txt',
    }
    const result = await runTool(JSON.stringify(input), {
      type: 'object',
      properties: {
        file: { const: { format: 'pdf' } },
        kind: { enum: [{ format: 'csv' }] },
        // A property named like a data keyword is still a schema.
        default: { type: 'string', format: 'uri' },
      },
    })
    expect(result.executed).toEqual([input])
  })

  it('lists at most 10 errors', async () => {
    const result = await runTool(
      JSON.stringify({ xs: Array.from({ length: 12 }, () => 'x') }),
      {
        type: 'object',
        properties: { xs: { type: 'array', items: { type: 'integer' } } },
      },
    )
    const error = JSON.stringify(result.results[0]?.result)
    expect(error).toContain('#/xs/9: ')
    expect(error).not.toContain('#/xs/10: ')
    expect(error).toContain(', and 2 more')
  })

  it('checks a middleware rewrite to undefined as null', async () => {
    const result = await runTool('{"count":2}', jsonSchema, {
      middleware: {
        onBeforeToolCall: async () => ({
          type: 'transformArgs',
          args: undefined,
        }),
      },
    })
    expect(result.executed).toEqual([])
    expect(result.results[0]?.result).toEqual({
      error: expect.stringContaining(
        'check: #: Instance type "null" is invalid. Expected "object".',
      ),
    })
  })

  it('treats a key set to undefined as a missing key', async () => {
    const result = await runTool('{"count":2}', jsonSchema, {
      middleware: {
        onBeforeToolCall: async () => ({
          type: 'transformArgs',
          args: { count: 2, note: undefined },
        }),
      },
    })
    expect(result.executed).toEqual([{ count: 2, note: undefined }])
  })

  it('does not change the tool schema', async () => {
    const schema: JSONSchema = {
      type: 'object',
      $defs: { count: { type: 'integer' } },
      properties: {
        count: { $ref: '#/$defs/count' },
        name: { type: 'string', format: 'uri', nullable: true },
        kind: { enum: ['a'], nullable: true },
        owner: { nullable: true, allOf: [{ $ref: '#/$defs/count' }] },
      },
    }
    const before = JSON.stringify(schema)
    await runTool('{"count":2}', schema)
    expect(JSON.stringify(schema)).toBe(before)
    expect(Object.getOwnPropertyNames(schema.properties?.count)).toEqual([
      '$ref',
    ])
  })

  it('works when runtime code generation is blocked', async () => {
    vi.stubGlobal('Function', function blockedCodeGeneration() {
      throw new Error('Code generation is blocked')
    })
    try {
      const schema: JSONSchema = {
        type: 'object',
        properties: { count: { type: 'integer' } },
      }
      expect((await runTool('{"count":2}', schema)).executed).toEqual([
        { count: 2 },
      ])
      expect((await runTool('{"count":"2"}', schema)).executed).toEqual([])
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

const clientCheck = (
  inputSchema: SchemaInput,
  needsApproval = false,
): Tool => ({
  name: 'check',
  description: 'Check input',
  inputSchema,
  needsApproval,
})

const history = (input: unknown): Array<ModelMessage> => [
  {
    role: 'assistant',
    content: null,
    toolCalls: [
      {
        id: 'call',
        type: 'function',
        function: { name: 'check', arguments: JSON.stringify(input) },
      },
    ],
  },
]

function descriptors(chunks: Array<StreamChunk>) {
  return chunks.flatMap((chunk) =>
    chunk.type === EventType.RUN_FINISHED && chunk.outcome?.type === 'interrupt'
      ? chunk.outcome.interrupts
      : [],
  )
}

function clientInput(chunks: Array<StreamChunk>) {
  return descriptors(chunks).find((entry) => entry.id === 'client_tool_call')
    ?.metadata?.input
}

const review = defineInterrupt({
  id: 'boundary-review',
  responseSchema: z.boolean(),
})

// Pauses before the tools run, so client requests come from the boundary.
const reviewBeforeTools = defineChatMiddleware({
  name: 'boundary',
  onInterruptBoundary(ctx) {
    if (ctx.phase !== 'beforeTools') return undefined
    return {
      interrupts: [
        review.interrupt({
          key: 'review',
          reason: 'review',
          message: 'Review',
        }),
      ],
    }
  },
})

async function initial(
  input: unknown,
  tool: Tool,
  middleware: Array<ChatMiddleware> = [],
  boundary = false,
) {
  const { adapter } = createMockAdapter({
    iterations: [
      [
        ev.runStarted(),
        ev.toolStart('call', 'check'),
        ev.toolArgs('call', JSON.stringify(input)),
        ev.runFinished('tool_calls'),
      ],
    ],
  })
  const messages: Array<ModelMessage> = [{ role: 'user', content: 'check' }]
  if (!boundary) {
    return collectChunks(chat({ adapter, messages, tools: [tool], middleware }))
  }
  return collectChunks(
    chat({
      adapter,
      messages,
      tools: [tool],
      interrupts: [review],
      middleware: [reviewBeforeTools, ...middleware],
    }),
  )
}

describe('client tool input in chat()', () => {
  it.each([false, true])(
    'shows middleware the raw input, then sends the checked input: boundary=%s',
    async (boundary) => {
      let transforms = 0
      const seen: Array<unknown> = []
      const inputSchema = z.object({
        count: z.string().transform((value) => {
          transforms++
          return Number(value)
        }),
      })
      const chunks = await initial(
        { count: '2' },
        clientCheck(inputSchema),
        [
          {
            onBeforeToolCall(_ctx, hook) {
              seen.push(structuredClone(hook.args))
            },
          },
        ],
        boundary,
      )
      expect(seen).toEqual([{ count: '2' }])
      expect(transforms).toBe(1)
      expect(clientInput(chunks)).toEqual({ count: 2 })
    },
  )

  it.each([false, true])(
    'sends no client request when middleware makes the input invalid: boundary=%s',
    async (boundary) => {
      const chunks = await initial(
        { count: 2 },
        clientCheck(schema),
        [
          {
            onBeforeToolCall: () => ({
              type: 'transformArgs',
              args: { count: 'wrong' },
            }),
          },
        ],
        boundary,
      )
      expect(clientInput(chunks)).toBeUndefined()
      expect(
        chunks.some(
          (chunk) =>
            chunk.type === EventType.TOOL_CALL_RESULT &&
            typeof chunk.content === 'string' &&
            chunk.content.includes('Input validation failed'),
        ),
      ).toBe(true)
    },
  )

  it('runs no middleware for the pending approval preview', async () => {
    let hooks = 0
    const chunks = await initial(
      { count: '2' },
      clientCheck(z.object({ count: z.string().transform(Number) }), true),
      [
        {
          onBeforeToolCall() {
            hooks++
          },
        },
      ],
    )
    expect(hooks).toBe(0)
    expect(
      descriptors(chunks).find((entry) => entry.id === 'approval_call')
        ?.metadata?.input,
    ).toEqual({ count: 2 })
    expect(clientInput(chunks)).toBeUndefined()
  })

  it('checks an approval edit after middleware on resume', async () => {
    const { adapter, calls } = createMockAdapter({ iterations: [] })
    const seen: Array<unknown> = []
    const inputSchema = z.object({
      count: z.number().transform((value) => value + 1),
    })
    const chunks = await collectChunks(
      chat({
        adapter,
        parentRunId: 'old',
        messages: history({ count: 1 }),
        tools: [clientCheck(inputSchema, true)],
        resume: [
          {
            interruptId: 'approval_call',
            status: 'resolved',
            payload: { approved: true, editedArgs: { count: 2 } },
          },
        ],
        middleware: [
          {
            onBeforeToolCall(_ctx, hook) {
              seen.push(structuredClone(hook.args))
            },
          },
        ],
      }),
    )
    expect(calls).toHaveLength(0)
    expect(seen).toEqual([{ count: 2 }])
    expect(clientInput(chunks)).toEqual({ count: 3 })
  })

  it('checks the client input, with no second hook run, when the result comes back', async () => {
    const { adapter, calls } = createMockAdapter({
      iterations: [[ev.runStarted(), ev.runFinished()]],
    })
    let hooks = 0
    await collectChunks(
      chat({
        adapter,
        parentRunId: 'old',
        messages: history({ count: 'wrong' }),
        tools: [clientCheck(schema)],
        resume: [
          {
            interruptId: 'client_tool_call',
            status: 'resolved',
            payload: { ok: true },
          },
        ],
        middleware: [
          {
            onBeforeToolCall() {
              hooks++
            },
          },
        ],
      }),
    )
    expect(hooks).toBe(0)
    const results = calls[0]?.messages.filter(
      (message) => message.role === 'tool',
    )
    expect(results).toHaveLength(1)
    expect(JSON.stringify(results?.[0])).toContain('Input validation failed')
  })

  it('records no execute_tool span for a client tool', async () => {
    const fakeTracer = createFakeTracer()
    await initial({ count: 2 }, clientCheck(schema), [
      otelMiddleware({
        tracer: fakeTracer.tracer,
        meter: createFakeMeter().meter,
      }),
    ])
    expect(
      fakeTracer.spans.some((span) => span.name.startsWith('execute_tool')),
    ).toBe(false)
  })
})
