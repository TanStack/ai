---
id: FetchWrapper
title: FetchWrapper
---

```ts
type FetchWrapper = (next) => typeof fetch;
```

Defined in: [packages/ai/src/types.ts:1118](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L1118)

Wraps the fetch of a model call. It gets the next fetch and gives back a
new fetch. A wrapper can change the URL, the headers, the request, or the
response.

## Parameters

### next

*typeof* `fetch`

## Returns

*typeof* `fetch`
