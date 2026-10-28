import { CodeLanguage, Daytona } from '@daytona/sdk'
import { describe, expect, it } from 'vitest'
import { createDaytonaIsolateDriver } from '../src/isolate-driver'
import { DAYTONA_RESULT_MARKER } from '../src/wrap-code'
import type { ToolBinding } from '@tanstack/ai-code-mode'
import type {
  DaytonaCodeRunParams,
  DaytonaCodeRunResponse,
  DaytonaExecutionEnvelope,
  DaytonaSandboxLike,
} from '../src/types'

const liveEnabled =
  process.env.DAYTONA_LIVE_TEST === '1' &&
  process.env.DAYTONA_API_KEY !== undefined &&
  process.env.DAYTONA_API_KEY.length > 0

const CREATE_TIMEOUT_SECONDS = 90
const DELETE_TIMEOUT_SECONDS = 60
const CODE_RUN_TIMEOUT_MS = 30_000

type LiveSandbox = Awaited<ReturnType<Daytona['create']>>

interface RawCodeRunCall {
  code: string
  params?: DaytonaCodeRunParams | undefined
  timeoutSeconds?: number | undefined
  response?: DaytonaCodeRunResponse | undefined
}

interface InstrumentedSandbox {
  sandbox: DaytonaSandboxLike
  calls: Array<RawCodeRunCall>
}

interface CleanupReport {
  attempted: boolean
  succeeded: boolean
}

interface SandboxRunReport<T> {
  result?: T | undefined
  error?: unknown
  cleanup: CleanupReport
}

function outputFromResponse(response: DaytonaCodeRunResponse): string {
  return response.artifacts?.stdout ?? response.result ?? ''
}

function parseRawEnvelope(
  response: DaytonaCodeRunResponse,
): DaytonaExecutionEnvelope {
  const markerLine = outputFromResponse(response)
    .split(/\r?\n/)
    .reverse()
    .find((line) => line.startsWith(DAYTONA_RESULT_MARKER))

  if (!markerLine) {
    throw new Error('raw Daytona response did not include the marker envelope')
  }

  const jsonStart = markerLine.indexOf('{', DAYTONA_RESULT_MARKER.length)
  if (jsonStart === -1) {
    throw new Error('raw Daytona marker line did not include a JSON envelope')
  }

  return JSON.parse(markerLine.slice(jsonStart)) as DaytonaExecutionEnvelope
}

function hasMarker(response: DaytonaCodeRunResponse): boolean {
  return [response.artifacts?.stdout, response.result].some(
    (value) => value?.includes(DAYTONA_RESULT_MARKER) === true,
  )
}

function instrumentSandbox(sandbox: LiveSandbox): InstrumentedSandbox {
  const calls: Array<RawCodeRunCall> = []

  return {
    calls,
    sandbox: {
      process: {
        codeRun: async (code, params, timeoutSeconds) => {
          const call: RawCodeRunCall = { code, params, timeoutSeconds }
          calls.push(call)
          const response = (await sandbox.process.codeRun(
            code,
            params,
            timeoutSeconds,
          )) as DaytonaCodeRunResponse
          call.response = response
          return response
        },
      },
    },
  }
}

function makeBinding(
  name: string,
  execute: (args: unknown) => Promise<unknown>,
): ToolBinding {
  return {
    name,
    description: `${name} live test tool`,
    inputSchema: { type: 'object', additionalProperties: true },
    execute,
  }
}

function expectSuccess<T>(result: {
  success: boolean
  value?: T
  error?: { name: string; message: string }
}): T {
  expect(result.error?.message).toBeUndefined()
  expect(result.success).toBe(true)
  return result.value as T
}

function uniqueSandboxName(language: CodeLanguage): string {
  const suffix = Math.random().toString(36).slice(2, 8)
  return `tanstack-ai-live-${language}-${Date.now()}-${suffix}`
}

