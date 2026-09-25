---
id: generateWorld
title: generateWorld
---

```ts
function generateWorld<TAdapter, TStream>(options): WorldActivityResult<TStream>;
```

Defined in: [packages/ai/src/activities/generateWorld/index.ts:156](https://github.com/TanStack/ai/blob/main/packages/ai/src/activities/generateWorld/index.ts#L156)

**`Experimental`**

World generation activity. Live adapters mint a session token. Job
adapters return a viewer URL or an in-progress operation id.

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
