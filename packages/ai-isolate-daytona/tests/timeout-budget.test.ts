import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createDaytonaIsolateDriver } from '../src/isolate-driver'
import { DAYTONA_RESULT_MARKER } from '../src/wrap-code'
import type { ToolBinding } from '@tanstack/ai-code-mode'
import type {
  DaytonaCodeRunResponse,
  DaytonaExecutionEnvelope,
  DaytonaSandboxLike,
} from '../src/types'

// Each test controls the clock, so every timeout branch runs on every run.
let clock = 0

beforeEach(() => {
  clock = 0
  vi.spyOn(Date, 'now').mockImplementation(() => clock)
})

afterEach(() => {
  vi.restoreAllMocks()
})

/** A sandbox whose codeRun answers with `response`, using the marker in the code. */
function sandboxFor(
  codeRun: () => Promise<DaytonaExecutionEnvelope>,
): DaytonaSandboxLike {
  return {
    process: {
      codeRun: async (code): Promise<DaytonaCodeRunResponse> => {
        const marker =
          code.match(/"(__TANSTACK_AI_CODE_MODE_RESULT__:[^"]+)"/)?.[1] ??
          DAYTONA_RESULT_MARKER
        const stdout = `${marker}${JSON.stringify(await codeRun())}`
        return { exitCode: 0, result: stdout, artifacts: { stdout } }
      },
    },
  }
}

function binding(execute: () => Promise<unknown>): ToolBinding {
  return {
    name: 'add',
    description: 'add tool',
    inputSchema: { type: 'object', properties: {} },
    execute,
  }
}

const needAdd: DaytonaExecutionEnvelope = {
  status: 'need_tools',
  toolCalls: [{ id: 'tc_0', name: 'add', args: {} }],
  logs: ['before'],
}

async function run(
  codeRun: () => Promise<DaytonaExecutionEnvelope>,
  execute: () => Promise<unknown> = async () => 1,
) {
  const driver = createDaytonaIsolateDriver({
    sandbox: sandboxFor(codeRun),
    timeout: 50,
  })
  const context = await driver.createContext({
    bindings: { add: binding(execute) },
  })
  return context.execute('return await add({})')
}

describe('Daytona timeout budget', () => {
  it('times out before the first code run when the budget is used up', async () => {
    const codeRun = vi.fn(async () => needAdd)
    const driver = createDaytonaIsolateDriver({
      sandbox: sandboxFor(codeRun),
      timeout: 50,
    })
    const context = await driver.createContext({ bindings: {} })
    // The deadline reads 0, the first check reads 100.
    vi.mocked(Date.now).mockReturnValueOnce(0).mockReturnValue(100)

    const result = await context.execute('return 1')

    expect(result.error?.name).toBe('TimeoutError')
    expect(codeRun).not.toHaveBeenCalled()
  })

  it('times out when the code run does not answer in time', async () => {
    const result = await run(() => new Promise(() => {}))

    expect(result.error?.name).toBe('TimeoutError')
  })

  it('times out before the tools when the code run used the budget', async () => {
    const execute = vi.fn(async () => 1)
    const result = await run(async () => {
      clock = 100
      return needAdd
    }, execute)

    expect(result.error?.name).toBe('TimeoutError')
    expect(result.logs).toEqual(['before'])
    expect(execute).not.toHaveBeenCalled()
  })

  it('times out when the tools do not answer in time', async () => {
    const codeRun = vi.fn(async () => needAdd)
    const result = await run(codeRun, () => new Promise(() => {}))

    expect(result.error?.name).toBe('TimeoutError')
    expect(codeRun).toHaveBeenCalledTimes(1)
  })

  it('times out after the tools when they used the budget', async () => {
    const codeRun = vi.fn(async () => needAdd)
    const result = await run(codeRun, async () => {
      clock = 100
      return 1
    })

    expect(result.error?.name).toBe('TimeoutError')
    expect(codeRun).toHaveBeenCalledTimes(1)
  })
})
