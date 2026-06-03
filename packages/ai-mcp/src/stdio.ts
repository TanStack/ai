import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { StdioTransportConfig } from './transport'

/** Build a stdio transport instance to pass as `createMCPClient({ transport })`. Node-only. */
export function stdioTransport(
  config: Omit<StdioTransportConfig, 'type'>,
): Transport {
  return new StdioClientTransport({
    command: config.command,
    args: config.args,
    env: config.env,
    cwd: config.cwd,
  })
}
