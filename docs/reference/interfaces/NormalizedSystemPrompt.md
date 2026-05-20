---
id: NormalizedSystemPrompt
title: NormalizedSystemPrompt
---

# Interface: NormalizedSystemPrompt\<TMetadata\>

Defined in: [packages/typescript/ai/src/system-prompts.ts:52](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/system-prompts.ts#L52)

Normalised shape adapters see after the chat layer turns string entries
into `{ content }` objects. Adapters call `normalizeSystemPrompts` once at
the top of their option-mapping pipeline so the rest of the code only has
to handle one shape.

## Type Parameters

### TMetadata

`TMetadata` = `unknown`

## Properties

### content

```ts
content: string;
```

Defined in: [packages/typescript/ai/src/system-prompts.ts:53](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/system-prompts.ts#L53)

***

### metadata?

```ts
optional metadata: TMetadata;
```

Defined in: [packages/typescript/ai/src/system-prompts.ts:54](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/system-prompts.ts#L54)
