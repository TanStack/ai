---
id: uiMessagesToWire
title: uiMessagesToWire
---

# Function: uiMessagesToWire()

```ts
function uiMessagesToWire(messages): WireMessage[];
```

Defined in: [packages/typescript/ai/src/utilities/ag-ui-wire.ts:47](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/utilities/ag-ui-wire.ts#L47)

Serialize TanStack `UIMessage`s into the AG-UI `RunAgentInput.messages`
wire shape. Each anchor (system/user/assistant) carries the canonical
`parts` array verbatim plus AG-UI mirror fields (`content`, `toolCalls`)
so AG-UI Zod parsing succeeds. Tool results and thinking parts on
assistant messages are additionally emitted as fan-out
`{role:'tool',...}` and `{role:'reasoning',...}` entries for strict
AG-UI server consumers.

## Parameters

### messages

[`UIMessage`](../interfaces/UIMessage.md)[]

## Returns

[`WireMessage`](../type-aliases/WireMessage.md)[]
