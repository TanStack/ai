import { expect, it } from 'vitest'
import { inMemory } from '@tanstack/ai-memory/in-memory'
import { runMemoryAdapterContract } from '@tanstack/ai-memory/testkit'

it('exports runMemoryAdapterContract from the built testkit subpath', () => {
  expect(typeof runMemoryAdapterContract).toBe('function')
})

runMemoryAdapterContract('published testkit consumer', () => inMemory())
