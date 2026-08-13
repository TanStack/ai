---
id: isProviderExecutedToolCall
title: isProviderExecutedToolCall
---

# Function: isProviderExecutedToolCall()

```ts
function isProviderExecutedToolCall(toolCall): boolean;
```

Defined in: [packages/ai/src/utilities/provider-executed.ts:28](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/provider-executed.ts#L28)

True when a tool call was executed by the provider (e.g. Anthropic
`web_search` / `web_fetch` server tools) rather than the agent loop. Such
calls must not be routed to client-side execution and are already "complete".

## Parameters

### toolCall

\{
`metadata?`: `unknown`;
\} | `null` | `undefined`

## Returns

`boolean`
