import { expect, it } from 'vitest'
import { CapabilityRegistry } from '@tanstack/ai/middlewares'

it('exports a working CapabilityRegistry from the built middlewares subpath', () => {
  expect(new CapabilityRegistry()).toBeInstanceOf(CapabilityRegistry)
})
