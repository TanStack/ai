---
id: compactForModel
title: compactForModel
---

```ts
function compactForModel(value, depth?): unknown;
```

Defined in: packages/ai/src/activities/chat/tools/tool-calls.ts:96

A copy of a subagent result that is safe to send to the parent model.
A string longer than MODEL\_RESULT\_MAX\_STRING (for example a base64
image) becomes a short note, so one image result cannot fill the context.
The full result still travels on `SUBAGENT_FINISHED` for the UI.

## Parameters

### value

`unknown`

### depth?

`number` = `0`

## Returns

`unknown`
