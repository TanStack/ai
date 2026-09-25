---
id: WorldGenerationResult
title: WorldGenerationResult
---

Defined in: [packages/ai/src/types.ts:2397](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2397)

**`Experimental`**

Result of world generation. JSON-serializable so a server route can return
it to a browser.

Live adapters (Reactor): `status: 'ready'` with `token` and token
`expiresAt`. The browser uses `token` + `model` to open the session.

Job adapters (World Labs): `status: 'ready'` with viewer `url` and
`worldId`, or `status: 'waiting'` with `operationId` and no `url`.
`expiresAt` on a job is operation expiry, not a session token.

 World generation is an experimental feature and may change.

## Properties

### assets?

```ts
optional assets?: WorldGenerationAssets;
```

Defined in: [packages/ai/src/types.ts:2422](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2422)

**`Experimental`**

Assets when a world job has finished and the provider returned them

***

### expiresAt?

```ts
optional expiresAt?: number;
```

Defined in: [packages/ai/src/types.ts:2408](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2408)

**`Experimental`**

Expiry as milliseconds since epoch. Live adapters: session token.
Job adapters: operation expiry when the provider sends it.

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2399](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2399)

**`Experimental`**

Unique identifier for this generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2401](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2401)

**`Experimental`**

Model used for generation (provider connect slug or model id)

***

### operationId?

```ts
optional operationId?: string;
```

Defined in: [packages/ai/src/types.ts:2420](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2420)

**`Experimental`**

Provider operation id for a long-running world job

***

### prompt

```ts
prompt: string;
```

Defined in: [packages/ai/src/types.ts:2410](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2410)

**`Experimental`**

Prompt used to generate the world, or the prompt the client should send

***

### sessionId?

```ts
optional sessionId?: string;
```

Defined in: [packages/ai/src/types.ts:2414](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2414)

**`Experimental`**

Provider session id, when the adapter created one

***

### status

```ts
status: "ready" | "waiting";
```

Defined in: [packages/ai/src/types.ts:2412](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2412)

**`Experimental`**

Status after the server half finishes

***

### token?

```ts
optional token?: string;
```

Defined in: [packages/ai/src/types.ts:2403](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2403)

**`Experimental`**

Short-lived session token for a live client connection

***

### url?

```ts
optional url?: string;
```

Defined in: [packages/ai/src/types.ts:2416](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2416)

**`Experimental`**

Viewer URL for a finished world job (not an asset download URL)

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2424](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2424)

**`Experimental`**

Token usage / billing, when the adapter can report it

***

### worldId?

```ts
optional worldId?: string;
```

Defined in: [packages/ai/src/types.ts:2418](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2418)

**`Experimental`**

Provider world id for a finished or in-progress job
