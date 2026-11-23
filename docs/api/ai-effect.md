---
title: "@tanstack/ai-effect"
id: tanstack-ai-effect-api
order: 11
description: "API reference for @tanstack/ai-effect: chat, serverTool, toolSchema, AIError, and every TanStack AI activity as an Effect 4 Effect or Stream."
keywords:
  - tanstack ai
  - "@tanstack/ai-effect"
  - effect
  - serverTool
  - toolSchema
  - AIError
  - api reference
---

Effect 4 bindings for TanStack AI. Each function takes the options of the core function and returns an Effect `Effect` or `Stream`. For a walkthrough, start with [Effect](../effect/index).

## Installation

<!-- ::start:tabs variant="package-manager" mode="install" -->

react: @tanstack/ai @tanstack/ai-effect effect

<!-- ::end:tabs -->

Peer dependencies: `@tanstack/ai` and `effect` 4.1 or later.

## `chat(options)`

Runs core `chat()` as an Effect. See [Effect](../effect/index).

```ts ignore
import * as AI from '@tanstack/ai-effect'
import { openaiText } from '@tanstack/ai-openai'

const stream = AI.chat({
  adapter: openaiText('gpt-6.1-sol'),
  messages: [{ role: 'user', content: 'Hello' }],
  threadId: 'hello',
})
```

### Options

The options of core [`chat`](./ai#chat), with two changes:

- `abortController` is not an option. Interruption aborts the run.
- `tools` can also hold `serverTool` values.

### Returns

| Options | Returns |
| --- | --- |
| Default | `Stream.Stream<StreamChunk, AIError, R>` |
| `stream: false` | `Effect.Effect<ChatResult, AIError, R>`. `ChatResult` is `{ text, chunks }`. |
| `outputSchema` | `Effect.Effect<T, AIError, R>`. `T` is the type of the schema. |
| `outputSchema` and `stream: true` | `Stream.Stream<StreamChunk, AIError, R>` |

`R` is the union of the services of the `serverTool` values in `tools`. With no `serverTool`, `R` is `never`.

## `serverTool(definition, execute)`

Makes a server tool from a tool definition and a function that returns an Effect. See [Effect tools](../effect/tools).

```ts ignore
function serverTool<TDef, E, R>(
  definition: TDef,
  execute: (
    input: InferSchemaType<TDef['inputSchema']>,
    context: ToolExecutionContext,
  ) => Effect.Effect<InferSchemaType<TDef['outputSchema']>, E, R>,
): EffectServerTool<TDef, R>
```

- `definition`: the result of `toolDefinition()` from `@tanstack/ai`.
- `execute`: gets the parsed input and the tool context. It returns an Effect of the output.

A failure of the Effect goes to the model as a tool error. The run continues. If the run aborts, the tool fiber is interrupted.

## `toolSchema(schema)`

Turns an Effect Schema into an `inputSchema` or `outputSchema` for `toolDefinition()`.

```ts ignore
function toolSchema<S extends Schema.Constraint>(
  schema: S,
): StandardJSONSchemaV1<S['Encoded'], S['Type']>
```

- Every object in the JSON Schema has `additionalProperties: false`. This lets providers such as OpenAI use strict mode.
- The tool input in `serverTool` gets the type of the schema.

## `EffectServerTool<TDef, R>`

The type that `serverTool` returns. Pass it in the `tools` of `chat`.

| Field | Type |
| --- | --- |
| `_tag` | `'EffectServerTool'` |
| `def` | `TDef` |
| `execute` | `(input, ctx) => Effect.Effect<Output, unknown, R>` |

## `AIError`

The error of every function in this package. It wraps a throw or a rejection from TanStack AI.

```ts ignore
class AIError extends Data.TaggedError('AIError')<{
  readonly message: string
  readonly cause: unknown
}> {}
```

- `_tag`: `'AIError'`. Catch it with `Effect.catchTag('AIError', ...)`.
- `message`: the message of the original error.
- `cause`: the original error.

A `RUN_ERROR` chunk does not fail a `Stream`. It is a normal chunk. See [Effect activities](../effect/activities#a-run_error-chunk-does-not-fail-the-stream).

## Activities

Each activity takes the options of its core function, without `abortSignal`. It returns `Effect.Effect<Result, AIError>`. With `stream: true`, it returns `Stream.Stream<StreamChunk, AIError>`.

| Function | Core function | Supports `stream: true` |
| --- | --- | --- |
| `summarize` | `summarize` | Yes |
| `generateImage` | `generateImage` | Yes |
| `generateAudio` | `generateAudio` | Yes |
| `generateSpeech` | `generateSpeech` | Yes |
| `generateVoice` | `generateVoice` | Yes |
| `generateTranscription` | `generateTranscription` | Yes |
| `generateVideo` | `generateVideo` | Yes |
| `generateWorld` | `generateWorld` | Yes |
| `generateLiveVideo` | `generateLiveVideo` | Yes |
| `getVideoJobStatus` | `getVideoJobStatus` | No |
| `embed` | `embed` | No |
| `rerank` | `rerank` | No |
| `decide` | `decide` | No |
| `listVoices` | `listVoices` | No |
| `uploadFile` | `uploadFile` | No |
| `getFile` | `getFile` | No |
| `deleteFile` | `deleteFile` | No |

For the core options and results, see [`@tanstack/ai`](./ai). For examples, see [Effect activities](../effect/activities).
