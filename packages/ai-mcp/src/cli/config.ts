import type { TransportConfig } from '../transport'

export interface CodegenServerConfig {
  transport: TransportConfig
  /** Tool-name prefix; must match the runtime `createMCPClient({ prefix })`. */
  prefix?: string
}

export interface MCPCodegenConfig {
  servers: Record<string, CodegenServerConfig>
  /** Output file for the generated descriptor types. */
  outFile: string
}

export function defineConfig(config: MCPCodegenConfig): MCPCodegenConfig {
  return config
}

/** Load mcp.config.ts (via jiti) or mcp.config.json from cwd. */
export async function loadConfig(cwd: string): Promise<MCPCodegenConfig> {
  const { existsSync } = await import('node:fs')
  const { join } = await import('node:path')
  const tsPath = join(cwd, 'mcp.config.ts')
  const jsonPath = join(cwd, 'mcp.config.json')
  if (existsSync(tsPath)) {
    const { createJiti } = await import('jiti')
    const jiti = createJiti(import.meta.url)
    const mod = await jiti.import<{ default: MCPCodegenConfig }>(tsPath)
    return mod.default
  }
  if (existsSync(jsonPath)) {
    const { readFileSync } = await import('node:fs')
    return JSON.parse(readFileSync(jsonPath, 'utf8')) as MCPCodegenConfig
  }
  throw new Error('No mcp.config.ts or mcp.config.json found in ' + cwd)
}
