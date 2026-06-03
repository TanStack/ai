import { describe, expect, it } from 'vitest'
import { defineConfig } from '../src/cli/config'

describe('defineConfig', () => {
  it('returns the config verbatim (identity helper for typing)', () => {
    const cfg = defineConfig({
      servers: { weather: { transport: { type: 'http', url: 'https://x/mcp' } } },
      outFile: './mcp-types.generated.ts',
    })
    expect(cfg.servers.weather?.transport.type).toBe('http')
  })
})
