---
id: DISCOVERY_TOOL_NAME
title: DISCOVERY_TOOL_NAME
---

# Variable: DISCOVERY\_TOOL\_NAME

```ts
const DISCOVERY_TOOL_NAME: "__lazy__tool__discovery__" = '__lazy__tool__discovery__';
```

Defined in: [packages/ai/src/activities/chat/tools/lazy-tool-manager.ts:12](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/lazy-tool-manager.ts#L12)

Name of the synthetic tool the LLM calls to discover lazy tools.

Exported so callers building custom message-compaction / history-trimming
logic can reference the discovery tool by constant instead of hard-coding
the string (which is an internal contract that could change).
