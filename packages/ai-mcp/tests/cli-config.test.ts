import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { defineConfig } from '../src/cli/define-config'
import { loadConfig } from '../src/cli/config'

describe('defineConfig', () => {
  it('returns the config verbatim (identity helper for typing)', () => {
    const cfg = defineConfig({
      servers: {
        weather: { transport: { type: 'http', url: 'https://x/mcp' } },
      },
      outFile: './mcp-types.generated.ts',
    })
    expect(cfg.servers.weather?.transport.type).toBe('http')
  })
})

describe('loadConfig', () => {
  let tmpDir: string | undefined

  afterEach(() => {
    if (tmpDir) {
      rmSync(tmpDir, { recursive: true, force: true })
      tmpDir = undefined
    }
  })

  it('JSON fallback: reads and parses mcp.config.json when no .ts file exists', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'mcp-cfg-'))
    const configContent = {
      servers: {
        weather: {
          transport: { type: 'http', url: 'https://x/mcp' },
        },
      },
      outFile: './mcp-types.generated.ts',
    }
    writeFileSync(
      join(tmpDir, 'mcp.config.json'),
      JSON.stringify(configContent),
    )

    const cfg = await loadConfig(tmpDir)

    const transport = cfg.servers['weather']?.transport
    expect(transport?.type).toBe('http')
    if (transport?.type === 'http' || transport?.type === 'sse') {
      expect(transport.url).toBe('https://x/mcp')
    }
    expect(cfg.outFile).toBe('./mcp-types.generated.ts')
  })

  it('throw on missing: rejects with the real error message when no config file exists', async () => {
    tmpDir = mkdtempSync(join(tmpdir(), 'mcp-cfg-empty-'))

    await expect(loadConfig(tmpDir)).rejects.toThrow(
      /No mcp\.config\.ts or mcp\.config\.json found in /,
    )
    await expect(loadConfig(tmpDir)).rejects.toThrow(tmpDir)
  })
})
