import { describe, expect, it } from 'vitest'
import { generateToolWrappers, wrapCode } from '../src/worker/wrap-code'
import type { ToolResultPayload, ToolSchema } from '../src/types'
import workerModule from '../src/worker/index'

const worker = workerModule as {
  fetch: (
    request: Request,
    env: { UNSAFE_EVAL?: { eval: (code: string) => unknown } },
    ctx: ExecutionContext,
  ) => Promise<Response>
}

const mockExecutionContext = {
  waitUntil: () => {},
  passThroughOnException: () => {},
} as unknown as ExecutionContext

describe('generateToolWrappers', () => {
  const tools: Array<ToolSchema> = [
    {
      name: 'add',
      description: 'Add numbers',
      inputSchema: { type: 'object' },
    },
    { name: 'fetchData', description: 'Fetch data', inputSchema: {} },
  ]

  it('generates first-pass wrappers that collect tool calls when toolResults is undefined', () => {
    const code = generateToolWrappers(tools)
    expect(code).toContain('async function add(input)')
    expect(code).toContain('__pendingToolCalls.push')
    expect(code).toContain('__ToolCallNeeded')
    expect(code).toContain('async function fetchData(input)')
    expect(code).not.toContain('__toolResults')
  })

  it('generates second-pass wrappers that return cached results when toolResults is provided', () => {
    const toolResults: Record<string, ToolResultPayload> = {
      add_1: { success: true, value: 5 },
      fetchData_1: { success: false, error: 'Failed' },
    }
    const code = generateToolWrappers(tools, toolResults)
    expect(code).toContain('async function add(input)')
    expect(code).toContain('__toolResults[callId]')
    expect(code).toContain('result.success')
    expect(code).toContain('result.error')
    expect(code).toContain('return result.value')
  })

  it('rejects tool names that would break out of the function identifier', () => {
    const malicious: ToolSchema = {
      name: "foo'); process.exit(1); (function bar() {",
      description: '',
      inputSchema: {},
    }
    expect(() => generateToolWrappers([malicious])).toThrow(/Invalid tool name/)
  })

  it('rejects tool names containing whitespace, quotes, or backticks', () => {
    const cases = [
      'has space',
      'with`backtick',
      "with'quote",
      'with"quote',
      'with;semi',
      'with\nnewline',
    ]
    for (const name of cases) {
      expect(() =>
        generateToolWrappers([{ name, description: '', inputSchema: {} }]),
      ).toThrow(/Invalid tool name/)
    }
  })

  it('rejects tool names that start with a digit', () => {
    expect(() =>
      generateToolWrappers([
        { name: '123tool', description: '', inputSchema: {} },
      ]),
    ).toThrow(/Invalid tool name/)
  })

  it('rejects reserved JS keywords that would pass the regex but break eval', () => {
    const reserved = ['return', 'class', 'function', 'if', 'await', 'import']
    for (const name of reserved) {
      expect(
        () =>
          generateToolWrappers([{ name, description: '', inputSchema: {} }]),
        `should reject reserved: ${name}`,
      ).toThrow(/reserved JavaScript keyword/)
    }
  })

  it('accepts conventional identifiers (camelCase, snake_case, $_)', () => {
    const valid = ['camelCase', 'snake_case', '_leading_underscore', '$dollar']
    for (const name of valid) {
      expect(() =>
        generateToolWrappers([{ name, description: '', inputSchema: {} }]),
      ).not.toThrow()
    }
  })
})

describe('wrapCode', () => {
  const tools: Array<ToolSchema> = [
    { name: 'greet', description: 'Greet', inputSchema: {} },
  ]

  it('wraps user code in async IIFE with __pendingToolCalls and __toolResults when no toolResults', () => {
    const wrapped = wrapCode('return 1 + 1', tools)
    expect(wrapped).toContain('(async function()')
    expect(wrapped).toContain('const __pendingToolCalls = []')
    expect(wrapped).toContain('const __toolResults = {}')
    expect(wrapped).toContain('return 1 + 1')
    expect(wrapped).toContain("status: 'done'")
    expect(wrapped).toContain("status: 'need_tools'")
    expect(wrapped).toContain('async function greet(input)')
  })

  it('includes toolResults JSON when toolResults provided', () => {
    const toolResults: Record<string, ToolResultPayload> = {
      greet_1: { success: true, value: 'Hi' },
    }
    const wrapped = wrapCode('return await greet({})', tools, toolResults)
    expect(wrapped).toContain('"greet_1"')
    expect(wrapped).toContain('"success":true')
    expect(wrapped).toContain('"value":"Hi"')
  })

  it('includes console capture and __logs', () => {
    const wrapped = wrapCode('console.log("x")', [])
    expect(wrapped).toContain('const console =')
    expect(wrapped).toContain('__logs.push')
    expect(wrapped).toContain('logs: __logs')
  })
})

describe('Worker fetch handler', () => {
  it('returns CORS headers for OPTIONS preflight', async () => {
    const request = new Request('https://worker.test/', { method: 'OPTIONS' })
    const response = await worker.fetch(request, {}, mockExecutionContext)

    expect(response.status).toBe(200)
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain(
      'POST',
    )
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain(
      'Content-Type',
    )
  })

  it('returns 405 for non-POST methods', async () => {
    const request = new Request('https://worker.test/', { method: 'GET' })
    const response = await worker.fetch(request, {}, mockExecutionContext)

    expect(response.status).toBe(405)
    const json = await response.json()
    expect(json).toHaveProperty('error', 'Method not allowed')
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  it('returns 400 when body has no code', async () => {
    const request = new Request('https://worker.test/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tools: [] }),
    })
    const response = await worker.fetch(request, {}, mockExecutionContext)

    expect(response.status).toBe(400)
    const json = await response.json()
    expect(json).toHaveProperty('error', 'Code is required')
  })

  it('returns 200 with UnsafeEvalNotAvailable when env has no UNSAFE_EVAL', async () => {
    const request = new Request('https://worker.test/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code: 'return 1',
        tools: [],
      }),
    })
    const response = await worker.fetch(request, {}, mockExecutionContext)

    expect(response.status).toBe(200)
    const json = await response.json()
    expect(json.status).toBe('error')
    expect(json.error.name).toBe('UnsafeEvalNotAvailable')
    expect(json.error.message).toContain('UNSAFE_EVAL')
    expect(json.error.message).toContain('wrangler.toml')
    // No longer steers users to Workers for Platforms
    expect(json.error.message).not.toContain('Workers for Platforms')
  })

  it('returns 500 with RequestError when body is invalid JSON', async () => {
    const request = new Request('https://worker.test/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    })
    const response = await worker.fetch(request, {}, mockExecutionContext)

    expect(response.status).toBe(500)
    const json = await response.json()
    expect(json.status).toBe('error')
    expect(json.error.name).toBe('RequestError')
  })
})
