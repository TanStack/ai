---
id: uiMessagesToWire
title: uiMessagesToWire
---

# Function: uiMessagesToWire()

```ts
function uiMessagesToWire(messages, options?): WireMessage[];
```

Defined in: [packages/ai/src/utilities/ag-ui-wire.ts:88](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/ag-ui-wire.ts#L88)

Serialize TanStack `UIMessage`s and `ModelMessage`s into the AG-UI
`RunAgentInput.messages` wire shape. Anchors are spec-only (`id`, `role`,
`name`, `content`, `toolCalls`, `metadata`). Tool results and thinking parts
on assistant messages are additionally emitted as fan-out
`{role:'tool',...}` and `{role:'reasoning',...}` entries for strict AG-UI
server consumers. Set `includeSnapshotStructuredOutput` to retain complete
structured-output metadata for UI snapshots.

## Parameters

### messages

(
  \| [`ModelMessage`](../interfaces/ModelMessage.md)\<
  \| `string`
  \| [`ContentPart`](../type-aliases/ContentPart.md)\<`unknown`, `unknown`, `unknown`, `unknown`, `unknown`\>[]
  \| `null`\>
  \| [`UIMessage`](../interfaces/UIMessage.md)\<`unknown`\>)[]

### options?

#### includeSnapshotStructuredOutput

`boolean`

## Returns

[`WireMessage`](../type-aliases/WireMessage.md)[]
