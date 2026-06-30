import { afterEach, describe, expect, it } from 'vitest'
import { resolveGrokAcpAuthMethod } from '../src/auth'
import {
  buildGrokAcpServeCommand,
  buildGrokAcpStdioCommand,
} from '../src/process/acp'

afterEach(() => {
  delete process.env.XAI_API_KEY
  delete process.env.GROK_API_KEY
})

describe('resolveGrokAcpAuthMethod', () => {
  it('prefers xai.api_key when an API key env is set', () => {
    process.env.XAI_API_KEY = 'sk-test'
    expect(resolveGrokAcpAuthMethod()).toBe('xai.api_key')
    expect(resolveGrokAcpAuthMethod({ GROK_API_KEY: 'alt' })).toBe(
      'xai.api_key',
    )
  })

  it('falls back to grok.com for host login flows', () => {
    expect(resolveGrokAcpAuthMethod()).toBe('grok.com')
  })
})

describe('grok ACP commands', () => {
  it('builds stdio command with harness cwd, model, and always-approve', () => {
    expect(
      buildGrokAcpStdioCommand({
        exe: 'grok',
        cliModel: 'composer-2.5',
        harnessCwd: '/workspace',
      }),
    ).toBe(
      "grok agent -m 'composer-2.5' --cwd '/workspace' --always-approve stdio",
    )
  })

  it('builds serve command with harness cwd, bind, and secret', () => {
    expect(
      buildGrokAcpServeCommand({
        exe: 'grok',
        cliModel: 'composer-2.5',
        harnessCwd: '/workspace',
        port: 2419,
        secret: 'abc123',
      }),
    ).toBe(
      "grok agent -m 'composer-2.5' --cwd '/workspace' --always-approve serve --bind '0.0.0.0:2419' --secret 'abc123'",
    )
  })
})
