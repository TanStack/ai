---
id: resolveResumeRunId
title: resolveResumeRunId
---

# Function: resolveResumeRunId()

```ts
function resolveResumeRunId(request): string | null;
```

Defined in: [packages/ai/src/stream-durability.ts:141](https://github.com/TanStack/ai/blob/main/packages/ai/src/stream-durability.ts#L141)

The run id a request names: `X-Run-Id` header first, then `?runId`.

The single implementation of that precedence, shared by the durability
adapters below and by the resume response helpers' run driver
(`stream-to-response.ts`), so the helper and the adapter can never disagree
about which run a request is talking about.

## Parameters

### request

`Request`

## Returns

`string` \| `null`
