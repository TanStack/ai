import { describe, expect, it } from 'vitest'
import {
  BEDROCK_API_COMPATIBILITY,
  lookupBedrockCompatibility,
  mantlePathForModel,
} from '../src/api-compatibility'

describe('Bedrock API compatibility config', () => {
  it('puts Gemma 4 on /openai/v1 and Gemma 3 on /v1', () => {
    expect(lookupBedrockCompatibility('google.gemma-4-31b').mantlePath).toBe(
      '/openai/v1',
    )
    expect(lookupBedrockCompatibility('google.gemma-3-12b-it').mantlePath).toBe(
      '/v1',
    )
    expect(mantlePathForModel('google.gemma-4-future')).toBe('/openai/v1')
    expect(mantlePathForModel(undefined)).toBe('/v1')
  })

  it('seeds Gemma 4 ids that ListFoundationModels omits', () => {
    const rule = BEDROCK_API_COMPATIBILITY.find(
      (r) => r.match === 'google.gemma-4-',
    )
    expect(rule?.models?.map((m) => m.id)).toEqual([
      'google.gemma-4-31b',
      'google.gemma-4-26b-a4b',
      'google.gemma-4-e2b',
    ])
  })
})
