import type {
  AIAdapter,
  ConstrainedModelMessage,
  Modality,
  ModelMessage,
} from '../types'

/**
 * Type-safe helper to create a messages array constrained by a model's supported modalities.
 *
 * This function provides compile-time checking that your messages only contain
 * content types supported by the specified model. It's particularly useful when
 * combining typed messages with untyped data (like from request.json()).
 *
 * @example
 * ```typescript
 * import { messages, chat } from '@tanstack/ai'
 * import { openai } from '@tanstack/ai-openai'
 *
 * const adapter = openai()
 *
 * // This will error at compile time because gpt-4o only supports text+image
 * const msgs = messages({ adapter, model: 'gpt-4o' }, [
 *   {
 *     role: 'user',
 *     content: [
 *       { type: 'video', source: { type: 'url', value: '...' } } // Error!
 *     ]
 *   }
 * ])
 * ```
 */
export function messages<
  TAdapter extends AIAdapter<any, any, any, any, any, any>,
  const TModel extends TAdapter extends AIAdapter<infer Models, any, any, any, any, any>
  ? Models[number]
  : string,
>(
  _options: { adapter: TAdapter; model: TModel },
  msgs: TAdapter extends AIAdapter<any, any, any, any, any, infer ModelInputModalities>
    ? TModel extends keyof ModelInputModalities
    ? ModelInputModalities[TModel] extends ReadonlyArray<Modality>
    ? Array<ConstrainedModelMessage<ModelInputModalities[TModel]>>
    : Array<ModelMessage>
    : Array<ModelMessage>
    : Array<ModelMessage>,
): typeof msgs {
  return msgs
}

/**
 * Type assertion helper that narrows an array of unknown messages to be
 * compatible with a specific model's input modalities.
 *
 * Use this when you have messages from an external source (like request.json())
 * that you want to use with a type-safe chat call. This is a type-level assertion
 * and does NOT perform runtime validation.
 *
 * @example
 * ```typescript
 * import { assertMessages, chat } from '@tanstack/ai'
 * import { openai } from '@tanstack/ai-openai'
 *
 * const adapter = openai()
 * const { messages: incomingMessages } = await request.json()
 *
 * // Assert that incoming messages are compatible with gpt-4o
 * const typedMessages = assertMessages({ adapter, model: 'gpt-4o' }, incomingMessages)
 *
 * // Now you can safely spread them without polluting type inference
 * const stream = chat({
 *   adapter,
 *   model: 'gpt-4o',
 *   messages: [
 *     ...typedMessages,
 *     { role: 'user', content: [{ type: 'text', text: 'Hello' }] }
 *   ]
 * })
 * ```
 *
 * @warning This is a compile-time assertion only. If the runtime data doesn't
 * match the expected shape, you may get runtime errors. For runtime validation,
 * use a schema validation library like Zod.
 */
export function assertMessages<
  TAdapter extends AIAdapter<any, any, any, any, any, any>,
  const TModel extends TAdapter extends AIAdapter<infer Models, any, any, any, any, any>
  ? Models[number]
  : string,
>(
  _options: { adapter: TAdapter; model: TModel },
  msgs: unknown,
): TAdapter extends AIAdapter<any, any, any, any, any, infer ModelInputModalities>
  ? TModel extends keyof ModelInputModalities
  ? ModelInputModalities[TModel] extends ReadonlyArray<Modality>
  ? Array<ConstrainedModelMessage<ModelInputModalities[TModel]>>
  : Array<ModelMessage>
  : Array<ModelMessage>
  : Array<ModelMessage> {
  return msgs as ReturnType<typeof assertMessages<TAdapter, TModel>>
}
