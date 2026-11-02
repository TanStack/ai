import { describe, expect, it } from 'vitest'
import { createMCPClient, createMCPClientFromTransport } from '../src/client'
import { MCPConnectionError } from '../src/errors'
import {
  makeFullServer,
  makeServerWithWeatherTool,
} from './helpers/in-memory-server'

describe('MCP client request signals', () => {
  it('connect rejects when its signal is aborted', async () => {
    const { clientTransport } = await makeServerWithWeatherTool()
    const error = await createMCPClient({
      transport: clientTransport,
      signal: AbortSignal.abort(),
    }).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(MCPConnectionError)
  })

  it('tools, resources, templates, prompts, and their reads take a signal', async () => {
    const { clientTransport } = await makeFullServer()
    await using client = await createMCPClientFromTransport(clientTransport)
    const signal = AbortSignal.abort()
    const results = await Promise.allSettled([
      client.tools({ signal }),
      client.resources({ signal }),
      client.readResource('file:///a', { signal }),
      client.resourceTemplates({ signal }),
      client.prompts({ signal }),
      client.getPrompt('p', undefined, { signal }),
    ])
    expect(results.map((r) => r.status)).toEqual(
      Array.from({ length: 6 }, () => 'rejected'),
    )
    // Without a signal the same client still works.
    await expect(client.tools()).resolves.toBeDefined()
    await expect(client.resources()).resolves.toBeDefined()
  })
})
