---
id: normalizeSystemPrompts
title: normalizeSystemPrompts
---

# Function: normalizeSystemPrompts()

```ts
function normalizeSystemPrompts<TMetadata>(prompts): NormalizedSystemPrompt<TMetadata>[];
```

Defined in: [packages/typescript/ai/src/system-prompts.ts:70](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/system-prompts.ts#L70)

Normalise the public `systemPrompts` shape (`Array<string | { content, metadata? }>`)
to a homogenous `Array<{ content, metadata? }>`. Adapters use this so they
don't have to type-narrow string vs object inline.

Returns an empty array (never `undefined`) so callers can chain `.map` /
`.join` without an extra null check.

Throws a `TypeError` (naming the offending index) if an object-form entry's
`content` isn't a string. Public API boundary — callers reaching this
function through `as any` / external JS would otherwise stream a literal
`"undefined"` into the model's system prompt with no signal.

## Type Parameters

### TMetadata

`TMetadata` = `unknown`

## Parameters

### prompts

readonly [`SystemPrompt`](../type-aliases/SystemPrompt.md)\<`unknown`\>[] | `undefined`

## Returns

[`NormalizedSystemPrompt`](../interfaces/NormalizedSystemPrompt.md)\<`TMetadata`\>[]
