/**
 * Type-safety tests for TextActivityOptions['tools'] gating.
 *
 * Mirrors the pattern in image-per-model-type-safety.test.ts — uses
 * `@ts-expect-error` to assert compile-time rejections and `expectTypeOf`
 * for positive inference checks.
 */
import { describe, expectTypeOf, it } from 'vitest'
import { z } from 'zod'
import { toolDefinition } from '../src/index'
import type { ProviderTool } from '../src/index'
import type { TextActivityOptions } from '../src/activities/chat/index'
import type { TextAdapter } from '../src/activities/chat/adapter'

// ---- Mock adapter wired with a fixed toolCapabilities union ----

type MockToolCapabilities = readonly ['web_search', 'code_execution']

type MockAdapter = TextAdapter<
  'mock-model',
  Record<string, any>,
  readonly ['text'],
  { text: {}; image: {}; audio: {}; video: {}; document: {} },
  MockToolCapabilities
>

// Helper that exposes the gated `tools` element type.
type MockToolsOption = NonNullable<
  TextActivityOptions<MockAdapter, undefined, true>['tools']
>[number]

// ---- Fixtures ----

const userTool = toolDefinition({
  name: 'user_tool',
  description: 'A plain user-defined tool',
  inputSchema: z.object({ query: z.string() }),
}).server(async ({ query }) => query.toUpperCase())

const supportedProviderTool = {
  name: 'web_search',
  description: '',
  metadata: {},
} as ProviderTool<'mock', 'web_search'>

const unsupportedProviderTool = {
  name: 'computer_use',
  description: '',
  metadata: {},
} as ProviderTool<'mock', 'computer_use'>

describe('TextActivityOptions["tools"] type gating', () => {
  it('accepts user-defined tools from toolDefinition()', () => {
    expectTypeOf(userTool).toMatchTypeOf<MockToolsOption>()
  })

  it('accepts provider tools whose kind appears in supports.tools', () => {
    expectTypeOf(supportedProviderTool).toMatchTypeOf<MockToolsOption>()
  })

  it('rejects provider tools whose kind is not in supports.tools', () => {
    // @ts-expect-error - 'computer_use' is not in MockToolCapabilities
    const _tools: Array<MockToolsOption> = [unsupportedProviderTool]
    void _tools
  })

  it('rejects provider tools with broad string TKind', () => {
    const broadTool = {
      name: 'x',
      description: '',
      metadata: {},
    } as ProviderTool<'x', string>
    // @ts-expect-error - broad `string` TKind is not assignable to the model's specific toolCapabilities union
    const _tools: Array<MockToolsOption> = [broadTool]
    void _tools
  })

  it('accepts a mixed array of user tools and supported provider tools', () => {
    const tools: Array<MockToolsOption> = [userTool, supportedProviderTool]
    expectTypeOf(tools).items.toMatchTypeOf<MockToolsOption>()
  })
})
