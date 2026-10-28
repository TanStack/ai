---
id: uiMessagesToWire
title: uiMessagesToWire
---

```ts
function uiMessagesToWire(messages, options?): WireMessage[];
```

Defined in: packages/ai/src/utilities/ag-ui-wire.ts:101

Serialize TanStack `UIMessage`s and `ModelMessage`s into the AG-UI
`RunAgentInput.messages` wire shape. Anchors are spec-only (`id`, `role`,
`name`, `content`, `toolCalls`, `metadata`). Tool results and thinking parts
on assistant messages are additionally emitted as fan-out
`{role:'tool',...}` and `{role:'reasoning',...}` entries for strict AG-UI
server consumers. Set `includeSnapshotStructuredOutput` to retain complete
structured-output metadata for UI snapshots. Set `includeActivity` to emit
AG-UI `ActivityMessage` rows (MESSAGES_SNAPSHOT only — default omit so
RunAgentInput never carries activity). An assistant message whose
parts leave the default block order goes out as several rows in the real
order (see `TanStackMessageMetadata.continues`). A tool result also ends a
row, and its tool row follows that row.

## Parameters

### messages

(
  \| [`UIMessage`](../interfaces/UIMessage.md)\<`unknown`\>
  \| [`ModelMessage`](../interfaces/ModelMessage.md)\<
  \| `string`
  \| [`ContentPart`](../type-aliases/ContentPart.md)\<`unknown`, `unknown`, `unknown`, `unknown`, `unknown`\>[]
  \| `null`\>)[]

### options?

#### includeActivity?

`boolean`

#### includeSnapshotStructuredOutput?

`boolean`

## Returns

[`WireMessage`](../type-aliases/WireMessage.md)[]
