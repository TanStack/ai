import { expectTypeOf } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '../src'
import type {
  ClientTool,
  InferToolResultMetadata,
  ServerTool,
  ToolDefinition,
} from '../src'

const withSchema = toolDefinition({
  name: 'search',
  description: 'Search',
  resultMetadataSchema: z.object({ source: z.string(), hits: z.number() }),
})

const withoutSchema = toolDefinition({
  name: 'plain',
  description: 'Plain',
})

const searchServer = withSchema.server((_args, context) => {
  // The setter takes a Partial of the schema type.
  context?.setResultMetadata?.({ source: 'cache' })
  context?.setResultMetadata?.({ hits: 3 })
  // @ts-expect-error `cached` is not a key of the schema
  context?.setResultMetadata?.({ cached: true })
  // @ts-expect-error `hits` must be a number
  context?.setResultMetadata?.({ hits: '3' })
  return null
})

withSchema.client((_args, context) => {
  // @ts-expect-error a client tool cannot set result metadata
  context?.setResultMetadata?.({ source: 'cache' })
  return null
})

// The same rule holds when an app sets `execute` on a client tool.
const searchClient = withSchema.client()
searchClient.execute = (_args, context) => {
  // @ts-expect-error a client tool cannot set result metadata
  context?.setResultMetadata?.({ source: 'cache' })
  return null
}

withoutSchema.server((_args, context) => {
  // Without a schema, any record is accepted.
  context?.setResultMetadata?.({ anything: 1, nested: { a: true } })
  return null
})

type SearchMetadata = { source: string; hits: number }

expectTypeOf<
  InferToolResultMetadata<typeof withSchema>
>().toEqualTypeOf<SearchMetadata>()
expectTypeOf<
  InferToolResultMetadata<typeof searchServer>
>().toEqualTypeOf<SearchMetadata>()
expectTypeOf<InferToolResultMetadata<typeof withoutSchema>>().toEqualTypeOf<
  Record<string, unknown>
>()
expectTypeOf<
  InferToolResultMetadata<ReturnType<typeof withoutSchema.server>>
>().toEqualTypeOf<Record<string, unknown>>()

// Wide tool types accept a tool with a result metadata schema.
const wideServer: ServerTool<any, any, any> = searchServer
const wideClient: ClientTool<any, any, any> = withSchema.client()
const wideDefinition: ToolDefinition<any, any, string> = withSchema
void [wideServer, wideClient, wideDefinition]

// A tool without a schema keeps the record type.
expectTypeOf<InferToolResultMetadata<typeof withoutSchema>>().toEqualTypeOf<
  Record<string, unknown>
>()
