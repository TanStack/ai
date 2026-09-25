import { describe, expectTypeOf, it } from 'vitest'
import type {
  VercelGatewayChatModel,
  VercelGatewayChatModelProviderOptionsByName,
  VercelGatewayModelInputModalitiesByName,
  VercelGatewayProvider,
} from '../src/model-meta'
import type { VercelGatewayRoutingOptions } from '../src/text/text-provider-options'

type HasKey<T, K extends string> = K extends keyof T ? true : false

describe('Vercel Gateway per-model provider options', () => {
  it('keeps temperature on models that list it', () => {
    type Options =
      VercelGatewayChatModelProviderOptionsByName['alibaba/qwen-3-14b']

    expectTypeOf<HasKey<Options, 'temperature'>>().toEqualTypeOf<true>()
    expectTypeOf<HasKey<Options, 'max_tokens'>>().toEqualTypeOf<true>()
    expectTypeOf<HasKey<Options, 'gateway'>>().toEqualTypeOf<true>()
  })

  it('omits temperature on models that do not list it', () => {
    type Options = VercelGatewayChatModelProviderOptionsByName['openai/gpt-5']

    expectTypeOf<HasKey<Options, 'temperature'>>().toEqualTypeOf<false>()
    expectTypeOf<HasKey<Options, 'max_tokens'>>().toEqualTypeOf<true>()
    expectTypeOf<HasKey<Options, 'gateway'>>().toEqualTypeOf<true>()
  })
})

describe('Vercel Gateway per-model input modalities', () => {
  it('uses text only for a text-only chat model', () => {
    expectTypeOf<
      VercelGatewayModelInputModalitiesByName['alibaba/qwen-3-14b']
    >().toEqualTypeOf<readonly ['text']>()
  })

  it('uses text and image for a vision chat model', () => {
    expectTypeOf<
      VercelGatewayModelInputModalitiesByName['alibaba/qwen3-vl-instruct']
    >().toEqualTypeOf<readonly ['text', 'image']>()
  })

  it('maps pdf input to document on file-input chat models', () => {
    expectTypeOf<
      VercelGatewayModelInputModalitiesByName['alibaba/qwen3-235b-a22b-thinking']
    >().toEqualTypeOf<readonly ['text', 'image', 'document']>()
  })
})

describe('Vercel Gateway routing option unions', () => {
  it('types gateway.models as catalog chat models', () => {
    expectTypeOf<
      NonNullable<VercelGatewayRoutingOptions['models']>[number]
    >().toEqualTypeOf<VercelGatewayChatModel>()
  })

  it('types gateway.order and gateway.only as catalog providers', () => {
    expectTypeOf<
      NonNullable<VercelGatewayRoutingOptions['order']>[number]
    >().toEqualTypeOf<VercelGatewayProvider>()
    expectTypeOf<
      NonNullable<VercelGatewayRoutingOptions['only']>[number]
    >().toEqualTypeOf<VercelGatewayProvider>()
  })
})
