---
id: StructuredOutputMiddlewareConfig
title: StructuredOutputMiddlewareConfig
---

# Interface: StructuredOutputMiddlewareConfig

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:362](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L362)

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

### messages

```ts
messages: ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:315](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L315)

Canonical conversation history. Middleware and persistence read this.

#### Inherited from

[`ChatMiddlewareConfig`](ChatMiddlewareConfig.md).[`messages`](ChatMiddlewareConfig.md#messages)

***

### metadata?

```ts
optional metadata?: Record<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:322](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L322)

#### Inherited from

[`ChatMiddlewareConfig`](ChatMiddlewareConfig.md).[`metadata`](ChatMiddlewareConfig.md#metadata)

***

### modelOptions?

```ts
optional modelOptions?: Record<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:323](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L323)

#### Inherited from

[`ChatMiddlewareConfig`](ChatMiddlewareConfig.md).[`modelOptions`](ChatMiddlewareConfig.md#modeloptions)

***

### outputSchema

```ts
outputSchema: JSONSchema;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:367](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L367)

JSON Schema being sent to the provider for structured output.

***

### providerMessages?

```ts
optional providerMessages?: ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:317](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L317)

Provider-only context. Defaults to `messages` when it is not set.

#### Inherited from

[`ChatMiddlewareConfig`](ChatMiddlewareConfig.md).[`providerMessages`](ChatMiddlewareConfig.md#providermessages)

***

### resume?

```ts
optional resume?: RunAgentResumeItem[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:320](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L320)

#### Inherited from

[`ChatMiddlewareConfig`](ChatMiddlewareConfig.md).[`resume`](ChatMiddlewareConfig.md#resume)

***

### resumeToolState?

```ts
optional resumeToolState?: ChatResumeToolState;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:321](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L321)

#### Inherited from

[`ChatMiddlewareConfig`](ChatMiddlewareConfig.md).[`resumeToolState`](ChatMiddlewareConfig.md#resumetoolstate)

***

### systemPrompts

```ts
systemPrompts: SystemPrompt[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:318](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L318)

#### Inherited from

[`ChatMiddlewareConfig`](ChatMiddlewareConfig.md).[`systemPrompts`](ChatMiddlewareConfig.md#systemprompts)
