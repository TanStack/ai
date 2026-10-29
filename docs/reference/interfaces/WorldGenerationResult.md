---
id: WorldGenerationResult
title: WorldGenerationResult
---

Defined in: [packages/ai/src/types.ts:2775](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2775)

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

Defined in: [packages/ai/src/types.ts:2800](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2800)

**`Experimental`**

Assets when a world job has finished and the provider returned them

***

### expiresAt?

```ts
optional expiresAt?: number;
```

Defined in: [packages/ai/src/types.ts:2786](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2786)

**`Experimental`**

Expiry as milliseconds since epoch. Live adapters: session token.
Job adapters: operation expiry when the provider sends it.

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2777](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2777)

**`Experimental`**

Unique identifier for this generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2779](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2779)

**`Experimental`**

Model used for generation (provider connect slug or model id)

***

### operationId?

```ts
optional operationId?: string;
```

Defined in: [packages/ai/src/types.ts:2798](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2798)

**`Experimental`**

Provider operation id for a long-running world job

***

### prompt

```ts
prompt: string;
```

Defined in: [packages/ai/src/types.ts:2788](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2788)

**`Experimental`**

Prompt used to generate the world, or the prompt the client should send

***

### sessionId?

```ts
optional sessionId?: string;
```

Defined in: [packages/ai/src/types.ts:2792](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2792)

**`Experimental`**

Provider session id, when the adapter created one

***

### status

```ts
status: "ready" | "waiting";
```

Defined in: [packages/ai/src/types.ts:2790](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2790)

**`Experimental`**

Status after the server half finishes

***

### token?

```ts
optional token?: string;
```

Defined in: [packages/ai/src/types.ts:2781](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2781)

**`Experimental`**

Short-lived session token for a live client connection

***

### url?

```ts
optional url?: string;
```

Defined in: [packages/ai/src/types.ts:2794](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2794)

**`Experimental`**

Viewer URL for a finished world job (not an asset download URL)

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2802](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2802)

**`Experimental`**

Token usage / billing, when the adapter can report it

***

### worldId?

```ts
optional worldId?: string;
```

Defined in: [packages/ai/src/types.ts:2796](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2796)

**`Experimental`**

Provider world id for a finished or in-progress job
