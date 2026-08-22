---
id: chatParamsFromRequestBody
title: chatParamsFromRequestBody
---

# Function: chatParamsFromRequestBody()

```ts
function chatParamsFromRequestBody(body): Promise<{
  aguiContext: Context[];
  context: Context[];
  forwardedProps: Record<string, unknown>;
  messages: (
     | ModelMessage<
     | string
     | ContentPart<unknown, unknown, unknown, unknown, unknown>[]
     | null>
    | UIMessage<unknown>)[];
  parentRunId?: string;
  resume?: RunAgentResumeItem[];
  runId: string;
  state: unknown;
  threadId: string;
  tools: object[];
}>;
```

Defined in: [packages/ai/src/utilities/chat-params.ts:204](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/chat-params.ts#L204)

Parse and validate an HTTP request body as an AG-UI `RunAgentInput`.

Returns a spread-friendly object whose `messages` field is suitable for
passing directly to `chat({ messages })`. The existing
`convertMessagesToModelMessages` handles AG-UI fan-out dedup and
reasoning/activity/developer-role normalization internally.

Validated structurally against the AG-UI `RunAgentInput` contract without a
schema library, so this package pulls in no validation runtime of its own.

## Parameters

### body

`unknown`

## Returns

`Promise`\<\{
  `aguiContext`: `Context`[];
  `context`: `Context`[];
  `forwardedProps`: `Record`\<`string`, `unknown`\>;
  `messages`: (
     \| [`ModelMessage`](../interfaces/ModelMessage.md)\<
     \| `string`
     \| [`ContentPart`](../type-aliases/ContentPart.md)\<`unknown`, `unknown`, `unknown`, `unknown`, `unknown`\>[]
     \| `null`\>
    \| [`UIMessage`](../interfaces/UIMessage.md)\<`unknown`\>)[];
  `parentRunId?`: `string`;
  `resume?`: [`RunAgentResumeItem`](../type-aliases/RunAgentResumeItem.md)[];
  `runId`: `string`;
  `state`: `unknown`;
  `threadId`: `string`;
  `tools`: `object`[];
\}\>

## Throws

An error with a migration-pointing message when the body does
  not conform to AG-UI `RunAgentInput`. Surface this as a
  400 Bad Request to the client.
