import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createCloudflareIsolateDriver,
  type CloudflareIsolateDriverConfig,
} from '../src/isolate-driver'
import type { ToolBinding } from '@tanstack/ai-code-mode'
import type { ExecuteRequest, ExecuteResponse } from '../src/types'

const WORKER_URL = 'https://code-mode.example.com'

function makeBinding(
  name: string,
  execute: (args: unknown) => Promise<unknown>,
): ToolBinding {
  return {
    name,
    description: `${name} tool`,
    inputSchema: { type: 'object', properties: {} },
    execute,
  }
}

describe('createCloudflareIsolateDriver', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('createContext', () => {
    it('returns a context with execute and dispose', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          ({
            status: 'done',
            success: true,
            value: 42,
            logs: [],
          }) as ExecuteResponse,
      })

      const driver = createCloudflareIsolateDriver({ workerUrl: WORKER_URL })
      const context = await driver.createContext({
        bindings: {},
      })

      expect(context).toBeDefined()
      expect(typeof context.execute).toBe('function')
      expect(typeof context.dispose).toBe('function')

      const result = await context.execute('return 42')
      expect(result.success).toBe(true)
      expect(result.value).toBe(42)
    })
  })

  describe('execute - basic execution', () => {
    it('sends code and tools in POST body, returns value when Worker returns done', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          ({
            status: 'done',
            success: true,
            value: { sum: 7 },
            logs: ['hello'],
          }) as ExecuteResponse,
      })

      const driver = createCloudflareIsolateDriver({ workerUrl: WORKER_URL })
      const context = await driver.createContext({ bindings: {} })

      const result = await context.execute('return { sum: 3 + 4 }')

      expect(result.success).toBe(true)
      expect(result.value).toEqual({ sum: 7 })
      expect(result.logs).toEqual(['hello'])

      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, options] = fetchMock.mock.calls[0]
      expect(url).toBe(WORKER_URL)
      expect(options.method).toBe('POST')
      expect(options.headers['Content-Type']).toBe('application/json')

      const body: ExecuteRequest = JSON.parse(options.body)
      expect(body.code).toBe('return { sum: 3 + 4 }')
      expect(body.tools).toEqual([])
      expect(body.toolResults).toBeUndefined()
    })

    it('includes timeout in request when provided in config', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          ({
            status: 'done',
            success: true,
            value: null,
            logs: [],
          }) as ExecuteResponse,
      })

      const driver = createCloudflareIsolateDriver({
        workerUrl: WORKER_URL,
        timeout: 5000,
      })
      const context = await driver.createContext({
        bindings: {},
        timeout: 10000,
      })

      await context.execute('return 1')

      const body: ExecuteRequest = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.timeout).toBe(10000)
    })
  })

  describe('execute - authorization header', () => {
    it('forwards Authorization header when provided in config', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          ({
            status: 'done',
            success: true,
            value: null,
            logs: [],
          }) as ExecuteResponse,
      })

      const driver = createCloudflareIsolateDriver({
        workerUrl: WORKER_URL,
        authorization: 'Bearer secret-token',
      })
      const context = await driver.createContext({ bindings: {} })

      await context.execute('return 1')

      expect(fetchMock).toHaveBeenCalledWith(
        WORKER_URL,
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer secret-token',
          }),
        }),
      )
    })

    it('does not set Authorization when not provided', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          ({
            status: 'done',
            success: true,
            value: null,
            logs: [],
          }) as ExecuteResponse,
      })

      const driver = createCloudflareIsolateDriver({ workerUrl: WORKER_URL })
      const context = await driver.createContext({ bindings: {} })

      await context.execute('return 1')

      const headers = fetchMock.mock.calls[0][1].headers
      expect(headers).not.toHaveProperty('Authorization')
    })
  })

  describe('execute - tool call round-trip', () => {
    it('executes tools locally when Worker returns need_tools, then sends results back', async () => {
      const addBinding = makeBinding('add', async (args: unknown) => {
        const { a, b } = args as { a: number; b: number }
        return a + b
      })

      // First response: need_tools
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          ({
            status: 'need_tools',
            toolCalls: [{ id: 'add_1', name: 'add', args: { a: 2, b: 3 } }],
            logs: ['before add'],
            continuationId: 'cont-1',
          }) as ExecuteResponse,
      })

      // Second response: done with value
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          ({
            status: 'done',
            success: true,
            value: 5,
            logs: ['after add'],
          }) as ExecuteResponse,
      })

      const driver = createCloudflareIsolateDriver({ workerUrl: WORKER_URL })
      const context = await driver.createContext({
        bindings: { add: addBinding },
      })

      const result = await context.execute(
        'const x = await add({ a: 2, b: 3 }); return x',
      )

      expect(result.success).toBe(true)
      expect(result.value).toBe(5)
      expect(result.logs).toEqual(['before add', 'after add'])

      expect(fetchMock).toHaveBeenCalledTimes(2)

      // First request: code + tools, no toolResults
      const body1: ExecuteRequest = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body1.toolResults).toBeUndefined()
      expect(body1.tools).toHaveLength(1)
      expect(body1.tools[0].name).toBe('add')

      // Second request: same code + tools + toolResults
      const body2: ExecuteRequest = JSON.parse(fetchMock.mock.calls[1][1].body)
      expect(body2.toolResults).toBeDefined()
      expect(body2.toolResults!['add_1']).toEqual({ success: true, value: 5 })
    })

    it('handles multiple tool calls in one round', async () => {
      const getA = makeBinding('getA', async () => 'A')
      const getB = makeBinding('getB', async () => 'B')

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          ({
            status: 'need_tools',
            toolCalls: [
              { id: 'getA_1', name: 'getA', args: {} },
              { id: 'getB_1', name: 'getB', args: {} },
            ],
            logs: [],
            continuationId: 'c1',
          }) as ExecuteResponse,
      })

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          ({
            status: 'done',
            success: true,
            value: 'AB',
            logs: [],
          }) as ExecuteResponse,
      })

      const driver = createCloudflareIsolateDriver({ workerUrl: WORKER_URL })
      const context = await driver.createContext({
        bindings: { getA, getB },
      })

      const result = await context.execute(
        'return (await getA({})) + (await getB({}))',
      )

      expect(result.success).toBe(true)
      expect(result.value).toBe('AB')

      const body2: ExecuteRequest = JSON.parse(fetchMock.mock.calls[1][1].body)
      expect(body2.toolResults!['getA_1']).toEqual({
        success: true,
        value: 'A',
      })
      expect(body2.toolResults!['getB_1']).toEqual({
        success: true,
        value: 'B',
      })
    })

    it('reports tool execution errors in toolResults', async () => {
      const failTool = makeBinding('failTool', async () => {
        throw new Error('Tool failed')
      })

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          ({
            status: 'need_tools',
            toolCalls: [{ id: 'failTool_1', name: 'failTool', args: {} }],
            logs: [],
            continuationId: 'c1',
          }) as ExecuteResponse,
      })

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          ({
            status: 'done',
            success: false,
            error: { name: 'Error', message: 'Tool call failed' },
            logs: [],
          }) as ExecuteResponse,
      })

      const driver = createCloudflareIsolateDriver({ workerUrl: WORKER_URL })
      const context = await driver.createContext({
        bindings: { failTool },
      })

      await context.execute('await failTool({})')

      const body2: ExecuteRequest = JSON.parse(fetchMock.mock.calls[1][1].body)
      expect(body2.toolResults!['failTool_1']).toEqual({
        success: false,
        error: 'Tool failed',
      })
    })

    it('returns error for unknown tool name in toolCalls', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          ({
            status: 'need_tools',
            toolCalls: [{ id: 'unknown_1', name: 'unknownTool', args: {} }],
            logs: [],
            continuationId: 'c1',
          }) as ExecuteResponse,
      })

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          ({
            status: 'done',
            success: false,
            error: { name: 'Error', message: 'Tool result not found' },
            logs: [],
          }) as ExecuteResponse,
      })

      const driver = createCloudflareIsolateDriver({ workerUrl: WORKER_URL })
      const context = await driver.createContext({ bindings: {} })

      const result = await context.execute('await unknownTool({})')

      const body2: ExecuteRequest = JSON.parse(fetchMock.mock.calls[1][1].body)
      expect(body2.toolResults!['unknown_1']).toEqual({
        success: false,
        error: 'Unknown tool: unknownTool',
      })
    })
  })

  describe('execute - max tool rounds', () => {
    it('returns MaxRoundsExceeded when Worker keeps returning need_tools', async () => {
      const config: CloudflareIsolateDriverConfig = {
        workerUrl: WORKER_URL,
        maxToolRounds: 2,
      }
      const driver = createCloudflareIsolateDriver(config)
      const addBinding = makeBinding('add', async () => 1)

      // Always return need_tools (simulate Worker never finishing)
      fetchMock.mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: async () =>
            ({
              status: 'need_tools',
              toolCalls: [{ id: 'add_1', name: 'add', args: {} }],
              logs: [],
              continuationId: 'c',
            }) as ExecuteResponse,
        }),
      )

      const context = await driver.createContext({
        bindings: { add: addBinding },
      })

      const result = await context.execute('await add({})')

      expect(result.success).toBe(false)
      expect(result.error?.name).toBe('MaxRoundsExceeded')
      expect(result.error?.message).toContain('2')
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })
  })

  describe('execute - error handling', () => {
    it('returns WorkerError when response is not ok', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      })

      const driver = createCloudflareIsolateDriver({ workerUrl: WORKER_URL })
      const context = await driver.createContext({ bindings: {} })

      const result = await context.execute('return 1')

      expect(result.success).toBe(false)
      expect(result.error?.name).toBe('WorkerError')
      expect(result.error?.message).toContain('500')
      expect(result.error?.message).toContain('Internal Server Error')
    })

    it('returns error when Worker returns status: error', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          ({
            status: 'error',
            error: {
              name: 'UnsafeEvalNotAvailable',
              message: 'UNSAFE_EVAL binding is not available',
            },
          }) as ExecuteResponse,
      })

      const driver = createCloudflareIsolateDriver({ workerUrl: WORKER_URL })
      const context = await driver.createContext({ bindings: {} })

      const result = await context.execute('return 1')

      expect(result.success).toBe(false)
      expect(result.error?.name).toBe('UnsafeEvalNotAvailable')
      expect(result.error?.message).toContain('UNSAFE_EVAL')
    })

    it('returns error when Worker returns status: done with success: false', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          ({
            status: 'done',
            success: false,
            error: {
              name: 'SyntaxError',
              message: 'Unexpected token',
              stack: '...',
            },
            logs: [],
          }) as ExecuteResponse,
      })

      const driver = createCloudflareIsolateDriver({ workerUrl: WORKER_URL })
      const context = await driver.createContext({ bindings: {} })

      const result = await context.execute('syntax error!!!')

      expect(result.success).toBe(false)
      expect(result.error?.name).toBe('SyntaxError')
      expect(result.error?.message).toBe('Unexpected token')
    })

    it('returns NetworkError when fetch throws', async () => {
      fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'))

      const driver = createCloudflareIsolateDriver({ workerUrl: WORKER_URL })
      const context = await driver.createContext({ bindings: {} })

      const result = await context.execute('return 1')

      expect(result.success).toBe(false)
      expect(result.error?.name).toBe('NetworkError')
      expect(result.error?.message).toContain('ECONNREFUSED')
    })
  })

  describe('dispose', () => {
    it('execute returns DisposedError after dispose', async () => {
      const driver = createCloudflareIsolateDriver({ workerUrl: WORKER_URL })
      const context = await driver.createContext({ bindings: {} })

      await context.dispose()

      const result = await context.execute('return 1')

      expect(result.success).toBe(false)
      expect(result.error?.name).toBe('DisposedError')
      expect(result.error?.message).toContain('disposed')
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })
})
