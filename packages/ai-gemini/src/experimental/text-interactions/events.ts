import type { Interactions } from '@google/genai'
import type { CustomEvent, StreamChunk } from '@tanstack/ai'

/**
 * `CUSTOM` event carrying the server-assigned Interactions API id. Emitted
 * immediately before `RUN_FINISHED` on a successful run; pass `interactionId`
 * back as `modelOptions.previous_interaction_id` to continue the conversation.
 */
export interface GeminiInteractionIdEvent extends Omit<
  CustomEvent,
  'name' | 'value'
> {
  name: 'gemini.interactionId'
  value: { interactionId: string }
}

/**
 * `CUSTOM` event carrying a raw `google_search_call` Step from the
 * Interactions API. Payload shape is owned by `@google/genai`.
 *
 * SDK 2.x: server-side tool activity is now first-class `Step`s (emitted
 * via `step.start`) rather than content deltas, so each variant below
 * carries the full Step (with its `id` / `call_id`) instead of a delta
 * fragment.
 */
export interface GeminiGoogleSearchCallEvent extends Omit<
  CustomEvent,
  'name' | 'value'
> {
  name: 'gemini.googleSearchCall'
  value: Interactions.GoogleSearchCallStep
}

/**
 * `CUSTOM` event carrying a raw `google_search_result` Step from the
 * Interactions API.
 */
export interface GeminiGoogleSearchResultEvent extends Omit<
  CustomEvent,
  'name' | 'value'
> {
  name: 'gemini.googleSearchResult'
  value: Interactions.GoogleSearchResultStep
}

/**
 * `CUSTOM` event carrying a raw `code_execution_call` Step from the
 * Interactions API.
 */
export interface GeminiCodeExecutionCallEvent extends Omit<
  CustomEvent,
  'name' | 'value'
> {
  name: 'gemini.codeExecutionCall'
  value: Interactions.CodeExecutionCallStep
}

/**
 * `CUSTOM` event carrying a raw `code_execution_result` Step from the
 * Interactions API.
 */
export interface GeminiCodeExecutionResultEvent extends Omit<
  CustomEvent,
  'name' | 'value'
> {
  name: 'gemini.codeExecutionResult'
  value: Interactions.CodeExecutionResultStep
}

/**
 * `CUSTOM` event carrying a raw `url_context_call` Step from the
 * Interactions API.
 */
export interface GeminiUrlContextCallEvent extends Omit<
  CustomEvent,
  'name' | 'value'
> {
  name: 'gemini.urlContextCall'
  value: Interactions.URLContextCallStep
}

/**
 * `CUSTOM` event carrying a raw `url_context_result` Step from the
 * Interactions API.
 */
export interface GeminiUrlContextResultEvent extends Omit<
  CustomEvent,
  'name' | 'value'
> {
  name: 'gemini.urlContextResult'
  value: Interactions.URLContextResultStep
}

/**
 * `CUSTOM` event carrying a raw `file_search_call` Step from the
 * Interactions API.
 */
export interface GeminiFileSearchCallEvent extends Omit<
  CustomEvent,
  'name' | 'value'
> {
  name: 'gemini.fileSearchCall'
  value: Interactions.FileSearchCallStep
}

/**
 * `CUSTOM` event carrying a raw `file_search_result` Step from the
 * Interactions API.
 */
export interface GeminiFileSearchResultEvent extends Omit<
  CustomEvent,
  'name' | 'value'
> {
  name: 'gemini.fileSearchResult'
  value: Interactions.FileSearchResultStep
}

/**
 * Discriminated union of every `CUSTOM` event the
 * `geminiTextInteractions()` adapter emits.
 *
 * Each variant carries the lifecycle fields `model?` / `timestamp?` /
 * `rawEvent?` from {@link CustomEvent} so a single narrow against the
 * `StreamChunk` union yields a fully typed payload — no helper or `as`
 * cast required:
 *
 * ```ts
 * for await (const chunk of stream as GeminiInteractionsStream) {
 *   if (chunk.type === 'CUSTOM' && chunk.name === 'gemini.interactionId') {
 *     chunk.value.interactionId // string
 *   }
 * }
 * ```
 *
 * The four tool variant pairs (`google_search`, `code_execution`,
 * `url_context`, `file_search`) forward the raw
 * `Interactions.*CallStep` / `Interactions.*ResultStep` payload from
 * `@google/genai`. SDK 2.x emits these as full Steps via `step.start`
 * (carrying the call's `id` / `call_id`) rather than as content deltas.
 * `computer_use` is accepted as a request tool but the API does not
 * surface a dedicated CUSTOM event for it.
 */
export type GeminiInteractionsCustomEvent =
  | GeminiInteractionIdEvent
  | GeminiGoogleSearchCallEvent
  | GeminiGoogleSearchResultEvent
  | GeminiCodeExecutionCallEvent
  | GeminiCodeExecutionResultEvent
  | GeminiUrlContextCallEvent
  | GeminiUrlContextResultEvent
  | GeminiFileSearchCallEvent
  | GeminiFileSearchResultEvent

/** String-literal union of the event names in {@link GeminiInteractionsCustomEvent}. */
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

/**
 * Public stream type for `chatStream` results from the
 * `geminiTextInteractions()` adapter. Yields the standard
 * {@link StreamChunk} lifecycle events plus the Gemini-specific
 * `CUSTOM` events declared in {@link GeminiInteractionsCustomEvent},
 * so a single discriminated narrow on `chunk.name` gives a typed
 * `chunk.value`:
 *
 * ```ts
 * import type { GeminiInteractionsStream } from '@tanstack/ai-gemini/experimental'
 *
 * for await (const chunk of stream as GeminiInteractionsStream) {
 *   if (chunk.type === 'CUSTOM' && chunk.name === 'gemini.interactionId') {
 *     chunk.value.interactionId // typed as string
 *   }
 * }
 * ```
 *
 * Caveat: server tools may emit arbitrary user-defined custom events via
 * `emitCustomEvent(name, value)`. Those flow through the stream at
 * runtime but are intentionally absent from this union — including a
 * bare {@link CustomEvent} would collapse `chunk.value` back to `any`
 * after the narrow. Branch on `CUSTOM` outside the literal-`name`
 * narrows or cast explicitly if you rely on `emitCustomEvent`.
 */
export type GeminiInteractionsStream = AsyncIterable<
  Exclude<StreamChunk, CustomEvent> | GeminiInteractionsCustomEvent
>
