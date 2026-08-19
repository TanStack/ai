import { describe, expect, it } from 'vitest'
import { mapGatewayModelOptions } from '../src/utils/map-gateway-options'

describe('mapGatewayModelOptions', () => {
  it('moves gateway onto providerOptions.gateway and keeps sampling fields', () => {
    expect(
      mapGatewayModelOptions({
        temperature: 0.2,
        gateway: { order: ['anthropic'], models: ['openai/gpt-5.5'] },
      }),
    ).toEqual({
      temperature: 0.2,
      providerOptions: {
        gateway: { order: ['anthropic'], models: ['openai/gpt-5.5'] },
      },
    })
  })

  it('does not emit providerOptions when gateway is absent', () => {
    expect(mapGatewayModelOptions({ temperature: 0.1 })).toEqual({
      temperature: 0.1,
    })
  })

  it('returns an empty object for undefined input', () => {
    expect(mapGatewayModelOptions(undefined)).toEqual({})
  })
})
