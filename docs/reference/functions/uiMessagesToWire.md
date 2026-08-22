---
id: uiMessagesToWire
title: uiMessagesToWire
---

# Function: uiMessagesToWire()

```ts
function uiMessagesToWire(messages): WireMessage[];
```

Defined in: [packages/ai/src/utilities/ag-ui-wire.ts:62](https://github.com/TanStack/ai/blob/main/packages/ai/src/utilities/ag-ui-wire.ts#L62)

Serialize TanStack `UIMessage`s into the AG-UI `RunAgentInput.messages`
wire shape. Anchors are spec-only (`id`, `role`, `name`, `content`,
`toolCalls`, `metadata`). Tool results and thinking parts on assistant
messages are additionally emitted as fan-out `{role:'tool',...}` and
`{role:'reasoning',...}` entries for strict AG-UI server consumers.

## Parameters

### messages

[`UIMessage`](../interfaces/UIMessage.md)\<`unknown`\>[]

## Returns

[`WireMessage`](../type-aliases/WireMessage.md)[]
