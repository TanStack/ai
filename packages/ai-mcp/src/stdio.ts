import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import type { StdioTransportConfig } from './transport'

/**
 * Build a stdio Transport to pass as `createMCPClient({ transport })`.
 *
 * Node only. This does not start the process.
 * `config.command` is the program. `config.args`, `config.env`, and `config.cwd` go to that program.
 */
export function stdioTransport(config: Omit<StdioTransportConfig, 'type'>) {
  return new StdioClientTransport({
    command: config.command,
    args: config.args,
    env: config.env,
    cwd: config.cwd,
  })
}
