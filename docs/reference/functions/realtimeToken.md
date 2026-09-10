---
id: realtimeToken
title: realtimeToken
---

# Function: realtimeToken()

```ts
function realtimeToken(options): Promise<RealtimeToken>;
```

Defined in: [packages/ai/src/realtime/index.ts:29](https://github.com/TanStack/ai/blob/main/packages/ai/src/realtime/index.ts#L29)

Generate a realtime token using the provided adapter.

This function is used on the server to generate ephemeral tokens
that clients can use to establish realtime connections.

## Parameters

### options

[`RealtimeTokenOptions`](../interfaces/RealtimeTokenOptions.md)

Token generation options including the adapter

## Returns

`Promise`\<[`RealtimeToken`](../interfaces/RealtimeToken.md)\>

Promise resolving to a RealtimeToken

## Example

```typescript
import { realtimeToken } from '@tanstack/ai'
import { openaiRealtimeToken } from '@tanstack/ai-openai'

// On the server (e.g. inside a server route or framework server
// function), mint an ephemeral token for the client:
const token = await realtimeToken({
  adapter: openaiRealtimeToken({ model: 'gpt-realtime' }),
})
```
