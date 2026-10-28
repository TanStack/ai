import type { MCPCodegenConfig } from './define-config'

export type { CodegenServerConfig, MCPCodegenConfig } from './define-config'
export { defineConfig } from './define-config'

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
