import { describe, expect, it } from 'vitest'
import { introspectFromTransport } from '../src/cli/introspect'
import { makeFullServer } from './helpers/in-memory-server'

describe('introspect', () => {
  it('reads the full server surface', async () => {
    const { clientTransport } = await makeFullServer()
    const surface = await introspectFromTransport(clientTransport)
    expect(surface.tools.length).toBeGreaterThan(0)
    expect(surface.capabilities).toBeDefined()
    expect(surface.resources.length).toBeGreaterThan(0)
    expect(surface.prompts.length).toBeGreaterThan(0)
  })
})
