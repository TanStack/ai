import { describe, expect, it } from 'vitest'
import { emitDescriptors } from '../src/cli/emit'

describe('emitDescriptors', () => {
  it('emits a ServerDescriptor type per server with typed tool inputs', async () => {
    const out = await emitDescriptors({
      weather: {
        prefix: undefined,
        surface: {
          tools: [
            {
              name: 'get_weather',
              inputSchema: {
                type: 'object',
                properties: { city: { type: 'string' } },
                required: ['city'],
              },
            },
          ],
          resources: [],
          prompts: [],
          capabilities: { tools: {} },
        },
      },
    })
    expect(out).toContain('export interface WeatherServer')
    expect(out).toContain('get_weather')
    expect(out).toContain('city')
    // Combined pool map, keyed by config key, referencing the per-server interface.
    expect(out).toContain('export interface MCPServers')
    expect(out).toMatch(/'weather':\s*WeatherServer/)
  })
})
