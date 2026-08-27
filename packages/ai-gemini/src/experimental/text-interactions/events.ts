import type { Interactions } from '@google/genai'
import type { CustomEvent, StreamChunk } from '@tanstack/ai'

export interface GeminiInteractionIdEvent extends Omit<
  CustomEvent,
  'name' | 'value'
> {
  name: 'gemini.interactionId'
  value: { interactionId: string }
}

export interface GeminiGoogleSearchCallEvent extends Omit<
  CustomEvent,
  'name' | 'value'
> {
  name: 'gemini.googleSearchCall'
  value: Interactions.GoogleSearchCallStep
}

export interface GeminiGoogleSearchResultEvent extends Omit<
  CustomEvent,
  'name' | 'value'
> {
  name: 'gemini.googleSearchResult'
  value: Interactions.GoogleSearchResultStep
}

export interface GeminiCodeExecutionCallEvent extends Omit<
  CustomEvent,
  'name' | 'value'
> {
  name: 'gemini.codeExecutionCall'
  value: Interactions.CodeExecutionCallStep
}

export interface GeminiCodeExecutionResultEvent extends Omit<
  CustomEvent,
  'name' | 'value'
> {
  name: 'gemini.codeExecutionResult'
  value: Interactions.CodeExecutionResultStep
}

export interface GeminiUrlContextCallEvent extends Omit<
  CustomEvent,
  'name' | 'value'
> {
  name: 'gemini.urlContextCall'
  value: Interactions.URLContextCallStep
}

export interface GeminiUrlContextResultEvent extends Omit<
  CustomEvent,
  'name' | 'value'
> {
  name: 'gemini.urlContextResult'
  value: Interactions.URLContextResultStep
}

export interface GeminiFileSearchCallEvent extends Omit<
  CustomEvent,
  'name' | 'value'
> {
  name: 'gemini.fileSearchCall'
  value: Interactions.FileSearchCallStep
}

export interface GeminiFileSearchResultEvent extends Omit<
  CustomEvent,
  'name' | 'value'
> {
  name: 'gemini.fileSearchResult'
  value: Interactions.FileSearchResultStep
}

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

export type GeminiInteractionsCustomEventValue<
  TName extends GeminiInteractionsCustomEventName,
> = Extract<GeminiInteractionsCustomEvent, { name: TName }>['value']

export type GeminiInteractionsStream = AsyncIterable<
  Exclude<StreamChunk, CustomEvent> | GeminiInteractionsCustomEvent
>
