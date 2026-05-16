---
id: chatParamsFromRequestBody
title: chatParamsFromRequestBody
---

# Function: chatParamsFromRequestBody()

```ts
function chatParamsFromRequestBody(body): Promise<{
  context: object[];
  forwardedProps: Record<string, unknown>;
  messages: (
     | UIMessage
     | ModelMessage<
     | string
     | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
    | null>)[];
  parentRunId?: string;
  runId: string;
  state: unknown;
  threadId: string;
  tools: object[];
}>;
```

Defined in: [packages/typescript/ai/src/utilities/chat-params.ts:38](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/utilities/chat-params.ts#L38)

Parse and validate an HTTP request body as an AG-UI `RunAgentInput`.

Returns a spread-friendly object whose `messages` field is suitable for
passing directly to `chat({ messages })`. The existing
`convertMessagesToModelMessages` handles AG-UI fan-out dedup and
reasoning/activity/developer-role normalization internally.

## Parameters

### body

`unknown`

## Returns

`Promise`\<\{
  `context`: `object`[];
  `forwardedProps`: `Record`\<`string`, `unknown`\>;
  `messages`: (
     \| [`UIMessage`](../interfaces/UIMessage.md)
     \| [`ModelMessage`](../interfaces/ModelMessage.md)\<
     \| `string`
     \| [`ContentPart`](../type-aliases/ContentPart.md)\<`unknown`, `unknown`, `unknown`, `unknown`, `unknown`\>[]
    \| `null`\>)[];
  `parentRunId?`: `string`;
  `runId`: `string`;
  `state`: `unknown`;
  `threadId`: `string`;
  `tools`: `object`[];
\}\>

## Throws

An error with a migration-pointing message when the body does
  not conform to AG-UI 0.0.52 `RunAgentInputSchema`. Surface this as a
  400 Bad Request to the client.
