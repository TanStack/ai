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
    expect(out).toMatch(/"weather":\s*WeatherServer/)
  })

  it('escapes hostile names and rejects pascal-case interface collisions', async () => {
    const surface = {
      tools: [
        {
          name: `quote'"\nbreak`,
          inputSchema: { type: 'object', properties: {} },
        },
      ],
      resources: [],
      prompts: [],
      capabilities: { tools: {} },
    }
    // Tool names with quotes/newlines must be escaped in the emitted TS.
    const out = await emitDescriptors({
      '1pm-server': { prefix: undefined, surface },
    })
    expect(out).toContain(JSON.stringify(`quote'"\nbreak`))
    // Leading digit gets an underscore prefix to stay a valid identifier.
    expect(out).toContain('export interface _1pmServerServer')

    // `foo-bar` and `foo_bar` pascal-case identically — must throw, not emit
    // duplicate interfaces.
    await expect(
      emitDescriptors({
        'foo-bar': { prefix: undefined, surface },
        foo_bar: { prefix: undefined, surface },
      }),
    ).rejects.toThrow(/collision/)
  })
})
