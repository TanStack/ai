---
id: StructuredOutputMiddlewareConfig
title: StructuredOutputMiddlewareConfig
---

# Interface: StructuredOutputMiddlewareConfig

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:251](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L251)

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

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:213](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L213)

#### Inherited from

[`ChatMiddlewareConfig`](ChatMiddlewareConfig.md).[`messages`](ChatMiddlewareConfig.md#messages)

***

### metadata?

```ts
optional metadata?: Record<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:218](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L218)

#### Inherited from

[`ChatMiddlewareConfig`](ChatMiddlewareConfig.md).[`metadata`](ChatMiddlewareConfig.md#metadata)

***

### modelOptions?

```ts
optional modelOptions?: Record<string, unknown>;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:219](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L219)

#### Inherited from

[`ChatMiddlewareConfig`](ChatMiddlewareConfig.md).[`modelOptions`](ChatMiddlewareConfig.md#modeloptions)

***

### outputSchema

```ts
outputSchema: JSONSchema;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:256](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L256)

JSON Schema being sent to the provider for structured output.

***

### resume?

```ts
optional resume?: ResumeEntry[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:216](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L216)

#### Inherited from

[`ChatMiddlewareConfig`](ChatMiddlewareConfig.md).[`resume`](ChatMiddlewareConfig.md#resume)

***

### resumeToolState?

```ts
optional resumeToolState?: ChatResumeToolState;
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:217](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L217)

#### Inherited from

[`ChatMiddlewareConfig`](ChatMiddlewareConfig.md).[`resumeToolState`](ChatMiddlewareConfig.md#resumetoolstate)

***

### systemPrompts

```ts
systemPrompts: SystemPrompt[];
```

Defined in: [packages/ai/src/activities/chat/middleware/types.ts:214](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/middleware/types.ts#L214)

#### Inherited from

[`ChatMiddlewareConfig`](ChatMiddlewareConfig.md).[`systemPrompts`](ChatMiddlewareConfig.md#systemprompts)
