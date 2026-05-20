---
id: mergeAgentTools
title: mergeAgentTools
---

# Function: mergeAgentTools()

```ts
function mergeAgentTools(serverTools, clientTools): Tool<SchemaInput, SchemaInput, string>[];
```

Defined in: [packages/typescript/ai/src/utilities/chat-params.ts:174](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/utilities/chat-params.ts#L174)

Merge a server-side tool array with the AG-UI client-declared tools
received in the request body.

Rules:
- Server tools win on name collision. The client's declaration is
  ignored if the server already has a tool with that name. The client's
  UI-side handler still fires when the streamed tool-result event comes
  through (see `chat-client.ts` `onToolCall`), giving the
  "after server execution the client also handles" semantic for free.
- Client-only tools (name not in `serverTools`) become no-execute
  entries: the runtime's existing `ClientToolRequest` path handles
  them — server emits a tool-call request, client executes via its
  registered handler, client posts back the result.

## Parameters

### serverTools

readonly [`Tool`](../interfaces/Tool.md)\<[`SchemaInput`](../type-aliases/SchemaInput.md), [`SchemaInput`](../type-aliases/SchemaInput.md), `string`\>[]

The server's tool array (e.g. from
  `[myToolDef.server(...)]`). Pass directly to `chat({ tools })`.

### clientTools

readonly `object`[]

The `tools` array received from
  `chatParamsFromRequest(...)` / `chatParamsFromRequestBody(...)`.

## Returns

[`Tool`](../interfaces/Tool.md)\<[`SchemaInput`](../type-aliases/SchemaInput.md), [`SchemaInput`](../type-aliases/SchemaInput.md), `string`\>[]

A merged array suitable for `chat({ tools })`.
