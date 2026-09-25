---
id: ContentPartFileSource
title: ContentPartFileSource
---

Defined in: [packages/ai/src/types.ts:250](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L250)

A provider-issued file handle (Files API). AG-UI `FileSource`: the handle
is opaque, do not fetch or parse it.

The media is uploaded once via a `files` adapter (`openaiFiles()`,
`anthropicFiles()`, `geminiFiles()`, `grokFiles()`, `falFiles()`) and
referenced here by the returned handle instead of re-sending base64 or a
public URL on each request. Only the provider that minted a handle can
resolve it. Adapters that cannot consume file handles at all are rejected
by the activity-layer preflight before mapping starts.

## Extends

- `FileSource`

## Type Parameters

### TProvider

`TProvider` *extends* `string` = `string`

## Properties

### provider?

```ts
optional provider?: TProvider;
```

Defined in: [packages/ai/src/types.ts:258](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L258)

The adapter name of the provider that issued the handle (`'openai'`,
`'gemini'`, ...), the same id TanStack reports as the usage provider.
When present, an adapter rejects a handle another provider issued.

#### Overrides

```ts
AGUIFileSource.provider
```
