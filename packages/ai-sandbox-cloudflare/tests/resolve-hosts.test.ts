/**
 * Contracts for the two host resolvers (pure; no Workers runtime needed):
 *  - `resolveBridgeOrigin` — container→Worker origin (/_bridge, /tool-exec).
 *  - `resolvePreviewHost` — browser-facing `exposePort` preview host.
 */
import { describe, expect, it } from 'vitest'
import { resolveBridgeOrigin, resolvePreviewHost } from '../src/public-host'

const req = (publicHost?: string): { publicHost?: string } =>
  publicHost === undefined ? {} : { publicHost }

describe('resolveBridgeOrigin', () => {
  it('uses PUBLIC_HOSTNAME when set (https for a public host)', () => {
    expect(
      resolveBridgeOrigin({ PUBLIC_HOSTNAME: 'app.example.com' }, req('x')),
    ).toBe('https://app.example.com')
  })

  it('rewrites a local trigger host to host.docker.internal over http', () => {
    expect(resolveBridgeOrigin({}, req('localhost:3001'))).toBe(
      'http://host.docker.internal:3001',
    )
    expect(resolveBridgeOrigin({}, req('127.0.0.1:8787'))).toBe(
      'http://host.docker.internal:8787',
    )
  })

  it('uses the deployed request host over https', () => {
    expect(resolveBridgeOrigin({}, req('agent.acct.workers.dev'))).toBe(
      'https://agent.acct.workers.dev',
    )
  })

  it('honors an explicit host.docker.internal override over http', () => {
    expect(
      resolveBridgeOrigin(
        { PUBLIC_HOSTNAME: 'host.docker.internal:3001' },
        req('localhost:3001'),
      ),
    ).toBe('http://host.docker.internal:3001')
  })

  it('throws when neither a configured nor a request host is available', () => {
    expect(() => resolveBridgeOrigin({}, req())).toThrow(/no bridge host/)
  })
})

describe('resolvePreviewHost', () => {
  it('uses PREVIEW_HOSTNAME when set', () => {
    expect(
      resolvePreviewHost({ PREVIEW_HOSTNAME: 'preview.example.com' }, req('x')),
    ).toBe('preview.example.com')
  })

  it('passes a local host through (SDK localhost preview path)', () => {
    expect(resolvePreviewHost({}, req('localhost:3001'))).toBe('localhost:3001')
  })

  it('throws on a *.workers.dev request host (no wildcard subdomains)', () => {
    expect(() => resolvePreviewHost({}, req('agent.acct.workers.dev'))).toThrow(
      /custom domain/,
    )
  })

  it('uses a custom-domain request host directly', () => {
    expect(resolvePreviewHost({}, req('app.example.com'))).toBe(
      'app.example.com',
    )
  })

  it('throws when neither a configured nor a request host is available', () => {
    expect(() => resolvePreviewHost({}, req())).toThrow(/no preview host/)
  })
})
