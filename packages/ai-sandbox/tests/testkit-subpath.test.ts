import { describe, expect, it } from 'vitest'
import {
  makeFakeShellSpawn,
  runJournalConformance,
  runSandboxCheckpointForkConformance,
  runSandboxCheckpointStoreConformance,
  runTakeoverConformance,
} from '@tanstack/ai-sandbox/testkit'
import { memorySandboxSnapshots } from '@tanstack/ai-sandbox'

runSandboxCheckpointForkConformance(
  'published testkit consumer',
  memorySandboxSnapshots,
)

/**
 * Proves the `@tanstack/ai-sandbox/testkit` subpath resolves as a consumer
 * would resolve it.
 */
describe('@tanstack/ai-sandbox/testkit subpath', () => {
  it('ships the provider and checkpoint conformance suites', () => {
    expect(typeof runJournalConformance).toBe('function')
    expect(typeof runSandboxCheckpointForkConformance).toBe('function')
    expect(typeof runSandboxCheckpointStoreConformance).toBe('function')
    expect(typeof runTakeoverConformance).toBe('function')
  })

  it('exports a working makeFakeShellSpawn', async () => {
    const spawn = makeFakeShellSpawn()
    await spawn.stdin.write('pwd; echo hi\n')
    const first = await spawn.stdout[Symbol.asyncIterator]().next()
    expect(first).toEqual({ value: '/workspace\n', done: false })
    await spawn.stdin.end()
    expect(await spawn.wait()).toBe(0)
  })
})
