import { chat } from '../src'
import type { TextAdapter } from '../src/activities/chat/adapter'
import type { DefaultMessageMetadataByModality } from '../src/types'

type Adapter<TReasoning extends { levels: any; budget: boolean }> = TextAdapter<
  'm',
  Record<string, never>,
  readonly ['text'],
  DefaultMessageMetadataByModality,
  ReadonlyArray<string>,
  unknown,
  never,
  TReasoning
>

declare const effortModel: Adapter<{
  levels: 'off' | 'low' | 'high'
  budget: false
}>
declare const budgetModel: Adapter<{
  levels: 'off' | 'low' | 'medium' | 'high'
  budget: true
}>
declare const plainModel: TextAdapter<
  'm',
  Record<string, never>,
  readonly ['text'],
  DefaultMessageMetadataByModality
>

const messages = [{ role: 'user' as const, content: 'hi' }]

// A model's own levels, as a string or in the object form.
chat({ adapter: effortModel, messages, reasoning: 'low' })
chat({ adapter: effortModel, messages, reasoning: 'off' })
chat({
  adapter: effortModel,
  messages,
  reasoning: { level: 'high', summary: false },
})

// @ts-expect-error `medium` is not one of this model's levels
chat({ adapter: effortModel, messages, reasoning: 'medium' })

// @ts-expect-error budgetTokens needs a budget-based model
chat({
  adapter: effortModel,
  messages,
  reasoning: { level: 'low', budgetTokens: 1000 },
})

// A budget-based model takes budgetTokens.
chat({
  adapter: budgetModel,
  messages,
  reasoning: { level: 'medium', budgetTokens: 4000 },
})

// @ts-expect-error an adapter that declares no reasoning takes no reasoning option
chat({ adapter: plainModel, messages, reasoning: 'low' })

// Not passing it is always fine.
chat({ adapter: plainModel, messages })
