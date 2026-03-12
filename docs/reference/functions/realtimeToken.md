---
id: realtimeToken
title: realtimeToken
---

# Function: realtimeToken()

```ts
function realtimeToken(options): Promise<RealtimeToken>;
```

Defined in: [realtime/index.ts:33](https://github.com/TanStack/ai/blob/main/packages/typescript/ai/src/realtime/index.ts#L33)

Generate a realtime token using the provided adapter.

This function is used on the **server** to generate ephemeral tokens that clients can use to establish realtime connections. The token contains authentication credentials and session configuration, and is typically short-lived (e.g., 10 minutes for OpenAI, 30 minutes for ElevenLabs).

## Parameters

### options

[`RealtimeTokenOptions`](../interfaces/RealtimeTokenOptions.md)

Token generation options including the provider-specific adapter.

## Returns

`Promise<`[`RealtimeToken`](../interfaces/RealtimeToken.md)`>`

A token containing the provider credentials, expiration, and session config.

## Examples

### OpenAI

```typescript
import { realtimeToken } from '@tanstack/ai'
import { openaiRealtimeToken } from '@tanstack/ai-openai'

const token = await realtimeToken({
  adapter: openaiRealtimeToken({
    model: 'gpt-4o-realtime-preview',
  }),
})
```

### ElevenLabs

```typescript
import { realtimeToken } from '@tanstack/ai'
import { elevenlabsRealtimeToken } from '@tanstack/ai-elevenlabs'

const token = await realtimeToken({
  adapter: elevenlabsRealtimeToken({
    agentId: 'your-agent-id',
  }),
})
```

### TanStack Start Server Function

```typescript
import { createServerFn } from '@tanstack/react-start'
import { realtimeToken } from '@tanstack/ai'
import { openaiRealtimeToken } from '@tanstack/ai-openai'

export const getRealtimeToken = createServerFn({ method: 'POST' })
  .handler(async () => {
    return realtimeToken({
      adapter: openaiRealtimeToken({
        model: 'gpt-4o-realtime-preview',
      }),
    })
  })
```
