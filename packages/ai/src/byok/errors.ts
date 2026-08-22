import type { ProviderId } from './providers'

export class ByokMissingError extends Error {
  readonly provider: ProviderId

  constructor(provider: ProviderId) {
    super(`Missing ${provider} API key`)
    this.name = 'ByokMissingError'
    this.provider = provider
  }
}

export class ByokBlockedError extends Error {
  readonly provider: ProviderId
  readonly reason: 'missing' | 'locked'

  constructor(provider: ProviderId, reason: 'missing' | 'locked') {
    super(
      reason === 'locked'
        ? `${provider} key is locked`
        : `Missing ${provider} API key`,
    )
    this.name = 'ByokBlockedError'
    this.provider = provider
    this.reason = reason
  }
}

export class ByokUnresolvedProviderError extends Error {
  constructor() {
    super(
      'BYOK is enabled but no provider slug was resolved. Pass byokProvider or forwardedProps.provider.',
    )
    this.name = 'ByokUnresolvedProviderError'
  }
}
