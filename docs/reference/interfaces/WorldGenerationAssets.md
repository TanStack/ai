---
id: WorldGenerationAssets
title: WorldGenerationAssets
---

Defined in: [packages/ai/src/types.ts:2759](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2759)

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

Defined in: [packages/ai/src/types.ts:2761](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2761)

**`Experimental`**

Auto-generated scene description

***

### imagery?

```ts
optional imagery?: object;
```

Defined in: [packages/ai/src/types.ts:2775](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2775)

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

Defined in: [packages/ai/src/types.ts:2770](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2770)

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

Defined in: [packages/ai/src/types.ts:2764](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2764)

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

Defined in: [packages/ai/src/types.ts:2763](https://github.com/TanStack/ai/blob/main/packages/ai/src/types.ts#L2763)

**`Experimental`**

Preview image URL
