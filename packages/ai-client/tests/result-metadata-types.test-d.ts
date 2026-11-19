import { expectTypeOf } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '@tanstack/ai/client'
import type { ToolCallPart } from '../src/types'

const searchDocs = toolDefinition({
  name: 'searchDocs',
  description: 'Search the docs',
  inputSchema: z.object({ query: z.string() }),
  resultMetadataSchema: z.object({
    sources: z.array(z.object({ url: z.string() })),
  }),
}).client()

const getTime = toolDefinition({
  name: 'getTime',
  description: 'Get the time',
}).client()

declare const part: ToolCallPart<readonly [typeof searchDocs, typeof getTime]>

if (part.name === 'searchDocs') {
  expectTypeOf(part.resultMetadata?.sources).toEqualTypeOf<
    Array<{ url: string }> | undefined
  >()
  // @ts-expect-error `searchDocs` metadata has no `count` key.
  part.resultMetadata?.count
}

if (part.name === 'getTime') {
  expectTypeOf(part.resultMetadata).toEqualTypeOf<
    Record<string, unknown> | undefined
  >()
}

declare const untypedPart: ToolCallPart
expectTypeOf(untypedPart.resultMetadata).toEqualTypeOf<unknown>()
