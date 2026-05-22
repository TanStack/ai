---
id: StructuredOutputMiddlewareConfig
title: StructuredOutputMiddlewareConfig
---

# Interface: StructuredOutputMiddlewareConfig

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:147](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L147)

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

### maxTokens?

```ts
optional maxTokens: number;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:132](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L132)

#### Inherited from

[`ChatMiddlewareConfig`](ChatMiddlewareConfig.md).[`maxTokens`](ChatMiddlewareConfig.md#maxtokens)

***

### messages

```ts
messages: ModelMessage<
  | string
  | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
  | null>[];
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:127](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L127)

#### Inherited from

[`ChatMiddlewareConfig`](ChatMiddlewareConfig.md).[`messages`](ChatMiddlewareConfig.md#messages)

***

### metadata?

```ts
optional metadata: Record<string, unknown>;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:133](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L133)

#### Inherited from

[`ChatMiddlewareConfig`](ChatMiddlewareConfig.md).[`metadata`](ChatMiddlewareConfig.md#metadata)

***

### modelOptions?

```ts
optional modelOptions: Record<string, unknown>;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:134](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L134)

#### Inherited from

[`ChatMiddlewareConfig`](ChatMiddlewareConfig.md).[`modelOptions`](ChatMiddlewareConfig.md#modeloptions)

***

### outputSchema

```ts
outputSchema: JSONSchema;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:152](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L152)

JSON Schema being sent to the provider for structured output.

***

### systemPrompts

```ts
systemPrompts: SystemPrompt[];
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:128](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L128)

#### Inherited from

[`ChatMiddlewareConfig`](ChatMiddlewareConfig.md).[`systemPrompts`](ChatMiddlewareConfig.md#systemprompts)

***

### temperature?

```ts
optional temperature: number;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:130](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L130)

#### Inherited from

[`ChatMiddlewareConfig`](ChatMiddlewareConfig.md).[`temperature`](ChatMiddlewareConfig.md#temperature)

***

### topP?

```ts
optional topP: number;
```

Defined in: [packages/typescript/ai/src/activities/chat/middleware/types.ts:131](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/activities/chat/middleware/types.ts#L131)

#### Inherited from

[`ChatMiddlewareConfig`](ChatMiddlewareConfig.md).[`topP`](ChatMiddlewareConfig.md#topp)
