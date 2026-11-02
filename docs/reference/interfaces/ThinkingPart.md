---
id: ThinkingPart
title: ThinkingPart
---

Defined in: [packages/ai/src/types.ts:541](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L541)

## Properties

### content

```ts
content: string;
```

Defined in: [packages/ai/src/types.ts:543](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L543)

***

### redacted?

```ts
optional redacted?: boolean;
```

Defined in: [packages/ai/src/types.ts:558](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L558)

The provider encrypted this thinking block (Anthropic `redacted_thinking`).
`content` is empty, and `signature` holds the opaque data that goes back
to the provider unchanged. On the AG-UI wire, the reasoning message id
starts with `redacted_thinking-` instead.

***

### signature?

```ts
optional signature?: string;
```

Defined in: [packages/ai/src/types.ts:551](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L551)

The provider's opaque reasoning artefact, sent back unchanged: an
Anthropic signature, Anthropic redacted data, or OpenAI encrypted content.
TODO(#1581): rename to `encryptedValue` to match AG-UI's `ReasoningMessage`.
Renaming breaks stored messages, so it needs a read shim for `signature`.

***

### stepId?

```ts
optional stepId?: string;
```

Defined in: [packages/ai/src/types.ts:544](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L544)

***

### type

```ts
type: "thinking";
```

Defined in: [packages/ai/src/types.ts:542](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L542)
