---
id: TTSOptions
title: TTSOptions
---

Defined in: [packages/ai/src/types.ts:2429](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2429)

Options for text-to-speech generation.
These are the common options supported across providers.

## Type Parameters

### TProviderOptions

`TProviderOptions` *extends* `object` = `object`

## Properties

### abortSignal?

```ts
optional abortSignal?: AbortSignal;
```

Defined in: [packages/ai/src/types.ts:2469](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2469)

Effective abort signal composed by the activity from caller `abortSignal`
and/or `timeout`. Adapters should forward this to the provider SDK when
supported. Request-specific — never store on a global client config.

***

### format?

```ts
optional format?: "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm";
```

Defined in: [packages/ai/src/types.ts:2453](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2453)

The output audio format

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:2463](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2463)

Internal logger threaded from the generateSpeech() entry point. Adapters
must call logger.request() before the SDK call and logger.errors() in
catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2431](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2431)

The model to use for TTS generation

***

### modelOptions?

```ts
optional modelOptions?: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:2457](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2457)

Model-specific options for TTS generation

***

### speed?

```ts
optional speed?: number;
```

Defined in: [packages/ai/src/types.ts:2455](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2455)

The speed of the generated audio (0.25 to 4.0)

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:2437](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2437)

The text to convert to speech. When the caller passed `turns`, the
activity fills this with the turn texts joined by newlines so adapters
that only read `text` still receive the full script.

***

### timestamps?

```ts
optional timestamps?: boolean;
```

Defined in: [packages/ai/src/types.ts:2449](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2449)

Ask for `alignment` / `segments` on the result. Rejected by the activity
unless the adapter declares `capabilities.timestamps`, because on some
providers this is a different endpoint rather than free metadata.

***

### turns?

```ts
optional turns?: TTSTurn[];
```

Defined in: [packages/ai/src/types.ts:2443](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2443)

Multi-voice dialogue turns, when the caller asked for dialogue. Only
adapters that declare `capabilities.maxSpeakers` ever see this — the
activity rejects `turns` for the rest.

***

### voice?

```ts
optional voice?: string;
```

Defined in: [packages/ai/src/types.ts:2451](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2451)

The voice to use for generation
