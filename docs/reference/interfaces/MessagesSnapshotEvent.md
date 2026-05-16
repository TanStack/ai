---
id: MessagesSnapshotEvent
title: MessagesSnapshotEvent
---

# Interface: MessagesSnapshotEvent

Defined in: [packages/typescript/ai/src/types.ts:1048](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1048)

Emitted to provide a snapshot of all messages in a conversation.

Unlike StateSnapshot (which carries arbitrary application state),
MessagesSnapshot specifically delivers the conversation transcript.

@ag-ui/core provides: `messages` (as @ag-ui/core Message[])
TanStack AI adds: `model?`

Note: The `messages` field uses the @ag-ui/core Message type.
Use converters to transform to/from TanStack UIMessage format.

## Extends

- `MessagesSnapshotEvent`

## Indexable

```ts
[k: string]: unknown
```

## Properties

### model?

```ts
optional model: string;
```

Defined in: [packages/typescript/ai/src/types.ts:1050](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/types.ts#L1050)

Model identifier for multi-model support
