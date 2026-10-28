---
id: StructuredOutputMiddlewareConfig
title: StructuredOutputMiddlewareConfig
---

Defined in: packages/ai/src/activities/chat/middleware/types.ts:415

Config passed to onStructuredOutputConfig.

Mirrors ChatMiddlewareConfig minus `tools` and `toolChoice` (the final
structured-output call is a single typed-response request, not an agentic
loop — tools cannot be forwarded to it), plus the `outputSchema` being sent
to the provider.
Middleware may transform the schema (e.g., inject $defs, strip
vendor-incompatible keywords) by returning a partial that includes
`outputSchema`.

## Extends

- `Omit`\<[`ChatMiddlewareConfig`](ChatMiddlewareConfig.md), `"tools"` \| `"toolChoice"`\>

## Properties

### activities?

```ts
optional activities?: ActivityRecord[];
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:347

Frontend-only AG-UI activity sidecar. Persistence loads and saves this
when an ActivityStore is configured. Never model input.

#### Inherited from

[`ChatMiddlewareConfig`](ChatMiddlewareConfig.md).[`activities`](ChatMiddlewareConfig.md#activities)

***

### messages

```ts
messages: ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:342

Canonical conversation history. Middleware and persistence read this.

#### Inherited from

[`ChatMiddlewareConfig`](ChatMiddlewareConfig.md).[`messages`](ChatMiddlewareConfig.md#messages)

***

### metadata?

```ts
optional metadata?: Record<string, unknown>;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:354

#### Inherited from

[`ChatMiddlewareConfig`](ChatMiddlewareConfig.md).[`metadata`](ChatMiddlewareConfig.md#metadata)

***

### modelOptions?

```ts
optional modelOptions?: Record<string, unknown>;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:355

#### Inherited from

[`ChatMiddlewareConfig`](ChatMiddlewareConfig.md).[`modelOptions`](ChatMiddlewareConfig.md#modeloptions)

***

### outputSchema

```ts
outputSchema: JSONSchema;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:420

JSON Schema being sent to the provider for structured output.

***

### promptCache?

```ts
optional promptCache?: ResolvedPromptCache;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:368

The prompt cache of the next model call. A returned value stays until a
middleware changes it.

#### Inherited from

[`ChatMiddlewareConfig`](ChatMiddlewareConfig.md).[`promptCache`](ChatMiddlewareConfig.md#promptcache)

***

### providerMessages?

```ts
optional providerMessages?: ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:349

Provider-only context. Defaults to `messages` when it is not set.

#### Inherited from

[`ChatMiddlewareConfig`](ChatMiddlewareConfig.md).[`providerMessages`](ChatMiddlewareConfig.md#providermessages)

***

### reasoning?

```ts
optional reasoning?: ReasoningRequest;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:357

How hard the model thinks at this call. A middleware can set or change it.

#### Inherited from

[`ChatMiddlewareConfig`](ChatMiddlewareConfig.md).[`reasoning`](ChatMiddlewareConfig.md#reasoning)

***

### resume?

```ts
optional resume?: RunAgentResumeItem[];
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:352

#### Inherited from

[`ChatMiddlewareConfig`](ChatMiddlewareConfig.md).[`resume`](ChatMiddlewareConfig.md#resume)

***

### resumeToolState?

```ts
optional resumeToolState?: ChatResumeToolState;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:353

#### Inherited from

[`ChatMiddlewareConfig`](ChatMiddlewareConfig.md).[`resumeToolState`](ChatMiddlewareConfig.md#resumetoolstate)

***

### systemPrompts

```ts
systemPrompts: SystemPrompt[];
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:350

#### Inherited from

[`ChatMiddlewareConfig`](ChatMiddlewareConfig.md).[`systemPrompts`](ChatMiddlewareConfig.md#systemprompts)

***

### wrapFetch?

```ts
optional wrapFetch?: FetchWrapper;
```

Defined in: packages/ai/src/activities/chat/middleware/types.ts:374

Wraps the fetch of the next model call. A returned wrapper chains inside
the wrappers before it, so it does not replace them. It applies to that
call only. The next call starts again from the `chat()` option.

#### Inherited from

[`ChatMiddlewareConfig`](ChatMiddlewareConfig.md).[`wrapFetch`](ChatMiddlewareConfig.md#wrapfetch)
