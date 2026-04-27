---
id: DebugCategories
title: DebugCategories
---

# Interface: DebugCategories

Defined in: [packages/typescript/ai/src/logger/types.ts:30](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/logger/types.ts#L30)

Per-category toggles for debug logging. Each flag enables or disables one class of log message. Unspecified flags default to `true` when `DebugConfig` is partially specified; `undefined` on the `debug` option defaults all flags to `false` except `errors`.

## Extended by

- [`DebugConfig`](DebugConfig.md)

## Properties

### agentLoop?

```ts
optional agentLoop: boolean;
```

Defined in: [packages/typescript/ai/src/logger/types.ts:50](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/logger/types.ts#L50)

Iteration markers and phase transitions in the chat agent loop. Chat-only.

***

### config?

```ts
optional config: boolean;
```

Defined in: [packages/typescript/ai/src/logger/types.ts:54](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/logger/types.ts#L54)

Config transforms returned by middleware `onConfig` hooks. Chat-only.

***

### errors?

```ts
optional errors: boolean;
```

Defined in: [packages/typescript/ai/src/logger/types.ts:58](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/logger/types.ts#L58)

Caught errors throughout the pipeline. Unlike other categories, defaults to `true` even when `debug` is unspecified. Explicitly set `errors: false` or `debug: false` to silence.

***

### middleware?

```ts
optional middleware: boolean;
```

Defined in: [packages/typescript/ai/src/logger/types.ts:42](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/logger/types.ts#L42)

Inputs and outputs around each middleware hook invocation. Chat-only.

***

### output?

```ts
optional output: boolean;
```

Defined in: [packages/typescript/ai/src/logger/types.ts:38](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/logger/types.ts#L38)

Chunks/results yielded to the consumer after all middleware. For streaming activities this fires per chunk; for non-streaming activities it fires once per result.

***

### provider?

```ts
optional provider: boolean;
```

Defined in: [packages/typescript/ai/src/logger/types.ts:34](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/logger/types.ts#L34)

Raw chunks/frames received from a provider SDK (OpenAI, Anthropic, Gemini, Ollama, Grok, Groq, OpenRouter, fal, ElevenLabs). Emitted inside every streaming adapter's chunk loop.

***

### request?

```ts
optional request: boolean;
```

Defined in: [packages/typescript/ai/src/logger/types.ts:62](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/logger/types.ts#L62)

Outgoing call metadata (provider, model, message/tool counts) emitted before each adapter SDK call.

***

### tools?

```ts
optional tools: boolean;
```

Defined in: [packages/typescript/ai/src/logger/types.ts:46](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/logger/types.ts#L46)

Before/after tool-call execution in the chat agent loop. Chat-only.
