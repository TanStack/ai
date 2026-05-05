---
id: realtimeToken
title: realtimeToken
---

# Function: realtimeToken()

```ts
function realtimeToken(options): Promise<RealtimeToken>;
```

Defined in: [packages/typescript/ai/src/realtime/index.ts:33](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/realtime/index.ts#L33)

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

// Server function (TanStack Start example)
export const getRealtimeToken = createServerFn()
  .handler(async () => {
    return realtimeToken({
      adapter: openaiRealtimeToken({
        model: 'gpt-4o-realtime-preview',
        voice: 'alloy',
        instructions: 'You are a helpful assistant...',
      }),
    })
  })
```
