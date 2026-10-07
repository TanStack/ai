---
id: StructuredOutputMiddlewareConfig
title: StructuredOutputMiddlewareConfig
---

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:388](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L388)

Config passed to onStructuredOutputConfig.

Mirrors ChatMiddlewareConfig minus `tools` (the final structured-output call
is a single typed-response request, not an agentic loop — tools cannot be
forwarded to it), plus the `outputSchema` being sent to the provider.
Middleware may transform the schema (e.g., inject $defs, strip
vendor-incompatible keywords) by returning a partial that includes
`outputSchema`.

## Extends

- `Omit`\<[`ChatMiddlewareConfig`](ChatMiddlewareConfig.md), `"tools"`\>

## Properties

### activities?

```ts
optional activities?: ActivityRecord[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:340](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L340)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:335](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L335)

Canonical conversation history. Middleware and persistence read this.

#### Inherited from

[`ChatMiddlewareConfig`](ChatMiddlewareConfig.md).[`messages`](ChatMiddlewareConfig.md#messages)

***

### metadata?

```ts
optional metadata?: Record<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:347](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L347)

#### Inherited from

[`ChatMiddlewareConfig`](ChatMiddlewareConfig.md).[`metadata`](ChatMiddlewareConfig.md#metadata)

***

### modelOptions?

```ts
optional modelOptions?: Record<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:348](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L348)

#### Inherited from

[`ChatMiddlewareConfig`](ChatMiddlewareConfig.md).[`modelOptions`](ChatMiddlewareConfig.md#modeloptions)

***

### outputSchema

```ts
outputSchema: JSONSchema;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:393](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L393)

JSON Schema being sent to the provider for structured output.

***

### providerMessages?

```ts
optional providerMessages?: ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:342](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L342)

Provider-only context. Defaults to `messages` when it is not set.

#### Inherited from

[`ChatMiddlewareConfig`](ChatMiddlewareConfig.md).[`providerMessages`](ChatMiddlewareConfig.md#providermessages)

***

### resume?

```ts
optional resume?: RunAgentResumeItem[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:345](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L345)

#### Inherited from

[`ChatMiddlewareConfig`](ChatMiddlewareConfig.md).[`resume`](ChatMiddlewareConfig.md#resume)

***

### resumeToolState?

```ts
optional resumeToolState?: ChatResumeToolState;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:346](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L346)

#### Inherited from

[`ChatMiddlewareConfig`](ChatMiddlewareConfig.md).[`resumeToolState`](ChatMiddlewareConfig.md#resumetoolstate)

***

### systemPrompts

```ts
systemPrompts: SystemPrompt[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:343](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L343)

#### Inherited from

[`ChatMiddlewareConfig`](ChatMiddlewareConfig.md).[`systemPrompts`](ChatMiddlewareConfig.md#systemprompts)
