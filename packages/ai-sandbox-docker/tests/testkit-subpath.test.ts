import { expect, it } from 'vitest'
import { runSandboxCheckpointStoreConformance } from '@tanstack/ai-sandbox/testkit'

it('exports the checkpoint store conformance suite from the built testkit subpath', () => {
  expect(typeof runSandboxCheckpointStoreConformance).toBe('function')
})
