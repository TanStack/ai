---
id: mergeAgentTools
title: mergeAgentTools
---

# Function: mergeAgentTools()

## Call Signature

```ts
function mergeAgentTools<TServerTools>(serverTools, clientTools): TServerTools;
```

Defined in: [packages/ai/src/utilities/chat-params.ts:359](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/chat-params.ts#L359)

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

Typing:
- Empty `clientTools` preserves the server tuple (closed name union).
- Non-empty `clientTools` returns a widened array that honestly includes
  client stubs, so `TypedStreamChunk` does not claim a closed server-only
  name union.

### Type Parameters

#### TServerTools

`TServerTools` *extends* readonly [`AnyTool`](../type-aliases/AnyTool.md)[]

### Parameters

#### serverTools

`TServerTools`

The server's tool array (e.g. from
  `[myToolDef.server(...)]`). Pass directly to `chat({ tools })`.

#### clientTools

readonly \[\]

The `tools` array received from
  `chatParamsFromRequest(...)` / `chatParamsFromRequestBody(...)`.

### Returns

`TServerTools`

A merged array suitable for `chat({ tools })`.

## Call Signature

```ts
function mergeAgentTools<TServerTools>(serverTools, clientTools): MergedAgentTools<TServerTools>;
```

Defined in: [packages/ai/src/utilities/chat-params.ts:362](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/chat-params.ts#L362)

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

Typing:
- Empty `clientTools` preserves the server tuple (closed name union).
- Non-empty `clientTools` returns a widened array that honestly includes
  client stubs, so `TypedStreamChunk` does not claim a closed server-only
  name union.

### Type Parameters

#### TServerTools

`TServerTools` *extends* readonly [`AnyTool`](../type-aliases/AnyTool.md)[]

### Parameters

#### serverTools

`TServerTools`

The server's tool array (e.g. from
  `[myToolDef.server(...)]`). Pass directly to `chat({ tools })`.

#### clientTools

readonly `object`[]

The `tools` array received from
  `chatParamsFromRequest(...)` / `chatParamsFromRequestBody(...)`.

### Returns

[`MergedAgentTools`](../type-aliases/MergedAgentTools.md)\<`TServerTools`\>

A merged array suitable for `chat({ tools })`.
