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
  const TModel extends TAdapter extends AIAdapter<
    infer Models,
    any,
    any,
    any,
    any,
    any
  >
    ? Models[number]
    : string,
>(
  _options: { adapter: TAdapter; model: TModel },
  msgs: TAdapter extends AIAdapter<
    any,
    any,
    any,
    any,
    any,
    infer ModelInputModalities
  >
    ? TModel extends keyof ModelInputModalities
      ? ModelInputModalities[TModel] extends ReadonlyArray<Modality>
        ? Array<ConstrainedModelMessage<ModelInputModalities[TModel]>>
        : Array<ModelMessage>
      : Array<ModelMessage>
    : Array<ModelMessage>,
): typeof msgs {
  return msgs
}
