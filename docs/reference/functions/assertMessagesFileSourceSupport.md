---
id: assertMessagesFileSourceSupport
title: assertMessagesFileSourceSupport
---

```ts
function assertMessagesFileSourceSupport(adapter, messages): void;
```

Defined in: [packages/ai/src/utilities/content-source.ts:123](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/content-source.ts#L123)

Fail-closed preflight for chat messages: throws when any message content
part carries a `{ type: 'file' }` source and the adapter hasn't declared
`supportsFileSources`. See [assertPromptFileSourceSupport](assertPromptFileSourceSupport.md).

## Parameters

### adapter

[`FileSourceCapable`](../interfaces/FileSourceCapable.md)

### messages

readonly `unknown`[]

## Returns

`void`