async function captureWithLiveSandbox<T>(
  language: CodeLanguage,
  callback: (sandbox: LiveSandbox) => Promise<T>,
): Promise<SandboxRunReport<T>> {
  const daytona = new Daytona()
  const cleanup: CleanupReport = { attempted: false, succeeded: false }
  let sandbox: LiveSandbox | undefined
  let result: T | undefined
  let error: unknown

  try {
    sandbox = await daytona.create(
      {
        language,
        name: uniqueSandboxName(language),
        labels: {
          package: 'tanstack-ai-isolate-daytona',
          test: 'live-harness',
        },
        ephemeral: true,
        autoStopInterval: 5,
      },
      { timeout: CREATE_TIMEOUT_SECONDS },
    )
    result = await callback(sandbox)
  } catch (caught) {
    error = caught
  } finally {
    if (sandbox !== undefined) {
      cleanup.attempted = true
      await sandbox.delete(DELETE_TIMEOUT_SECONDS)
      cleanup.succeeded = true
    }
  }

  return { result, error, cleanup }
}

async function withLiveSandbox<T>(
  language: CodeLanguage,
  callback: (sandbox: LiveSandbox) => Promise<T>,
): Promise<{ result: T; cleanup: CleanupReport }> {
  const report = await captureWithLiveSandbox(language, callback)
  expect(report.cleanup.attempted).toBe(true)
  expect(report.cleanup.succeeded).toBe(true)
  if (report.error !== undefined) {
    throw report.error
  }
  return { result: report.result as T, cleanup: report.cleanup }
}

async function runLanguageSmoke(language: CodeLanguage): Promise<void> {
  await withLiveSandbox(language, async (liveSandbox) => {
    const instrumented = instrumentSandbox(liveSandbox)
    const add = makeBinding('external_add', (args) => {
      const input = args as { a: number; b: number }
      return Promise.resolve(input.a + input.b)
    })
    const driver = createDaytonaIsolateDriver({
      sandbox: instrumented.sandbox,
      timeout: CODE_RUN_TIMEOUT_MS,
    })
    const context = await driver.createContext({
      bindings: { external_add: add },
    })

    const smoke = await context.execute<number>('return 42')
    expectSuccess(smoke)
    expect(smoke.value).toBe(42)
    expect(instrumented.calls[0]?.response).toBeDefined()
    expect(hasMarker(instrumented.calls[0]!.response!)).toBe(true)

    const toolResult = await context.execute<number>(
      'return await external_add({ a: 20, b: 22 })',
    )
    expectSuccess(toolResult)
    expect(toolResult.value).toBe(42)
    expect(instrumented.calls.at(-1)?.code).toContain('"tc_0"')
  })
}

describe('Daytona live harness gate', () => {
  it.skipIf(liveEnabled)(
    'does not run live Daytona scenarios without explicit credentials',
    () => {
      expect(liveEnabled).toBe(false)
    },
  )
})

