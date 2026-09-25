---
id: WorldGenerationAssets
title: WorldGenerationAssets
---

Defined in: [packages/ai/src/types.ts:2363](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2363)

**`Experimental`**

Assets from a finished world job. Live session adapters omit this.
URLs are often signed CDN links. They can expire and may need a proxy
to fetch from a browser.

 World generation is an experimental feature and may change.

## Properties

### caption?

```ts
optional caption?: string;
```

Defined in: [packages/ai/src/types.ts:2365](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2365)

**`Experimental`**

Auto-generated scene description

***

### imagery?

```ts
optional imagery?: object;
```

Defined in: [packages/ai/src/types.ts:2379](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2379)

**`Experimental`**

#### panoUrl?

```ts
optional panoUrl?: string;
```

***

### mesh?

```ts
optional mesh?: object;
```

Defined in: [packages/ai/src/types.ts:2374](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2374)

**`Experimental`**

#### colliderMeshUrl?

```ts
optional colliderMeshUrl?: string;
```

#### fullResMeshUrl?

```ts
optional fullResMeshUrl?: string;
```

#### hqMeshUrl?

```ts
optional hqMeshUrl?: string;
```

***

### splats?

```ts
optional splats?: object;
```

Defined in: [packages/ai/src/types.ts:2368](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2368)

**`Experimental`**

#### groundPlaneOffset?

```ts
optional groundPlaneOffset?: number;
```

#### metricScaleFactor?

```ts
optional metricScaleFactor?: number;
```

#### spzUrls?

```ts
optional spzUrls?: Record<string, string>;
```

Quality-key map of splat URLs (`100k`, `500k`, `full_res`, …)

***

### thumbnailUrl?

```ts
optional thumbnailUrl?: string;
```

Defined in: [packages/ai/src/types.ts:2367](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2367)

**`Experimental`**

Preview image URL
