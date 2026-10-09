---
id: LiveVideoGenerationResult
title: LiveVideoGenerationResult
---

Defined in: [packages/ai/src/types.ts:2627](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2627)

**`Experimental`**

Result of live generation. JSON-serializable so a server route can return
it to a browser.

Reactor: connect with `token` and `model` (the connect slug).
fal: `model` is the WMA app id. Open `wma(model)` through a server proxy
that attaches `FAL_KEY`. Do not send `token` as Key credentials.

 Live generation is an experimental feature and may change.

## Properties

### expiresAt

```ts
expiresAt: number;
```

Defined in: [packages/ai/src/types.ts:2638](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2638)

**`Experimental`**

Token expiry as milliseconds since epoch

***

### id

```ts
id: string;
```

Defined in: [packages/ai/src/types.ts:2629](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2629)

**`Experimental`**

Unique identifier for this generation

***

### model

```ts
model: string;
```

Defined in: [packages/ai/src/types.ts:2634](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2634)

**`Experimental`**

Connect id for the browser client. Reactor: `reactor/helios`.
fal: WMA app id `fal-ai/minimax-h3-max-director`.

***

### prompt

```ts
prompt: string;
```

Defined in: [packages/ai/src/types.ts:2640](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2640)

**`Experimental`**

Prompt the client should send when it starts the session

***

### sessionId?

```ts
optional sessionId?: string;
```

Defined in: [packages/ai/src/types.ts:2644](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2644)

**`Experimental`**

Provider session id, when the adapter created one

***

### status

```ts
status: "ready" | "waiting";
```

Defined in: [packages/ai/src/types.ts:2642](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2642)

**`Experimental`**

Session status after the server half finishes

***

### token

```ts
token: string;
```

Defined in: [packages/ai/src/types.ts:2636](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2636)

**`Experimental`**

Short-lived session token. Reactor uses this to connect. fal does not.

***

### usage?

```ts
optional usage?: TokenUsage<ProviderUsageDetails>;
```

Defined in: [packages/ai/src/types.ts:2646](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2646)

**`Experimental`**

Token usage / billing, when the adapter can report it
