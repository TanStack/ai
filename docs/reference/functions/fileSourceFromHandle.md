---
id: fileSourceFromHandle
title: fileSourceFromHandle
---

```ts
function fileSourceFromHandle<TProvider>(handle): ContentPartFileSource<TProvider>;
```

Defined in: [packages/ai/src/activities/files/index.ts:104](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/files/index.ts#L104)

Build a `{ type: 'file' }` content source from an uploaded
[FileHandle](../interfaces/FileHandle.md), for use in a chat message (image/audio/document part
`source`).

The source's `value` is the handle's wire form: the handle URL when the
provider exposes one (Gemini, fal, Grok), otherwise the opaque id (OpenAI,
Anthropic). `provider` records the issuer, so an adapter for a different
provider rejects the source rather than sending a handle it cannot resolve.

## Type Parameters

### TProvider

`TProvider` *extends* `string`

## Parameters

### handle

[`FileHandle`](../interfaces/FileHandle.md)\<`TProvider`\>

## Returns

[`ContentPartFileSource`](../interfaces/ContentPartFileSource.md)\<`TProvider`\>

## Example

```ts
const handle = await uploadFile({ adapter: openaiFiles(), input })
messages.push({ role: 'user', content: [
  { type: 'image', source: fileSourceFromHandle(handle) },
] })
```
