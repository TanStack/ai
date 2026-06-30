import { describe, expect, it } from 'vitest'
import {
  buildGrokAcpServeCommand,
  buildGrokAcpStdioCommand,
} from '../src/process/acp'

describe('grok ACP commands', () => {
  it('builds stdio command with model and always-approve', () => {
    expect(
      buildGrokAcpStdioCommand({
        exe: 'grok',
        cliModel: 'composer-2.5',
      }),
    ).toBe("grok agent -m 'composer-2.5' --always-approve stdio")
  })

  it('builds serve command with bind and secret', () => {
    expect(
      buildGrokAcpServeCommand({
        exe: 'grok',
        cliModel: 'composer-2.5',
        port: 2419,
        secret: 'abc123',
      }),
    ).toBe(
      "grok agent -m 'composer-2.5' --always-approve serve --bind '0.0.0.0:2419' --secret 'abc123'",
    )
  })
})