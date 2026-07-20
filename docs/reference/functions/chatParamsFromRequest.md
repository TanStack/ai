---
id: chatParamsFromRequest
title: chatParamsFromRequest
---

# Function: chatParamsFromRequest()

```ts
function chatParamsFromRequest(req): Promise<{
  aguiContext: object[];
  context: object[];
  forwardedProps: Record<string, unknown>;
  messages: (
     | ModelMessage<
     | string
     | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
     | null>
    | UIMessage<unknown>)[];
  parentRunId?: string;
  runId: string;
  state: unknown;
  threadId: string;
  tools: object[];
}>;
```

Defined in: [packages/ai/src/utilities/chat-params.ts:134](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/chat-params.ts#L134)

Read an HTTP `Request`, parse its JSON body, and validate it as an
AG-UI `RunAgentInput` — collapsing the standard `req.json()` +
`chatParamsFromRequestBody(...)` pair into a single call.

On a malformed body or invalid AG-UI shape, this **throws a
`Response`** with status 400 and a migration-pointing message in the
body. Frameworks that natively handle thrown `Response` objects
(TanStack Start, SolidStart, Remix, React Router 7) will return the
400 to the client automatically, so the handler reduces to:

```ts
export async function POST(req: Request) {
  const params = await chatParamsFromRequest(req)
  // ...use params
}
```

In frameworks that do not auto-handle thrown `Response` objects
(Next.js Route Handlers, SvelteKit, Hono, raw Node), wrap the call
with try/catch and return the caught Response yourself, or use
`chatParamsFromRequestBody` directly with your own JSON-parsing.

## Parameters

### req

`Request`

## Returns

`Promise`\<\{
  `aguiContext`: `object`[];
  `context`: `object`[];
  `forwardedProps`: `Record`\<`string`, `unknown`\>;
  `messages`: (
     \| [`ModelMessage`](../interfaces/ModelMessage.md)\<
     \| `string`
     \| [`ContentPart`](../type-aliases/ContentPart.md)\<`unknown`, `unknown`, `unknown`, `unknown`, `unknown`\>[]
     \| `null`\>
    \| [`UIMessage`](../interfaces/UIMessage.md)\<`unknown`\>)[];
  `parentRunId?`: `string`;
  `runId`: `string`;
  `state`: `unknown`;
  `threadId`: `string`;
  `tools`: `object`[];
\}\>

## Throws

400 on malformed JSON or invalid AG-UI shape.
