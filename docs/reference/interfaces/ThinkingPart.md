---
id: ThinkingPart
title: ThinkingPart
---

Defined in: packages/ai/src/types.ts:538

## Properties

### content

```ts
content: string;
```

Defined in: packages/ai/src/types.ts:540

***

### redacted?

```ts
optional redacted?: boolean;
```

Defined in: packages/ai/src/types.ts:555

The provider encrypted this thinking block (Anthropic `redacted_thinking`).
`content` is empty, and `signature` holds the opaque data that goes back
to the provider unchanged. On the AG-UI wire, the reasoning message id
starts with `redacted_thinking-` instead.

***

### signature?

```ts
optional signature?: string;
```

Defined in: packages/ai/src/types.ts:548

The provider's opaque reasoning artefact, sent back unchanged: an
Anthropic signature, Anthropic redacted data, or OpenAI encrypted content.
TODO(#1581): rename to `encryptedValue` to match AG-UI's `ReasoningMessage`.
Renaming breaks stored messages, so it needs a read shim for `signature`.

***

### stepId?

```ts
optional stepId?: string;
```

Defined in: packages/ai/src/types.ts:541

***

### type

```ts
type: "thinking";
```

Defined in: packages/ai/src/types.ts:539
