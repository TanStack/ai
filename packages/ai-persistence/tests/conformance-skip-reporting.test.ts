import { afterAll, describe, expect } from 'vitest'
import { composePersistence, memoryPersistence } from '../src'
import { runPersistenceConformance } from '../src/testkit/conformance'
import type { RunnerTask, RunnerTestCase } from 'vitest'

// A store that is absent and declared in `skip` must report its cases as
// skipped. A case that returns early without `ctx.skip` reports a pass that
// asserted nothing.
const OMITTED_STORES = ['activities', 'generationRuns', 'artifacts', 'blobs']

function collectCases(task: RunnerTask): Array<RunnerTestCase> {
  if (task.type === 'test') return [task]
  return task.tasks.flatMap(collectCases)
}

describe('conformance reporting for omitted stores', () => {
  runPersistenceConformance(
    'chat-only',
    () =>
      composePersistence(memoryPersistence(), {
        overrides: {
          activities: false,
          generationRuns: false,
          artifacts: false,
          blobs: false,
        },
      }),
    { skip: ['activities', 'generationRuns', 'artifacts', 'blobs'] },
  )

  // vitest requires a destructuring pattern as the first hook argument.
  // eslint-disable-next-line no-empty-pattern
  afterAll(({}, suite) => {
    const omittedCases = suite.tasks
      .flatMap(collectCases)
      .filter((testCase) => OMITTED_STORES.includes(testCase.suite?.name ?? ''))

    expect(omittedCases.length).toBeGreaterThan(0)
    for (const testCase of omittedCases) {
      expect(testCase.result?.state, testCase.name).toBe('skip')
    }
  })
})
