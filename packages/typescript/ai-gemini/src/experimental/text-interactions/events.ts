import type { Interactions } from '@google/genai'

/**
 * Discriminated union of every `CUSTOM` event the
 * `geminiTextInteractions()` adapter emits.
 *
 * Use in `onCustomEvent` / `useChat` handlers to narrow `data` without
 * `as any`:
 *
 * ```ts
 * onCustomEvent: (name, data) => {
 *   const event = { name, value: data } as GeminiInteractionsCustomEvent
 *   if (event.name === 'gemini.interactionId') {
 *     // event.value.interactionId is string
 *   }
 * }
 * ```
 *
 * Tool-delta variants forward the raw `Interactions.ContentDelta.*Delta`
 * payload from `@google/genai` so consumers stay in sync with SDK shape
 * changes automatically.
 */
export type GeminiInteractionsCustomEvent =
  | {
      name: 'gemini.interactionId'
      value: { interactionId: string }
    }
  | {
      name: 'gemini.googleSearchCall'
      value: Interactions.ContentDelta.GoogleSearchCallDelta
    }
  | {
      name: 'gemini.googleSearchResult'
      value: Interactions.ContentDelta.GoogleSearchResultDelta
    }
  | {
      name: 'gemini.codeExecutionCall'
      value: Interactions.ContentDelta.CodeExecutionCallDelta
    }
  | {
      name: 'gemini.codeExecutionResult'
      value: Interactions.ContentDelta.CodeExecutionResultDelta
    }
  | {
      name: 'gemini.urlContextCall'
      value: Interactions.ContentDelta.URLContextCallDelta
    }
  | {
      name: 'gemini.urlContextResult'
      value: Interactions.ContentDelta.URLContextResultDelta
    }
  | {
      name: 'gemini.fileSearchCall'
      value: Interactions.ContentDelta.FileSearchCallDelta
    }
  | {
      name: 'gemini.fileSearchResult'
      value: Interactions.ContentDelta.FileSearchResultDelta
    }

/** String-literal union of the event names in `GeminiInteractionsCustomEvent`. */
export type GeminiInteractionsCustomEventName =
  GeminiInteractionsCustomEvent['name']

/**
 * Look up the typed `value` payload for a specific event name.
 *
 * ```ts
 * const v: GeminiInteractionsCustomEventValue<'gemini.interactionId'>
 * //    ^? { interactionId: string }
 * ```
 */
export type GeminiInteractionsCustomEventValue<
  TName extends GeminiInteractionsCustomEventName,
> = Extract<GeminiInteractionsCustomEvent, { name: TName }>['value']
