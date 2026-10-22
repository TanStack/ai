---
id: ActivitySnapshotEvent
title: ActivitySnapshotEvent
---

Defined in: [packages/ai/src/types.ts:2079](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2079)

Full activity state for an `ActivityMessage`.

@ag-ui/core provides: `messageId`, `activityType`, `content`, `replace?`,
`metadata?`, `subagentRunId?`. When `replace` is omitted it means `true`.

## Extends

- `Omit`\<`AGUIActivitySnapshotEvent`, `"type"`\>

## Properties

### type

```ts
type: "ACTIVITY_SNAPSHOT";
```

Defined in: [packages/ai/src/types.ts:2083](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2083)
