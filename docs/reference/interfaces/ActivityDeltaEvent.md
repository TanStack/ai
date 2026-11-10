---
id: ActivityDeltaEvent
title: ActivityDeltaEvent
---

Defined in: [packages/ai/src/types.ts:2103](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2103)

RFC 6902 JSON Patch against an existing activity's `content`.

@ag-ui/core provides: `messageId`, `activityType`, `patch`, `metadata?`,
`subagentRunId?`

## Extends

- `Omit`\<`AGUIActivityDeltaEvent`, `"type"`\>

## Properties

### type

```ts
type: "ACTIVITY_DELTA";
```

Defined in: [packages/ai/src/types.ts:2107](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2107)
