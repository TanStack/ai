---
id: ActivitySnapshotEvent
title: ActivitySnapshotEvent
---

Defined in: packages/ai/src/types.ts:1999

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

Defined in: packages/ai/src/types.ts:2003
