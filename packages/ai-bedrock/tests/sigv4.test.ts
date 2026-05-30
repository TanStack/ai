import { describe, expect, it } from 'vitest'
import { resolveSigV4Params } from '../src/sigv4/index'

describe('resolveSigV4Params', () => {
  it('uses service "bedrock" and the given region', () => {
    expect(resolveSigV4Params({ region: 'us-east-1', endpoint: 'runtime' })).toEqual({
      service: 'bedrock',
      region: 'us-east-1',
    })
  })

  it('uses service "bedrock-mantle" for the mantle endpoint', () => {
    expect(resolveSigV4Params({ region: 'eu-west-1', endpoint: 'mantle' })).toEqual({
      service: 'bedrock-mantle',
      region: 'eu-west-1',
    })
  })
})