describe.skipIf(!liveEnabled)(
  'Daytona live Code Mode harness',
  () => {
    it('executes TypeScript Code Mode programs and tool replay against real Daytona', async () => {
      await withLiveSandbox(CodeLanguage.TYPESCRIPT, async (liveSandbox) => {
        const instrumented = instrumentSandbox(liveSandbox)
        const capturedArgs: Array<unknown> = []
        const externalAdd = makeBinding('external_add', (args) => {
          const input = args as { a: number; b: number }
          return Promise.resolve(input.a + input.b)
        })
        const externalA = makeBinding('external_a', (args) => {
          capturedArgs.push(args)
          return Promise.resolve('A')
        })
        const externalB = makeBinding('external_b', () => Promise.resolve('B'))
        const externalEchoArgs = makeBinding('external_echoArgs', (args) => {
          capturedArgs.push(args)
          return Promise.resolve(args)
        })
        const externalPayload = makeBinding('external_payload', () =>
          Promise.resolve({
            nested: { ok: true, list: [1, 'two', null] },
            text: 'line 1\nline 2 "quoted" unicode snowman',
          }),
        )
        const externalFail = makeBinding('external_fail', () =>
          Promise.reject(new Error('host tool exploded')),
        )
        const bindings = {
          external_add: externalAdd,
          external_a: externalA,
          external_b: externalB,
          external_echoArgs: externalEchoArgs,
          external_payload: externalPayload,
          external_fail: externalFail,
        }
        const driver = createDaytonaIsolateDriver({
          sandbox: instrumented.sandbox,
          timeout: CODE_RUN_TIMEOUT_MS,
        })
        const context = await driver.createContext({ bindings })

        const simple = await context.execute<number>('return 42')
        expect(simple.success).toBe(true)
        expect(simple.value).toBe(42)

        const firstRawResponse = instrumented.calls[0]?.response
        expect(firstRawResponse).toBeDefined()
        expect(hasMarker(firstRawResponse!)).toBe(true)
        expect(parseRawEnvelope(firstRawResponse!).status).toBe('done')

        const consoleResult = await context.execute<string>(`
            console.log('log line', { count: 1 });
            console.warn('warn line');
            console.error('error line');
            return 'console-ok';
          `)
        expect(consoleResult.success).toBe(true)
        expect(consoleResult.value).toBe('console-ok')
        expect(consoleResult.logs).toEqual([
          'log line {"count":1}',
          'WARN: warn line',
          'ERROR: error line',
        ])

        const asyncResult = await context.execute<Array<number>>(`
            const one = await Promise.resolve(1);
            const two = await new Promise((resolve) => setTimeout(() => resolve(2), 10));
            const rest = await Promise.all([Promise.resolve(3), Promise.resolve(4)]);
            return [one, two, ...rest];
          `)
        expect(asyncResult.success).toBe(true)
        expect(asyncResult.value).toEqual([1, 2, 3, 4])

        const oneTool = await context.execute<number>(
          'return await external_add({ a: 19, b: 23 })',
        )
        expect(oneTool.success).toBe(true)
        expect(oneTool.value).toBe(42)

        const beforeSequential = instrumented.calls.length
        const sequential = await context.execute<number>(`
            const first = await external_add({ a: 1, b: 2 });
            const second = await external_add({ a: first, b: 4 });
            return second;
          `)
        expect(sequential.success).toBe(true)
        expect(sequential.value).toBe(7)
        const sequentialCalls = instrumented.calls.slice(beforeSequential)
        expect(sequentialCalls).toHaveLength(3)
        expect(sequentialCalls[1]?.code).toContain('"tc_0"')
        expect(sequentialCalls[1]?.code).not.toContain('"tc_1"')
        expect(sequentialCalls[2]?.code).toContain('"tc_0"')
        expect(sequentialCalls[2]?.code).toContain('"tc_1"')

        const beforeBatch = instrumented.calls.length
        const batch = await context.execute<Array<string>>(`
            return await Promise.all([
              external_a({ label: 'left' }),
              external_b({ label: 'right' }),
            ]);
          `)
        expect(batch.success).toBe(true)
        expect(batch.value).toEqual(['A', 'B'])
        const batchEnvelope = parseRawEnvelope(
          instrumented.calls[beforeBatch]!.response!,
        )
        expect(batchEnvelope.status).toBe('need_tools')
        if (batchEnvelope.status === 'need_tools') {
          expect(batchEnvelope.toolCalls.map((call) => call.id)).toEqual([
            'tc_0',
            'tc_1',
          ])
          expect(batchEnvelope.toolCalls.map((call) => call.name)).toEqual([
            'external_a',
            'external_b',
          ])
        }
        expect(instrumented.calls[beforeBatch + 1]?.code).toContain('"tc_0"')
        expect(instrumented.calls[beforeBatch + 1]?.code).toContain('"tc_1"')

        const serializedArgs = {
          nested: { quotes: '"hello"', newline: 'a\nb', unicode: 'snowman' },
          array: [1, true, null, { ok: false }],
        }
        const argsResult = await context.execute<typeof serializedArgs>(
          `return await external_echoArgs(${JSON.stringify(serializedArgs)})`,
        )
        expect(argsResult.success).toBe(true)
        expect(argsResult.value).toEqual(serializedArgs)
        expect(capturedArgs).toContainEqual(serializedArgs)

        const payloadResult = await context.execute<{
          nested: { ok: boolean; list: Array<unknown> }
          text: string
        }>('return await external_payload({})')
        expect(payloadResult.success).toBe(true)
        expect(payloadResult.value).toEqual({
          nested: { ok: true, list: [1, 'two', null] },
          text: 'line 1\nline 2 "quoted" unicode snowman',
        })

        const beforeToolError = instrumented.calls.length
        const toolError = await context.execute(
          'return await external_fail({})',
        )
        expect(toolError.success).toBe(false)
        expect(toolError.error?.message).toContain('host tool exploded')
        expect(instrumented.calls[beforeToolError + 1]?.code).toContain(
          '"success":false',
        )
        expect(instrumented.calls[beforeToolError + 1]?.code).toContain(
          'host tool exploded',
        )

        const stdoutNoise = await context.execute<string>(`
            globalThis.console.log('stdout noise before marker');
            return 'noise-ok';
          `)
        expect(stdoutNoise.success).toBe(true)
        expect(stdoutNoise.value).toBe('noise-ok')

        const markerValue = `${DAYTONA_RESULT_MARKER} inside returned value`
        const markerResult = await context.execute<string>(
          `return ${JSON.stringify(markerValue)}`,
        )
        expect(markerResult.success).toBe(true)
        expect(markerResult.value).toBe(markerValue)

        const runtimeError = await context.execute(`
            console.log('before boom');
            throw new TypeError('boom');
          `)
        expect(runtimeError.success).toBe(false)
        expect(runtimeError.error?.name).toBe('TypeError')
        expect(runtimeError.error?.message).toBe('boom')
        expect(runtimeError.logs).toEqual(['before boom'])

        const syntaxError = await context.execute('const broken = ;')
        expect(syntaxError.success).toBe(false)
        expect(syntaxError.error?.message).toMatch(
          /Code Mode marker|Failed to execute code in Daytona sandbox/,
        )

        const beforeFreshExecute = instrumented.calls.length
        const firstFresh = await context.execute<number>(
          'return await external_add({ a: 1, b: 1 })',
        )
        const secondFresh = await context.execute<number>(
          'return await external_add({ a: 2, b: 2 })',
        )
        expect(firstFresh.success).toBe(true)
        expect(secondFresh.success).toBe(true)
        const freshCalls = instrumented.calls.slice(beforeFreshExecute)
        expect(freshCalls[0]?.code).toContain('const __toolResults = {};')
        const firstFreshEnvelope = parseRawEnvelope(freshCalls[0]!.response!)
        expect(firstFreshEnvelope.status).toBe('need_tools')
        if (firstFreshEnvelope.status === 'need_tools') {
          expect(firstFreshEnvelope.toolCalls.map((call) => call.id)).toEqual([
            'tc_0',
          ])
        }
        expect(freshCalls[2]?.code).toContain('const __toolResults = {};')
        expect(freshCalls[2]?.code).not.toContain('"tc_0"')
        const secondFreshEnvelope = parseRawEnvelope(freshCalls[2]!.response!)
        expect(secondFreshEnvelope.status).toBe('need_tools')
        if (secondFreshEnvelope.status === 'need_tools') {
          expect(secondFreshEnvelope.toolCalls.map((call) => call.id)).toEqual([
            'tc_0',
          ])
        }

        const beforeDispose = instrumented.calls.length
        await context.dispose()
        const disposed = await context.execute('return 1')
        expect(disposed.success).toBe(false)
        expect(disposed.error?.name).toBe('DisposedError')
        expect(instrumented.calls).toHaveLength(beforeDispose)
      })
    }, 180_000)

    it('counts maxToolRounds as callback rounds, not total codeRun calls', async () => {
      await withLiveSandbox(CodeLanguage.TYPESCRIPT, async (liveSandbox) => {
        const instrumented = instrumentSandbox(liveSandbox)
        const externalAdd = makeBinding('external_add', (args) => {
          const input = args as { a: number; b: number }
          return Promise.resolve(input.a + input.b)
        })
        const driver = createDaytonaIsolateDriver({
          sandbox: instrumented.sandbox,
          timeout: CODE_RUN_TIMEOUT_MS,
          maxToolRounds: 1,
        })
        const context = await driver.createContext({
          bindings: { external_add: externalAdd },
        })

        const oneRound = await context.execute<number>(
          'return await external_add({ a: 20, b: 22 })',
        )
        expect(oneRound.success).toBe(true)
        expect(oneRound.value).toBe(42)

        const beforeTwoRound = instrumented.calls.length
        const twoRounds = await context.execute<number>(`
            const first = await external_add({ a: 1, b: 1 });
            return await external_add({ a: first, b: 1 });
          `)
        expect(twoRounds.success).toBe(false)
        expect(twoRounds.error?.name).toBe('MaxRoundsExceeded')
        expect(instrumented.calls.slice(beforeTwoRound)).toHaveLength(2)
      })
    }, 120_000)

    it('returns a clear failure when Daytona codeRun times out', async () => {
      await withLiveSandbox(CodeLanguage.TYPESCRIPT, async (liveSandbox) => {
        const instrumented = instrumentSandbox(liveSandbox)
        const driver = createDaytonaIsolateDriver({
          sandbox: instrumented.sandbox,
          timeout: 1000,
        })
        const context = await driver.createContext({ bindings: {} })

        const result = await context.execute(`
            await new Promise((resolve) => setTimeout(resolve, 10_000));
            return 'late';
          `)

        expect(instrumented.calls[0]?.timeoutSeconds).toBe(1)
        expect(result.success).toBe(false)
        expect(result.error?.name).toBe('TimeoutError')
        expect(result.error?.message).toMatch(/timeout|timed out|execute/i)
      })
    }, 90_000)

    it('reports wrong sandbox language execution without a marker-shaped success', async () => {
      await withLiveSandbox(CodeLanguage.PYTHON, async (liveSandbox) => {
        const instrumented = instrumentSandbox(liveSandbox)
        const driver = createDaytonaIsolateDriver({
          sandbox: instrumented.sandbox,
          timeout: CODE_RUN_TIMEOUT_MS,
        })
        const context = await driver.createContext({ bindings: {} })

        const result = await context.execute('return 42')

        expect(result.success).toBe(false)
        expect(result.error?.message).toMatch(
          /Code Mode marker|Failed to execute code in Daytona sandbox/,
        )
      })
    }, 120_000)

    it('always deletes live sandboxes after passing and failing callbacks', async () => {
      const passing = await captureWithLiveSandbox(
        CodeLanguage.TYPESCRIPT,
        async (sandbox) => {
          await sandbox.process.codeRun('console.log("cleanup pass")')
          return 'passed'
        },
      )
      expect(passing.error).toBeUndefined()
      expect(passing.result).toBe('passed')
      expect(passing.cleanup).toEqual({ attempted: true, succeeded: true })

      const failing = await captureWithLiveSandbox(
        CodeLanguage.TYPESCRIPT,
        () => Promise.reject(new Error('forced cleanup failure path')),
      )
      expect(failing.error).toBeInstanceOf(Error)
      expect(failing.cleanup).toEqual({ attempted: true, succeeded: true })
    }, 180_000)

    it('keeps the README language claims honest for TypeScript and JavaScript', async () => {
      await runLanguageSmoke(CodeLanguage.TYPESCRIPT)
      await runLanguageSmoke(CodeLanguage.JAVASCRIPT)
    }, 180_000)
  },
  300_000,
)
