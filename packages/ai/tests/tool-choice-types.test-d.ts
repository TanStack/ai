import { expectTypeOf } from 'vitest'
import { chat, toolDefinition } from '../src'
import type { TextAdapter } from '../src/activities/chat/adapter'
import type { DefaultMessageMetadataByModality, ToolChoice } from '../src/types'

declare const adapter: TextAdapter<
  'm',
  Record<string, never>,
  readonly ['text'],
  DefaultMessageMetadataByModality
>

const getWeather = toolDefinition({
  name: 'getWeather',
  description: 'Weather for a city',
}).server(() => ({ temperature: 21 }))

const getTime = toolDefinition({
  name: 'getTime',
  description: 'The time in a city',
}).server(() => ({ time: '12:00' }))

const messages = [{ role: 'user' as const, content: 'hi' }]

// The option type offers the names of the `tools` as literals.
type Options = Parameters<
  typeof chat<
    typeof adapter,
    undefined,
    true,
    readonly [typeof getWeather, typeof getTime]
  >
>[0]
type ToolName = Extract<
  NonNullable<Options['toolChoice']>,
  { type: 'tool' }
>['name']
expectTypeOf<ToolName>().toEqualTypeOf<
  'getWeather' | 'getTime' | (string & {})
>()

// A tool name of the call.
chat({
  adapter,
  messages,
  tools: [getWeather, getTime],
  toolChoice: { type: 'tool', name: 'getWeather' },
})

// Any other string still compiles: a provider tool or a lazy tool.
chat({
  adapter,
  messages,
  tools: [getWeather],
  toolChoice: { type: 'tool', name: 'web_search' },
})

// The string values, and no tools.
chat({ adapter, messages, toolChoice: 'required' })
chat({ adapter, messages, toolChoice: 'none' })

chat({
  adapter,
  messages,
  // @ts-expect-error not a tool choice value
  toolChoice: 'always',
})

// Without a name type, `ToolChoice` takes any string name.
expectTypeOf<
  Extract<ToolChoice, { type: 'tool' }>['name']
>().toEqualTypeOf<string>()
