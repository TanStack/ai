import { expectTypeOf } from 'vitest'
import { chat, rerank } from '@tanstack/ai'
import { bedrockRerank, bedrockText, resolveBedrockAuth } from '../src'
import type {
  BedrockRerankAdapter,
  BedrockRerankConfig,
  BedrockRerankProviderOptions,
} from '../src'

const config: BedrockRerankConfig = { region: 'us-west-2' }
const adapter = bedrockRerank('amazon.rerank-v1:0', config)
expectTypeOf(adapter).toEqualTypeOf<
  BedrockRerankAdapter<'amazon.rerank-v1:0'>
>()
expectTypeOf(
  adapter['~types'].providerOptions,
).toEqualTypeOf<BedrockRerankProviderOptions>()

const result = rerank({
  adapter,
  query: 'rain',
  documents: [{ id: 1, text: 'rain' }],
  modelOptions: { additionalModelRequestFields: { max_tokens_per_doc: 512 } },
})
expectTypeOf<Awaited<typeof result>['rerankedDocuments']>().toEqualTypeOf<
  Array<{ id: number; text: string }>
>()

// @ts-expect-error - chat model IDs cannot select a reranker
bedrockRerank('us.amazon.nova-pro-v1:0')
// @ts-expect-error - Bedrock rerank cannot use API keys
bedrockRerank('cohere.rerank-v3-5:0', { apiKey: 'key' })
// @ts-expect-error - rerank always uses SigV4
bedrockRerank('cohere.rerank-v3-5:0', { auth: 'apikey' })

rerank({
  adapter,
  query: 'rain',
  documents: ['rain'],
  // @ts-expect-error - pagination is handled internally
  modelOptions: { nextToken: 'token' },
})

rerank({
  // @ts-expect-error - a chat adapter cannot rerank documents
  adapter: bedrockText('us.amazon.nova-pro-v1:0'),
  query: 'rain',
  documents: ['rain'],
})

chat({
  threadId: 'rerank-type-test',
  // @ts-expect-error - a rerank adapter cannot chat
  adapter,
  messages: [{ role: 'user', content: 'hello' }],
})

const auth = resolveBedrockAuth({ auth: 'sigv4' }, 'runtime')
expectTypeOf(auth.kind).toEqualTypeOf<'sigv4'>()
expectTypeOf(auth.credentials).toBeFunction()
