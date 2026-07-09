---
id: ProviderExecutedToolMetadata
title: ProviderExecutedToolMetadata
---

# Interface: ProviderExecutedToolMetadata

Defined in: [packages/ai/src/types.ts:181](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L181)

Convention for tool-call `metadata` that marks a call as **provider-executed**
— run by the provider's own infrastructure (e.g. Anthropic `web_search` /
`web_fetch` server tools) rather than by the agent loop. Adapters set
`providerExecuted: true` so that:

1. The agent loop never tries to execute the call client-side (see
   [isProviderExecutedToolCall](../functions/isProviderExecutedToolCall.md) usage in the chat engine), and
2. The adapter can stash the raw provider result alongside it so the call —
   and its evidence — round-trips into the next turn's request.

Provider-specific payloads live under a namespaced key (e.g. `anthropic`),
keeping this convention opaque to the framework core. The index signature
preserves those per-adapter fields.

## Indexable

```ts
[key: string]: unknown
```

## Properties

### providerExecuted?

```ts
optional providerExecuted: boolean;
```

Defined in: [packages/ai/src/types.ts:182](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L182)
