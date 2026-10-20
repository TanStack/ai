import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { chat } from '../src/activities/chat/index'
import { defineChatMiddleware } from '../src/activities/chat/middleware/define'
import { defineInterrupt } from '../src/interrupt-definition'
import { executeToolCalls } from '../src/activities/chat/tools/tool-calls'
import {
  validateJsonSchema,
  validateToolInput,
} from '../src/activities/chat/tools/input-validation'
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
  TextOptions,
  Tool,
  ToolCall,
  ToolInputRepairContext,
} from '../src/types'

const schema = z.object({ count: z.number().int().min(1) })

/** Checks the schema alone: the built-in repair would fix some inputs. */
const noRepair = { repairToolInput: false } as const

async function runTool(
  rawArguments: string,
  inputSchema: SchemaInput | boolean,
  options: {
    client?: boolean
    needsApproval?: boolean
    approvals?: Map<string, ToolApprovalResolution>
    middleware?: ToolExecutionMiddlewareHooks
    clientResults?: Map<string, unknown>
    repairToolInput?: TextOptions['repairToolInput']
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
    undefined,
    undefined,
    undefined,
    undefined,
    options.repairToolInput,
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
      error: expect.stringMatching(
        /^Input validation failed for tool check: [\s\S]*\nReceived arguments: \{"count":0\}$/,
      ),
    })
    expect(result.executed).toEqual([])
  })

  it('echoes only the model arguments, not values middleware added', async () => {
    const result = await runTool('{"count":0}', schema, {
      middleware: {
        onBeforeToolCall: async () => ({
          type: 'transformArgs',
          args: { count: 0, token: 'secret-token' },
        }),
      },
    })
    expect(result.results[0]?.state).toBe('output-error')
    expect(JSON.stringify(result.results[0]?.result)).not.toContain(
      'secret-token',
    )
    // The model learns that its own arguments were changed.
    expect(JSON.stringify(result.results[0]?.result)).toContain(
      'An approval edit or middleware changed these arguments',
    )
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

  it('checks an approval edit for a client tool', async () => {
    const result = await runTool('{"count":2}', schema, {
      client: true,
      needsApproval: true,
      approvals: new Map([
        ['call-1', { approved: true, editedArgs: { count: 'wrong' } }],
      ]),
    })
    expect(result.results[0]?.state).toBe('output-error')
    expect(result.needsClientExecution).toEqual([])
  })

  it('keeps a returned client result when middleware repaired the input', async () => {
    let hooks = 0
    const result = await runTool('{"count":"wrong"}', schema, {
      client: true,
      clientResults: new Map([['call-1', 'client result']]),
      middleware: {
        onBeforeToolCall: async () => {
          hooks++
          return { type: 'transformArgs', args: { count: 4 } }
        },
      },
    })
    expect(hooks).toBe(0)
    expect(result.results[0]?.state).not.toBe('output-error')
    expect(result.results[0]?.result).toBe('client result')
  })

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

describe('a batch with an approval', () => {
  const call = (id: string, name: string, args: string): ToolCall => ({
    id,
    type: 'function',
    function: { name, arguments: args },
  })

  async function runBatch(
    calls: Array<ToolCall>,
    tools: Array<AnyTool>,
    approvals?: Map<string, ToolApprovalResolution>,
  ) {
    const generator = executeToolCalls(calls, tools, approvals)
    while (true) {
      const next = await generator.next()
      if (next.done) return next.value
    }
  }

  it('runs the held calls when the only approval preview fails its check', async () => {
    const execute = vi.fn(() => 'ran')
    const result = await runBatch(
      [call('a', 'gated', '{"count":0}'), call('b', 'plain', '{}')],
      [
        {
          name: 'gated',
          description: 'Gated',
          inputSchema: schema,
          needsApproval: true,
          execute: vi.fn(),
        },
        { name: 'plain', description: 'Plain', execute },
      ],
    )
    expect(result.needsApproval).toEqual([])
    expect(execute).toHaveBeenCalledTimes(1)
    expect(result.results.map((r) => [r.toolCallId, r.state])).toEqual([
      ['a', 'output-error'],
      ['b', undefined],
    ])
  })

  it('sends an approved client call while another call waits for approval', async () => {
    const result = await runBatch(
      [call('a', 'clientGated', '{}'), call('b', 'serverGated', '{}')],
      [
        { name: 'clientGated', description: 'Client', needsApproval: true },
        {
          name: 'serverGated',
          description: 'Server',
          needsApproval: true,
          execute: vi.fn(),
        },
      ],
      new Map([['a', true]]),
    )
    expect(result.needsClientExecution.map((r) => r.toolCallId)).toEqual(['a'])
    expect(result.needsApproval.map((r) => r.toolCallId)).toEqual(['b'])
  })
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

  it.each([
    '{}',
    '{"count":"wrong"}',
    '{"count":0}',
    '{"count":2,"extra":true}',
  ])('rejects invalid input without executing: %s', async (raw) => {
    const result = await runTool(raw, jsonSchema)
    expect(result.executed).toEqual([])
    expect(result.results[0]?.state).toBe('output-error')
    expect(result.results[0]?.result).toEqual({
      error: expect.stringContaining('Input validation failed for tool check'),
    })
  })

  it('names the failed location and shows the received arguments', async () => {
    const result = await runTool('{"count":0}', jsonSchema)
    expect(result.results[0]?.result).toEqual({
      error: expect.stringMatching(/#\/count: .*\n.*Received arguments:/s),
    })
    expect(result.results[0]?.result).toEqual({
      error: expect.stringContaining('Received arguments: {"count":0}'),
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
    expect((await runTool('{"count":"x"}', schema)).executed).toEqual([])
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
    expect((await runTool('{"a/b":null}', schema, noRepair)).executed).toEqual(
      [],
    )
    expect((await runTool('{"a/b":"3"}', schema, noRepair)).executed).toEqual(
      [],
    )
    expect(
      (await runTool('{"50%":null,"copy":{"id":1}}', schema)).executed,
    ).toEqual([{ '50%': null, copy: { id: 1 } }])
    expect((await runTool('{"copy":null}', schema, noRepair)).executed).toEqual(
      [],
    )
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
    expect((await runTool('{"work":null}', schema, noRepair)).executed).toEqual(
      [],
    )
    expect((await runTool('{"office":{}}', schema, noRepair)).executed).toEqual(
      [],
    )
    expect((await runTool('{"home":1}', schema, noRepair)).executed).toEqual([])
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
    expect((await runTool('{"copy":"3"}', schema, noRepair)).executed).toEqual(
      [],
    )
    expect(
      (await runTool('{"outer":{"inner":true}}', schema, noRepair)).executed,
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
    expect((await runTool('{"size":null}', schema, noRepair)).executed).toEqual(
      [],
    )
  })

  it('repairs a value inside an OpenAPI 3.0 nullable schema', async () => {
    const schema: JSONSchema = {
      type: 'object',
      properties: {
        count: { nullable: true, allOf: [{ type: 'integer' }] },
        size: { type: 'integer', nullable: true },
      },
    }
    expect(
      (await runTool('{"count":"3","size":"4"}', schema)).executed,
    ).toEqual([{ count: 3, size: 4 }])
    expect(
      (await runTool('{"count":null,"size":null}', schema)).executed,
    ).toEqual([{ count: null, size: null }])
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
      expect((await runTool('{"count":"2"}', schema)).executed).toEqual([
        { count: 2 },
      ])
      expect((await runTool('{"count":"x"}', schema)).executed).toEqual([])
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('tool input repair', () => {
  const schema: JSONSchema = {
    type: 'object',
    properties: { count: { type: 'integer', minimum: 1 } },
    required: ['count'],
    additionalProperties: false,
  }

  it('coerces a numeric field before execution', async () => {
    const result = await runTool('{"count":"2"}', schema)
    expect(result.executed).toEqual([{ count: 2 }])
  })

  it('does not change the received arguments', async () => {
    const received = { count: '2' }
    expect(await validateToolInput(schema, received, 'check')).toEqual({
      count: 2,
    })
    expect(received).toEqual({ count: '2' })
  })

  it('shows the original arguments when the repaired value still fails', async () => {
    const result = await runTool('{"count":"0"}', schema)
    expect(result.executed).toEqual([])
    expect(result.results[0]?.result).toEqual({
      error: expect.stringContaining('Received arguments: {"count":"0"}'),
    })
  })

  it('follows local references and drops a null optional field', async () => {
    const result = await runTool('{"count":"3","label":null,"omitted":null}', {
      type: 'object',
      $defs: { count: { type: 'integer', minimum: 1 } },
      properties: {
        count: { $ref: '#/$defs/count' },
        label: { type: ['string', 'null'] },
        omitted: { type: 'string' },
      },
      required: ['count'],
    })
    expect(result.executed).toEqual([{ count: 3, label: null }])
  })

  it.each<[unknown, JSONSchema, unknown]>([
    ['12', { anyOf: [{ type: 'integer' }, { type: 'string' }] }, '12'],
    ['12', { type: ['integer', 'string'] }, '12'],
    ['3', { type: 'integer' }, 3],
    [['1', '2'], { type: 'array', items: { type: 'integer' } }, [1, 2]],
    [
      ['1', 'x'],
      { prefixItems: [{ type: 'integer' }, { type: 'string' }] },
      [1, 'x'],
    ],
    ['true', { type: 'boolean' }, true],
    [null, { type: 'string' }, ''],
  ])('repairs %j against %j', async (received, inputSchema, expected) => {
    expect(await validateToolInput(inputSchema, received, 'check')).toEqual(
      expected,
    )
  })

  it('rejects a primitive that cannot be repaired', async () => {
    await expect(
      validateToolInput({ type: 'integer' }, 'wrong', 'check'),
    ).rejects.toThrow('Input validation failed for tool check')
  })

  it('keeps a valid referenced union branch', async () => {
    const result = await runTool('{"count":"12"}', {
      type: 'object',
      $defs: { numeric: { type: 'integer' }, text: { type: 'string' } },
      properties: {
        count: {
          anyOf: [{ $ref: '#/$defs/numeric' }, { $ref: '#/$defs/text' }],
        },
      },
      required: ['count'],
    })
    expect(result.executed).toEqual([{ count: '12' }])
  })

  it('coerces conditional branch fields', async () => {
    const result = await runTool('{"mode":"count","count":"4"}', {
      type: 'object',
      if: { properties: { mode: { const: 'count' } }, required: ['mode'] },
      then: {
        properties: { count: { type: 'integer' } },
        required: ['count'],
      },
    })
    expect(result.executed).toEqual([{ mode: 'count', count: 4 }])
  })

  it('keeps a null field that a conditional branch requires', async () => {
    const result = await runTool('{"mode":"count","count":null}', {
      type: 'object',
      properties: { mode: { type: 'string' }, count: { type: 'integer' } },
      if: { properties: { mode: { const: 'count' } }, required: ['mode'] },
      then: { required: ['count'] },
    })
    expect(result.executed).toEqual([{ mode: 'count', count: 0 }])
  })

  it('keeps a null field that an intersection requires', async () => {
    const result = await runTool('{"count":null}', {
      type: 'object',
      allOf: [
        { properties: { count: { type: 'integer' } } },
        { required: ['count'] },
      ],
    })
    expect(result.executed).toEqual([{ count: 0 }])
  })

  it('keeps a null field required outside a union branch', async () => {
    const result = await runTool('{"count":null}', {
      type: 'object',
      required: ['count'],
      anyOf: [{ properties: { count: { type: 'integer' } } }],
    })
    expect(result.executed).toEqual([{ count: 0 }])
  })

  it('coerces pattern and additional properties', async () => {
    const result = await runTool('{"n_1":"4","extra":"5"}', {
      type: 'object',
      patternProperties: { '^n_': { type: 'integer' } },
      additionalProperties: { type: 'number' },
    })
    expect(result.executed).toEqual([{ n_1: 4, extra: 5 }])
  })

  it('coerces an approval edit before execution', async () => {
    const result = await runTool('{"count":2}', schema, {
      needsApproval: true,
      approvals: new Map([
        ['call-1', { approved: true, editedArgs: { count: '4' } }],
      ]),
    })
    expect(result.executed).toEqual([{ count: 4 }])
  })

  it('coerces a middleware rewrite before a client request', async () => {
    const result = await runTool('{"count":2}', schema, {
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

  it('repairs input for a Standard Schema that exports JSON Schema', async () => {
    const result = await runTool(
      '{"count":"2","label":null}',
      z.object({ count: z.number(), label: z.string().optional() }),
    )
    expect(result.executed).toEqual([{ count: 2 }])
  })

  it('runs the authored transform on the repaired input', async () => {
    const result = await runTool(
      '{"count":"2"}',
      z.object({ count: z.number().transform((value) => value * 10) }),
    )
    expect(result.executed).toEqual([{ count: 20 }])
  })

  it('reports the issues of the first run when repair does not help', async () => {
    const result = await runTool(
      '{"count":"wrong"}',
      z.object({ count: z.number() }),
    )
    expect(result.executed).toEqual([])
    expect(result.results[0]?.result).toEqual({
      error: expect.stringContaining('Received arguments: {"count":"wrong"}'),
    })
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

// Pauses at a tool boundary, so client requests come from that boundary.
const reviewAt = (phase: 'beforeTools' | 'afterTools') =>
  defineChatMiddleware({
    name: 'boundary',
    onInterruptBoundary(ctx) {
      if (ctx.phase !== phase) return undefined
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
  boundary?: 'beforeTools' | 'afterTools',
  repairToolInput?: TextOptions['repairToolInput'],
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
    return collectChunks(
      chat({ adapter, messages, tools: [tool], middleware, repairToolInput }),
    )
  }
  return collectChunks(
    chat({
      adapter,
      messages,
      tools: [tool],
      interrupts: [review],
      middleware: [reviewAt(boundary), ...middleware],
      repairToolInput,
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
        boundary ? 'beforeTools' : undefined,
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
        boundary ? 'beforeTools' : undefined,
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

  it('keeps the client result, with no second hook run, when it comes back', async () => {
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
    expect(JSON.stringify(results?.[0])).not.toContain(
      'Input validation failed',
    )
  })

  it.each([false, true])(
    'runs the hook once for a client tool at an afterTools boundary: invalid=%s',
    async (invalid) => {
      let hooks = 0
      const chunks = await initial(
        { count: 2 },
        clientCheck(schema),
        [
          {
            onBeforeToolCall() {
              hooks++
              return invalid
                ? { type: 'transformArgs', args: { count: 'wrong' } }
                : undefined
            },
          },
        ],
        'afterTools',
      )
      expect(hooks).toBe(1)
      const toolResults = chunks.filter(
        (chunk) => chunk.type === EventType.TOOL_CALL_RESULT,
      )
      expect(toolResults).toHaveLength(invalid ? 1 : 0)
      if (invalid) {
        expect(clientInput(chunks)).toBeUndefined()
      } else {
        expect(clientInput(chunks)).toEqual({ count: 2 })
      }
    },
  )

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

describe('repairToolInput', () => {
  const countSchema: JSONSchema = {
    type: 'object',
    properties: { count: { type: 'integer' } },
    required: ['count'],
  }

  /** One model turn that calls `check` with each input, then a turn that answers. */
  async function run(
    inputs: Array<unknown>,
    inputSchema: SchemaInput,
    repairToolInput?: TextOptions['repairToolInput'],
  ) {
    const executed: Array<unknown> = []
    const tool: Tool = {
      name: 'check',
      description: 'Check',
      inputSchema,
      execute: (input) => {
        executed.push(input)
        return 'ok'
      },
    }
    const { adapter } = createMockAdapter({
      iterations: [
        [
          ev.runStarted(),
          ...inputs.flatMap((input, index) => [
            ev.toolStart(`call-${index}`, 'check'),
            ev.toolArgs(`call-${index}`, JSON.stringify(input)),
            ev.toolEnd(`call-${index}`),
          ]),
          ev.runFinished('tool_calls'),
        ],
        [ev.runStarted(), ev.textContent('Done'), ev.runFinished('stop')],
      ],
    })
    const chunks = await collectChunks(
      chat({
        adapter,
        messages: [{ role: 'user', content: 'check' }],
        tools: [tool],
        repairToolInput,
      }),
    )
    const results = chunks.flatMap((chunk) =>
      chunk.type === EventType.TOOL_CALL_RESULT &&
      typeof chunk.content === 'string'
        ? [chunk.content]
        : [],
    )
    const errors = results.filter((content) =>
      content.includes('Input validation failed'),
    )
    return { executed, results, errors }
  }

  it('turns the built-in repair off with false', async () => {
    const result = await run([{ count: '3' }], countSchema, false)
    expect(result.executed).toEqual([])
    expect(result.errors).toHaveLength(1)
  })

  it('turns the repair off with false for a Standard Schema', async () => {
    const result = await run(
      [{ count: '3' }],
      z.object({ count: z.number() }),
      false,
    )
    expect(result.executed).toEqual([])
    expect(result.errors).toHaveLength(1)
  })

  it.each([false, true])(
    'turns the repair off with false for a client tool: boundary=%s',
    async (boundary) => {
      const chunks = await initial(
        { count: '3' },
        clientCheck(schema),
        [],
        boundary ? 'beforeTools' : undefined,
        false,
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

  it('replaces the built-in repair with a function', async () => {
    const repair = vi.fn(({ input }: ToolInputRepairContext) =>
      typeof input === 'object' &&
      input !== null &&
      'count' in input &&
      input.count === 'many'
        ? { count: 7 }
        : undefined,
    )
    const result = await run(
      [{ count: 'many' }, { count: '3' }],
      countSchema,
      repair,
    )
    // `'3'` is not repaired: the function said `undefined`.
    expect(result.executed).toEqual([{ count: 7 }])
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toContain(
      String.raw`Received arguments: {\"count\":\"3\"}`,
    )
    const context = repair.mock.calls[0]?.[0]
    expect(context?.tool.name).toBe('check')
    expect(context?.toolCall.id).toBe('call-0')
    expect(context?.input).toEqual({ count: 'many' })
    expect(context?.error.message).toContain('Input validation failed')
  })

  it('does not call the function for a valid input', async () => {
    const repair = vi.fn(() => ({ count: 9 }))
    const result = await run([{ count: 2 }], countSchema, repair)
    expect(repair).not.toHaveBeenCalled()
    expect(result.executed).toEqual([{ count: 2 }])
  })

  it('reports the original error when the repaired input still fails', async () => {
    const result = await run([{ count: 'many' }], countSchema, () => ({
      count: 'still wrong',
    }))
    expect(result.executed).toEqual([])
    expect(result.errors[0]).toContain(
      String.raw`Received arguments: {\"count\":\"many\"}`,
    )
  })

  it('runs a Standard Schema, with its transform, on the repaired input', async () => {
    const result = await run(
      [{ count: 'two' }],
      z.object({ count: z.number().transform((value) => value * 10) }),
      () => ({ count: 2 }),
    )
    expect(result.executed).toEqual([{ count: 20 }])
  })

  it('makes the thrown error the tool error', async () => {
    const result = await run([{ count: 'many' }], countSchema, () => {
      throw new Error('cannot repair')
    })
    expect(result.executed).toEqual([])
    // The model's own arguments follow the thrown message.
    expect(result.results).toEqual([
      JSON.stringify({
        error: 'cannot repair\nReceived arguments: {"count":"many"}',
      }),
    ])
  })
})

describe('an approved edit in the transcript', () => {
  const run = async (
    editedArgs: unknown,
    middleware: Array<ChatMiddleware> = [],
  ) => {
    const { adapter, calls } = createMockAdapter({
      iterations: [[ev.runStarted(), ev.runFinished()]],
    })
    const execute = vi.fn(async (_input: unknown) => 'ok')
    await collectChunks(
      chat({
        adapter,
        parentRunId: 'old',
        messages: history({ count: 1 }),
        tools: [
          { ...clientCheck(z.object({ count: z.number() }), true), execute },
        ],
        resume: [
          {
            interruptId: 'approval_call',
            status: 'resolved',
            payload: { approved: true, editedArgs },
          },
        ],
        middleware,
      }),
    )
    const sent = calls[0]?.messages.flatMap((message) =>
      message.role === 'assistant' ? (message.toolCalls ?? []) : [],
    )
    return { execute, args: sent?.[0]?.function.arguments }
  }

  it('keeps an edit that the tool ran with', async () => {
    const { execute, args } = await run({ count: 2 })
    expect(execute.mock.calls[0]?.[0]).toEqual({ count: 2 })
    expect(args).toBe('{"count":2}')
  })

  it('keeps the model input for a null edit, which the tool ignores', async () => {
    const { execute, args } = await run(null)
    expect(execute.mock.calls[0]?.[0]).toEqual({ count: 1 })
    expect(args).toBe('{"count":1}')
  })

  it('keeps the model input when middleware skips the call', async () => {
    const { execute, args } = await run({ count: 2 }, [
      { onBeforeToolCall: () => ({ type: 'skip', result: 'skipped' }) },
    ])
    expect(execute).not.toHaveBeenCalled()
    expect(args).toBe('{"count":1}')
  })
})

describe('validateJsonSchema', () => {
  it('checks every keyword of the schema, and never repairs the value', () => {
    const schema = { type: 'string', pattern: '^key-' }
    expect(validateJsonSchema(schema, 'key-1')).toEqual({ value: 'key-1' })
    const refused = validateJsonSchema(schema, 'secret')
    expect(refused.issues?.length).toBeGreaterThan(0)
    // A tool input would be repaired to `5`. This check does not repair.
    expect(
      validateJsonSchema({ type: 'number' }, '5').issues?.length,
    ).toBeGreaterThan(0)
  })
})
