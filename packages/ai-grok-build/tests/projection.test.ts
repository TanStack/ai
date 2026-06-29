import { describe, expect, it } from 'vitest'
import { renderGrokMcpToml } from '../src/adapters/projection'

describe('renderGrokMcpToml', () => {
  it('writes grok project-scope MCP config with bearer header', () => {
    const toml = renderGrokMcpToml({
      name: 'tanstack',
      url: 'http://host.docker.internal:3001/_bridge',
      token: 'secret-token',
      close: async () => {},
    })
    expect(toml).toContain('[mcp_servers.tanstack]')
    expect(toml).toContain('url = "http://host.docker.internal:3001/_bridge"')
    expect(toml).toContain('Authorization = "Bearer secret-token"')
  })
})
