import { afterEach, describe, expect, it } from 'vitest'
import {
  formatAcpRequestError,
  resolveGrokAcpAuthMethod,
  resolveGrokSessionAuthMethod,
} from '../src/auth'
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

  it('omits auth when no API key is set so host login can win', () => {
    expect(resolveGrokAcpAuthMethod()).toBeUndefined()
  })
})

describe('resolveGrokSessionAuthMethod', () => {
  it('skips authenticate on host mode even when an API key is set', () => {
    process.env.XAI_API_KEY = 'sk-test'
    expect(resolveGrokSessionAuthMethod('host', undefined)).toBeUndefined()
  })

  it('uses xai.api_key on api-key mode', () => {
    process.env.XAI_API_KEY = 'sk-test'
    expect(resolveGrokSessionAuthMethod('api-key', undefined)).toBe(
      'xai.api_key',
    )
  })

  it('defaults omitted authMode to api-key', () => {
    expect(resolveGrokSessionAuthMethod(undefined, undefined)).toBe(
      'xai.api_key',
    )
  })

  it('lets an explicit authMethodId win', () => {
    expect(resolveGrokSessionAuthMethod('host', 'grok.com')).toBe('grok.com')
  })
})

describe('formatAcpRequestError', () => {
  it('prefers RequestError.data over Internal error', () => {
    const error = Object.assign(new Error('Internal error'), {
      data: 'Unauthorized (401) from https://cli-chat-proxy.grok.com/v1/responses',
    })
    expect(formatAcpRequestError(error)).toMatch(/Unauthorized \(401\)/)
  })

  it('falls back to Error.message when data is missing', () => {
    expect(formatAcpRequestError(new Error('stream broke'))).toBe(
      'stream broke',
    )
  })
})

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
