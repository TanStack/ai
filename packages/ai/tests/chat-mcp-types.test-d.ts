import { expectTypeOf } from 'vitest'
import type { MCPToolSource } from '../src'

// A plain object with tools()/close() satisfies the structural interface.
const fake = {
  tools: async () => [],
  close: async () => {},
}
expectTypeOf(fake).toMatchTypeOf<MCPToolSource>()
