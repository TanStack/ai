import { describe, expect, it } from 'vitest'
import { withGatewayCost } from '../src/utils/gateway-cost'

const tokens = { promptTokens: 3, completionTokens: 1, totalTokens: 4 }

describe('withGatewayCost', () => {
  it('maps provider_metadata.gateway decimal strings onto usage', () => {
    expect(
      withGatewayCost(tokens, {
        provider_metadata: {
          gateway: {
            cost: '0',
            marketCost: '0.000035',
            gatewayCost: '0',
            generationId: 'gen_1',
            routing: { finalProvider: 'anthropic' },
          },
        },
      }),
    ).toEqual({
      ...tokens,
      cost: 0,
      costDetails: { upstreamCost: 0.000035 },
      providerUsageDetails: {
        generationId: 'gen_1',
        finalProvider: 'anthropic',
      },
    })
  })

  it('reads numeric cost on a chat usage object', () => {
    expect(
      withGatewayCost(tokens, {
        usage: { cost: 0.0025, market_cost: 0.0025 },
      }),
    ).toEqual({
      ...tokens,
      cost: 0.0025,
      costDetails: { upstreamCost: 0.0025 },
    })
  })

  it('leaves usage unchanged when the gateway sends no cost', () => {
    expect(withGatewayCost(tokens, { provider_metadata: {} })).toEqual(tokens)
    expect(withGatewayCost(undefined, { cost: '1' })).toBeUndefined()
  })
})
