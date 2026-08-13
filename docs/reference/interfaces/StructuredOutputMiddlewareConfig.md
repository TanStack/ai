---
id: StructuredOutputMiddlewareConfig
title: StructuredOutputMiddlewareConfig
---

# Interface: StructuredOutputMiddlewareConfig

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:225](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L225)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:208](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L208)

#### Inherited from

[`ChatMiddlewareConfig`](ChatMiddlewareConfig.md).[`messages`](ChatMiddlewareConfig.md#messages)

***

### metadata?

```ts
optional metadata: Record<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:211](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L211)

#### Inherited from

[`ChatMiddlewareConfig`](ChatMiddlewareConfig.md).[`metadata`](ChatMiddlewareConfig.md#metadata)

***

### modelOptions?

```ts
optional modelOptions: Record<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:212](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L212)

#### Inherited from

[`ChatMiddlewareConfig`](ChatMiddlewareConfig.md).[`modelOptions`](ChatMiddlewareConfig.md#modeloptions)

***

### outputSchema

```ts
outputSchema: JSONSchema;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:230](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L230)

JSON Schema being sent to the provider for structured output.

***

### systemPrompts

```ts
systemPrompts: SystemPrompt[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:209](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L209)

#### Inherited from

[`ChatMiddlewareConfig`](ChatMiddlewareConfig.md).[`systemPrompts`](ChatMiddlewareConfig.md#systemprompts)
