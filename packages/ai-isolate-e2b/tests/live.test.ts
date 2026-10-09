/**
 * Live suite against real E2B sandboxes. Runs only with `E2B_API_KEY`; every
 * sandbox it creates is killed in `afterAll`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Sandbox } from 'e2b'
import { toolDefinition } from '@tanstack/ai'
import { createCodeMode } from '@tanstack/ai-code-mode'
import { z } from 'zod'
import { createE2BIsolateDriver } from '../src/index'

const apiKey = process.env.E2B_API_KEY

/** Processes of this driver carry the runner path in their command line. */
async function runnerProcesses(sandbox: Sandbox): Promise<string> {
  // The bracket stops pgrep from matching its own command line.
  const ps = await sandbox.commands.run(
    'pgrep -af "[t]anstack-code-mode" || true',
  )
  return ps.stdout.trim()
}

describe.skipIf(!apiKey)('e2b isolate driver (live)', () => {
  let sandbox: Sandbox

  beforeAll(async () => {
    sandbox = await Sandbox.create({ timeoutMs: 5 * 60_000 })
  }, 60_000)

  afterAll(async () => {
    await sandbox?.kill()
  })

  it('runs Code Mode end to end with a host tool', async () => {
    let calls = 0
    const add = toolDefinition({
      name: 'add',
      description: 'Add two numbers.',
      inputSchema: z.object({ x: z.number(), y: z.number() }),
    }).server(async ({ x, y }) => {
      calls++
      return x + y
    })
    const { tool } = createCodeMode({
      driver: createE2BIsolateDriver({ sandbox }),
      tools: [add],
    })
    const result = await tool.execute!({
      typescriptCode: `const a: number = await external_add({ x: 1, y: 2 })
        console.log('a is', a)
        const b: number = await external_add({ x: a, y: 10 })
        return b * 10`,
    })
    expect(result).toMatchObject({
      success: true,
      result: 130,
      logs: ['a is 3'],
    })
    expect(calls).toBe(2)
  }, 60_000)

  it('kills the process in the sandbox on timeout and leaves no file behind', async () => {
    const context = await createE2BIsolateDriver({ sandbox }).createContext({
      bindings: {},
      timeout: 3000,
    })
    const result = await context.execute('while (true) {}')
    expect(result.error?.name).toBe('TimeoutError')
    expect(await runnerProcesses(sandbox)).toBe('')
    const leftovers = await sandbox.commands.run(
      'ls /tmp | grep tanstack-code-mode || true',
    )
    expect(leftovers.stdout.trim()).toBe('')
  }, 60_000)

  it('kills processes the code spawned once the execution returns', async () => {
    const context = await createE2BIsolateDriver({ sandbox }).createContext({
      bindings: {},
    })
    const result = await context.execute(
      `process.mainModule.require('node:child_process')
         .spawn('sleep', ['600'], { stdio: 'ignore' })
       return 'spawned'`,
    )
    expect(result.value).toBe('spawned')
    await context.dispose()
    const ps = await sandbox.commands.run('pgrep -af "[s]leep 600" || true')
    expect(ps.stdout.trim()).toBe('')
  }, 60_000)

  it('enforces the memory limit', async () => {
    const context = await createE2BIsolateDriver({ sandbox }).createContext({
      bindings: {},
      memoryLimit: 32,
      timeout: 20_000,
    })
    const result = await context.execute(
      'const a = []; for (;;) a.push(new Array(1e6).fill(1))',
    )
    expect(result.error?.name).toBe('MemoryLimitError')
  }, 60_000)

  it('disposing one context leaves another execution in the same sandbox running', async () => {
    const driver = createE2BIsolateDriver({ sandbox })
    const first = await driver.createContext({ bindings: {} })
    const second = await driver.createContext({ bindings: {} })
    const hung = first.execute('await new Promise(() => {})')
    const slow = second.execute(
      "await new Promise((r) => setTimeout(r, 3000)); return 'second'",
    )
    await new Promise((r) => setTimeout(r, 1500))
    await first.dispose()
    expect((await hung).error?.name).toBe('DisposedError')
    expect(await slow).toMatchObject({ success: true, value: 'second' })
    expect(await runnerProcesses(sandbox)).toBe('')
  }, 60_000)

  it('reports a killed sandbox as unavailable', async () => {
    const gone = await Sandbox.create({ timeoutMs: 60_000 })
    await gone.kill()
    const context = await createE2BIsolateDriver({
      sandbox: gone,
    }).createContext({ bindings: {} })
    const result = await context.execute('return 1')
    expect(result.error?.name).toBe('E2BSandboxUnavailableError')
  }, 60_000)
})
