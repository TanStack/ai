---
id: ThinkingPart
title: ThinkingPart
---

Defined in: [packages/ai/src/types.ts:470](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L470)

## Properties

### content

```ts
content: string;
```

Defined in: [packages/ai/src/types.ts:472](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L472)

***

### redacted?

```ts
optional redacted?: boolean;
```

Defined in: [packages/ai/src/types.ts:487](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L487)

The provider encrypted this thinking block (Anthropic `redacted_thinking`).
`content` is empty, and `signature` holds the opaque data that goes back
to the provider unchanged. On the AG-UI wire, the reasoning message id
starts with `redacted_thinking-` instead.

***

### signature?

```ts
optional signature?: string;
```

Defined in: [packages/ai/src/types.ts:480](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L480)

The provider's opaque reasoning artefact, sent back unchanged: an
Anthropic signature, Anthropic redacted data, or OpenAI encrypted content.
TODO(#1581): rename to `encryptedValue` to match AG-UI's `ReasoningMessage`.
Renaming breaks stored messages, so it needs a read shim for `signature`.

***

### stepId?

```ts
optional stepId?: string;
```

Defined in: [packages/ai/src/types.ts:473](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L473)

***

### type

```ts
type: "thinking";
```

Defined in: [packages/ai/src/types.ts:471](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L471)
