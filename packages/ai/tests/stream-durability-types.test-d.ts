import { expectTypeOf } from 'vitest'
import {
  toHttpResponse,
  toServerSentEventsResponse,
} from '../src/stream-to-response'
import type { StreamDurability } from '../src/stream-durability'
import type { StreamChunk } from '../src/types'

declare const backendOffsetBrand: unique symbol
type BackendOffset = string & {
  readonly [backendOffsetBrand]: true
}

declare const durability: StreamDurability<BackendOffset>
declare const stream: AsyncIterable<StreamChunk>

expectTypeOf(durability.resumeFrom()).toEqualTypeOf<BackendOffset | null>()
expectTypeOf(durability.append).returns.toEqualTypeOf<
  Promise<Array<BackendOffset>>
>()

toServerSentEventsResponse(stream, {
  durability: { adapter: durability },
})

// NDJSON delivery is durable too: the branded adapter threads through
// `toHttpResponse` exactly as it does through the SSE helper.
toHttpResponse(stream, {
  durability: { adapter: durability },
})

// @ts-expect-error raw strings cannot be passed to a branded-offset adapter
durability.read('raw-offset')

type HttpResponseOptions = NonNullable<Parameters<typeof toHttpResponse>[1]>
expectTypeOf<HttpResponseOptions>().toHaveProperty('durability')
