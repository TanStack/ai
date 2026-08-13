---
id: DebugConfig
title: DebugConfig
---

# Interface: DebugConfig

Defined in: [packages/ai/src/logger/types.ts:73](https://github.com/TanStack/ai/blob/main/packages/ai/src/logger/types.ts#L73)

Granular debug configuration combining per-category toggles with an optional custom logger. Any unspecified category flag defaults to `true`.

## Extends

- [`DebugCategories`](DebugCategories.md)

## Properties

### agentLoop?

```ts
optional agentLoop: boolean;
```

Defined in: [packages/ai/src/logger/types.ts:50](https://github.com/TanStack/ai/blob/main/packages/ai/src/logger/types.ts#L50)

Iteration markers and phase transitions in the chat agent loop. Chat-only.

#### Inherited from

[`DebugCategories`](DebugCategories.md).[`agentLoop`](DebugCategories.md#agentloop)

***

### config?

```ts
optional config: boolean;
```

Defined in: [packages/ai/src/logger/types.ts:54](https://github.com/TanStack/ai/blob/main/packages/ai/src/logger/types.ts#L54)

Config transforms returned by middleware `onConfig` hooks. Chat-only.

#### Inherited from

[`DebugCategories`](DebugCategories.md).[`config`](DebugCategories.md#config)

***

### errors?

```ts
optional errors: boolean;
```

Defined in: [packages/ai/src/logger/types.ts:58](https://github.com/TanStack/ai/blob/main/packages/ai/src/logger/types.ts#L58)

Caught errors throughout the pipeline. Unlike other categories, defaults to `true` even when `debug` is unspecified. Explicitly set `errors: false` or `debug: false` to silence.

#### Inherited from

[`DebugCategories`](DebugCategories.md).[`errors`](DebugCategories.md#errors)

***

### logger?

```ts
optional logger: Logger;
```

Defined in: [packages/ai/src/logger/types.ts:77](https://github.com/TanStack/ai/blob/main/packages/ai/src/logger/types.ts#L77)

Custom `Logger` implementation. When omitted, a default `ConsoleLogger` routes output to `console.debug`/`info`/`warn`/`error`.

***

### middleware?

```ts
optional middleware: boolean;
```

Defined in: [packages/ai/src/logger/types.ts:42](https://github.com/TanStack/ai/blob/main/packages/ai/src/logger/types.ts#L42)

Inputs and outputs around each middleware hook invocation. Chat-only.

#### Inherited from

[`DebugCategories`](DebugCategories.md).[`middleware`](DebugCategories.md#middleware)

***

### output?

```ts
optional output: boolean;
```

Defined in: [packages/ai/src/logger/types.ts:38](https://github.com/TanStack/ai/blob/main/packages/ai/src/logger/types.ts#L38)

Chunks/results yielded to the consumer after all middleware. For streaming activities this fires per chunk; for non-streaming activities it fires once per result.

#### Inherited from

[`DebugCategories`](DebugCategories.md).[`output`](DebugCategories.md#output)

***

### provider?

```ts
optional provider: boolean;
```

Defined in: [packages/ai/src/logger/types.ts:34](https://github.com/TanStack/ai/blob/main/packages/ai/src/logger/types.ts#L34)

Raw chunks/frames received from a provider SDK (OpenAI, Anthropic, Gemini, Ollama, Grok, Groq, OpenRouter, fal, ElevenLabs). Emitted inside every streaming adapter's chunk loop.

#### Inherited from

[`DebugCategories`](DebugCategories.md).[`provider`](DebugCategories.md#provider)

***

### request?

```ts
optional request: boolean;
```

Defined in: [packages/ai/src/logger/types.ts:62](https://github.com/TanStack/ai/blob/main/packages/ai/src/logger/types.ts#L62)

Outgoing call metadata (provider, model, message/tool counts) emitted before each adapter SDK call.

#### Inherited from

[`DebugCategories`](DebugCategories.md).[`request`](DebugCategories.md#request)

***

### sandbox?

```ts
optional sandbox: boolean;
```

Defined in: [packages/ai/src/logger/types.ts:67](https://github.com/TanStack/ai/blob/main/packages/ai/src/logger/types.ts#L67)

Sandbox internals: watcher start/stop + mechanism, file events, sandbox
hook dispatch, ensure/bootstrap and lifecycle transitions. Chat-only.

#### Inherited from

[`DebugCategories`](DebugCategories.md).[`sandbox`](DebugCategories.md#sandbox)

***

### tools?

```ts
optional tools: boolean;
```

Defined in: [packages/ai/src/logger/types.ts:46](https://github.com/TanStack/ai/blob/main/packages/ai/src/logger/types.ts#L46)

Before/after tool-call execution in the chat agent loop. Chat-only.

#### Inherited from

[`DebugCategories`](DebugCategories.md).[`tools`](DebugCategories.md#tools)
