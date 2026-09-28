import { Client } from '@modelcontextprotocol/client'
import { describe, expect, it } from 'vitest'
import { makeServerWithWeatherTool } from './in-memory-server'

describe('in-memory server helper', () => {
  it('lists get_weather and returns the city forecast', async () => {
    const { server, clientTransport } = await makeServerWithWeatherTool()
    const client = new Client({ name: 'helper-test', version: '1.0.0' })
    try {
      await client.connect(clientTransport)
      const listed = await client.listTools()
      const called = await client.callTool({
        name: 'get_weather',
        arguments: { city: 'Brooklyn' },
      })
      expect(listed.tools.map((tool) => tool.name)).toEqual(['get_weather'])
      expect(called.content).toEqual([
        { type: 'text', text: 'Sunny in Brooklyn' },
      ])
    } finally {
      await client.close()
      await server.close()
    }
  })
})
