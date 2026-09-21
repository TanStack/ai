---
id: TTSOptions
title: TTSOptions
---

Defined in: [packages/ai/src/types.ts:2407](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2407)

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

Defined in: [packages/ai/src/types.ts:2447](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2447)

Effective abort signal composed by the activity from caller `abortSignal`
and/or `timeout`. Adapters should forward this to the provider SDK when
supported. Request-specific — never store on a global client config.

***

### format?

```ts
optional format?: "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm";
```

Defined in: [packages/ai/src/types.ts:2431](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2431)

The output audio format

***

### logger

```ts
logger: InternalLogger;
```

Defined in: [packages/ai/src/types.ts:2441](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2441)

Internal logger threaded from the generateSpeech() entry point. Adapters
must call logger.request() before the SDK call and logger.errors() in
catch blocks.

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2409](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2409)

The model to use for TTS generation

***

### modelOptions?

```ts
optional modelOptions?: TProviderOptions;
```

Defined in: [packages/ai/src/types.ts:2435](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2435)

Model-specific options for TTS generation

***

### speed?

```ts
optional speed?: number;
```

Defined in: [packages/ai/src/types.ts:2433](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2433)

The speed of the generated audio (0.25 to 4.0)

***

### text

```ts
text: string;
```

Defined in: [packages/ai/src/types.ts:2415](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2415)

The text to convert to speech. When the caller passed `turns`, the
activity fills this with the turn texts joined by newlines so adapters
that only read `text` still receive the full script.

***

### timestamps?

```ts
optional timestamps?: boolean;
```

Defined in: [packages/ai/src/types.ts:2427](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2427)

Ask for `alignment` / `segments` on the result. Rejected by the activity
unless the adapter declares `capabilities.timestamps`, because on some
providers this is a different endpoint rather than free metadata.

***

### turns?

```ts
optional turns?: TTSTurn[];
```

Defined in: [packages/ai/src/types.ts:2421](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2421)

Multi-voice dialogue turns, when the caller asked for dialogue. Only
adapters that declare `capabilities.maxSpeakers` ever see this — the
activity rejects `turns` for the rest.

***

### voice?

```ts
optional voice?: string;
```

Defined in: [packages/ai/src/types.ts:2429](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2429)

The voice to use for generation
