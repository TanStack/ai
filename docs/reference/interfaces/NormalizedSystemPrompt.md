---
id: NormalizedSystemPrompt
title: NormalizedSystemPrompt
---

Defined in: packages/ai/src/system-prompts.ts:52

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

Defined in: packages/ai/src/system-prompts.ts:53

***

### metadata?

```ts
optional metadata?: TMetadata;
```

Defined in: packages/ai/src/system-prompts.ts:54
