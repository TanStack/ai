---
id: generateWorld
title: generateWorld
---

```ts
function generateWorld<TAdapter, TStream>(options): WorldActivityResult<TStream>;
```

Defined in: [packages/ai/src/activities/generateWorld/index.ts:155](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateWorld/index.ts#L155)

**`Experimental`**

World generation activity - opens a live, prompt-steerable world session.

## Type Parameters

### TAdapter

`TAdapter` *extends* [`WorldAdapter`](../interfaces/WorldAdapter.md)\<`string`, `WorldProviderOptions`\<`TAdapter`\>\>

### TStream

`TStream` *extends* `boolean` = `false`

## Parameters

### options

`WorldActivityOptions`\<`TAdapter`, `TStream`\>

## Returns

`WorldActivityResult`\<`TStream`\>

## Example

**Mint a session token on the server**

```ts
import { generateWorld } from '@tanstack/ai'
import { reactorWorld } from '@tanstack/ai-reactor'

const world = await generateWorld({
  adapter: reactorWorld('visko-orbis-stable'),
  prompt: 'A neon cyberpunk city at night, slow aerial drift',
})

// Hand world.token, world.model, and world.prompt to the browser.
```

 World generation is an experimental feature and may change.
