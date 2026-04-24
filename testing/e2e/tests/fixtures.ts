import { test as base } from '@playwright/test'

const AIMOCK_PORT = 4010

export type AIMockFixture = {
  testId: string
  aimockPort: number
}

// aimock is started in globalSetup and shared across all workers.
// Tests only need testId (for sequenceIndex isolation) and aimockPort.
export const test = base.extend<AIMockFixture>({
  aimockPort: [
    async ({}, use) => {
      await use(AIMOCK_PORT)
    },
    { scope: 'worker' },
  ],

  // Test-scoped: unique ID per test for sequenceIndex isolation
  testId: async ({}, use, testInfo) => {
    const id = `${testInfo.workerIndex}-${testInfo.testId}`
    await use(id)
  },
})

export { expect } from '@playwright/test'
