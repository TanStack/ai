---
id: ActivityPart
title: ActivityPart
---

Defined in: [packages/ai/src/types.ts:495](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L495)

Frontend-only AG-UI activity. Never converted into ModelMessage input.
Mirrors [ActivityMessage](https://docs.ag-ui.com/concepts/messages):
`activityType` selects a renderer; `content` is the structured payload.

## Extends

- `Pick`\<`AGUIActivityMessage`, `"activityType"` \| `"content"` \| `"subagentRunId"`\>

## Properties

### type

```ts
type: "activity";
```

Defined in: [packages/ai/src/types.ts:499](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L499)
