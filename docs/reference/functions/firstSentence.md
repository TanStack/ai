---
id: firstSentence
title: firstSentence
---

# Function: firstSentence()

```ts
function firstSentence(text): string;
```

Defined in: [packages/ai/src/activities/chat/tools/lazy-tools.ts:8](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/chat/tools/lazy-tools.ts#L8)

Extract the first sentence of a description (up to the first ., !, or ?
followed by whitespace or end-of-string). Falls back to the whole trimmed
string when there is no sentence terminator.

## Parameters

### text

`string`

## Returns

`string`
