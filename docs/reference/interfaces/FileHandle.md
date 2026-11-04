---
id: FileHandle
title: FileHandle
---

Defined in: [packages/ai/src/activities/files/adapter.ts:41](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/files/adapter.ts#L41)

A provider-issued file handle returned by [FilesAdapter.upload](FilesAdapter.md#upload) /
[FilesAdapter.get](FilesAdapter.md#get). Reference it in a message via a `{ type: 'file' }`
content source — use `fileSourceFromHandle` to build one.

`TProvider` carries the issuing provider's name as a literal (`'openai'`,
`'gemini'`, ...) when the handle came from a concrete files adapter, so
cross-provider lifecycle calls (`deleteFile` with a foreign handle) fail at
compile time. It defaults to `string` so wire-deserialized handles still fit.

## Type Parameters

### TProvider

`TProvider` *extends* `string` = `string`

## Properties

### expiresAt?

```ts
optional expiresAt?: number;
```

Defined in: [packages/ai/src/activities/files/adapter.ts:62](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/files/adapter.ts#L62)

Expiry as epoch milliseconds when the handle is scheduled to expire.

***

### filename?

```ts
optional filename?: string;
```

Defined in: [packages/ai/src/activities/files/adapter.ts:64](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/files/adapter.ts#L64)

Original filename when the provider reports it.

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/activities/files/adapter.ts:48](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/files/adapter.ts#L48)

Provider handle used for lifecycle operations (`get`/`delete`): the
OpenAI/Anthropic `file_id`, the Gemini file resource name (`files/...`), or
the fal storage URL (fal itself has no lifecycle API — the URL doubles as
the wire reference).

***

### mimeType?

```ts
optional mimeType?: string;
```

Defined in: [packages/ai/src/activities/files/adapter.ts:58](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/files/adapter.ts#L58)

MIME type reported by the provider (or echoed from the upload input).

***

### provider

```ts
provider: TProvider;
```

Defined in: [packages/ai/src/activities/files/adapter.ts:50](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/files/adapter.ts#L50)

The provider that issued the handle (`'openai'`, `'gemini'`, ...).

***

### sizeBytes?

```ts
optional sizeBytes?: number;
```

Defined in: [packages/ai/src/activities/files/adapter.ts:60](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/files/adapter.ts#L60)

File size in bytes when the provider reports it.

***

### uri?

```ts
optional uri?: string;
```

Defined in: [packages/ai/src/activities/files/adapter.ts:56](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/files/adapter.ts#L56)

The handle's URL form when the provider exposes one (Gemini file URI, fal
storage URL). For providers whose handle is an opaque id (OpenAI,
Anthropic) this is `undefined`.
