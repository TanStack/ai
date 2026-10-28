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
